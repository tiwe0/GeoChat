import { useCallback, useEffect, useRef, useState } from "react";
import type { FileUIPart, UIMessage } from "ai";
import {
  createAgentRunCoordinator,
  createAgentRunLedgerFromStart,
  type AgentRunRunnerSnapshot,
} from "@geochat-ai/app/client";
import type {
  AgentRunImageAttachment,
  ChatMessageMetadata,
} from "@geochat-ai/app/contracts";
import { createAgentRunRunnerClaimOwner } from "@geochat-ai/app/contracts";
import type { AgentRunThinkingEffort } from "@geochat-ai/app";
import { areSupportedAgentAttachments } from "../features/attachments/capabilities";
import {
  getInstallationId,
  finishActiveRun,
  isStuckRunner,
  removeActiveRun,
  removeCachedToolResult,
  restoreActiveRun,
  saveActiveRun,
  type StoredActiveRun,
} from "../features/agent-run/activeRunStorage";
import { claimRemoteTools, waitForRunnerEvent } from "../features/agent-run/runnerClient";
import { executeRemoteToolRequest } from "../features/agent-run/toolWorker";
import { executeAgentRunLoop, type AgentRunDisplayPart } from "../features/agent-run/controller";
import { getCanvasSessionId } from "../features/agent-run/canvasIdentity";

type ChatMessage = UIMessage<ChatMessageMetadata>;
type ChatStatus = "ready" | "submitted" | "streaming" | "error";

type SendMessageInput = { text?: string; files?: FileUIPart[] };
type SendMessageOptions = { body?: { conversationId?: string } };

const canvasSessionId = getCanvasSessionId();

