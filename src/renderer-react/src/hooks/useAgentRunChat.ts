import { useCallback, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type FileUIPart,
  type UIMessage,
} from "ai";
import {
  isFunctionCallRendererExecutable,
  isFunctionCallToolName,
} from "@geochat-ai/app/functioncalls";
import type { AgentRunImageAttachment, ChatMessageMetadata } from "@geochat-ai/app/contracts";
import { agentModelSupportsReasoning, type AgentModelConfig } from "@geochat-ai/app/model-registry";
import type { AgentRunThinkingEffort } from "@geochat-ai/app/contracts";
import { areSupportedAgentAttachments } from "../features/attachments/capabilities";
import {
  clearActiveNativeRun,
  getInstallationId,
  readActiveNativeRun,
  saveActiveNativeRun,
  type StoredActiveNativeRun,
} from "../features/agent-run/activeRunStorage";
import { executeRendererTool } from "../features/agent-run/toolWorker";
import { desktopLogger } from "../features/desktop/desktopLogger";
import {
  promptWithSkillPolicy,
  readDesktopConfig,
} from "../../../shared/desktop/desktop-config";
import type { DesktopConfig } from "../../../shared/desktop/workbench-types";

type ChatMessage = UIMessage<ChatMessageMetadata>;
type SendMessageInput = { text?: string; files?: FileUIPart[] };
type SendMessageOptions = { body?: { conversationId?: string } };
type ActiveNativeRun = { runId: string; conversationId: string };

const NATIVE_CHAT_NETWORK_RETRY_DELAYS_MS = [750, 1_500, 3_000] as const;

export type AddToolOutput = (input: {
  tool: string;
  toolCallId: string;
  output?: unknown;
  state?: "output-available" | "output-error";
  errorText?: string;
}) => void | PromiseLike<void>;

