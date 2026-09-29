import { useCallback, useEffect, useRef, useState } from "react";
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
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
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

const logger = createStructuredLogger("agent-run.renderer");

type ChatMessage = UIMessage<ChatMessageMetadata>;
type SendMessageInput = { text?: string; files?: FileUIPart[] };
type SendMessageOptions = { body?: { conversationId?: string } };
type ActiveNativeRun = { runId: string; conversationId: string };
type NativeRunRequestContext = Omit<StoredActiveNativeRun, "runId">;
type NativeRunRequestSnapshot = Readonly<{
  model: AgentModelConfig;
  locale: "zh-CN" | "en-US";
  thinking: boolean;
  thinkingEffort: AgentRunThinkingEffort;
  desktopConfig: DesktopConfig;
}>;

const NATIVE_CHAT_NETWORK_RETRY_DELAYS_MS = [750, 1_500, 3_000] as const;

export type AddToolOutput = (input: {
  tool: string;
  toolCallId: string;
  output?: unknown;
  state?: "output-available" | "output-error";
  errorText?: string;
}) => void | PromiseLike<void>;

export class AgentRunSubmissionError extends Error {
  readonly messageAccepted: boolean;
  readonly originalError: Error;

  constructor(error: unknown, messageAccepted: boolean) {
    const originalError = error instanceof Error ? error : new Error(String(error));
    super(originalError.message, { cause: originalError });
    this.name = "AgentRunSubmissionError";
    this.messageAccepted = messageAccepted;
    this.originalError = originalError;
  }
}

export function wasAgentRunMessageAccepted(error: unknown) {
  return error instanceof AgentRunSubmissionError && error.messageAccepted;
}

export function unwrapAgentRunSubmissionError(error: unknown) {
  return error instanceof AgentRunSubmissionError ? error.originalError : error;
}

export class AgentRunSubmissionLease {
  private acquired = false;

  tryAcquire() {
    if (this.acquired) return false;
    this.acquired = true;
    return true;
  }

  release() {
    this.acquired = false;
  }
}

export function captureNativeRunRequestSnapshot(
  input: Pick<Parameters<typeof useAgentRunChat>[0], "getModelConfig" | "getThinking" | "getThinkingEffort" | "locale">,
  desktopConfig: DesktopConfig = readDesktopConfig(),
): NativeRunRequestSnapshot {
  const selectedModel = input.getModelConfig?.();
  if (!selectedModel) throw new Error("A model configuration is required.");
  const model = Object.freeze({ ...selectedModel });
  return Object.freeze({
    model,
    locale: input.locale,
    thinking: input.getThinking() && agentModelSupportsReasoning(model.provider, model.model),
    thinkingEffort: input.getThinkingEffort(),
    desktopConfig: structuredClone(desktopConfig),
  });
}

export async function stopActiveNativeRun(
  active: ActiveNativeRun | null,
  stopChat: () => Promise<unknown>,
  terminalize: (run: ActiveNativeRun) => Promise<unknown>,
) {
  await stopChat();
  if (active) await terminalize(active);
}

function isActiveNativeRun(activeRunRef: { current: ActiveNativeRun | null }, runId: string) {
  return activeRunRef.current?.runId === runId;
}

