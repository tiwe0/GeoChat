import {
  decideAgentRunRunnerContinuation,
  finishAgentRunLedger,
  isAgentRunRawGeoGebraCommandFallback,
  isAgentRunRemoteToolRequestInput,
  isAgentRunTimestamp,
  type AgentModelConfig,
  type AgentRunImageAttachment,
  type AgentRunLedgerRecord,
  type AgentRunModelStepRecord,
  type AgentRunRemoteToolRequest,
  type AgentRunRemoteToolRequestInput,
  type AgentRunToolRecord
} from "@geochat-ai/app";
import {
  canExecuteBackendToolRequest,
  type BackendToolExecutionContext
} from "../agent/backend-tools";
import type { BackendModelNextAction, BackendModelNextActionInput } from "../agent/model-runner";
import type { AgentRunCommitService } from "./agent-run-commits";
import { executeBackendToolAutoStep } from "./agent-run-continuation-backend-tools";
import {
  createAdvancedDrawingNextToolPolicyDecision,
  createBackendToolAutoStepLimitDecision,
  createBackendToolErrorDecision,
  createRawCommandFallbackPolicyDecision,
  createRunnerContinuationPolicyDecision,
  createRunnerModelErrorDecision
} from "./agent-run-continuation-policy";
import {
  committedRunnerOutcome,
  type RunnerContinuationOutcome
} from "./agent-run-continuation-responses";
import { runRunnerContinuationModelTurn } from "./agent-run-continuation-model-turns";
import type { AgentRunRunnerSnapshotService } from "./agent-run-runner-snapshots";

type RemoteToolConflictOutcome = (input: {
  runId: string;
  currentRequest?: AgentRunRemoteToolRequest;
}) => Promise<RunnerContinuationOutcome>;