export function useAgentRunChat(input: {
  apiOrigin: string;
  getAuthToken: () => string | null;
  getModel: () => string;
  getModelConfig?: () => AgentModelConfig;
  getModelProvider?: (model: string) => string;
  locale: "zh-CN" | "en-US";
  onFinish?: () => void;
  onRestore?: (run: { conversationId: string; modelProvider: string; modelId: string; prompt: string; thinking: boolean; thinkingEffort: AgentRunThinkingEffort | null }) => void;
  getThinking: () => boolean;
  getThinkingEffort: () => AgentRunThinkingEffort;
}) {
  const inputRef = useRef(input);
  inputRef.current = input;
  const activeRunRef = useRef<ActiveNativeRun | null>(null);
  const installationIdRef = useRef<string | null>(null);
  const addToolOutputRef = useRef<AddToolOutput | null>(null);
  const transportRef = useRef<DefaultChatTransport<ChatMessage> | null>(null);
  const runGenerationRef = useRef(0);
  const recoveryPromiseRef = useRef<Promise<void> | null>(null);
  const networkRetryAttemptRef = useRef(0);
  const networkRetryTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const retryCurrentRequestRef = useRef<(() => Promise<void>) | null>(null);

  const clearNetworkRetry = () => {
    if (networkRetryTimerRef.current !== null) globalThis.clearTimeout(networkRetryTimerRef.current);
    networkRetryTimerRef.current = null;
    networkRetryAttemptRef.current = 0;
  };

  const scheduleNetworkRetry = (active: ActiveNativeRun, error: unknown) => {
    if (activeRunRef.current?.runId !== active.runId) return false;
    if (networkRetryTimerRef.current !== null) return true;
    const delay = nativeChatNetworkRetryDelay(networkRetryAttemptRef.current);
    if (delay === null || !isRetryableNativeChatError(error)) return false;
    const generation = runGenerationRef.current;
    networkRetryAttemptRef.current += 1;
    desktopLogger.warn(`Native AI SDK stream interrupted; retrying run ${active.runId} in ${delay}ms (${networkRetryAttemptRef.current}/${NATIVE_CHAT_NETWORK_RETRY_DELAYS_MS.length})`);
    networkRetryTimerRef.current = globalThis.setTimeout(() => {
      networkRetryTimerRef.current = null;
      if (activeRunRef.current?.runId !== active.runId || runGenerationRef.current !== generation) return;
      const retry = retryCurrentRequestRef.current;
      if (!retry) return;
      void retry().catch((retryError) => {
        if (scheduleNetworkRetry(active, retryError)) return;
        activeRunRef.current = null;
        runGenerationRef.current += 1;
        void terminalizeInterruptedNativeRun(active, inputRef.current, installationIdRef).catch((cancelError) => {
          console.error("[ERROR] Failed to terminalize the active agent run after network retries", cancelError);
        });
      });
    }, delay);
    return true;
  };

  if (!transportRef.current) {
    transportRef.current = new DefaultChatTransport<ChatMessage>({
      api: `${input.apiOrigin.replace(/\/+$/, "")}/v1/chat`,
      headers: async () => {
        const token = inputRef.current.getAuthToken();
        const headers: Record<string, string> = {
          "x-client-channel": token ? "desktop-workbench" : "web-workbench",
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        else headers["x-guest-session-id"] = guestSessionId(await getInstallationId(installationIdRef));
        return headers;
      },
      prepareSendMessagesRequest: ({ messages }) => {
        const active = activeRunRef.current;
        if (!active) throw new Error("A native AI SDK run context is required.");
        const current = inputRef.current;
        const model = current.getModelConfig?.();
        if (!model) throw new Error("A model configuration is required.");
        const thinking = current.getThinking()
          && agentModelSupportsReasoning(model.provider, model.model);
        return {
          body: {
            messages: messagesWithSkillPolicy(
              completeInterruptedToolParts(messages),
              readDesktopConfig(),
              current.locale,
            ),
            runId: active.runId,
            conversationId: active.conversationId,
            model,
            locale: current.locale,
            thinking,
            thinkingEffort: current.getThinkingEffort(),
          },
        };
      },
    });
  }

  const chat = useChat<ChatMessage>({
    transport: transportRef.current,
    // Coalesce high-frequency stream chunks before notifying React. WebKit can
    // otherwise deliver a burst of synchronous external-store updates and hit
    // React's nested-update guard while an error chunk is being finalized.
    throttle: 150,
    sendAutomaticallyWhen: shouldAutomaticallyContinueNativeRun,
    onToolCall: async ({ toolCall }) => {
      const active = activeRunRef.current;
      const toolName = toolCall.toolName;
      const knownTool = isFunctionCallToolName(toolName);
      const rendererTool = knownTool && isFunctionCallRendererExecutable(toolName);
      console.debug(`[DEBUG] Native AI SDK tool received name=${toolName} dynamic=${toolCall.dynamic} active=${Boolean(active)} renderer=${rendererTool}`);
      if (!active || toolCall.dynamic || !knownTool || !rendererTool) return;
      const runId = active.runId;
      const generation = runGenerationRef.current;
      const isCurrentRun = () => activeRunRef.current?.runId === runId && runGenerationRef.current === generation;
      try {
        const result = await executeRendererTool(toolName, toolCall.input);
        if (!isCurrentRun()) return;
        if (result.ok) {
          queueToolOutput(addToolOutputRef.current, {
            tool: toolName,
            toolCallId: toolCall.toolCallId,
            output: result,
          }, isCurrentRun);
        } else {
          queueToolOutput(addToolOutputRef.current, {
            tool: toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: result.error ?? "Renderer tool failed.",
          }, isCurrentRun);
        }
      } catch (error) {
        console.error(`[ERROR] Renderer tool failed tool=${toolName} toolCallId=${toolCall.toolCallId}`, error);
        queueToolOutput(addToolOutputRef.current, {
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: error instanceof Error ? error.message : "Renderer tool failed.",
        }, isCurrentRun);
      }
    },
    onFinish: ({ message, finishReason, isAbort, isDisconnect, isError }) => {
      if (isDisconnect) {
        const disconnectedRun = activeRunRef.current;
        if (disconnectedRun && scheduleNetworkRetry(disconnectedRun, new TypeError("Network stream disconnected."))) return;
      }
      // onError owns error classification and retry. Clearing the run here
      // would turn a recoverable transport failure into a user cancellation.
      if (isError) return;
      if (isAbort || isDisconnect) {
        const interruptedRun = activeRunRef.current;
        activeRunRef.current = null;
        runGenerationRef.current += 1;
        clearNetworkRetry();
        if (interruptedRun) {
          void terminalizeInterruptedNativeRun(interruptedRun, inputRef.current, installationIdRef).catch((error) => {
            console.error("[ERROR] Failed to terminalize an interrupted native AI SDK run", error);
          });
        }
        return;
      }
      if (!shouldCompleteNativeRun(message, finishReason)) {
        // A renderer tool result is queued after onToolCall returns. At this
        // point the message can still contain input-available even though the
        // result is about to be attached. The AI SDK's sendAutomaticallyWhen
        // callback owns continuation; cancelling here races the backend CAS
        // write and incorrectly records a normal tool handoff as user stop.
        return;
      }
      const completedRun = activeRunRef.current;
      activeRunRef.current = null;
      runGenerationRef.current += 1;
      clearNetworkRetry();
      if (completedRun) void clearActiveNativeRun(completedRun.runId);
      inputRef.current.onFinish?.();
    },
    onError: (error) => {
      console.error(`[ERROR] Native AI SDK chat failed: ${error.message}`, error);
      const active = activeRunRef.current;
      if (active && scheduleNetworkRetry(active, error)) return;
      activeRunRef.current = null;
      runGenerationRef.current += 1;
      clearNetworkRetry();
      if (active) {
        void terminalizeInterruptedNativeRun(active, inputRef.current, installationIdRef).catch((cancelError) => {
          console.error("[ERROR] Failed to terminalize the active agent run after a chat error", cancelError);
        });
      }
    },
  });
  addToolOutputRef.current = chat.addToolOutput as AddToolOutput;
  retryCurrentRequestRef.current = async () => {
    chat.clearError();
    // Sending without a new message resubmits the current native AI SDK
    // history, preserving completed renderer tool outputs across a reconnect.
    await chat.sendMessage();
  };

  useEffect(() => {
    const generation = runGenerationRef.current;
    const recovery = recoverInterruptedNativeRun(inputRef.current, installationIdRef, fetch, () => runGenerationRef.current === generation)
      .then(() => undefined)
      .catch((error) => {
        if (runGenerationRef.current === generation) console.error("[ERROR] Failed to recover interrupted native AI SDK run", error);
      })
      .finally(() => {
        if (recoveryPromiseRef.current === recovery) recoveryPromiseRef.current = null;
      });
    recoveryPromiseRef.current = recovery;
    return () => {
      runGenerationRef.current += 1;
      if (networkRetryTimerRef.current !== null) globalThis.clearTimeout(networkRetryTimerRef.current);
      networkRetryTimerRef.current = null;
    };
  }, []);

  const sendMessage = useCallback(async (message: SendMessageInput, options?: SendMessageOptions) => {
    await recoveryPromiseRef.current;
    if (chat.status === "submitted" || chat.status === "streaming" || activeRunRef.current) return;
    const conversationId = options?.body?.conversationId;
    if (!conversationId) throw new Error("A conversation id is required for an agent run.");
    const files = message.files ?? [];
    if (!areSupportedAgentAttachments(files)) {
      const unsupported = files.find((file) => !file.mediaType?.startsWith("image/"));
      throw new Error(`Unsupported agent attachment: ${unsupported?.filename ?? "file"}. Only image attachments are supported.`);
    }
    const localAttachments = toImageAttachments(files);
    const currentPrompt = message.text?.trim() || (localAttachments.length ? "Analyze the attached image and help with the GeoGebra task." : "");
    if (!currentPrompt) return;
    const current = inputRef.current;
    const attachments = await uploadImageAttachments(current.apiOrigin, current.getAuthToken(), localAttachments);
    const uploadedFiles = files.map((file, index) => attachments[index]
      ? { ...file, url: attachments[index]!.dataUrl }
      : file);
    const runId = `run_${crypto.randomUUID().replaceAll("-", "")}`;
    clearNetworkRetry();
    runGenerationRef.current += 1;
    const text = message.text?.trim();
    const model = current.getModelConfig?.();
    if (!model) {
      activeRunRef.current = null;
      throw new Error("A model configuration is required.");
    }
    const thinking = current.getThinking() && agentModelSupportsReasoning(model.provider, model.model);
    try {
      await activateNativeRun(activeRunRef, {
        runId,
        conversationId,
        modelProvider: model.provider,
        modelId: model.model,
        prompt: currentPrompt,
        thinking,
        thinkingEffort: current.getThinkingEffort(),
      });
      if (text) await chat.sendMessage({ text, ...(uploadedFiles.length ? { files: uploadedFiles } : {}) });
      else await chat.sendMessage({ files: uploadedFiles });
    } catch (error) {
      activeRunRef.current = null;
      runGenerationRef.current += 1;
      try {
        await terminalizeInterruptedNativeRun({ runId, conversationId }, current, installationIdRef);
      } catch (cancelError) {
        console.error(`[ERROR] Failed to terminalize rejected native AI SDK run runId=${runId}`, cancelError);
      }
      throw error;
    }
  }, [chat]);

  const stop = useCallback(async () => {
    const active = activeRunRef.current;
    activeRunRef.current = null;
    runGenerationRef.current += 1;
    clearNetworkRetry();
    await chat.stop();
    if (!active) return;
    const current = inputRef.current;
    try {
      await terminalizeInterruptedNativeRun(active, current, installationIdRef);
    } catch (error) {
      console.error(`[ERROR] Failed to cancel native AI SDK run runId=${active.runId}`, error);
    }
  }, [chat]);

  return {
    messages: chat.messages,
    setMessages: chat.setMessages,
    sendMessage,
    stop,
    status: chat.status,
    error: chat.error,
  };
}

export function nativeChatNetworkRetryDelay(attempt: number) {
  return NATIVE_CHAT_NETWORK_RETRY_DELAYS_MS[attempt] ?? null;
}

export function isRetryableNativeChatError(error: unknown) {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/\b(?:408|425|429|500|502|503|504)\b/.test(message)) return true;
  return /(?:failed to fetch|fetch failed|network|connection|disconnected|load failed|timed? ?out|socket|econnreset|enotfound|temporary failure)/i.test(message);
}