export function useAgentRunChat(input: {
  apiOrigin: string;
  getAuthToken: () => string | null;
  getModel: () => string;
  getModelConfig?: () => AgentModelConfig;
  getModelProvider?: (model: string) => string;
  locale: "zh-CN" | "en-US";
  onFinish?: () => void;
  onRendererToolSettled?: (toolName: string) => void;
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
  const activeRequestContextRef = useRef<NativeRunRequestContext | null>(null);
  const failedRequestContextRef = useRef<NativeRunRequestContext | null>(null);
  const activeRequestSnapshotRef = useRef<NativeRunRequestSnapshot | null>(null);
  const failedRequestSnapshotRef = useRef<NativeRunRequestSnapshot | null>(null);
  const submissionLeaseRef = useRef(new AgentRunSubmissionLease());
  const userStopInProgressRef = useRef(false);
  const [canRetry, setCanRetry] = useState(false);

  const rememberFailedRequest = (request: NativeRunRequestContext | null) => {
    failedRequestContextRef.current = request;
    setCanRetry(Boolean(request));
  };

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
    logger.warn("stream_retry_scheduled", "AGENT_STREAM_RETRY_SCHEDULED", {
      error,
      runId: active.runId,
      conversationId: active.conversationId,
      retryDelayMs: delay,
      retryAttempt: networkRetryAttemptRef.current,
    });
    networkRetryTimerRef.current = globalThis.setTimeout(() => {
      networkRetryTimerRef.current = null;
      if (activeRunRef.current?.runId !== active.runId || runGenerationRef.current !== generation) return;
      const retry = retryCurrentRequestRef.current;
      if (!retry) return;
      void retry().catch((retryError) => {
        if (scheduleNetworkRetry(active, retryError)) return;
        rememberFailedRequest(activeRequestContextRef.current);
        failedRequestSnapshotRef.current = activeRequestSnapshotRef.current;
        activeRequestContextRef.current = null;
        activeRequestSnapshotRef.current = null;
        activeRunRef.current = null;
        runGenerationRef.current += 1;
        void terminalizeInterruptedNativeRun(active, inputRef.current, installationIdRef).catch((cancelError) => {
          logger.warn("retry_terminalization_failed", "AGENT_RUN_TERMINALIZATION_FAILED", {
            error: cancelError,
            runId: active.runId,
            conversationId: active.conversationId,
          });
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
        const snapshot = activeRequestSnapshotRef.current;
        if (!snapshot) throw new Error("A native AI SDK request snapshot is required.");
        const transportMessages = nativeChatTransportMessages(
          messages,
          snapshot.desktopConfig,
          snapshot.locale,
        );
        return {
          body: {
            ...transportMessages,
            runId: active.runId,
            conversationId: active.conversationId,
            model: snapshot.model,
            locale: snapshot.locale,
            thinking: snapshot.thinking,
            thinkingEffort: snapshot.thinkingEffort,
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
      logger.debug("tool_received", "AGENT_TOOL_RECEIVED", {
        runId: active?.runId,
        conversationId: active?.conversationId,
        toolName,
        toolCallId: toolCall.toolCallId,
        dynamic: toolCall.dynamic,
        rendererTool,
      });
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
        logger.error("renderer_tool_failed", "AGENT_RENDERER_TOOL_FAILED", {
          error,
          runId,
          conversationId: active.conversationId,
          toolName,
          toolCallId: toolCall.toolCallId,
        });
        queueToolOutput(addToolOutputRef.current, {
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: error instanceof Error ? error.message : "Renderer tool failed.",
        }, isCurrentRun);
      } finally {
        if (isCurrentRun()) inputRef.current.onRendererToolSettled?.(toolName);
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
        if (isAbort && userStopInProgressRef.current) {
          clearNetworkRetry();
          return;
        }
        const interruptedRun = activeRunRef.current;
        activeRequestContextRef.current = null;
        activeRequestSnapshotRef.current = null;
        activeRunRef.current = null;
        runGenerationRef.current += 1;
        clearNetworkRetry();
        if (interruptedRun) {
          void terminalizeInterruptedNativeRun(interruptedRun, inputRef.current, installationIdRef).catch((error) => {
            logger.warn("interrupted_run_terminalization_failed", "AGENT_RUN_TERMINALIZATION_FAILED", {
              error,
              runId: interruptedRun.runId,
              conversationId: interruptedRun.conversationId,
            });
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
      activeRequestContextRef.current = null;
      activeRequestSnapshotRef.current = null;
      rememberFailedRequest(null);
      failedRequestSnapshotRef.current = null;
      activeRunRef.current = null;
      runGenerationRef.current += 1;
      clearNetworkRetry();
      if (completedRun) void clearActiveNativeRun(completedRun.runId);
      inputRef.current.onFinish?.();
    },
    onError: (error) => {
      if (userStopInProgressRef.current) return;
      const active = activeRunRef.current;
      if (active && scheduleNetworkRetry(active, error)) return;
      logger.error("chat_failed", "AGENT_CHAT_FAILED", {
        error,
        runId: active?.runId,
        conversationId: active?.conversationId,
      });
      rememberFailedRequest(activeRequestContextRef.current);
      failedRequestSnapshotRef.current = activeRequestSnapshotRef.current;
      activeRequestContextRef.current = null;
      activeRequestSnapshotRef.current = null;
      activeRunRef.current = null;
      runGenerationRef.current += 1;
      clearNetworkRetry();
      if (active) {
        void terminalizeInterruptedNativeRun(active, inputRef.current, installationIdRef).catch((cancelError) => {
          logger.warn("chat_error_terminalization_failed", "AGENT_RUN_TERMINALIZATION_FAILED", {
            error: cancelError,
            runId: active.runId,
            conversationId: active.conversationId,
          });
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
        if (runGenerationRef.current === generation) logger.warn("interrupted_run_recovery_failed", "AGENT_RUN_RECOVERY_FAILED", { error });
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
    if (!submissionLeaseRef.current.tryAcquire()) return;
    const conversationId = options?.body?.conversationId;
    try {
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
      const snapshot = captureNativeRunRequestSnapshot(current);
      const submissionGeneration = runGenerationRef.current;

      await recoveryPromiseRef.current;
      if (
        runGenerationRef.current !== submissionGeneration
        || chat.status === "submitted"
        || chat.status === "streaming"
        || activeRunRef.current
      ) return;

      const attachments = await uploadImageAttachments(current.apiOrigin, current.getAuthToken(), localAttachments);
      if (
        runGenerationRef.current !== submissionGeneration
        || activeRunRef.current
      ) return;
      const uploadedFiles = files.map((file, index) => attachments[index]
        ? { ...file, url: attachments[index]!.dataUrl }
        : file);
      const runId = `run_${crypto.randomUUID().replaceAll("-", "")}`;
      clearNetworkRetry();
      runGenerationRef.current += 1;
      const text = message.text?.trim();
      const requestContext: NativeRunRequestContext = {
        conversationId,
        modelProvider: snapshot.model.provider,
        modelId: snapshot.model.model,
        prompt: currentPrompt,
        thinking: snapshot.thinking,
        thinkingEffort: snapshot.thinkingEffort,
      };
      activeRequestContextRef.current = requestContext;
      activeRequestSnapshotRef.current = snapshot;
      rememberFailedRequest(null);
      failedRequestSnapshotRef.current = null;
      let messageAccepted = false;
      try {
        await activateNativeRun(activeRunRef, {
          runId,
          ...requestContext,
        });
        messageAccepted = true;
        if (!isActiveNativeRun(activeRunRef, runId)) throw new Error("Agent run submission was superseded before transport started.");
        if (text) await chat.sendMessage({ text, ...(uploadedFiles.length ? { files: uploadedFiles } : {}) });
        else await chat.sendMessage({ files: uploadedFiles });
      } catch (error) {
        if (messageAccepted) {
          rememberFailedRequest(requestContext);
          failedRequestSnapshotRef.current = snapshot;
        }
        activeRequestContextRef.current = null;
        activeRequestSnapshotRef.current = null;
        activeRunRef.current = null;
        runGenerationRef.current += 1;
        let submissionError: unknown = error;
        try {
          await terminalizeInterruptedNativeRun({ runId, conversationId }, current, installationIdRef);
        } catch (cancelError) {
          submissionError = new AggregateError(
            [error, cancelError],
            `Native AI SDK submission failed and run ${runId} could not be terminalized.`,
          );
        }
        throw new AgentRunSubmissionError(submissionError, messageAccepted);
      }
    } finally {
      submissionLeaseRef.current.release();
    }
  }, [chat]);

  const retry = useCallback(async () => {
    if (!submissionLeaseRef.current.tryAcquire()) return false;
    try {
      await recoveryPromiseRef.current;
      if (chat.status === "submitted" || chat.status === "streaming" || activeRunRef.current) return false;
      const requestContext = failedRequestContextRef.current;
      const requestSnapshot = failedRequestSnapshotRef.current;
      if (!requestContext || !requestSnapshot) return false;
      const runId = `run_${crypto.randomUUID().replaceAll("-", "")}`;
      clearNetworkRetry();
      runGenerationRef.current += 1;
      activeRequestContextRef.current = requestContext;
      activeRequestSnapshotRef.current = requestSnapshot;
      rememberFailedRequest(null);
      failedRequestSnapshotRef.current = null;
      let requestActivated = false;
      try {
        await activateNativeRun(activeRunRef, { runId, ...requestContext });
        requestActivated = true;
        if (!isActiveNativeRun(activeRunRef, runId)) throw new Error("Agent run retry was superseded before transport started.");
        chat.clearError();
        // AI SDK owns message truncation and request reconstruction. This
        // removes a partial assistant response, keeps the original user turn,
        // and avoids duplicating that message in local history.
        await chat.regenerate();
        return true;
      } catch (error) {
        activeRequestContextRef.current = null;
        activeRequestSnapshotRef.current = null;
        activeRunRef.current = null;
        rememberFailedRequest(requestContext);
        failedRequestSnapshotRef.current = requestSnapshot;
        if (requestActivated) {
          let retryError: unknown = error;
          try {
            await terminalizeInterruptedNativeRun({ runId, conversationId: requestContext.conversationId }, inputRef.current, installationIdRef);
          } catch (cancelError) {
            retryError = new AggregateError(
              [error, cancelError],
              `Native AI SDK retry failed and run ${runId} could not be terminalized.`,
            );
          }
          throw new AgentRunSubmissionError(retryError, true);
        }
        throw new AgentRunSubmissionError(error, true);
      }
    } finally {
      submissionLeaseRef.current.release();
    }
  }, [chat]);

  const stop = useCallback(async () => {
    const active = activeRunRef.current;
    userStopInProgressRef.current = true;
    try {
      await stopActiveNativeRun(
        active,
        () => chat.stop(),
        (run) => terminalizeInterruptedNativeRun(run, inputRef.current, installationIdRef),
      );
      activeRequestContextRef.current = null;
      activeRequestSnapshotRef.current = null;
      rememberFailedRequest(null);
      failedRequestSnapshotRef.current = null;
      if (!active || activeRunRef.current?.runId === active.runId) activeRunRef.current = null;
      runGenerationRef.current += 1;
      clearNetworkRetry();
    } finally {
      userStopInProgressRef.current = false;
    }
  }, [chat]);

  return {
    messages: chat.messages,
    setMessages: chat.setMessages,
    sendMessage,
    retry,
    canRetry,
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

export function nativeChatTransportMessages<Message extends UIMessage>(
  messages: Message[],
  config: DesktopConfig,
  locale: "zh-CN" | "en-US",
) {
  const visibleMessages = completeInterruptedToolParts(messages);
  return {
    // This is the only transcript the backend may persist or return to the UI.
    messages: visibleMessages,
    // Provider-only augmentation must never become conversation history.
    providerMessages: messagesWithSkillPolicy(visibleMessages, config, locale),
  };
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
      logger.warn("tool_output_queue_failed", "AGENT_TOOL_OUTPUT_QUEUE_FAILED", {
        error,
        toolName: input.tool,
        toolCallId: input.toolCallId,
      });
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
      logger.warn("attachment_upload_failed", "AGENT_ATTACHMENT_UPLOAD_FAILED", { error: caughtError, attachmentName: attachment.name });
      return attachment;
    }
  }));
}
