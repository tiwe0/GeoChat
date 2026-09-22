import {
  agentModelSupportsReasoning,
  agentThinkingProviderOptions,
  createAgentRunLedger,
  finishAgentRunLedger,
  getAgentModelPolicy,
  incrementAgentRunModelStep,
  isAgentModelConfig,
  isFunctionCallArgs,
  isFunctionCallToolName,
  deriveAgentWorkflowStateFromTools,
  normalizeAgentRunThinkingEffort,
  mergeAgentRunUsage,
  upsertAgentRunTool,
  type AgentModelConfig,
  type AgentRunLedgerRecord,
  type AgentRunToolRecord,
  type FunctionCallToolName,
  type PatchBlackboardArgs,
  type ReadBlackboardArgs,
} from "@geochat-ai/app";
import {
  createAgentUIStreamResponse,
  generateText,
  getToolName,
  hasToolCall,
  isToolUIPart,
  NoSuchToolError,
  safeValidateUIMessages,
  stepCountIs,
  ToolLoopAgent,
  type UIMessage,
  type LanguageModel,
  type LanguageModelUsage,
} from "ai";
import type { BackendHttpContext } from "../http/context";
import type { ConversationDataScope } from "../db/conversation-repository";
import { executeBackendToolRequest } from "./backend-tools";
import { buildCommandReferencePacketForRun } from "./command-searcher";
import { createBackendLanguageModel } from "./ai-sdk-models";
import { createBackendPlanningTools } from "./ai-sdk-tools";
import { selectAgentSkillsForRun } from "./skill-selector";
import { systemPromptForRun } from "./agent-prompt";
import { refineExecuteGeoGebraCommands } from "./native-tool-policy";
import { AgentRunLedgerConflictError } from "../db/agent-run-repository";

export type NativeChatRequest = {
  messages: UIMessage[];
  runId: string;
  conversationId: string;
  model: AgentModelConfig;
  locale: "zh-CN" | "en-US";
  thinking: boolean;
  thinkingEffort?: "light" | "standard" | "extended" | null;
};

export function isNativeChatRequest(value: unknown): value is NativeChatRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    Array.isArray(payload.messages) &&
    typeof payload.runId === "string" && Boolean(payload.runId.trim()) &&
    typeof payload.conversationId === "string" && Boolean(payload.conversationId.trim()) &&
    isAgentModelConfig(payload.model) &&
    (payload.locale === "zh-CN" || payload.locale === "en-US") &&
    typeof payload.thinking === "boolean" &&
    (payload.thinkingEffort === undefined || payload.thinkingEffort === null || normalizeAgentRunThinkingEffort(payload.thinkingEffort) !== null)
  );
}

