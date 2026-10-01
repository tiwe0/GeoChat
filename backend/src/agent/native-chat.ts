import {
  agentThinkingProviderOptions,
  incrementAgentRunModelStep,
  mergeAgentRunUsage,
  normalizeAgentRunThinkingEffort,
  upsertAgentRunTool,
  type AgentRunSkillSelectionRecord,
} from "@geochat-ai/app/agent-run";
import {
  deriveAgentWorkflowStateFromTools,
  evaluateAgentWorkflowToolCall,
} from "@geochat-ai/app/agent-policy";
import {
  getAgentModelPolicy,
} from "@geochat-ai/app/models";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import {
  createAgentUIStreamResponse,
  generateText,
  NoSuchToolError,
  safeValidateUIMessages,
  stepCountIs,
  ToolLoopAgent,
  type Experimental_InferAgentUIMessage,
  type LanguageModel,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import { isDeepStrictEqual } from "node:util";
import type { ConversationDataScope } from "../db/conversation-repository";
import { AgentRunLedgerConflictError } from "../db/agent-run-repository";
import { CredentialResolutionError } from "../credentials/resolver";
import { createBackendLanguageModel } from "./ai-sdk-models";
import { createBackendPlanningTools } from "./ai-sdk-tools";
import { gateNativeChatTerminalEvents, type NativeChatTerminalPersistence } from "./ai-sdk-sse-transport";
import {
  bindNativeRunAssistantMessage,
  claimNativeRunLease,
  failNativeRun,
  hasCompletedControlTool,
  loadOrCreateNativeRun,
  nativeRunLeaseIsActive,
  releaseNativeRunLease,
  terminalizeNativeModelTurn,
  validateNativeRunContinuation,
} from "./agent-run-lifecycle";
import {
  NativeRunPersistenceCoordinator,
  persistNativeConversationMessages,
  seedNativeRunBlackboard,
} from "./agent-run-persistence";

const logger = createStructuredLogger("agent.native-chat");
import {
  activeNativeToolNames,
  countVerifiedCanvasMutationCycles,
  createNativeToolExecutionContext,
  mergeCompletedNativeUITools,
  nativeControlTool,
  nativeConvergenceInstruction,
} from "./agent-tool-orchestrator";
import { executeBackendToolRequest } from "./backend-tools";
import { buildCommandReferencePacketForRun } from "./command-searcher";
import type { NativeChatDependencies } from "./native-chat-ports";
import {
  isNativeChatRequest,
  nativeMessageText,
  validateNativeChatModelPolicy,
  type NativeChatRequest,
} from "./native-chat-request";
import { systemPromptForRun } from "./agent-prompt";
import { refineExecuteGeoGebraCommands } from "./native-tool-policy";
import { sanitizeProviderError } from "./provider-error";
import { selectAgentSkillsForRun, type AgentSkillSelectionPacket } from "./skill-selector";

export { activeNativeToolNames, countVerifiedCanvasMutationCycles, nativeConvergenceInstruction };
export { isNativeChatRequest };
export type { NativeChatDependencies } from "./native-chat-ports";
export type { NativeChatRequest } from "./native-chat-request";

export async function createNativeChatResponse(
  input: NativeChatRequest,
  dependencies: NativeChatDependencies,
  options: {
    model?: LanguageModel;
    abortSignal?: AbortSignal;
    dataScope?: ConversationDataScope;
    correlationId?: string;
    clientSessionId?: string;
  } = {},
) {
  const correlationId = options.correlationId ?? input.runId;
  const policyError = validateNativeChatModelPolicy(input);
  if (policyError) return jsonError(policyError, 400);

  const validated = await safeValidateUIMessages({ messages: input.messages });
  if (!validated.success) return jsonError(validated.error.message, 400);
  const messages = validated.data;
  const validatedProvider = input.providerMessages
    ? await safeValidateUIMessages({ messages: input.providerMessages })
    : validated;
  if (!validatedProvider.success) return jsonError(validatedProvider.error.message, 400);
  const providerMessages = validatedProvider.data;
  if (!isProviderOnlyMessageAugmentation(messages, providerMessages)) {
    return jsonError("Provider messages may only append policy text to the latest user message.", 400);
  }
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUser) return jsonError("A user message is required.", 400);
  const latestProviderUser = [...providerMessages].reverse().find((message) => message.role === "user");
  if (!latestProviderUser) return jsonError("A provider user message is required.", 400);
  const clientSessionId = options.clientSessionId ?? "internal-native-chat";

  let model = options.model;
  if (!model) {
    if (!dependencies.credentials) return jsonError("The native credential resolver is unavailable.", 503);
    try {
      model = await createBackendLanguageModel(input.model, dependencies.credentials, {
        abortSignal: options.abortSignal,
        correlationId,
      });
    } catch (error) {
      if (error instanceof CredentialResolutionError) return jsonError(error.message, error.status);
      throw error;
    }
  }

  const loaded = await loadOrCreateNativeRun(
    input,
    latestUser,
    dependencies.runs,
    (run) => seedNativeRunBlackboard(dependencies.blackboard, run),
    clientSessionId,
  );
  const continuityError = validateNativeRunContinuation(loaded.run, input, latestUser, clientSessionId);
  if (continuityError) return jsonError(continuityError, 409);
  let prepared = bindNativeRunAssistantMessage(loaded.run, messages);
  prepared = mergeCompletedNativeUITools(prepared, messages);
  const now = dependencies.now?.() ?? new Date();
  if (nativeRunLeaseIsActive(prepared, now)) return jsonError("Agent run already has an active continuation.", 409);

  const continuationLeaseId = dependencies.createId?.() ?? crypto.randomUUID();
  prepared = claimNativeRunLease(prepared, continuationLeaseId, now);
  const persistence = new NativeRunPersistenceCoordinator(prepared, dependencies.runs);
  try {
    await persistence.claim(loaded.isNew);
  } catch (error) {
    if (isLedgerConflict(error)) return jsonError("Agent run continuation conflicted with another request.", 409);
    throw error;
  }

  logger.info("request_accepted", "AGENT_REQUEST_ACCEPTED", {
    correlationId,
    runId: persistence.current.runId,
    conversationId: persistence.current.conversationId,
    modelProvider: persistence.current.modelProvider,
    modelId: persistence.current.modelId,
  });

  try {
    await persistNativeConversationMessages(
      dependencies.conversations,
      input.conversationId,
      [latestUser],
      options.dataScope,
      undefined,
      input.model.model,
    );
  } catch (error) {
    const sanitized = sanitizeProviderError(error);
    const failed = await persistence.commit((run) => releaseNativeRunLease(
      failNativeRun(run, sanitized || "Failed to persist the conversation owner anchor."),
      continuationLeaseId,
    ));
    return jsonError(failed.error ?? "Failed to persist the conversation owner anchor.", 500);
  }

  const maxModelSteps = persistence.current.maxToolSteps ?? getAgentModelPolicy(input.model).maxToolSteps;
  const selectSkills = dependencies.selectSkills ?? selectAgentSkillsForRun;
  const skillSelection = await selectSkills({
    // Skill policy is a provider-only transport augmentation. Give the selector
    // a transient view of that prompt without contaminating the ledger,
    // blackboard, recovery composer, or persisted conversation title.
    run: {
      ...persistence.current,
      prompt: nativeMessageText(latestProviderUser),
    },
    model,
    temperature: getAgentModelPolicy(input.model).defaultTemperature,
    timeout: persistence.current.modelStepTimeoutMs ?? 120_000,
  });
  await persistence.commit((run) => {
    let next = run;
    for (let index = 0; index < (skillSelection.modelCallCount ?? 0); index += 1) {
      next = incrementAgentRunModelStep(next);
    }
    if (skillSelection.modelCallCount) {
      next = { ...next, usage: mergeAgentRunUsage(next.usage, skillSelection.usage) };
    }
    return {
      ...next,
      skillSelection: skillSelectionRecord(skillSelection, next.skillSelection?.recordedAt),
    };
  });

  const remainingModelSteps = maxModelSteps - (persistence.current.modelStepCount ?? 0);
  if (remainingModelSteps <= 0) {
    const failed = await persistence.commit((run) => releaseNativeRunLease(
      failNativeRun(run, `Model step budget exhausted (${maxModelSteps}).`),
      continuationLeaseId,
    ));
    return jsonError(failed.error ?? `Model step budget exhausted (${maxModelSteps}).`, 409);
  }

  const commandReferencePacket = buildCommandReferencePacketForRun({
    prompt: persistence.current.prompt,
    locale: persistence.current.locale,
    skillSelection,
  });
  const system = await systemPromptForRun(persistence.current, false, skillSelection, commandReferencePacket);
  const executionContext = createNativeToolExecutionContext(() => persistence.current, dependencies.blackboard);
  const executeTool = dependencies.executeBackendTool ?? executeBackendToolRequest;
  const tools = createBackendPlanningTools(persistence.current.locale, [], skillSelection, persistence.current, {
    executeBackendTool: async (toolName, args, toolContext) => {
      const startedAt = new Date().toISOString();
      const current = persistence.current;
      const tool = toolName === "setFinished"
        ? nativeControlTool(
            toolContext.toolCallId,
            toolName,
            args,
            startedAt,
            evaluateAgentWorkflowToolCall(deriveAgentWorkflowStateFromTools(current.tools), toolName),
          )
        : await executeTool(
            { toolCallId: toolContext.toolCallId, toolName, args, requestedAt: startedAt },
            executionContext,
            startedAt,
          );
      await persistence.commit((run) => upsertAgentRunTool(run, tool));
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
    stopWhen: [stepCountIs(remainingModelSteps), () => hasCompletedControlTool(persistence.current)],
    maxRetries: 3,
    temperature: getAgentModelPolicy(input.model).defaultTemperature,
    providerOptions: agentThinkingProviderOptions({
      provider: input.model.provider,
      enabled: input.thinking,
      effort: normalizeAgentRunThinkingEffort(input.thinkingEffort) ?? "standard",
    }),
    prepareStep: () => {
      const run = persistence.current;
      if ((run.modelStepCount ?? 0) >= maxModelSteps) throw new Error(`Model step budget exhausted (${maxModelSteps}).`);
      const convergenceInstruction = nativeConvergenceInstruction(run, maxModelSteps);
      return {
        activeTools: activeNativeToolNames(run, Object.keys(tools)),
        ...(convergenceInstruction ? { instructions: `${system}\n\n${convergenceInstruction}` } : {}),
      };
    },
    repairToolCall: async ({ toolCall, tools: repairTools, error, messages: repairMessages, instructions, abortSignal }) => {
      if (NoSuchToolError.isInstance(error)) return null;
      if ((persistence.current.modelStepCount ?? 0) >= maxModelSteps) {
        throw new Error(`Model step budget exhausted (${maxModelSteps}).`);
      }
      const repair = await generateText({
        model,
        instructions,
        messages: [
          ...repairMessages,
          { role: "assistant", content: [{
            type: "tool-call",
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: toolCall.input,
          }] },
          { role: "tool", content: [{
            type: "tool-result",
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            output: { type: "error-text", value: error.message },
          }] },
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
      await persistence.commit((run) => {
        const incremented = incrementAgentRunModelStep(run);
        return { ...incremented, usage: mergeAgentRunUsage(incremented.usage, usageRecord(repair.usage)) };
      });
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
        prompt: persistence.current.prompt,
        locale: persistence.current.locale,
      }),
    },
    onEnd: async ({ usage, finishReason }) => {
      finalUsage = usage;
      finalFinishReason = finishReason;
    },
    onStepEnd: async () => {
      await persistence.commit((run) => incrementAgentRunModelStep(run));
    },
  });

  let resolveTerminalPersistence!: (result: NativeChatTerminalPersistence) => void;
  let rejectTerminalPersistence!: (error: unknown) => void;
  const terminalPersistence = new Promise<NativeChatTerminalPersistence>((resolve, reject) => {
    resolveTerminalPersistence = resolve;
    rejectTerminalPersistence = reject;
  });
  const response = await createAgentUIStreamResponse({
    agent,
    uiMessages: providerMessages,
    originalMessages: messages as Experimental_InferAgentUIMessage<typeof agent>[],
    generateMessageId: dependencies.createId ?? (() => crypto.randomUUID()),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    timeout: persistence.current.modelStepTimeoutMs ?? 120_000,
    sendReasoning: true,
    onError: (error) => {
      const sanitized = sanitizeProviderError(error);
      logger.error("stream_failed", "AGENT_STREAM_FAILED", {
        error,
        correlationId,
        runId: persistence.current.runId,
        conversationId: persistence.current.conversationId,
      });
      return sanitized || "Agent run failed.";
    },
    onEnd: async ({ messages: finalMessages, isAborted, outcome }) => {
      try {
        const persisted = await persistence.commit((current) => {
          if (isAborted) return releaseNativeRunLease(current, continuationLeaseId);
          let next = bindNativeRunAssistantMessage(current, finalMessages);
          next = mergeCompletedNativeUITools(next, finalMessages);
          if (finalUsage) next = { ...next, usage: mergeAgentRunUsage(next.usage, usageRecord(finalUsage)) };
          next = outcome.status === "failed"
            ? failNativeRun(next, sanitizeProviderError(outcome.error) || "Agent run failed.")
            : terminalizeNativeModelTurn(next, finalFinishReason, maxModelSteps);
          return releaseNativeRunLease(next, continuationLeaseId);
        }, isAborted
          ? undefined
          : (next) => persistNativeConversationMessages(
              dependencies.conversations,
              input.conversationId,
              finalMessages,
              options.dataScope,
              next.usage,
              input.model.model,
            ));
        resolveTerminalPersistence({ status: persisted.status, error: persisted.error });
      } catch (error) {
        const sanitized = sanitizeProviderError(error);
        logger.error("terminal_persistence_failed", "AGENT_PERSISTENCE_FAILED", {
          error,
          correlationId,
          runId: persistence.current.runId,
          conversationId: persistence.current.conversationId,
        });
        try {
          await persistence.commit((current) => {
            const withUsage = finalUsage
              ? { ...current, usage: mergeAgentRunUsage(current.usage, usageRecord(finalUsage)) }
              : current;
            return releaseNativeRunLease(
              failNativeRun(withUsage, sanitized || "Failed to persist the completed agent run."),
              continuationLeaseId,
            );
          });
        } catch (terminalError) {
          logger.error("persistence_failure_record_failed", "AGENT_PERSISTENCE_TERMINALIZATION_FAILED", {
            error: terminalError,
            correlationId,
            runId: persistence.current.runId,
            conversationId: persistence.current.conversationId,
          });
        }
        rejectTerminalPersistence(error);
      }
    },
  });
  return gateNativeChatTerminalEvents(response, terminalPersistence);
}

export function isProviderOnlyMessageAugmentation(
  visibleMessages: UIMessage[],
  providerMessages: UIMessage[],
) {
  if (visibleMessages.length !== providerMessages.length) return false;
  const latestUserIndex = lastIndexMatching(visibleMessages, (message) => message.role === "user");
  if (latestUserIndex < 0) return isDeepStrictEqual(visibleMessages, providerMessages);
  const visibleUser = visibleMessages[latestUserIndex]!;
  const providerUser = providerMessages[latestUserIndex];
  if (!providerUser || providerUser.id !== visibleUser.id || providerUser.role !== "user") return false;
  const latestTextIndex = lastIndexMatching(visibleUser.parts, (part) => part.type === "text");
  if (latestTextIndex < 0) return isDeepStrictEqual(visibleMessages, providerMessages);
  const visiblePart = visibleUser.parts[latestTextIndex];
  const providerPart = providerUser.parts[latestTextIndex];
  if (visiblePart?.type !== "text" || providerPart?.type !== "text") return false;
  if (
    providerPart.text !== visiblePart.text
    && !providerPart.text.startsWith(`${visiblePart.text}\n\n`)
  ) return false;

  const normalizedProvider = providerMessages.map((message, messageIndex) => {
    if (messageIndex !== latestUserIndex) return message;
    return {
      ...message,
      parts: message.parts.map((part, partIndex) => partIndex === latestTextIndex
        ? { ...part, text: visiblePart.text }
        : part),
    } as UIMessage;
  });
  return isDeepStrictEqual(visibleMessages, normalizedProvider);
}

function lastIndexMatching<T>(items: readonly T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) return index;
  }
  return -1;
}