export async function continueRunnerActionLoop(input: {
  run: AgentRunLedgerRecord;
  action: BackendModelNextAction;
  completedRequest: AgentRunRemoteToolRequest;
  expectedCompletedRequest: AgentRunRemoteToolRequest;
  modelStep: AgentRunModelStepRecord;
  model: AgentModelConfig;
  attachments?: AgentRunImageAttachment[];
  pendingToolRequests: AgentRunRemoteToolRequest[];
  onModelTextDelta?: (text: string) => void;
  agentRunCommits: AgentRunCommitService;
  agentRunRunnerSnapshots: AgentRunRunnerSnapshotService;
  modelNextAction: (input: BackendModelNextActionInput) => Promise<BackendModelNextAction>;
  backendToolAutoStepLimit: () => number;
  backendToolExecutionContext: (run: Pick<AgentRunLedgerRecord, "runId" | "conversationId" | "locale" | "prompt">) => BackendToolExecutionContext;
  remoteToolResultCommitConflictOutcome: RemoteToolConflictOutcome;
}): Promise<RunnerContinuationOutcome> {
  let run = input.run;
  let action = input.action;
  let modelStep = input.modelStep;
  let completedRequest: AgentRunRemoteToolRequest | undefined = input.completedRequest;
  let expectedCompletedRequest: AgentRunRemoteToolRequest | undefined = input.expectedCompletedRequest;
  const responseRequest = input.completedRequest;
  let pendingToolRequests = input.pendingToolRequests;
  const autoStepLimit = input.backendToolAutoStepLimit();

  for (let backendAutoStep = 0; backendAutoStep <= autoStepLimit; backendAutoStep += 1) {
    const decision = decideAgentRunRunnerContinuation({
      run,
      action,
      pendingToolRequests
    });
    run = decision.run;
    const policyDecision = createRunnerContinuationPolicyDecision(run.runId, decision);
    const supplementalPolicyDecisions =
      decision.type === "enqueue_tool" &&
      action.source === "model" &&
      isAgentRunRawGeoGebraCommandFallback({ run, request: decision.nextRequest })
        ? [createRawCommandFallbackPolicyDecision({ runId: run.runId, request: decision.nextRequest })]
        : [];
    const dateError = validateAgentRunDates(run);
    if (dateError) return dateError;

    if (decision.type === "workflow_blocked") {
      const committed = await input.agentRunCommits.saveRunnerContinuationCommit({ run, completedRequest, expectedCompletedRequest, policyDecision, modelStep });
      if (!committed.committed) return await input.remoteToolResultCommitConflictOutcome(committed);
      return await committedRunnerOutcome({
        status: 409,
        commit: committed,
        snapshots: input.agentRunRunnerSnapshots,
        responseRequest,
        error: "workflow_blocked",
        message: decision.message
      });
    }
    if (decision.type === "budget_exhausted") {
      const committed = await input.agentRunCommits.saveRunnerContinuationCommit({ run, completedRequest, expectedCompletedRequest, policyDecision, modelStep });
      if (!committed.committed) return await input.remoteToolResultCommitConflictOutcome(committed);
      return await committedRunnerOutcome({
        status: 200,
        commit: committed,
        snapshots: input.agentRunRunnerSnapshots,
        responseRequest,
        text: decision.text
      });
    }
    if (decision.type === "finish") {
      const committed = await input.agentRunCommits.saveRunnerContinuationCommit({ run, completedRequest, expectedCompletedRequest, policyDecision, modelStep });
      if (!committed.committed) return await input.remoteToolResultCommitConflictOutcome(committed);
      return await committedRunnerOutcome({
        status: 200,
        commit: committed,
        snapshots: input.agentRunRunnerSnapshots,
        responseRequest,
        text: decision.text
      });
    }

    if (!canExecuteBackendToolRequest(decision.nextRequest)) {
      const committed = await input.agentRunCommits.saveRunnerContinuationCommit({
        run,
        completedRequest,
        expectedCompletedRequest,
        nextRequest: decision.nextRequest,
        policyDecision,
        policyDecisions: supplementalPolicyDecisions,
        modelStep
      });
      if (!committed.committed) return await input.remoteToolResultCommitConflictOutcome(committed);
      return await committedRunnerOutcome({
        status: 200,
        commit: committed,
        snapshots: input.agentRunRunnerSnapshots,
        responseRequest,
        includeNextRequest: true
      });
    }

    if (backendAutoStep >= autoStepLimit) {
      run = finishAgentRunLedger(run, {
        status: "failed",
        usage: null,
        error: "Backend runner exceeded the automatic backend tool execution limit."
      });
      const committed = await input.agentRunCommits.saveRunnerContinuationCommit({
        run,
        completedRequest,
        expectedCompletedRequest,
        policyDecision,
        policyDecisions: [
          createBackendToolAutoStepLimitDecision({
            run,
            request: decision.nextRequest,
            limit: autoStepLimit,
            attemptedStep: backendAutoStep
          })
        ],
        modelStep
      });
      if (!committed.committed) return await input.remoteToolResultCommitConflictOutcome(committed);
      return await committedRunnerOutcome({
        status: 409,
        commit: committed,
        snapshots: input.agentRunRunnerSnapshots,
        responseRequest,
        error: "backend_tool_auto_step_limit",
        message: run.error
      });
    }

    const backendAutoStepResult = await executeBackendToolAutoStep({
      run,
      request: decision.nextRequest,
      executionContext: input.backendToolExecutionContext(run)
    });
    run = backendAutoStepResult.run;
    if (backendAutoStepResult.type === "failed") {
      const committed = await input.agentRunCommits.saveRunnerContinuationCommit({
        run,
        completedRequest,
        expectedCompletedRequest,
        policyDecision: createBackendToolErrorDecision(run.runId, backendAutoStepResult.tool),
        policyDecisions: supplementalPolicyDecisions,
        modelStep
      });
      if (!committed.committed) return await input.remoteToolResultCommitConflictOutcome(committed);
      return await committedRunnerOutcome({
        status: 502,
        commit: committed,
        snapshots: input.agentRunRunnerSnapshots,
        responseRequest,
        error: "backend_tool_error",
        message: run.error
      });
    }
    const advancedDrawingNextRequest = compiledAdvancedDrawingNextRequest(backendAutoStepResult.tool);
    if (advancedDrawingNextRequest) {
      const backendCommit = await input.agentRunCommits.saveRunnerContinuationCommit({
        run,
        completedRequest,
        expectedCompletedRequest,
        nextRequest: advancedDrawingNextRequest,
        policyDecision,
        policyDecisions: [
          ...supplementalPolicyDecisions,
          createAdvancedDrawingNextToolPolicyDecision({ runId: run.runId, request: advancedDrawingNextRequest })
        ],
        modelStep
      });
      if (!backendCommit.committed) return await input.remoteToolResultCommitConflictOutcome(backendCommit);
      return await committedRunnerOutcome({
        status: 200,
        commit: backendCommit,
        snapshots: input.agentRunRunnerSnapshots,
        responseRequest,
        includeNextRequest: true
      });
    }
    const backendCommit = await input.agentRunCommits.saveRunnerContinuationCommit({
      run,
      completedRequest,
      expectedCompletedRequest,
      policyDecision,
      policyDecisions: supplementalPolicyDecisions,
      modelStep
    });
    if (!backendCommit.committed) return await input.remoteToolResultCommitConflictOutcome(backendCommit);
    run = backendCommit.run;
    completedRequest = undefined;
    expectedCompletedRequest = undefined;
    pendingToolRequests = pendingToolRequests.filter((request) => request.status === "pending" || request.status === "running");

    const nextModelTurn = await runRunnerContinuationModelTurn({
      run,
      model: input.model,
      attachments: input.attachments,
      onModelTextDelta: input.onModelTextDelta,
      modelNextAction: input.modelNextAction
    });
    if (nextModelTurn.type === "failed") {
      run = nextModelTurn.run;
      const committed = await input.agentRunCommits.saveRunnerContinuationCommit({
        run,
        policyDecision: createRunnerModelErrorDecision(run.runId, "runner_continuation", run.error),
        modelStep: nextModelTurn.modelStep
      });
      if (!committed.committed) return await input.remoteToolResultCommitConflictOutcome(committed);
      return await committedRunnerOutcome({
        status: 502,
        commit: committed,
        snapshots: input.agentRunRunnerSnapshots,
        responseRequest,
        error: "runner_model_error",
        message: run.error
      });
    }
    action = nextModelTurn.action;
    modelStep = nextModelTurn.modelStep;
  }

  return {
    status: 409,
    body: {
      error: "backend_tool_auto_step_limit",
      message: "Backend runner automatic tool loop ended unexpectedly."
    }
  };
}