export async function createNativeChatResponse(
  input: NativeChatRequest,
  context: BackendHttpContext,
  options: { model?: LanguageModel; abortSignal?: AbortSignal; dataScope?: ConversationDataScope } = {},
) {
  const policy = validateModelPolicy(input);
  if (policy) return jsonError(policy, 400);

  const model = options.model ?? createBackendLanguageModel(input.model);
  const validated = await safeValidateUIMessages({ messages: input.messages });
  if (!validated.success) return jsonError(validated.error.message, 400);
  const messages = validated.data;
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUser) return jsonError("A user message is required.", 400);

  const loaded = await loadOrCreateRun(input, context, latestUser);
  let run = loaded.run;
  const continuityError = validateRunContinuation(run, input, latestUser);
  if (continuityError) return jsonError(continuityError, 409);
  run = bindRunAssistantMessage(run, messages);
  run = mergeCompletedUITools(run, messages);
  if (leaseIsActive(run)) return jsonError("Agent run already has an active continuation.", 409);
  const continuationLeaseId = crypto.randomUUID();
  run = {
    ...run,
    continuationLeaseId,
    continuationLeaseExpiresAt: new Date(Date.now() + (run.modelStepTimeoutMs ?? 120_000) + 30_000).toISOString(),
  };
  try {
    run = loaded.isNew
      ? await context.repositories.agentRuns.createLedger(run)
      : await context.repositories.agentRuns.compareAndSwapLedger(run, run.revision);
  } catch (error) {
    if (error instanceof AgentRunLedgerConflictError || (error instanceof Error && error.message.includes("revision conflict"))) {
      return jsonError("Agent run continuation conflicted with another request.", 409);
    }
    throw error;
  }
  try {
    await persistNativeConversationMessages(context, input.conversationId, [latestUser], options.dataScope);
  } catch (error) {
    run = finishAgentRunLedger(run, {
      status: "failed",
      error: error instanceof Error ? error.message : "Failed to persist the conversation owner anchor.",
    });
    run = await persistClaimedRun(context, releaseContinuationLease(run, continuationLeaseId));
    return jsonError(run.error ?? "Failed to persist the conversation owner anchor.", 500);
  }
  const maxModelSteps = run.maxToolSteps ?? getAgentModelPolicy(input.model).maxToolSteps;
  const skillSelection = await selectAgentSkillsForRun({
    run,
    model,
    temperature: getAgentModelPolicy(input.model).defaultTemperature,
    timeout: run.modelStepTimeoutMs ?? 120_000,
  });
  if (skillSelection.modelCallCount) {
    for (let index = 0; index < skillSelection.modelCallCount; index += 1) run = incrementAgentRunModelStep(run);
    run = { ...run, usage: mergeAgentRunUsage(run.usage, skillSelection.usage) };
    run = await persistClaimedRun(context, run);
  }
  const remainingModelSteps = maxModelSteps - (run.modelStepCount ?? 0);
  if (remainingModelSteps <= 0) {
    run = finishAgentRunLedger(run, { status: "failed", error: `Model step budget exhausted (${maxModelSteps}).` });
    run = await persistClaimedRun(context, releaseContinuationLease(run, continuationLeaseId));
    return jsonError(`Model step budget exhausted (${maxModelSteps}).`, 409);
  }
  const commandReferencePacket = buildCommandReferencePacketForRun({
    prompt: run.prompt,
    locale: run.locale,
    skillSelection,
  });
  const system = await systemPromptForRun(run, false, skillSelection, commandReferencePacket);
  // Tool execution, step completion, and stream completion are separate AI SDK
  // callbacks and may overlap. Keep every mutation plus CAS write in one queue;
  // otherwise two callbacks can both persist the same ledger revision and turn
  // an otherwise successful UI tool handoff into a revision conflict.
  let runWriteQueue: Promise<void> = Promise.resolve();
  const commitRun = (
    update: (current: AgentRunLedgerRecord) => AgentRunLedgerRecord,
    beforePersist?: (next: AgentRunLedgerRecord) => Promise<void>,
  ) => {
    const pending = runWriteQueue.then(async () => {
      const next = update(run);
      if (beforePersist) await beforePersist(next);
      run = await persistClaimedRun(context, next);
      return run;
    });
    runWriteQueue = pending.then(() => undefined, () => undefined);
    return pending;
  };
  const executionContext = {
    runId: run.runId,
    conversationId: run.conversationId,
    prompt: run.prompt,
    locale: run.locale,
    get toolHistory() { return run.tools; },
    readBlackboard: (args: ReadBlackboardArgs) => context.repositories.blackboard.listEntries(run.conversationId, args),
    patchBlackboard: (args: PatchBlackboardArgs, patchContext: { runId: string; toolCallId: string }) =>
      context.repositories.blackboard.patchEntries(run.conversationId, args, patchContext),
  };
  const tools = createBackendPlanningTools(run.locale, [], skillSelection, run, {
    executeBackendTool: async (toolName, args, toolContext) => {
      const startedAt = new Date().toISOString();
      const tool = toolName === "setFinished"
        ? completedNativeControlTool(toolContext.toolCallId, toolName, args, startedAt)
        : await executeBackendToolRequest(
            { toolCallId: toolContext.toolCallId, toolName, args, requestedAt: startedAt },
            executionContext,
            startedAt,
          );
      await commitRun((current) => upsertAgentRunTool(current, tool));
      return tool.result;
    },
  });
  let finalUsage: LanguageModelUsage | undefined;
  let finalFinishReason = "other";
  const agent = new ToolLoopAgent({
    id: "geochat",
    model,
    instructions: system,
    tools,
    toolChoice: "auto",
    stopWhen: [
      stepCountIs(remainingModelSteps),
      hasToolCall("setFinished"),
    ],
    // Let the AI SDK retry transient provider/network failures with its native
    // exponential backoff. A model turn is idempotent until a tool executes,
    // and retries stop immediately for provider errors marked non-retryable.
    maxRetries: 3,
    temperature: getAgentModelPolicy(input.model).defaultTemperature,
    providerOptions: agentThinkingProviderOptions({
      provider: input.model.provider,
      enabled: input.thinking,
      effort: normalizeAgentRunThinkingEffort(input.thinkingEffort) ?? "standard",
    }),
    prepareStep: () => {
      if ((run.modelStepCount ?? 0) >= maxModelSteps) throw new Error(`Model step budget exhausted (${maxModelSteps}).`);
      return { activeTools: activeNativeToolNames(run, Object.keys(tools)) };
    },
    repairToolCall: async ({ toolCall, tools: repairTools, error, messages: repairMessages, instructions, abortSignal }) => {
      if (NoSuchToolError.isInstance(error)) return null;
      if ((run.modelStepCount ?? 0) >= maxModelSteps) throw new Error(`Model step budget exhausted (${maxModelSteps}).`);
      const repair = await generateText({
        model,
        instructions,
        messages: [
          ...repairMessages,
          {
            role: "assistant",
            content: [{
              type: "tool-call",
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              input: toolCall.input,
            }],
          },
          {
            role: "tool",
            content: [{
              type: "tool-result",
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              output: { type: "error-text", value: error.message },
            }],
          },
        ],
        tools: repairTools,
        toolChoice: { type: "tool", toolName: toolCall.toolName as keyof typeof repairTools & string },
        providerOptions: agentThinkingProviderOptions({
          provider: input.model.provider,
          enabled: false,
          effort: "standard",
        }),
        abortSignal,
      });
      run = incrementAgentRunModelStep(run);
      run = { ...run, usage: mergeAgentRunUsage(run.usage, usageRecord(repair.usage)) };
      run = await persistClaimedRun(context, run);
      const repaired = repair.toolCalls.find((candidate) => candidate.toolName === toolCall.toolName);
      return repaired
        ? {
            type: "tool-call" as const,
            toolCallId: toolCall.toolCallId,
            toolName: repaired.toolName,
            input: JSON.stringify(repaired.input),
          }
        : null;
    },
    experimental_refineToolInput: {
      executeGeoGebraCommands: (args) => refineExecuteGeoGebraCommands(args, {
        prompt: run.prompt,
        locale: run.locale,
      }),
    },
    onEnd: async ({ usage, finishReason }) => {
      finalUsage = usage;
      finalFinishReason = finishReason;
    },
    onStepEnd: async () => {
      await commitRun((current) => incrementAgentRunModelStep(current));
    },
  });

  let resolveTerminalPersistence!: () => void;
  let rejectTerminalPersistence!: (error: unknown) => void;
  const terminalPersistence = new Promise<void>((resolve, reject) => {
    resolveTerminalPersistence = resolve;
    rejectTerminalPersistence = reject;
  });
  const response = await createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    timeout: run.modelStepTimeoutMs ?? 120_000,
    sendReasoning: true,
    onError: (error) => {
      console.error(`[ERROR] Native AI SDK chat stream failed runId=${run.runId}`, error);
      return error instanceof Error ? error.message : "Agent run failed.";
    },
    onEnd: async ({ messages: finalMessages, isAborted, outcome }) => {
      try {
        await commitRun((current) => {
          // The request signal represents the browser/desktop HTTP stream, not
          // user intent. A Wi-Fi drop aborts that signal too. Keep the run
          // resumable and only release its continuation lease; the explicit
          // /cancel endpoint remains the authority for user cancellation.
          if (isAborted) return releaseContinuationLease(current, continuationLeaseId);
          let next = bindRunAssistantMessage(current, finalMessages);
          next = mergeCompletedUITools(next, finalMessages);
          if (finalUsage) next = { ...next, usage: mergeAgentRunUsage(next.usage, usageRecord(finalUsage)) };
          if (outcome.status === "failed") {
            next = finishAgentRunLedger(next, {
              status: "failed",
              error: outcome.error instanceof Error ? outcome.error.message : "Agent run failed.",
            });
          } else {
            next = terminalizeCompletedModelTurn(next, finalFinishReason, maxModelSteps);
          }
          return releaseContinuationLease(next, continuationLeaseId);
        }, isAborted
          ? undefined
          : (next) => persistNativeConversationMessages(
              context,
              input.conversationId,
              finalMessages,
              options.dataScope,
              next.usage,
            ));
        resolveTerminalPersistence();
      } catch (error) {
        console.error(`[ERROR] Failed to persist native AI SDK chat runId=${run.runId}`, error);
        try {
          await commitRun((current) => {
            const withUsage = finalUsage
              ? { ...current, usage: mergeAgentRunUsage(current.usage, usageRecord(finalUsage)) }
              : current;
            return releaseContinuationLease(finishAgentRunLedger(withUsage, {
              status: "failed",
              error: error instanceof Error ? error.message : "Failed to persist the completed agent run.",
            }), continuationLeaseId);
          });
        } catch (terminalError) {
          console.error(`[ERROR] Failed to record native AI SDK persistence failure runId=${run.runId}`, terminalError);
        }
        rejectTerminalPersistence(error);
      }
    },
  });
  return gateTerminalStreamEvent(response, terminalPersistence);
}