export async function activateNativeRun(
  activeRunRef: { current: ActiveNativeRun | null },
  stored: StoredActiveNativeRun,
  save: (run: StoredActiveNativeRun) => Promise<void> = saveActiveNativeRun,
) {
  activeRunRef.current = { runId: stored.runId, conversationId: stored.conversationId };
  try {
    await save(stored);
  } catch (error) {
    if (activeRunRef.current?.runId === stored.runId) activeRunRef.current = null;
    throw error;
  }
}

export function shouldAutomaticallyContinueNativeRun({ messages }: { messages: UIMessage[] }) {
  const message = messages.at(-1);
  if (!message || message.role !== "assistant") return false;
  const lastStepStart = message.parts.reduce((index, part, current) => part.type === "step-start" ? current : index, -1);
  const tools = message.parts.slice(lastStepStart + 1).filter(isToolUIPart);
  if (!tools.length || tools.some((part) => !isCompletedToolPart(part))) return false;
  if (tools.some((part) => getToolName(part) === "setFinished")) return false;
  return tools.some((part) => {
    const name = getToolName(part);
    return isFunctionCallToolName(name) && isFunctionCallRendererExecutable(name);
  });
}

export function shouldCompleteNativeRun(message: UIMessage, finishReason?: string) {
  if (hasCompletedSetFinished(message)) return true;
  return finishReason !== "tool-calls" && !hasPendingToolParts(message);
}

