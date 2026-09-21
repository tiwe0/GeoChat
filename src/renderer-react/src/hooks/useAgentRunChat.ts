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
import type { AgentModelConfig } from "@geochat-ai/app/model-registry";
import { createAgentRunRunnerClaimOwner } from "@geochat-ai/app/contracts";
import type { AgentRunThinkingEffort } from "@geochat-ai/app/contracts";
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
import { desktopLogger } from "../features/desktop/desktopLogger";

type ChatMessage = UIMessage<ChatMessageMetadata>;
type ChatStatus = "ready" | "submitted" | "streaming" | "error";

type SendMessageInput = { text?: string; files?: FileUIPart[] };
type SendMessageOptions = { body?: { conversationId?: string } };

const canvasSessionId = getCanvasSessionId();

export function useAgentRunChat(input: {
  apiOrigin: string;
  getAuthToken: () => string | null;
  getModel: () => string;
  getModelConfig?: () => AgentModelConfig;
  getModelProvider?: (model: string) => string;
  locale: "zh-CN" | "en-US";
  onFinish?: () => void;
  onRestore?: (run: Pick<StoredActiveRun, "conversationId" | "modelId" | "prompt" | "thinking" | "thinkingEffort">) => void;
  getThinking: () => boolean;
  getThinkingEffort: () => AgentRunThinkingEffort;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<Error | undefined>();
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const abortRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const inputRef = useRef(input);
  const installationIdRef = useRef<string | null>(null);
  inputRef.current = input;

  const coordinatorRef = useRef(createAgentRunCoordinator({
    backendBaseUrl: input.apiOrigin,
    headers: () => {
      const token = inputRef.current.getAuthToken();
      const headers: Record<string, string> = {
        // A browser-only dev session has no Tauri runtime token. Mark it as
        // web traffic so a backend configured with desktop auth can still be
        // used without requiring a desktop credential.
        "x-client-channel": token ? "desktop-workbench" : "web-workbench",
        // Guest Harness requests have no persisted session to establish the
        // market. Keep the deployment market explicit so a China build cannot
        // silently fall back to the global policy.
      };
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
        console.info(`[INFO] Restoring pending agent run runId=${restored.runId}`);
        activeRunRef.current = restored.runId;
        abortRef.current = controller;
        stoppedRef.current = false;
        setMessages((previous) => mergeRestoredMessages(previous, restored));
        inputRef.current.onRestore?.(restored);
        setStatus("submitted");
        void continueRecoveredRun(restored, controller);
      },
      onDiscard: () => {
        console.debug("[DEBUG] No recoverable pending agent run was found");
        if (!disposed) setStatus("ready");
      },
    }).catch((caught) => {
      console.error("[ERROR] Failed to restore the pending agent run", caught);
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
        model: inputRef.current.getModelConfig?.(),
        claimRemoteTools, executeRemoteTool: executeRemoteToolRequest, afterToolResult: removeCachedToolResult,
        waitForRunnerEvent,
        onUpdate: ({ assistantText, parts }) => { setStatus(assistantText || parts.some((part) => part.type === "reasoning") ? "streaming" : "submitted"); setMessages((previous) => previous.map((item) => item.id !== restored.assistantMessageId ? item : assistantMessageUpdate(item, parts))); }
      });
      if (result.runner && result.runner.run.status !== "running") {
        await removeActiveRun(installationId, canvasSessionId);
      }
      console.info(`[INFO] Recovered agent run finished runId=${restored.runId} status=${result.runner?.run.status ?? "unknown"}`);
      if (!controller.signal.aborted) inputRef.current.onFinish?.();
    } catch (caught) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/hooks/useAgentRunChat.ts:158", caught);
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
      console.warn(`[WARN] Agent run cancellation requested runId=${runId}`);
      void getInstallationId(installationIdRef).then((installationId) => finishActiveRun({
        coordinator: coordinatorRef.current,
        runId,
        installationId,
        canvasSessionId,
        status: "cancelled",
        error: "Stopped by user.",
      })).catch((caught) => {
        console.error("[ERROR] Failed to persist the cancelled agent run", caught);
      });
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

    const currentPrompt = message.text?.trim() || (localAttachments.length ? "Analyze the attached image and help with the GeoGebra task." : "");
    if (!currentPrompt) return;
    const userMessageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
    const assistantMessageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
    const runId = `run_${crypto.randomUUID().replaceAll("-", "")}`;
    const current = inputRef.current;
    const attachments = await uploadImageAttachments(current.apiOrigin, current.getAuthToken(), localAttachments);
    const prompt = conversationPrompt(currentPrompt, messagesRef.current, current.locale);
    const modelId = current.getModel();
    const record = createAgentRunLedgerFromStart({
      runId,
      conversationId,
      userMessageId,
      assistantMessageId,
      mode: "ai-sdk",
      modelProvider: current.getModelProvider?.(modelId) ?? "deepseek",
      modelId,
      locale: current.locale,
      thinking: current.getThinking(),
      thinkingEffort: current.getThinkingEffort(),
      prompt,
      attachmentCount: attachments.length,
    });
    console.info(`[INFO] Starting agent run runId=${runId} provider=${record.modelProvider} model=${record.modelId}`);
    console.debug(`[DEBUG] Agent run options runId=${runId} attachments=${attachments.length} thinking=${record.thinking === true}`);
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
        // The backend deliberately does not persist API keys in the run
        // ledger. Send the current desktop model config with the start request
        // so it can validate capabilities and create the provider client.
        ...(current.getModelConfig ? { model: current.getModelConfig() } : {}),
        attachments,
        canvasSessionId,
        claimOwner,
      };
      const runner = await coordinatorRef.current.startPausedRunner(runnerStart);
      if (!runner) throw new Error("Agent runner did not return a snapshot.");
      console.debug(`[DEBUG] Agent runner accepted runId=${runId} status=${runner.run.status}`);
      await saveActiveRun(installationId, canvasSessionId, record);

      const result = await executeAgentRunLoop({ coordinator: coordinatorRef.current, runId, claimOwner, signal: controller.signal, model: current.getModelConfig?.(), attachments,
        initialRunner: runner, claimRemoteTools, executeRemoteTool: executeRemoteToolRequest, afterToolResult: removeCachedToolResult,
        waitForRunnerEvent,
        onUpdate: ({ assistantText, parts }) => { setStatus(assistantText || parts.some((part) => part.type === "reasoning") ? "streaming" : "submitted"); setMessages((previous) => previous.map((item) => item.id !== assistantMessageId ? item : assistantMessageUpdate(item, parts))); }
      });
      if (result.runner && result.runner.run.status !== "running") {
        await removeActiveRun(installationId, canvasSessionId);
      }
      console.info(`[INFO] Agent run finished runId=${runId} status=${result.runner?.run.status ?? "unknown"}`);
      if (!stoppedRef.current) current.onFinish?.();
    } catch (caught) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/hooks/useAgentRunChat.ts:271", caught);
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
  desktopLogger.trace(`Uploading ${attachments.length} agent attachment(s)`);
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
    } catch (caughtError) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/hooks/useAgentRunChat.ts:321", caughtError);
      return attachment;
    }
  }));
}