function gateTerminalStreamEvent(response: Response, terminalPersistence: Promise<void>) {
  if (!response.body) return response;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const encoder = new TextEncoder();
  let buffer = "";
  let terminalEvents = "";
  const flushTerminal = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (!terminalEvents) return;
    try {
      await terminalPersistence;
      controller.enqueue(encoder.encode(terminalEvents));
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Failed to persist the completed agent run.";
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", errorText })}\n\ndata: [DONE]\n\n`));
    }
    terminalEvents = "";
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (buffer && isTerminalSseEvent(buffer)) terminalEvents += buffer;
          else if (buffer) controller.enqueue(encoder.encode(buffer));
          await flushTerminal(controller);
          controller.close();
          return;
        }
        buffer += value;
        let boundary = nextSseBoundary(buffer);
        while (boundary) {
          const event = buffer.slice(0, boundary.index + boundary.length);
          buffer = buffer.slice(boundary.index + boundary.length);
          if (isTerminalSseEvent(event)) {
            terminalEvents += event;
            if (sseDataValues(event).includes("[DONE]")) await flushTerminal(controller);
          } else {
            controller.enqueue(encoder.encode(event));
          }
          boundary = nextSseBoundary(buffer);
        }
        if (controller.desiredSize !== null && controller.desiredSize <= 0) return;
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function nextSseBoundary(value: string) {
  const match = /\r?\n\r?\n/.exec(value);
  return match ? { index: match.index, length: match[0].length } : null;
}