export function completeInterruptedToolParts<Message extends UIMessage>(messages: Message[]) {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    let changed = false;
    const parts = message.parts.map((part) => {
      if (!isToolUIPart(part) || isCompletedToolPart(part)) return part;
      changed = true;
      return {
        ...part,
        state: "output-error" as const,
        errorText: "Tool execution was interrupted before a result was received.",
      };
    });
    return changed ? { ...message, parts } as Message : message;
  });
}

function hasCompletedSetFinished(message: UIMessage) {
  return message.parts.some((part) => isToolUIPart(part)
    && getToolName(part) === "setFinished"
    && part.state === "output-available"
    && toolOutputSucceeded(part));
}

function toolOutputSucceeded(part: unknown) {
  if (!part || typeof part !== "object") return false;
  const output = (part as Record<string, unknown>).output;
  return !output || typeof output !== "object" || Array.isArray(output) || (output as Record<string, unknown>).ok !== false;
}

function isCompletedToolPart(part: { state: string }) {
  return part.state === "output-available" || part.state === "output-error" || part.state === "output-denied";
}

export function messagesWithSkillPolicy<Message extends UIMessage>(
  messages: Message[],
  config: DesktopConfig,
  locale: "zh-CN" | "en-US",
) {
  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }
  if (latestUserIndex < 0) return messages;
  const latestUser = messages[latestUserIndex]!;
  let latestTextIndex = -1;
  for (let index = latestUser.parts.length - 1; index >= 0; index -= 1) {
    if (latestUser.parts[index]?.type === "text") {
      latestTextIndex = index;
      break;
    }
  }
  if (latestTextIndex < 0) return messages;
  const originalPart = latestUser.parts[latestTextIndex]!;
  if (originalPart.type !== "text") return messages;

  const parts = [...latestUser.parts];
  parts[latestTextIndex] = {
    ...originalPart,
    text: promptWithSkillPolicy(originalPart.text, config, locale),
  };
  const requestMessages = [...messages];
  requestMessages[latestUserIndex] = { ...latestUser, parts } as Message;
  return requestMessages;
}