export function useAgentRunChat(input: {
  apiOrigin: string;
  getAuthToken: () => string | null;
  getModel: () => string;
  getModelProvider?: (model: string) => string;
  locale: "zh-CN" | "en-US";
  onFinish?: () => void;
  onRestore?: (run: Pick<StoredActiveRun, "conversationId" | "modelId" | "prompt" | "thinkingEnabled" | "thinkingEffort">) => void;
  getThinking: () => boolean;
  getThinkingEffort: () => AgentRunThinkingEffort;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<Error | undefined>();
  const abortRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const inputRef = useRef(input);
  const installationIdRef = useRef<string | null>(null);
  inputRef.current = input;

  const coordinatorRef = useRef(createAgentRunCoordinator({
    backendBaseUrl: input.apiOrigin,
    headers: () => {
      const headers: Record<string, string> = {
        "x-client-channel": "desktop-workbench",
        // Guest Harness requests have no persisted session to establish the
        // market. Keep the deployment market explicit so a China build cannot
        // silently fall back to the global policy.
      };
      const token = inputRef.current.getAuthToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        return headers;
      }
      const installationId = installationIdRef.current;
      if (installationId) headers["x-guest-session-id"] = guestSessionId(installationId);
      return headers;
    },
  }));

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    void restoreActiveRun({
      coordinator: coordinatorRef.current, canvasSessionId,
      installationIdRef,
      signal: controller.signal,
      onRestore: (restored) => {
        if (disposed) return;
        activeRunRef.current = restored.runId;
        abortRef.current = controller;
        stoppedRef.current = false;
        setMessages((previous) => mergeRestoredMessages(previous, restored));
        inputRef.current.onRestore?.(restored);
        setStatus("submitted");
        void continueRecoveredRun(restored, controller);
      },
      onDiscard: () => {
        if (!disposed) setStatus("ready");
      },
    }).catch((caught) => {
      if (disposed) return;
      setError(caught instanceof Error ? caught : new Error("Failed to inspect a pending agent run."));
      setStatus("error");
    });
    return () => {
      disposed = true;
      controller.abort();
    };
  // The canvas session id is stable for this tab; recovery should run once per mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function continueRecoveredRun(restored: StoredActiveRun, controller: AbortController) {
    const installationId = await getInstallationId(installationIdRef);
    const claimOwner = createAgentRunRunnerClaimOwner("desktop-workbench", installationId, canvasSessionId);
    let completedWithError = false;
    try {
      const runner = await coordinatorRef.current.runnerSnapshot(restored.runId);
      if (!runner) {
        throw new Error("The pending agent run could not be inspected.");
      }
      if (runner.run.status !== "running") {
        await removeActiveRun(installationId, canvasSessionId);
        return;
      }
      if (restored.attachmentCount > 0 || isStuckRunner(runner)) {
        const finished = await finishActiveRun({
          coordinator: coordinatorRef.current,
          runId: restored.runId,
          installationId,
          canvasSessionId,
          status: "failed",
          error: restored.attachmentCount > 0
            ? "Image attachment runs cannot be safely recovered after a content-script reload."
            : "Recovered a runner that was active without a remote tool request.",
        });
        if (!finished) throw new Error("The pending agent run could not be reconciled.");
        return;
      }
      const result = await executeAgentRunLoop({ coordinator: coordinatorRef.current, runId: restored.runId, claimOwner, signal: controller.signal,
        claimRemoteTools, executeRemoteTool: executeRemoteToolRequest, afterToolResult: removeCachedToolResult,
        waitForRunnerEvent,
        onUpdate: ({ assistantText, parts, credits }) => { setStatus(assistantText || parts.some((part) => part.type === "reasoning") ? "streaming" : "submitted"); setMessages((previous) => previous.map((item) => item.id !== restored.assistantMessageId ? item : assistantMessageUpdate(item, parts, credits))); }
      });
      if (result.runner && result.runner.run.status !== "running") {
        await removeActiveRun(installationId, canvasSessionId);
      }
      if (!controller.signal.aborted) inputRef.current.onFinish?.();
    } catch (caught) {
      if (!controller.signal.aborted) {
        completedWithError = true;
        setError(caught instanceof Error ? caught : new Error("Failed to restore the pending agent run."));
        setStatus("error");
      }
    } finally {
      if (activeRunRef.current === restored.runId) activeRunRef.current = null;
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted && !completedWithError) setStatus("ready");
    }
  }

  const stop = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
    const runId = activeRunRef.current;
    if (runId) {
      void getInstallationId(installationIdRef).then((installationId) => finishActiveRun({
        coordinator: coordinatorRef.current,
        runId,
        installationId,
        canvasSessionId,
        status: "cancelled",
        error: "Stopped by user.",
      })).catch(() => undefined);
    }
    setError(undefined);
    setStatus("ready");
  }, []);

  const sendMessage = useCallback(async (message: SendMessageInput, options?: SendMessageOptions) => {
    if (status === "submitted" || status === "streaming" || activeRunRef.current) return;
    const conversationId = options?.body?.conversationId;
    if (!conversationId) throw new Error("A conversation id is required for an agent run.");

    const files = message.files ?? [];
    const localAttachments = toImageAttachments(files);
    if (!areSupportedAgentAttachments(files)) {
      const unsupported = files.find((file) => !file.mediaType?.startsWith("image/"));
      setError(new Error(`Unsupported agent attachment: ${unsupported?.filename ?? "file"}. Only image attachments are supported.`));
      setStatus("ready");
      return;
    }

    const prompt = message.text?.trim() || (localAttachments.length ? "Analyze the attached image and help with the GeoGebra task." : "");
    if (!prompt) return;
    const userMessageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
    const assistantMessageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
    const runId = `run_${crypto.randomUUID().replaceAll("-", "")}`;
    const current = inputRef.current;
    const attachments = await uploadImageAttachments(current.apiOrigin, current.getAuthToken(), localAttachments);
    const modelId = current.getModel();
    const record = createAgentRunLedgerFromStart({
      runId,
      conversationId,
      userMessageId,
      assistantMessageId,
      mode: "ai-sdk",
      modelProvider: current.getModelProvider?.(modelId) ?? "deepseek",
      modelId,
      thinking: current.getThinking() ? "enabled" : "disabled",
      thinkingEffort: current.getThinkingEffort(),
      locale: current.locale,
      prompt,
      attachmentCount: attachments.length,
    });
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      parts: [
        ...(message.text?.trim() ? [{ type: "text" as const, text: message.text.trim() }] : []),
        ...files,
      ],
    };
    const assistantMessage: ChatMessage = { id: assistantMessageId, role: "assistant", parts: [{ type: "text", text: "" }] };
    setMessages((previous) => [...previous, userMessage, assistantMessage]);
    setError(undefined);
    setStatus("submitted");
    stoppedRef.current = false;
    activeRunRef.current = runId;
    const controller = new AbortController();
    abortRef.current = controller;

    let completedWithError = false;

    try {
      const installationId = await getInstallationId(installationIdRef);
      const claimOwner = createAgentRunRunnerClaimOwner("desktop-workbench", installationId, canvasSessionId);
      const runnerStart = {
        run: record,
        attachments,
        canvasSessionId,
        claimOwner,
      };
      const runner = await coordinatorRef.current.startPausedRunner(runnerStart);
      if (!runner) throw new Error("Agent runner did not return a snapshot.");
      await saveActiveRun(installationId, canvasSessionId, record);

      const result = await executeAgentRunLoop({ coordinator: coordinatorRef.current, runId, claimOwner, signal: controller.signal, attachments,
        initialRunner: runner, claimRemoteTools, executeRemoteTool: executeRemoteToolRequest, afterToolResult: removeCachedToolResult,
        waitForRunnerEvent,
        onUpdate: ({ assistantText, parts, credits }) => { setStatus(assistantText || parts.some((part) => part.type === "reasoning") ? "streaming" : "submitted"); setMessages((previous) => previous.map((item) => item.id !== assistantMessageId ? item : assistantMessageUpdate(item, parts, credits))); }
      });
      if (result.runner && result.runner.run.status !== "running") {
        await removeActiveRun(installationId, canvasSessionId);
      }
      if (!stoppedRef.current) current.onFinish?.();
    } catch (caught) {
      if (!stoppedRef.current && !(caught instanceof DOMException && caught.name === "AbortError")) {
        const nextError = caught instanceof Error ? caught : new Error("Agent run failed.");
        completedWithError = true;
        setError(nextError);
        setStatus("error");
        return;
      }
    } finally {
      if (activeRunRef.current === runId) activeRunRef.current = null;
      if (abortRef.current === controller) abortRef.current = null;
      if (!stoppedRef.current && !completedWithError) setStatus("ready");
    }
  }, [status]);

  return { messages, setMessages, sendMessage, stop, status, error };
}