function sseDataValues(event: string) {
  return event.split(/\r?\n/).flatMap((line) => {
    if (!line.startsWith("data:")) return [];
    return [line.slice(5).trimStart()];
  });
}

function isTerminalSseEvent(event: string) {
  return sseDataValues(event).some((data) => {
    if (data === "[DONE]") return true;
    try {
      const parsed = JSON.parse(data) as { type?: unknown };
      return parsed.type === "finish";
    } catch {
      return false;
    }
  });
}

function terminalizeCompletedModelTurn(
  run: AgentRunLedgerRecord,
  finishReason: string,
  maxModelSteps: number,
) {
  if (hasCompletedControlTool(run)) {
    return finishAgentRunLedger(run, {
      status: "succeeded",
      ...(run.usage ? { usage: run.usage } : {}),
    });
  }
  const failedTool = latestUnrecoveredToolFailure(run);
  if (failedTool && finishReason !== "tool-calls") {
    return finishAgentRunLedger(run, {
      status: "failed",
      error: failedTool.error ?? `${failedTool.toolName} failed.`,
    });
  }
  if ((run.modelStepCount ?? 0) >= maxModelSteps && finishReason === "tool-calls") {
    return finishAgentRunLedger(run, {
      status: "failed",
      error: `Model step budget exhausted (${maxModelSteps}) before the run reached a terminal answer.`,
    });
  }
  if (finishReason === "stop") {
    return finishAgentRunLedger(run, {
      status: "succeeded",
      ...(run.usage ? { usage: run.usage } : {}),
    });
  }
  if (finishReason !== "tool-calls") {
    return finishAgentRunLedger(run, {
      status: "failed",
      error: `Model stopped without a successful terminal answer (finish reason: ${finishReason}).`,
    });
  }
  return run;
}