/**
 * AI SDK invokes `onToolCall` from its serialized message-update queue.
 * `addToolOutput` schedules work on that same queue, so awaiting it from the
 * callback deadlocks the stream at `input-available`. Queue it and let the
 * callback return first, as required by the SDK contract.
 */
export function queueToolOutput(
  addToolOutput: AddToolOutput | null,
  input: Parameters<AddToolOutput>[0],
  isCurrent: () => boolean = () => true,
) {
  if (!addToolOutput) return;
  // `onToolCall` runs while AI SDK is applying the current stream update.
  // Starting addToolOutput in that same task can synchronously publish the
  // ready/submitted transition through useSyncExternalStore before React has
  // committed the preceding tool-part snapshot. Let the stream callback exit
  // first; the SDK then owns the native automatic continuation as usual.
  globalThis.setTimeout(() => {
    if (!isCurrent()) return;
    void Promise.resolve(addToolOutput(input)).catch((error) => {
      console.error(`[ERROR] Failed to queue renderer tool output tool=${input.tool} toolCallId=${input.toolCallId}`, error);
    });
  }, 0);
}

function hasPendingToolParts(message: UIMessage) {
  return message.parts.some((part) => isToolUIPart(part) && (
    part.state === "input-streaming" || part.state === "input-available" || part.state === "approval-requested"
  ));
}

function guestSessionId(installationId: string) {
  return `frontend_guest_${installationId}`;
}

async function cancelNativeRun(
  active: ActiveNativeRun,
  input: Parameters<typeof useAgentRunChat>[0],
  installationIdRef: { current: string | null },
  request: typeof fetch = fetch,
) {
  const headers = await nativeRunHeaders(input, installationIdRef);
  const response = await request(new URL(`/v1/agent-runs/${encodeURIComponent(active.runId)}/cancel`, input.apiOrigin), {
    method: "POST",
    headers,
  });
  if (!response.ok && response.status !== 404) throw new Error(`Agent run cancellation failed with HTTP ${response.status}.`);
}

