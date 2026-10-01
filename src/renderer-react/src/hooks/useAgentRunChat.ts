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
import type { ChatMessageMetadata } from "@geochat-ai/app/contracts";
import type { BackendRuntimeSnapshot } from "@geochat-ai/app/desktop-contracts";
import type { AgentModelConfig } from "@geochat-ai/app/model-registry";
import type { AgentRunThinkingEffort } from "@geochat-ai/app/contracts";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import {
  activateNativeRun,
  AgentRunSubmissionError,
  AgentRunSubmissionLease,
  BackendRuntimeListener,
  BackendRuntimeRecoveryGate,
  backendRuntimeUnavailable,
  invalidateNativeRunAfterBackendLoss,
  recoverInterruptedNativeRun,
  stopActiveNativeRun,
  terminalizeInterruptedNativeRun,
  type ActiveNativeRun,
} from "../features/agent-run/nativeRunLifecycle";
import {
  isRetryableNativeChatError,
  nativeChatNetworkRetryDelay,
  nativeChatRequestBody,
  nativeRunHeaders,
  prepareNativeRunSubmission,
  uploadImageAttachments,
  type NativeRunRequestSnapshot,
} from "../features/agent-run/nativeRunRequest";
import { executeRendererTool } from "../features/agent-run/toolWorker";
import type { GeoGebraRuntimePort } from "../geogebra/runtime";
import { desktopApi, desktopRuntime } from "../features/desktop/runtime";

export {
  activateNativeRun,
  AgentRunSubmissionError,
  AgentRunSubmissionLease,
  recoverInterruptedNativeRun,
  stopActiveNativeRun,
  unwrapAgentRunSubmissionError,
  wasAgentRunMessageAccepted,
} from "../features/agent-run/nativeRunLifecycle";
export {
  captureNativeRunRequestSnapshot,
  completeInterruptedToolParts,
  isRetryableNativeChatError,
  messagesWithSkillPolicy,
  nativeChatNetworkRetryDelay,
  nativeChatTransportMessages,
} from "../features/agent-run/nativeRunRequest";

const logger = createStructuredLogger("agent-run.renderer");

type ChatMessage = UIMessage<ChatMessageMetadata>;
type SendMessageInput = { text?: string; files?: FileUIPart[] };
type SendMessageOptions = { body?: { conversationId?: string } };
type NativeRunRequestContext = {
  conversationId: string;
  modelProvider: string;
  modelId: string;
  prompt: string;
  thinking: boolean;
  thinkingEffort: AgentRunThinkingEffort | null;
};

export type AddToolOutput = (input: {
  tool: string;
  toolCallId: string;
  output?: unknown;
  state?: "output-available" | "output-error";
  errorText?: string;
}) => void | PromiseLike<void>;

function isActiveNativeRun(activeRunRef: { current: ActiveNativeRun | null }, runId: string) {
  return activeRunRef.current?.runId === runId;
}