function compiledAdvancedDrawingNextRequest(tool: AgentRunToolRecord): AgentRunRemoteToolRequestInput | undefined {
  if (tool.toolName !== "executeAdvancedDrawingCommand" || tool.status !== "succeeded") return undefined;
  const result = tool.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const inner = (result as { result?: unknown }).result;
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return undefined;
  const nextTool = (inner as { nextTool?: unknown }).nextTool;
  if (!nextTool || typeof nextTool !== "object" || Array.isArray(nextTool)) return undefined;
  const candidate = nextTool as { toolName?: unknown; args?: unknown };
  const request = {
    toolCallId: `${tool.toolCallId}-compiled-execute`,
    toolName: candidate.toolName,
    args: candidate.args
  };
  return isAgentRunRemoteToolRequestInput(request) ? request : undefined;
}

function validateAgentRunDates(record: AgentRunLedgerRecord): RunnerContinuationOutcome | undefined {
  if (!isAgentRunTimestamp(record.startedAt)) {
    return {
      status: 400,
      body: { error: "invalid_request", message: "Agent run startedAt must be a valid date string." }
    };
  }
  if (record.completedAt && !isAgentRunTimestamp(record.completedAt)) {
    return {
      status: 400,
      body: { error: "invalid_request", message: "Agent run completedAt must be a valid date string." }
    };
  }
  for (const tool of record.tools) {
    if (!isAgentRunTimestamp(tool.startedAt) || (tool.completedAt && !isAgentRunTimestamp(tool.completedAt))) {
      return {
        status: 400,
        body: { error: "invalid_request", message: "Agent run tool timestamps must be valid date strings." }
      };
    }
    if (record.status !== "running" && tool.status === "running") {
      return {
        status: 400,
        body: { error: "invalid_request", message: "Finished agent runs cannot contain running tools." }
      };
    }
  }
  return undefined;
}