function guestSessionId(installationId: string) {
  return `frontend_guest_${installationId}`;
}

function toImageAttachments(files: FileUIPart[]): AgentRunImageAttachment[] {
  return files.flatMap((file) => {
    if (!file.mediaType?.startsWith("image/") || typeof file.url !== "string") return [];
    return [{ name: file.filename ?? "image", mediaType: file.mediaType, dataUrl: file.url }];
  });
}

async function uploadImageAttachments(apiOrigin: string, token: string | null, attachments: AgentRunImageAttachment[]) {
  if (!token || attachments.length === 0) return attachments;
  return Promise.all(attachments.map(async (attachment) => {
    try {
      const image = await fetch(attachment.dataUrl);
      if (!image.ok) return attachment;
      const form = new FormData();
      form.append("file", await image.blob(), attachment.name);
      const response = await fetch(new URL("/api/media/images", apiOrigin), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-client-channel": "desktop-workbench",
        },
        body: form,
      });
      if (!response.ok) return attachment;
      const payload = await response.json() as { url?: unknown };
      return typeof payload.url === "string"
        ? { ...attachment, dataUrl: payload.url }
        : attachment;
    } catch {
      return attachment;
    }
  }));
}

function assistantMessageParts(parts: AgentRunDisplayPart[]) {
  return (parts.length ? parts : [{ type: "text", text: "" }]) as unknown as ChatMessage["parts"];
}

function assistantMessageUpdate(message: ChatMessage, parts: AgentRunDisplayPart[], credits?: number): ChatMessage {
  return {
    ...message,
    parts: assistantMessageParts(parts),
    ...(credits === undefined
      ? {}
      : { metadata: { ...(message.metadata ?? {}), credits } }),
  };
}

function mergeRestoredMessages(messages: ChatMessage[], restored: StoredActiveRun): ChatMessage[] {
  const userId = restored.userMessageId ?? `restored-user-${restored.runId}`;
  const assistantId = restored.assistantMessageId ?? `restored-assistant-${restored.runId}`;
  const hasUser = messages.some((message) => message.id === userId);
  const hasAssistant = messages.some((message) => message.id === assistantId);
  return [
    ...messages,
    ...(hasUser ? [] : [{ id: userId, role: "user", parts: [{ type: "text", text: restored.prompt }] } satisfies ChatMessage]),
    ...(hasAssistant ? [] : [{ id: assistantId, role: "assistant", parts: [{ type: "text", text: "" }] } satisfies ChatMessage]),
  ];
}