export function useAgentRunChat(input: {
  geogebraRuntime: GeoGebraRuntimePort;
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
  const initialBackendRuntime = desktopRuntime()?.backendRuntime ?? null;
  const backendRuntimeRef = useRef<BackendRuntimeSnapshot | null>(initialBackendRuntime);
  const backendRuntimeListenerRef = useRef(new BackendRuntimeListener());
  const backendRuntimeRecoveryGateRef = useRef(new BackendRuntimeRecoveryGate());
  const [backendRuntime, setBackendRuntime] = useState<BackendRuntimeSnapshot | null>(initialBackendRuntime);

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

  const recoverStoredNativeRun = () => {
    const generation = runGenerationRef.current;
    const recovery = recoverInterruptedNativeRun(
      inputRef.current,
      installationIdRef,
      fetch,
      () => runGenerationRef.current === generation,
    )
      .then(() => undefined)
      .catch((error) => {
        if (runGenerationRef.current === generation) {
          logger.warn("interrupted_run_recovery_failed", "AGENT_RUN_RECOVERY_FAILED", { error });
        }
      })
      .finally(() => {
        if (recoveryPromiseRef.current === recovery) recoveryPromiseRef.current = null;
      });
    recoveryPromiseRef.current = recovery;
    return recovery;
  };

  if (!transportRef.current) {
    transportRef.current = new DefaultChatTransport<ChatMessage>({
      api: `${input.apiOrigin.replace(/\/+$/, "")}/v1/chat`,
      headers: () => nativeRunHeaders(inputRef.current, installationIdRef, activeRunRef.current?.runId),
      prepareSendMessagesRequest: ({ messages }) => {
        const active = activeRunRef.current;
        if (!active) throw new Error("A native AI SDK run context is required.");
        const snapshot = activeRequestSnapshotRef.current;
        if (!snapshot) throw new Error("A native AI SDK request snapshot is required.");
        return { body: nativeChatRequestBody(messages, active, snapshot) };
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
        const result = await executeRendererTool(inputRef.current.geogebraRuntime, toolName, toolCall.input);
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
      activeRequestContextRef.current = null;
      activeRequestSnapshotRef.current = null;
      rememberFailedRequest(null);
      failedRequestSnapshotRef.current = null;
      activeRunRef.current = null;
      runGenerationRef.current += 1;
      clearNetworkRetry();
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
  const stopChatRef = useRef(chat.stop);
  stopChatRef.current = chat.stop;
  addToolOutputRef.current = chat.addToolOutput as AddToolOutput;
  retryCurrentRequestRef.current = async () => {
    chat.clearError();
    // Sending without a new message resubmits the current native AI SDK
    // history, preserving completed renderer tool outputs across a reconnect.
    await chat.sendMessage();
  };

  const handleBackendRuntimeState = (nextRuntime: BackendRuntimeSnapshot) => {
    backendRuntimeRef.current = nextRuntime;
    setBackendRuntime(nextRuntime);
    const recoveryAction = backendRuntimeRecoveryGateRef.current.observe(nextRuntime);
    if (recoveryAction === "recover") {
      void recoverStoredNativeRun();
      return;
    }
    if (recoveryAction !== "interrupt") return;

    const interruptedRun = invalidateNativeRunAfterBackendLoss({
      activeRunRef,
      runGenerationRef,
      submissionLease: submissionLeaseRef.current,
    });
    const failedContext = activeRequestContextRef.current;
    const failedSnapshot = activeRequestSnapshotRef.current;
    if (failedContext && failedSnapshot) {
      failedRequestContextRef.current = failedContext;
      failedRequestSnapshotRef.current = failedSnapshot;
      setCanRetry(true);
    }
    activeRequestContextRef.current = null;
    activeRequestSnapshotRef.current = null;
    clearNetworkRetry();

    userStopInProgressRef.current = true;
    void Promise.resolve(stopChatRef.current()).catch((error) => {
      logger.warn("backend_loss_stop_failed", "AGENT_BACKEND_LOSS_STOP_FAILED", { error });
    }).finally(() => {
      userStopInProgressRef.current = false;
    });
    if (interruptedRun) {
      logger.warn("backend_loss_run_interrupted", "AGENT_BACKEND_LOSS_RUN_INTERRUPTED", {
        runId: interruptedRun.runId,
        conversationId: interruptedRun.conversationId,
        backendState: nextRuntime.state,
      });
    }
  };
  backendRuntimeListenerRef.current.updateHandler(handleBackendRuntimeState);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;
    let disposed = false;
    const listener = backendRuntimeListenerRef.current;
    void listener.start((handler) => api.onBackendRuntimeState(handler)).then(async () => {
      if (disposed) return;
      const current = await api.getRuntimeInfo();
      if (!disposed && current.backendRuntime) listener.notify(current.backendRuntime);
    }).catch((error) => {
      logger.warn("backend_runtime_listener_failed", "AGENT_BACKEND_RUNTIME_LISTENER_FAILED", { error });
    });
    return () => {
      disposed = true;
      listener.stop();
    };
  }, []);

  useEffect(() => {
    if (!backendRuntimeUnavailable(backendRuntimeRef.current)) void recoverStoredNativeRun();
    return () => {
      runGenerationRef.current += 1;
      if (networkRetryTimerRef.current !== null) globalThis.clearTimeout(networkRetryTimerRef.current);
      networkRetryTimerRef.current = null;
    };
  }, []);

  const sendMessage = useCallback(async (message: SendMessageInput, options?: SendMessageOptions) => {
    if (backendRuntimeUnavailable(backendRuntimeRef.current)) {
      throw new Error(backendRuntimeRef.current?.error ?? "The desktop backend is unavailable.");
    }
    const submissionOwner = submissionLeaseRef.current.tryAcquire();
    if (!submissionOwner) return;
    const conversationId = options?.body?.conversationId;
    try {
      if (!conversationId) throw new Error("A conversation id is required for an agent run.");
      const current = inputRef.current;
      const draft = prepareNativeRunSubmission(message, current);
      if (!draft) return;
      const { files, localAttachments, prompt: currentPrompt, snapshot, text } = draft;
      const submissionGeneration = runGenerationRef.current;

      await recoveryPromiseRef.current;
      if (runGenerationRef.current !== submissionGeneration) {
        throw new AgentRunSubmissionError(
          new Error(
            backendRuntimeRef.current?.error
              ?? "The agent run submission was interrupted by a backend lifecycle change.",
          ),
          false,
        );
      }
      if (
        chat.status === "submitted"
        || chat.status === "streaming"
        || activeRunRef.current
      ) return;

      const runId = `run_${crypto.randomUUID().replaceAll("-", "")}`;
      const attachments = await uploadImageAttachments(
        current.apiOrigin,
        current.getAuthToken(),
        localAttachments,
        runId,
      );
      if (runGenerationRef.current !== submissionGeneration) {
        throw new AgentRunSubmissionError(
          new Error(
            backendRuntimeRef.current?.error
              ?? "The agent run submission was interrupted by a backend lifecycle change.",
          ),
          false,
        );
      }
      if (activeRunRef.current) return;
      const uploadedFiles = files.map((file, index) => attachments[index]
        ? { ...file, url: attachments[index]!.dataUrl }
        : file);
      clearNetworkRetry();
      const activeGeneration = runGenerationRef.current + 1;
      runGenerationRef.current = activeGeneration;
      const requestContext: NativeRunRequestContext = {
        conversationId,
        modelProvider: snapshot.model.provider,
        modelId: snapshot.model.model,
        prompt: currentPrompt,
        thinking: snapshot.thinking,
        thinkingEffort: snapshot.thinkingEffort,
      };
      let messageAccepted = false;
      let requestActivated = false;
      try {
        await activateNativeRun(activeRunRef, {
          runId,
          ...requestContext,
        });
        requestActivated = true;
        if (
          runGenerationRef.current !== activeGeneration
          || !isActiveNativeRun(activeRunRef, runId)
          || backendRuntimeUnavailable(backendRuntimeRef.current)
        ) {
          throw new Error(backendRuntimeRef.current?.error ?? "Agent run submission was superseded before transport started.");
        }
        messageAccepted = true;
        activeRequestContextRef.current = requestContext;
        activeRequestSnapshotRef.current = snapshot;
        rememberFailedRequest(null);
        failedRequestSnapshotRef.current = null;
        if (text) await chat.sendMessage({ text, ...(uploadedFiles.length ? { files: uploadedFiles } : {}) });
        else await chat.sendMessage({ files: uploadedFiles });
      } catch (error) {
        const ownsRun = runGenerationRef.current === activeGeneration && isActiveNativeRun(activeRunRef, runId);
        if (messageAccepted && ownsRun) {
          rememberFailedRequest(requestContext);
          failedRequestSnapshotRef.current = snapshot;
        }
        if (ownsRun) {
          activeRequestContextRef.current = null;
          activeRequestSnapshotRef.current = null;
          activeRunRef.current = null;
          runGenerationRef.current += 1;
        }
        let submissionError: unknown = error;
        if (requestActivated) {
          try {
            await terminalizeInterruptedNativeRun({ runId, conversationId }, current, installationIdRef);
          } catch (cancelError) {
            submissionError = new AggregateError(
              [error, cancelError],
              `Native AI SDK submission failed and run ${runId} could not be terminalized.`,
            );
          }
        }
        throw new AgentRunSubmissionError(submissionError, messageAccepted);
      }
    } finally {
      submissionLeaseRef.current.release(submissionOwner);
    }
  }, [chat]);

  const retry = useCallback(async () => {
    if (backendRuntimeUnavailable(backendRuntimeRef.current)) return false;
    const submissionOwner = submissionLeaseRef.current.tryAcquire();
    if (!submissionOwner) return false;
    try {
      await recoveryPromiseRef.current;
      if (chat.status === "submitted" || chat.status === "streaming" || activeRunRef.current) return false;
      const requestContext = failedRequestContextRef.current;
      const requestSnapshot = failedRequestSnapshotRef.current;
      if (!requestContext || !requestSnapshot) return false;
      const runId = `run_${crypto.randomUUID().replaceAll("-", "")}`;
      clearNetworkRetry();
      const activeGeneration = runGenerationRef.current + 1;
      runGenerationRef.current = activeGeneration;
      let requestActivated = false;
      try {
        await activateNativeRun(activeRunRef, { runId, ...requestContext });
        requestActivated = true;
        if (
          runGenerationRef.current !== activeGeneration
          || !isActiveNativeRun(activeRunRef, runId)
          || backendRuntimeUnavailable(backendRuntimeRef.current)
        ) {
          throw new Error(backendRuntimeRef.current?.error ?? "Agent run retry was superseded before transport started.");
        }
        activeRequestContextRef.current = requestContext;
        activeRequestSnapshotRef.current = requestSnapshot;
        rememberFailedRequest(null);
        failedRequestSnapshotRef.current = null;
        chat.clearError();
        // AI SDK owns message truncation and request reconstruction. This
        // removes a partial assistant response, keeps the original user turn,
        // and avoids duplicating that message in local history.
        await chat.regenerate();
        return true;
      } catch (error) {
        const ownsRun = runGenerationRef.current === activeGeneration && isActiveNativeRun(activeRunRef, runId);
        if (ownsRun) {
          activeRequestContextRef.current = null;
          activeRequestSnapshotRef.current = null;
          activeRunRef.current = null;
          runGenerationRef.current += 1;
          rememberFailedRequest(requestContext);
          failedRequestSnapshotRef.current = requestSnapshot;
        }
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
      submissionLeaseRef.current.release(submissionOwner);
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
    canRetry: canRetry && !backendRuntimeUnavailable(backendRuntime),
    backendRuntime,
    stop,
    status: chat.status,
    error: chat.error,
  };
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