async function terminalizeInterruptedNativeRun(
  active: ActiveNativeRun,
  input: Parameters<typeof useAgentRunChat>[0],
  installationIdRef: { current: string | null },
) {
  await cancelNativeRun(active, input, installationIdRef);
  await clearActiveNativeRun(active.runId);
}

type RecoverableAgentRun = {
  runId: string;
  conversationId: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  modelProvider: string;
  modelId: string;
  prompt: string;
  thinking?: boolean | null;
  thinkingEffort?: AgentRunThinkingEffort | null;
};

export async function recoverInterruptedNativeRun(
  input: Parameters<typeof useAgentRunChat>[0],
  installationIdRef: { current: string | null },
  request: typeof fetch = fetch,
  isCurrent: () => boolean = () => true,
) {
  const stored = await readActiveNativeRun();
  if (!stored) return null;

  const response = await request(new URL("/v1/agent-runs", input.apiOrigin), {
    cache: "no-store",
    headers: await nativeRunHeaders(input, installationIdRef),
  });
  if (!response.ok) {
    if (response.status === 404) {
      await clearActiveNativeRun(stored.runId);
      return null;
    }
    throw new Error(`Agent run recovery failed with HTTP ${response.status}.`);
  }
  const payload = await response.json() as { runs?: unknown };
  const run = parseRecoverableAgentRun(payload.runs, stored.runId);
  if (!run) {
    await clearActiveNativeRun(stored.runId);
    return null;
  }
  if (!isCurrent()) return null;
  input.onRestore?.({
    conversationId: run.conversationId,
    modelProvider: run.modelProvider,
    modelId: run.modelId,
    prompt: run.prompt,
    thinking: run.thinking === true,
    thinkingEffort: run.thinkingEffort ?? null,
  });
  if (run.status === "running") {
    await cancelNativeRun({ runId: run.runId, conversationId: run.conversationId }, input, installationIdRef, request);
  }
  if (!isCurrent()) return null;
  await clearActiveNativeRun(stored.runId);
  return run;
}

function parseRecoverableAgentRun(value: unknown, runId: string): RecoverableAgentRun | null {
  if (!Array.isArray(value)) return null;
  const candidate = value.find((item) => item && typeof item === "object" && !Array.isArray(item)
    && (item as Record<string, unknown>).runId === runId);
  if (!candidate) return null;
  const run = candidate as Record<string, unknown>;
  if (
    typeof run.runId !== "string"
    || typeof run.conversationId !== "string"
    || typeof run.modelProvider !== "string"
    || typeof run.modelId !== "string"
    || typeof run.prompt !== "string"
    || (run.status !== "running" && run.status !== "succeeded" && run.status !== "failed" && run.status !== "cancelled")
  ) return null;
  const effort = run.thinkingEffort;
  return {
    runId: run.runId,
    conversationId: run.conversationId,
    status: run.status,
    modelProvider: run.modelProvider,
    modelId: run.modelId,
    prompt: run.prompt,
    thinking: typeof run.thinking === "boolean" ? run.thinking : null,
    thinkingEffort: effort === "light" || effort === "standard" || effort === "extended" ? effort : null,
  };
}

async function nativeRunHeaders(
  input: Parameters<typeof useAgentRunChat>[0],
  installationIdRef: { current: string | null },
) {
  const token = input.getAuthToken();
  const headers: Record<string, string> = {
    "x-client-channel": token ? "desktop-workbench" : "web-workbench",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  else headers["x-guest-session-id"] = guestSessionId(await getInstallationId(installationIdRef));
  return headers;
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
      return typeof payload.url === "string" ? { ...attachment, dataUrl: payload.url } : attachment;
    } catch (caughtError) {
      console.error("[ERROR] Failed to upload an agent attachment", caughtError);
      return attachment;
    }
  }));
}