function validateRunContinuation(run: AgentRunLedgerRecord, input: NativeChatRequest, latestUser: UIMessage) {
  if (run.status !== "running") return `Agent run is already terminal: ${run.runId} (${run.status}).`;
  if (run.conversationId !== input.conversationId) return "Agent run conversation does not match the continuation request.";
  if (run.userMessageId && run.userMessageId !== latestUser.id) return "Agent run user-message lineage does not match the continuation request.";
  if (run.modelProvider !== input.model.provider || run.modelId !== input.model.model) return "Agent run model does not match the continuation request.";
  if ((run.modelProtocol ?? null) !== (input.model.protocol ?? null)) return "Agent run model protocol does not match the continuation request.";
  if ((run.modelBaseUrl ?? null) !== (input.model.customBaseUrl.trim() || null)) return "Agent run model endpoint does not match the continuation request.";
  if (run.prompt !== messageText(latestUser)) return "Agent run prompt does not match the continuation request.";
  if (run.attachmentCount !== latestUser.parts.filter((part) => part.type === "file").length) return "Agent run attachments do not match the continuation request.";
  if (run.requestFingerprint && run.requestFingerprint !== nativeUserMessageFingerprint(latestUser)) return "Agent run request fingerprint does not match the continuation request.";
  if ((run.locale ?? input.locale) !== input.locale) return "Agent run locale does not match the continuation request.";
  if ((run.thinking ?? input.thinking) !== input.thinking) return "Agent run reasoning mode does not match the continuation request.";
  const effort = normalizeAgentRunThinkingEffort(input.thinkingEffort) ?? "standard";
  if ((run.thinkingEffort ?? effort) !== effort) return "Agent run reasoning effort does not match the continuation request.";
  return undefined;
}

async function persistNativeConversationMessages(
  context: BackendHttpContext,
  conversationId: string,
  messages: UIMessage[],
  dataScope?: ConversationDataScope,
  usage?: AgentRunLedgerRecord["usage"],
) {
  if (!dataScope || !context.repositories.conversations) return;
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const existing = await context.repositories.conversations.findMessageById(message.id, dataScope);
    const content = messageText(message) || (message.role === "user" ? "Image attachment" : "Agent process completed");
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    await context.repositories.conversations.upsertConversationMessage({
      conversationId,
      message: {
        id: message.id,
        role: message.role,
        content,
        createdAt,
        payload: {
          id: message.id,
          role: message.role,
          content,
          createdAt,
          parts: message.parts,
          ...(message.role === "assistant" && usage
            ? { usage }
            : message.metadata && typeof message.metadata === "object" && "tokenUsage" in message.metadata
              ? { usage: message.metadata.tokenUsage as Record<string, number | undefined> }
              : {}),
        },
      },
    }, dataScope);
  }
}

