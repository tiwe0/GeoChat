import {
  currentUserPromptBeforeBlackboard,
  type AgentRunLedgerRecord,
  type PatchBlackboardArgs,
  type ReadBlackboardArgs
} from "@geochat-ai/app";
import type { ConversationDataScope } from "../../db/conversation-repository";
import { createAgentRunContinuationService } from "../../services/agent-run-continuations";
import { createAgentRunCommitService } from "../../services/agent-run-commits";
import { createAgentRunEventService } from "../../services/agent-run-events";
import { createAgentRunLifecycleWriteService } from "../../services/agent-run-lifecycle-writes";
import { createAgentRunManualWriteService } from "../../services/agent-run-manual-writes";
import { createAgentRunRemoteToolService } from "../../services/agent-run-remote-tools";
import { createAgentRunRemoteToolResultService } from "../../services/agent-run-remote-tool-results";
import { createAgentRunRunnerSnapshotService } from "../../services/agent-run-runner-snapshots";
import { createAgentRunStartService } from "../../services/agent-run-starts";
import { agentRunConversationVisibleInScope } from "../agent-run-scope";
import type { BackendHttpContext } from "../context";
import { json } from "../response";
import type { DataScopeResolver } from "../scope";

const defaultBackendToolAutoStepLimit = 24;

export function createAgentRunWriteController(
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver
) {
  const agentRunRepository = context.repositories.agentRuns;
  const blackboardRepository = context.repositories.blackboard;
  const agentRunEvents = createAgentRunEventService(agentRunRepository);
  const agentRunCommits = createAgentRunCommitService(agentRunRepository, agentRunEvents);
  const agentRunRunnerSnapshots = createAgentRunRunnerSnapshotService(agentRunRepository);
  const agentRunRemoteTools = createAgentRunRemoteToolService(agentRunRepository, agentRunCommits, {
    maxAttempts: context.remoteTools.maxAttempts
  });
  const agentRunManualWrites = createAgentRunManualWriteService(agentRunRepository, agentRunCommits, agentRunRunnerSnapshots);
  const agentRunLifecycleWrites = createAgentRunLifecycleWriteService(agentRunRepository, agentRunCommits);
  const backendToolExecutionContext = (run: Pick<AgentRunLedgerRecord, "runId" | "conversationId" | "locale" | "prompt">) => ({
    runId: run.runId,
    conversationId: run.conversationId,
    prompt: run.prompt,
    locale: run.locale,
    readBlackboard: (args: ReadBlackboardArgs) => blackboardRepository.listEntries(run.conversationId, args),
    patchBlackboard: (args: PatchBlackboardArgs, patchContext: { runId: string; toolCallId: string }) =>
      blackboardRepository.patchEntries(run.conversationId, args, patchContext)
  });
  const agentRunContinuations = createAgentRunContinuationService(agentRunRepository, agentRunCommits, agentRunRunnerSnapshots, {
    modelNextAction: context.services.modelNextAction,
    backendToolAutoStepLimit,
    backendToolExecutionContext
  });
  const agentRunRemoteToolResults = createAgentRunRemoteToolResultService(agentRunRepository, agentRunCommits, agentRunContinuations);
  const agentRunStarts = createAgentRunStartService(agentRunCommits, agentRunRunnerSnapshots, {
    seedBlackboard: (run) => seedRunnerBlackboard(blackboardRepository, run)
  });

  async function scopedAgentRunRecord(request: Request, runId: string): Promise<
    | { record: AgentRunLedgerRecord; scope: ConversationDataScope }
    | { response: Response }
  > {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope;
    const record = await agentRunRepository.getLedger(runId);
    if (!record) return { response: json({ error: "not_found", message: "Agent run was not found." }, { status: 404 }) };
    if (!await agentRunConversationVisibleInScope(record, dataScope.scope, context)) {
      return { response: json({ error: "not_found", message: "Agent run was not found." }, { status: 404 }) };
    }
    return { record, scope: dataScope.scope };
  }

  function agentRunVisibleInScope(record: AgentRunLedgerRecord, scope: ConversationDataScope) {
    return agentRunConversationVisibleInScope(record, scope, context);
  }

  return {
    agentRunCommits,
    agentRunRunnerSnapshots,
    agentRunLifecycleWrites,
    agentRunManualWrites,
    agentRunRemoteTools,
    agentRunRemoteToolResults,
    agentRunStarts,
    defaultRemoteToolClaimOwner: context.remoteTools.defaultClaimOwner,
    agentRunVisibleInScope,
    remoteToolLeaseMs: context.routeLimits.remoteToolLeaseMs,
    scopedAgentRunRecord
  };
}

async function seedRunnerBlackboard(
  blackboardRepository: BackendHttpContext["repositories"]["blackboard"],
  run: Pick<AgentRunLedgerRecord, "runId" | "conversationId" | "userMessageId" | "prompt" | "locale">
) {
  const prompt = currentUserPromptForBlackboard(run.prompt);
  if (!prompt) return;
  await blackboardRepository.patchEntries(
    run.conversationId,
    {
      ops: [
        {
          op: "upsert",
          key: "original_problem",
          category: "original_problem",
          value: prompt,
          confidence: 0.95,
          reason: run.locale === "en-US" ? "Seeded from the user prompt when the runner started." : "runner 启动时从用户题目自动写入。",
          sourceMessageId: run.userMessageId ?? null,
          sourceRunId: run.runId,
          sourceToolCallId: "runner-start-blackboard-seed"
        },
        {
          op: "upsert",
          key: "current_goal",
          category: "goal",
          value: run.locale === "en-US" ? `Complete the current user request: ${prompt}` : `完成当前用户请求：${prompt}`,
          confidence: 0.86,
          reason: run.locale === "en-US" ? "Seeded so follow-up turns can resolve the current task." : "用于后续对话解析当前任务和指代。",
          sourceMessageId: run.userMessageId ?? null,
          sourceRunId: run.runId,
          sourceToolCallId: "runner-start-blackboard-seed"
        }
      ],
      reason: run.locale === "en-US" ? "Create baseline working memory for this agent run." : "为本轮 Agent 建立基础工作记忆。"
    },
    { runId: run.runId, toolCallId: "runner-start-blackboard-seed" }
  );
}

function currentUserPromptForBlackboard(prompt: string) {
  const currentPrompt = currentUserPromptBeforeBlackboard(prompt);
  return currentPrompt.replace(/\s+/g, " ").trim();
}

function backendToolAutoStepLimit() {
  const value = Number(Bun.env.GEOCHAT_BACKEND_TOOL_AUTO_STEP_LIMIT ?? defaultBackendToolAutoStepLimit);
  if (!Number.isInteger(value) || value < 1) return defaultBackendToolAutoStepLimit;
  return Math.min(value, 64);
}

export type AgentRunWriteController = ReturnType<typeof createAgentRunWriteController>;