function assistantMessageParts(parts: AgentRunDisplayPart[]) {
  return (parts.length ? parts : [{ type: "text", text: "" }]) as unknown as ChatMessage["parts"];
}

function assistantMessageUpdate(message: ChatMessage, parts: AgentRunDisplayPart[]): ChatMessage {
  return {
    ...message,
    parts: assistantMessageParts(parts),
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

/**
 * Each runner turn is intentionally stored as an independent ledger record.
 * Include the existing transcript in the new run prompt so the backend model
 * receives the same conversation context instead of treating every turn as a
 * brand-new request.
 */
export function conversationPrompt(currentPrompt: string, previousMessages: readonly ChatMessage[], locale: "zh-CN" | "en-US") {
  const entries = previousMessages
    .map((message) => {
      const text = message.parts
        .flatMap((part) => contextPartText(part))
        .join("\n")
        .trim();
      if (!text) return "";
      const role = message.role === "user" ? (locale === "en-US" ? "User" : "用户") : (locale === "en-US" ? "Assistant" : "助手");
      return `${role}: ${truncateConversationEntry(text)}`;
    })
    .filter(Boolean);
  const context = fitConversationContext(entries, locale);
  if (!context) return currentPrompt;
  const marker = locale === "en-US"
    ? "[GeoChat conversation history — previous turns; continue this same conversation]"
    : "【GeoChat 历史对话上下文（此前轮次，请在同一对话中继续）】";
  const currentMarker = locale === "en-US" ? "[GeoChat current user message]" : "【GeoChat 本轮用户消息】";
  return `${marker}\n${context}\n\n${currentMarker}\n${currentPrompt}`;
}

const MAX_CONVERSATION_CONTEXT_CHARS = 24_000;
const MAX_CONVERSATION_ENTRY_CHARS = 8_000;

function truncateConversationEntry(text: string) {
  if (text.length <= MAX_CONVERSATION_ENTRY_CHARS) return text;
  return `${text.slice(0, MAX_CONVERSATION_ENTRY_CHARS)}\n[…context entry truncated…]`;
}

function fitConversationContext(entries: string[], locale: "zh-CN" | "en-US") {
  if (!entries.length) return "";
  const selected: string[] = [];
  let used = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    const next = used + entry.length + (selected.length ? 2 : 0);
    if (next > MAX_CONVERSATION_CONTEXT_CHARS) break;
    selected.unshift(entry);
    used = next;
  }
  const omitted = entries.length - selected.length;
  if (omitted > 0) {
    selected.unshift(locale === "en-US"
      ? `[${omitted} earlier conversation turn(s) summarized or omitted by context budget]`
      : `【已有 ${omitted} 轮较早对话因上下文预算被摘要或省略】`);
  }
  return selected.join("\n\n");
}

function contextPartText(part: unknown): string[] {
  if (!part || typeof part !== "object" || Array.isArray(part)) return [];
  const value = part as Record<string, unknown>;
  if ((value.type === "text" || value.type === "reasoning") && typeof value.text === "string") return [value.text];
  if (typeof value.type === "string" && value.type.startsWith("tool-")) {
    const payload = value.output ?? value.errorText ?? value.input;
    if (payload === undefined) return [];
    try {
      return [`<untrusted-data source="tool-result">${JSON.stringify(payload)}</untrusted-data>`];
    } catch (caughtError) { console.error("[ERROR] Caught exception at src/renderer-react/src/hooks/useAgentRunChat.ts:414", caughtError); return []; }
  }
  return [];
}