export function activeNativeToolNames(
  run: Pick<AgentRunLedgerRecord, "tools">,
  availableToolNames: readonly string[],
) {
  const state = deriveAgentWorkflowStateFromTools(run.tools);
  return availableToolNames.filter((name): name is FunctionCallToolName => {
    if (!isFunctionCallToolName(name)) return false;
    if (name === "setFinished") {
      return state.hasInitialCanvasRead && (!state.hasCanvasWrite || state.hasVerificationAfterWrite);
    }
    // Operational tools stay visible throughout the native AI SDK loop. If a
    // documented tool is removed from one step, compatible models may still
    // call it and AI SDK will fail with NoSuchToolError before the renderer can
    // return a recoverable tool result. Only terminal completion is gated.
    return true;
  });
}

function hasCompletedControlTool(run: Pick<AgentRunLedgerRecord, "tools">) {
  return run.tools.some((tool) => tool.toolName === "setFinished" && tool.status === "succeeded");
}

function latestUnrecoveredToolFailure(run: Pick<AgentRunLedgerRecord, "tools">) {
  const seen = new Set<FunctionCallToolName>();
  for (let index = run.tools.length - 1; index >= 0; index -= 1) {
    const tool = run.tools[index]!;
    if (seen.has(tool.toolName)) continue;
    seen.add(tool.toolName);
    if (tool.status === "failed") return tool;
  }
  return null;
}

function usageRecord(usage: LanguageModelUsage) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

function completedNativeControlTool(
  toolCallId: string,
  toolName: FunctionCallToolName,
  args: unknown,
  startedAt: string,
): AgentRunToolRecord {
  const completedAt = new Date().toISOString();
  return {
    toolCallId,
    toolName,
    status: "succeeded",
    args,
    result: { ok: true, result: args, clientMeta: { source: "ai-sdk-native-control" } },
    error: null,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
  };
}

async function loadOrCreateRun(
  input: NativeChatRequest,
  context: BackendHttpContext,
  latestUser: UIMessage,
) {
  const existing = await context.repositories.agentRuns.getLedger(input.runId);
  if (existing) return { run: existing, isNew: false } as const;
  const created = createAgentRunLedger({
    runId: input.runId,
    conversationId: input.conversationId,
    userMessageId: latestUser.id,
    assistantMessageId: null,
    model: input.model,
    locale: input.locale,
    thinking: input.thinking,
    thinkingEffort: input.thinkingEffort,
    prompt: messageText(latestUser),
    attachmentCount: latestUser.parts.filter((part) => part.type === "file").length,
  });
  const run = { ...created, requestFingerprint: nativeUserMessageFingerprint(latestUser) };
  await seedNativeRunBlackboard(context, run);
  return { run, isNew: true } as const;
}

async function persistClaimedRun(context: BackendHttpContext, run: AgentRunLedgerRecord) {
  return context.repositories.agentRuns.compareAndSwapLedger(run, run.revision);
}

function leaseIsActive(run: AgentRunLedgerRecord) {
  if (!run.continuationLeaseId || !run.continuationLeaseExpiresAt) return false;
  return Date.parse(run.continuationLeaseExpiresAt) > Date.now();
}

function releaseContinuationLease(run: AgentRunLedgerRecord, leaseId: string) {
  if (run.continuationLeaseId !== leaseId) return run;
  return { ...run, continuationLeaseId: null, continuationLeaseExpiresAt: null };
}

