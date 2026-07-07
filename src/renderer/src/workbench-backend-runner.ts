import type { Accessor } from "solid-js";
import {
  agentRunStartPayload,
  createAgentRunLedger,
  type AgentRunRunnerSnapshot,
  type BlackboardEntry,
  type DesktopFunctionCall,
  type RuntimeInfo
} from "@geochat-ai/app";
import { executeFunctionCall } from "./functioncalls";
import type { createGeoGebraController } from "./geogebra";
import { createRendererId } from "./ids";
import { interpolate, type Locale, type RendererI18n } from "./i18n";
import { hasConfiguredApiKey } from "./desktop-config";
import { backendPromptWithBlackboard } from "./workbench-blackboard";
import { isRunCancelledError, throwIfRunCancelled } from "./run-cancellation";
import type { WorkbenchConversationState } from "./workbench-conversation-state";
import { nowLabel } from "./workbench-messages";
import {
  cardsFromToolCalls,
  chatMessagesFromRunnerSnapshot,
  desktopCallFromLedgerTool,
  desktopCallFromRemoteToolRequest,
  ledgerToolFromCall,
  mergeLedgerToolCalls,
  nextRunnableToolRequest
} from "./workbench-tool-calls";
import {
  claimNextRunnableToolRequest,
  createAgentRunBridge,
  failBackendRunnerFromRenderer,
  readRemoteToolExecutionCache,
  REMOTE_TOOL_CLAIM_OWNER,
  removeRemoteToolExecutionCache,
  writeRemoteToolExecutionCache,
  type AgentRunCoordinator
} from "./workbench-runner-bridge";
import { toolActivityText } from "./tool-activity";
import type {
  DesktopChatMessage,
  ImageAttachment,
  ModelConfig
} from "./workbench-types";

type GeoGebraController = ReturnType<typeof createGeoGebraController>;

const RUNNER_RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const syntheticRunnerIdPrefixes = [
  "runner-recipe-raw-command-",
  "runner-budget-exhausted-",
  "runner-workflow-blocked-",
  "runner-stale-result-commit-",
  "runner-continuation-model-failure-",
  "runner-continuation-policy-",
  "command-usage-api-",
  "command-usage-route-"
];

type BackendRunnerContext = {
  conversation: WorkbenchConversationState;
  conversationId: Accessor<string>;
  copy: Accessor<RendererI18n>;
  locale: Accessor<Locale>;
  modelConfig: Accessor<ModelConfig>;
  runtime: Accessor<RuntimeInfo | undefined>;
  geogebra: GeoGebraController;
  isRunning: Accessor<boolean>;
  setIsRunning: (value: boolean) => void;
  signal?: AbortSignal;
  expandPanel: () => void;
  setActiveHistoryId: (conversationId: string) => void;
  refreshBlackboard: (conversationId: string) => void | Promise<void>;
  persistChatMessage: (conversationId: string, message: DesktopChatMessage) => Promise<void>;
};