export function skillSelectionRecord(
  packet: AgentSkillSelectionPacket,
  recordedAt = new Date().toISOString(),
): AgentRunSkillSelectionRecord {
  return {
    status: packet.status,
    visualProfile: packet.visualProfile ?? null,
    selectedSkills: packet.selectedSkills.map(({ name, reason }) => ({ name, reason })),
    loadedSkills: (packet.loadedSkills ?? []).map(({ name, source, maturity }) => ({ name, source, maturity })),
    failedSkillLoads: (packet.failedSkillLoads ?? []).map(({ name, error }) => ({ name, error })),
    curriculumNodeIds: packet.curriculumNodes.map((node) => node.id),
    enabledAdvancedTools: [...packet.enabledAdvancedTools],
    selectorReason: packet.selectorReason,
    selectorError: packet.error ?? null,
    injectedContextLength: packet.injectedContext.length,
    cacheHit: Boolean(packet.cacheHit),
    modelCallCount: packet.modelCallCount ?? 0,
    recordedAt,
  };
}

function usageRecord(usage: LanguageModelUsage) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

function isLedgerConflict(error: unknown) {
  return error instanceof AgentRunLedgerConflictError
    || (error instanceof Error && error.message.includes("revision conflict"));
}

function jsonError(message: string, status: number) {
  return Response.json({ error: "invalid_request", message }, { status });
}