function nativeUserMessageFingerprint(message: UIMessage) {
  const serialized = JSON.stringify(message.parts.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "file") return { type: "file", mediaType: part.mediaType, url: part.url, filename: part.filename ?? null };
    return { type: part.type };
  }));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function seedNativeRunBlackboard(
  context: BackendHttpContext,
  run: Pick<AgentRunLedgerRecord, "runId" | "conversationId" | "userMessageId" | "prompt" | "locale">,
) {
  if (!run.prompt.trim()) return;
  await context.repositories.blackboard.patchEntries(run.conversationId, {
    ops: [
      {
        op: "upsert",
        key: "original_problem",
        category: "original_problem",
        value: run.prompt,
        confidence: 0.95,
        reason: run.locale === "en-US" ? "Seeded from the user prompt when the native agent started." : "原生 Agent 启动时从用户题目自动写入。",
        sourceMessageId: run.userMessageId ?? null,
        sourceRunId: run.runId,
        sourceToolCallId: "native-chat-blackboard-seed",
      },
      {
        op: "upsert",
        key: "current_goal",
        category: "goal",
        value: run.locale === "en-US" ? `Complete the current user request: ${run.prompt}` : `完成当前用户请求：${run.prompt}`,
        confidence: 0.86,
        reason: run.locale === "en-US" ? "Seeded so follow-up turns can resolve the current task." : "用于后续对话解析当前任务和指代。",
        sourceMessageId: run.userMessageId ?? null,
        sourceRunId: run.runId,
        sourceToolCallId: "native-chat-blackboard-seed",
      },
    ],
    reason: run.locale === "en-US" ? "Create baseline working memory for this native agent run." : "为本轮原生 Agent 建立基础工作记忆。",
  }, { runId: run.runId, toolCallId: "native-chat-blackboard-seed" });
}

function mergeCompletedUITools(run: AgentRunLedgerRecord, messages: UIMessage[]) {
  let next = run;
  const existingById = new Map(run.tools.map((tool) => [tool.toolCallId, tool]));
  for (const message of messages) {
    if (message.role !== "assistant" || message.id !== run.assistantMessageId) continue;
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      const toolName = getToolName(part);
      if (!isFunctionCallToolName(toolName)) continue;
      if (part.state !== "output-available" && part.state !== "output-error" && part.state !== "output-denied") continue;
      const previous = existingById.get(part.toolCallId);
      const args = completedUIToolArgs(part, toolName, previous?.args);
      if (args === null) {
        console.error(`[ERROR] Ignoring invalid ${toolName} UI tool input while preserving runId=${run.runId}`);
        continue;
      }
      const now = new Date().toISOString();
      const tool: AgentRunToolRecord = {
        toolCallId: part.toolCallId,
        toolName: toolName as FunctionCallToolName,
        status: part.state === "output-available" ? "succeeded" : "failed",
        args,
        result: part.state === "output-available" && "output" in part ? part.output : previous?.result,
        error: part.state === "output-error" && "errorText" in part && typeof part.errorText === "string"
          ? part.errorText
          : part.state === "output-denied"
            ? "Tool output was denied."
            : null,
        startedAt: previous?.startedAt ?? now,
        completedAt: previous?.completedAt ?? now,
        durationMs: previous?.durationMs ?? 0,
      };
      next = upsertAgentRunTool(next, tool);
      existingById.set(tool.toolCallId, tool);
    }
  }
  return next;
}

function bindRunAssistantMessage(run: AgentRunLedgerRecord, messages: UIMessage[]) {
  if (run.assistantMessageId) return run;
  const userIndex = messages.findIndex((message) => message.id === run.userMessageId);
  if (userIndex < 0) return run;
  const assistant = messages.slice(userIndex + 1).find((message) => message.role === "assistant");
  return assistant ? { ...run, assistantMessageId: assistant.id } : run;
}

function completedUIToolArgs(
  part: UIMessage["parts"][number],
  toolName: FunctionCallToolName,
  previousArgs: unknown,
) {
  const payload = part as unknown as Record<string, unknown>;
  const candidates = [payload.input, parseRawToolInput(payload.rawInput), previousArgs];
  return candidates.find((candidate) => isFunctionCallArgs(toolName, candidate)) ?? null;
}

function parseRawToolInput(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function messageText(message: UIMessage) {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function validateModelPolicy(input: NativeChatRequest) {
  const policy = getAgentModelPolicy(input.model);
  if (!policy.supportsTools) return `The current model is not declared as tool-calling capable: ${input.model.provider}/${input.model.model}`;
  if (input.thinking && !agentModelSupportsReasoning(input.model.provider, input.model.model)) {
    return `Reasoning mode is not supported by the configured model: ${input.model.provider}/${input.model.model}`;
  }
  return undefined;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: "invalid_request", message }, { status });
}
