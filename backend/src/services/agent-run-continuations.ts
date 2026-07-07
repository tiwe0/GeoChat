import {
  isAgentRunRemoteToolRequestTerminal,
  type AgentModelConfig,
  type AgentRunImageAttachment,
  type AgentRunLedgerRecord,
  type AgentRunRemoteToolRequest
} from "@geochat-ai/app";
import type { BackendToolExecutionContext } from "../agent/backend-tools";
import type { BackendModelNextAction, BackendModelNextActionInput } from "../agent/model-runner";
import type { AgentRunRepository } from "../db/agent-run-repository";
import type { AgentRunCommitService } from "./agent-run-commits";
import { continueRunnerActionLoop } from "./agent-run-continuation-action-loop";
import { failAgentRunForRunnerContinuationError } from "./agent-run-continuation-failures";
import { runRunnerContinuationModelTurn } from "./agent-run-continuation-model-turns";
import { createRunnerModelErrorDecision } from "./agent-run-continuation-policy";
import {
  committedRunnerOutcome,
  currentRemoteToolTerminalOutcome,
  remoteToolCommitConflictOutcome,
  type RunnerContinuationOutcome
} from "./agent-run-continuation-responses";
import type { AgentRunRunnerSnapshotService } from "./agent-run-runner-snapshots";

export function createAgentRunContinuationService(
  agentRunRepository: AgentRunRepository,
  agentRunCommits: AgentRunCommitService,
  agentRunRunnerSnapshots: AgentRunRunnerSnapshotService,
  options: {
    modelNextAction: (input: BackendModelNextActionInput) => Promise<BackendModelNextAction>;
    backendToolAutoStepLimit: () => number;
    backendToolExecutionContext: (run: Pick<AgentRunLedgerRecord, "runId" | "conversationId" | "locale" | "prompt">) => BackendToolExecutionContext;
  }
) {
  async function commitCompletedToolResult(input: {
    run: AgentRunLedgerRecord;
    completedRequest: AgentRunRemoteToolRequest;
    expectedCompletedRequest: AgentRunRemoteToolRequest;
  }): Promise<RunnerContinuationOutcome> {
    const committed = await agentRunCommits.saveRunnerToolResultCommit(input);
    if (!committed.committed) return await remoteToolResultCommitConflictOutcome(committed);
    return await committedRunnerOutcome({
      status: 200,
      commit: committed,
      snapshots: agentRunRunnerSnapshots
    });
  }

  async function continueAfterToolResult(input: {
    run: AgentRunLedgerRecord;
    completedRequest: AgentRunRemoteToolRequest;
    expectedCompletedRequest: AgentRunRemoteToolRequest;
    model: AgentModelConfig;
    attachments?: AgentRunImageAttachment[];
    pendingToolRequests: AgentRunRemoteToolRequest[];
    onModelTextDelta?: (text: string) => void;
  }): Promise<RunnerContinuationOutcome> {
    let run = input.run;
    const modelTurn = await runRunnerContinuationModelTurn({
      run,
      model: input.model,
      attachments: input.attachments,
      onModelTextDelta: input.onModelTextDelta,
      modelNextAction: options.modelNextAction
    });
    if (modelTurn.type === "failed") {
      run = modelTurn.run;
      const committed = await agentRunCommits.saveRunnerToolResultCommit({
        run,
        completedRequest: input.completedRequest,
        expectedCompletedRequest: input.expectedCompletedRequest,
        policyDecision: createRunnerModelErrorDecision(run.runId, "runner_continuation", run.error),
        modelStep: modelTurn.modelStep
      });
      if (!committed.committed) return await remoteToolResultCommitConflictOutcome(committed);
      return await committedRunnerOutcome({
        status: 502,
        commit: committed,
        snapshots: agentRunRunnerSnapshots,
        error: "runner_model_error",
        message: run.error
      });
    }
    try {
      return await continueRunnerActionLoop({
        run,
        action: modelTurn.action,
        completedRequest: input.completedRequest,
        expectedCompletedRequest: input.expectedCompletedRequest,
        modelStep: modelTurn.modelStep,
        model: input.model,
        attachments: input.attachments,
        pendingToolRequests: input.pendingToolRequests,
        onModelTextDelta: input.onModelTextDelta,
        agentRunCommits,
        agentRunRunnerSnapshots,
        modelNextAction: options.modelNextAction,
        backendToolAutoStepLimit: options.backendToolAutoStepLimit,
        backendToolExecutionContext: options.backendToolExecutionContext,
        remoteToolResultCommitConflictOutcome
      });
    } catch (error) {
      run = failAgentRunForRunnerContinuationError(run, error);
      const committed = await agentRunCommits.saveRunnerToolResultCommit({
        run,
        completedRequest: input.completedRequest,
        expectedCompletedRequest: input.expectedCompletedRequest,
        policyDecision: createRunnerModelErrorDecision(run.runId, "runner_continuation", run.error),
        modelStep: modelTurn.modelStep
      });
      if (!committed.committed) return await remoteToolResultCommitConflictOutcome(committed);
      return await committedRunnerOutcome({
        status: 502,
        commit: committed,
        snapshots: agentRunRunnerSnapshots,
        error: "runner_continuation_error",
        message: run.error
      });
    }
  }

  async function remoteToolResultCommitConflictOutcome(input: {
    runId: string;
    currentRequest?: AgentRunRemoteToolRequest;
  }): Promise<RunnerContinuationOutcome> {
    const currentRun = await agentRunRepository.getLedger(input.runId);
    if (currentRun && input.currentRequest && isAgentRunRemoteToolRequestTerminal(input.currentRequest)) {
      return await currentRemoteToolTerminalOutcome({
        run: currentRun,
        request: input.currentRequest,
        snapshots: agentRunRunnerSnapshots
      });
    }
    return await remoteToolCommitConflictOutcome({
      run: currentRun,
      request: input.currentRequest,
      snapshots: agentRunRunnerSnapshots
    });
  }

  return {
    commitCompletedToolResult,
    continueAfterToolResult,
    runnerSnapshot: agentRunRunnerSnapshots.snapshot
  };
}

export type AgentRunContinuationService = ReturnType<typeof createAgentRunContinuationService>;