export async function runBackendAgent(input: BackendRunnerContext & {
  promptContent: string;
  attachments: ImageAttachment[];
  userMessageId: string;
  previousMessages: DesktopChatMessage[];
  persistedBlackboard: BlackboardEntry[];
}) {
  throwIfRunCancelled(input.signal);
  const assistantId = createRendererId();
  const modelConfig = input.modelConfig();
  const backendPrompt = backendPromptWithBlackboard(input.promptContent, input.previousMessages, input.persistedBlackboard);
  const run = createAgentRunLedger({
    runId: createRendererId(),
    conversationId: input.conversationId(),
    userMessageId: input.userMessageId,
    assistantMessageId: assistantId,
    mode: "ai-sdk",
    model: modelConfig,
    modelStepTimeoutMs: modelConfig.modelStepTimeoutMs,
    locale: input.locale(),
    prompt: backendPrompt,
    attachmentCount: input.attachments.length
  });
  const runtime = input.runtime();
  if (!runtime) throw new Error("Desktop runtime is not ready.");
  const coordinator = createAgentRunBridge(runtime);
  const assistantText = input.copy().chat.backendPlanning;
  const assistantMessage: DesktopChatMessage = {
    id: assistantId,
    role: "assistant",
    content: assistantText,
    createdAt: nowLabel(input.locale()),
    createdAtIso: new Date().toISOString(),
    activity: { kind: "backend_planning" },
    toolCalls: []
  };

  input.conversation.appendMessage(assistantMessage);
  void input.persistChatMessage(run.conversationId, assistantMessage);

  try {
    const runner = await coordinator.startPausedRunner({
      run: agentRunStartPayload(run),
      model: modelConfig,
      attachments: input.attachments
    });
    throwIfRunCancelled(input.signal);
    if (!runner) throw new Error(input.copy().chat.backendMissingInitialRunner);

    await continueBackendRunner({
      ...input,
      coordinator,
      runner,
      assistantId,
      runModelConfig: modelConfig,
      attachments: input.attachments,
      initialText: assistantText,
      errorPrefix: input.copy().chat.backendFailedPrefix
    });
  } catch (error) {
    if (isRunCancelledError(error)) {
      await coordinator.finish(run.runId, {
        status: "cancelled",
        usage: null,
        error: input.copy().chat.runStopped
      }).catch(() => undefined);
      const stoppedAssistantMessage: DesktopChatMessage = {
        ...assistantMessage,
        content: input.copy().chat.runStopped,
        activity: undefined,
        toolCalls: []
      };
      input.conversation.updateMessage(assistantId, () => stoppedAssistantMessage);
      input.conversation.appendAssistantUiMessage(input.copy().chat.runStopped);
      void input.persistChatMessage(run.conversationId, stoppedAssistantMessage);
      input.setIsRunning(false);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    const assistantErrorText = `${input.copy().chat.backendFailedPrefix}: ${message}\n\n${input.copy().chat.backendErrorAdvice}`;
    const errorAssistantMessage: DesktopChatMessage = {
      ...assistantMessage,
      content: assistantErrorText,
      activity: undefined,
      toolCalls: []
    };
    input.conversation.updateMessage(assistantId, () => errorAssistantMessage);
    input.conversation.appendAssistantUiMessage(assistantErrorText);
    void input.persistChatMessage(run.conversationId, errorAssistantMessage);
    input.setIsRunning(false);
  }
}

export async function recoverPendingBackendRunner(input: BackendRunnerContext & {
  info: RuntimeInfo;
}) {
  if (input.isRunning()) return;
  const coordinator = createAgentRunBridge(input.info);
  const snapshots = await coordinator.activeRunnerSnapshots().catch(() => []);
  const runner = snapshots.find(isRecoverablePendingRunner);
  if (!runner) {
    const stuckRunner = snapshots.find(isRecoverableStuckRunningRunner);
    if (!stuckRunner) return;
    await coordinator.finish(stuckRunner.run.runId, {
      status: "failed",
      usage: null,
      error: input.copy().chat.backendStuckRunRecovered
    }).catch(() => undefined);
    input.conversation.appendMessage(input.conversation.createAssistantMessage(input.copy().chat.backendStuckRunRecovered, input.locale()));
    return;
  }

  const modelConfig = input.modelConfig();
  if (runner.run.attachmentCount > 0) {
    input.conversation.appendMessage(input.conversation.createAssistantMessage(input.copy().chat.multimodalRunCannotRecover, input.locale()));
    return;
  }
  if (!hasConfiguredApiKey(modelConfig) || modelConfig.provider !== runner.run.modelProvider || modelConfig.model !== runner.run.modelId) {
    input.conversation.appendMessage(input.conversation.createAssistantMessage(
      interpolate(input.copy().chat.pendingRunModelMismatch, { provider: runner.run.modelProvider, model: runner.run.modelId }),
      input.locale()
    ));
    return;
  }

  const restored = chatMessagesFromRunnerSnapshot(runner, {
    assistantFallback: input.copy().chat.recoveringPendingRun,
    copy: input.copy(),
    locale: input.locale()
  });
  const assistantId = restored.assistantMessage.id;
  input.conversation.setId(runner.run.conversationId);
  input.setIsRunning(true);
  input.expandPanel();
  input.conversation.appendMessages([restored.userMessage, restored.assistantMessage]);
  input.setActiveHistoryId(runner.run.conversationId);
  void input.persistChatMessage(runner.run.conversationId, restored.userMessage);
  void input.persistChatMessage(runner.run.conversationId, restored.assistantMessage);

  await continueBackendRunner({
    ...input,
    coordinator,
    runner,
    assistantId,
    runModelConfig: modelConfig,
    attachments: [],
    initialToolCalls: restored.toolCalls,
    initialText: restored.assistantContent,
    errorPrefix: input.copy().chat.backendRecoverFailedPrefix
  });
}

function isRecoverablePendingRunner(snapshot: AgentRunRunnerSnapshot) {
  if (snapshot.run.mode !== "ai-sdk" || snapshot.status !== "waiting_for_tool" || !snapshot.pendingToolRequests.length) return false;
  if (syntheticRunnerIdPrefixes.some((prefix) => snapshot.run.runId.startsWith(prefix))) return false;
  const startedAt = Date.parse(snapshot.run.startedAt);
  if (!Number.isFinite(startedAt)) return false;
  return Date.now() - startedAt <= RUNNER_RECOVERY_MAX_AGE_MS;
}

function isRecoverableStuckRunningRunner(snapshot: AgentRunRunnerSnapshot) {
  if (snapshot.run.mode !== "ai-sdk" || snapshot.status !== "running" || snapshot.pendingToolRequests.length) return false;
  if (syntheticRunnerIdPrefixes.some((prefix) => snapshot.run.runId.startsWith(prefix))) return false;
  const startedAt = Date.parse(snapshot.run.startedAt);
  if (!Number.isFinite(startedAt)) return false;
  return Date.now() - startedAt <= RUNNER_RECOVERY_MAX_AGE_MS;
}

function isCompletedBlackboardPatchCall(call: DesktopFunctionCall) {
  return call.toolName === "patchBlackboard" && call.status === "done";
}

async function continueBackendRunner(input: BackendRunnerContext & {
  coordinator: AgentRunCoordinator;
  runner: AgentRunRunnerSnapshot;
  assistantId: string;
  runModelConfig: ModelConfig;
  attachments: ImageAttachment[];
  initialToolCalls?: DesktopFunctionCall[];
  initialText: string;
  errorPrefix: string;
}) {
  let completedCalls: DesktopFunctionCall[] = [...(input.initialToolCalls ?? [])];
  const refreshedBlackboardToolCalls = new Set<string>();
  const safetyToolSteps = Math.max(1, input.runner.budget.maxToolSteps + 1);
  let runner: AgentRunRunnerSnapshot | undefined = input.runner;
  let assistantText = input.initialText;

  function refreshBlackboardAfterPatch(conversationId: string) {
    const patchedCalls = completedCalls.filter((call) => isCompletedBlackboardPatchCall(call) && !refreshedBlackboardToolCalls.has(call.callId));
    if (!patchedCalls.length) return;
    for (const call of patchedCalls) refreshedBlackboardToolCalls.add(call.callId);
    void input.refreshBlackboard(conversationId);
  }

  try {
    throwIfRunCancelled(input.signal);
    refreshBlackboardAfterPatch(input.runner.run.conversationId);
    let nextRequest = await claimNextRunnableToolRequest(input.coordinator, runner, nextRunnableToolRequest(runner)?.toolCallId);
    for (let step = 0; step < safetyToolSteps; step += 1) {
      throwIfRunCancelled(input.signal);
      if (!nextRequest) {
        if (!runner) throw new Error(input.copy().chat.backendMissingRunnerAfterLookup);
        runner = await input.coordinator.runnerSnapshot(runner.run.runId);
        throwIfRunCancelled(input.signal);
        nextRequest = await claimNextRunnableToolRequest(input.coordinator, runner, nextRunnableToolRequest(runner)?.toolCallId);
        if (!nextRequest) break;
      }

      const existingIndex = completedCalls.findIndex((call) => call.callId === nextRequest!.toolCallId);
      const callIndex = existingIndex >= 0 ? existingIndex : completedCalls.length;
      completedCalls[callIndex] = desktopCallFromRemoteToolRequest(nextRequest);
      input.conversation.updateMessage(input.assistantId, (message) => ({
        ...message,
        content: toolActivityText(input.copy(), nextRequest!.toolName, "running"),
        activity: { kind: "backend_tool_running", toolName: nextRequest!.toolName },
        toolCalls: [...completedCalls]
      }));

      const cachedTool = readRemoteToolExecutionCache(nextRequest);
      if (cachedTool) {
        completedCalls[callIndex] = desktopCallFromLedgerTool(cachedTool);
      } else {
        completedCalls[callIndex] = { ...completedCalls[callIndex], status: "running", updatedAt: new Date().toISOString() };
        input.conversation.updateMessage(input.assistantId, (message) => ({ ...message, toolCalls: [...completedCalls] }));

        const result = await executeFunctionCall(completedCalls[callIndex], input.geogebra, input.copy());
        throwIfRunCancelled(input.signal);
        completedCalls[callIndex] = {
          ...completedCalls[callIndex],
          status: result.ok ? "done" : "error",
          result,
          error: result.error,
          updatedAt: new Date().toISOString()
        };
        writeRemoteToolExecutionCache(nextRequest, ledgerToolFromCall(completedCalls[callIndex]));
      }
      const cards = cardsFromToolCalls(completedCalls, input.copy());
      const submittedText = cachedTool
        ? input.copy().chat.backendCachedTool
        : toolActivityText(input.copy(), completedCalls[callIndex].toolName, "thinking");
      input.conversation.updateMessage(input.assistantId, (message) => ({
        ...message,
        content: submittedText,
        activity: cachedTool
          ? { kind: "backend_cached_tool" }
          : { kind: "backend_tool_submitted", toolName: completedCalls[callIndex].toolName },
        toolCalls: [...completedCalls],
        cards
      }));

      if (!runner) throw new Error(input.copy().chat.backendMissingRunnerOnSubmit);
      const runId = runner.run.runId;
      const response = await input.coordinator.submitToolResultStream(runId, completedCalls[callIndex].callId, {
        tool: ledgerToolFromCall(completedCalls[callIndex]),
        claimOwner: REMOTE_TOOL_CLAIM_OWNER,
        model: input.runModelConfig,
        attachments: input.attachments
      }, {
        signal: input.signal,
        onTextDelta: (text) => {
          if (input.signal?.aborted) return;
          if (!text) return;
          input.conversation.updateMessage(input.assistantId, (message) => ({
            ...message,
            content: submittedText,
            toolCalls: [...completedCalls],
            cards
          }));
        }
      });
      throwIfRunCancelled(input.signal);
      removeRemoteToolExecutionCache(nextRequest);
      runner = response?.runner ?? (await input.coordinator.runnerSnapshot(runId));
      if (!runner) throw new Error(input.copy().chat.backendMissingRunnerAfterSubmit);
      completedCalls = mergeLedgerToolCalls(completedCalls, runner.run.tools);
      refreshBlackboardAfterPatch(runner.run.conversationId);
      if (response?.text) assistantText = response.text;
      nextRequest = await claimNextRunnableToolRequest(input.coordinator, runner, response?.nextRequest?.toolCallId ?? nextRunnableToolRequest(runner)?.toolCallId);
      if (!nextRequest && runner.status !== "waiting_for_tool") break;
    }

    if (runner?.status === "waiting_for_tool") {
      throw new Error(interpolate(input.copy().chat.backendWaitingLimit, { count: safetyToolSteps }));
    }

    const finalRun = runner?.run;
    const failures = completedCalls.filter((call) => call.status === "error");
    const cards = cardsFromToolCalls(completedCalls, input.copy());
    if (!assistantText || assistantText === input.initialText) {
      assistantText = failures.length ? interpolate(input.copy().chat.backendToolFailures, { count: failures.length }) : input.copy().chat.constructionSynced;
    }
    const existingAssistant = input.conversation.findMessage(input.assistantId);
    const finalAssistantMessage: DesktopChatMessage = {
      ...(existingAssistant ?? {
        id: input.assistantId,
        role: "assistant" as const,
        createdAt: nowLabel(input.locale()),
        createdAtIso: new Date().toISOString()
      }),
      content: assistantText,
      activity: undefined,
      toolCalls: completedCalls,
      cards,
      usage: finalRun?.usage ?? undefined
    };
    input.conversation.updateMessage(input.assistantId, () => finalAssistantMessage);
    input.conversation.appendAssistantUiMessage(assistantText);
    void input.persistChatMessage(finalRun?.conversationId ?? input.runner.run.conversationId, finalAssistantMessage);
  } catch (error) {
    if (isRunCancelledError(error)) {
      await input.coordinator.finish((runner?.run ?? input.runner.run).runId, {
        status: "cancelled",
        usage: null,
        error: input.copy().chat.runStopped
      }).catch(() => undefined);
      const existingAssistant = input.conversation.findMessage(input.assistantId);
      const stoppedAssistantMessage: DesktopChatMessage = {
        ...(existingAssistant ?? {
          id: input.assistantId,
          role: "assistant" as const,
          createdAt: nowLabel(input.locale()),
          createdAtIso: new Date().toISOString()
        }),
        content: input.copy().chat.runStopped,
        activity: undefined,
        toolCalls: completedCalls
      };
      input.conversation.updateMessage(input.assistantId, () => stoppedAssistantMessage);
      input.conversation.appendAssistantUiMessage(input.copy().chat.runStopped);
      void input.persistChatMessage(input.runner.run.conversationId, stoppedAssistantMessage);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    const assistantErrorText = `${input.errorPrefix}: ${message}\n\n${input.copy().chat.backendErrorAdvice}`;
    await failBackendRunnerFromRenderer({
      coordinator: input.coordinator,
      run: runner?.run ?? input.runner.run,
      completedCalls,
      error: `${input.errorPrefix}: ${message}`
    });
    const existingAssistant = input.conversation.findMessage(input.assistantId);
    const errorAssistantMessage: DesktopChatMessage = {
      ...(existingAssistant ?? {
        id: input.assistantId,
        role: "assistant" as const,
        createdAt: nowLabel(input.locale()),
        createdAtIso: new Date().toISOString()
      }),
      content: assistantErrorText,
      activity: undefined,
      toolCalls: completedCalls
    };
    input.conversation.updateMessage(input.assistantId, () => errorAssistantMessage);
    input.conversation.appendAssistantUiMessage(assistantErrorText);
    void input.persistChatMessage(input.runner.run.conversationId, errorAssistantMessage);
  } finally {
    input.setIsRunning(false);
  }
}
