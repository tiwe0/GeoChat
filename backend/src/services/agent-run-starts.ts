import {
  createAgentRunInitialCanvasReadRequest,
  decideAgentRunRunnerStart,
  finishAgentRunLedger,
  getAgentModelPolicy,
  getFunctionCallRemoteBridgeToolNames,
  type AgentModelConfig,
  type AgentRunImageAttachment,
  type AgentRunLedgerRecord,
  type AgentRunPolicyDecisionRecord,
  type AgentRunRemoteToolRequestInput
} from "@geochat-ai/app";
import { sanitizeRunnerModelError } from "../agent/model-error";
import type { AgentRunCommitService } from "./agent-run-commits";
import type { AgentRunRunnerSnapshotService } from "./agent-run-runner-snapshots";

type RunnerStartOutcome = {
  status: 201 | 409 | 502;
  body: Record<string, unknown>;
};

export function createAgentRunStartService(
  agentRunCommits: AgentRunCommitService,
  agentRunRunnerSnapshots: AgentRunRunnerSnapshotService,
  options: {
    seedBlackboard?: (run: AgentRunLedgerRecord) => Promise<void>;
  } = {}
) {
  async function startRunner(input: {
    record: AgentRunLedgerRecord;
    model?: AgentModelConfig;
    attachments?: AgentRunImageAttachment[];
    firstTool?: AgentRunRemoteToolRequestInput;
  }): Promise<RunnerStartOutcome> {
    if (input.model && !agentRunModelMatches(input.record, input.model)) {
      const failedRecord = finishAgentRunLedger(input.record, {
        status: "failed",
        error: runnerModelMismatchMessage(input.record)
      });
      const policyDecision = createRunnerModelMismatchDecision(failedRecord, input.model, "runner_start");
      await agentRunCommits.saveRunnerTerminalPolicyCommit(failedRecord, policyDecision);
      return {
        status: 409,
        body: {
          error: "runner_model_mismatch",
          message: runnerModelMismatchMessage(failedRecord),
          runner: await agentRunRunnerSnapshots.snapshot(failedRecord)
        }
      };
    }

    const modelPreflightError = input.model
      ? validateRunnerModelPreflight(input.model, input.attachments?.length ?? 0, input.record.locale)
      : undefined;
    if (modelPreflightError) {
      const failedRecord = failAgentRunForModelError(input.record, modelPreflightError);
      const decision = createRunnerModelErrorDecision(failedRecord.runId, "runner_start", failedRecord.error);
      await agentRunCommits.saveRunnerTerminalPolicyCommit(failedRecord, decision);
      return {
        status: 502,
        body: {
          error: "runner_model_error",
          message: failedRecord.error,
          runner: await agentRunRunnerSnapshots.snapshot(failedRecord)
        }
      };
    }

    const firstTool = input.firstTool ?? createAgentRunInitialCanvasReadRequest({ locale: input.record.locale });
    if (!getFunctionCallRemoteBridgeToolNames().includes(firstTool.toolName)) {
      const failedRecord = finishAgentRunLedger(input.record, {
        status: "failed",
        error: remoteBridgeToolBoundaryMessage(firstTool.toolName)
      });
      const policyDecision = createRemoteBridgeToolBoundaryDecision({
        record: failedRecord,
        stage: "runner_start",
        toolCallId: firstTool.toolCallId,
        toolName: firstTool.toolName,
        details: { request: firstTool }
      });
      await agentRunCommits.saveRunnerTerminalPolicyCommit(failedRecord, policyDecision);
      return {
        status: 409,
        body: {
          error: "tool_not_remote_bridge_executable",
          message: remoteBridgeToolBoundaryMessage(firstTool.toolName),
          runner: await agentRunRunnerSnapshots.snapshot(failedRecord)
        }
      };
    }

    const startDecision = decideAgentRunRunnerStart({ run: input.record, firstRequest: firstTool });
    const policyDecision = createRunnerStartPolicyDecision(input.record.runId, startDecision);
    if (startDecision.type === "workflow_blocked") {
      const failedRecord = finishAgentRunLedger(startDecision.run, {
        status: "failed",
        error: startDecision.message
      });
      await agentRunCommits.saveRunnerTerminalPolicyCommit(failedRecord, policyDecision);
      return {
        status: 409,
        body: {
          error: "workflow_blocked",
          message: startDecision.message,
          runner: await agentRunRunnerSnapshots.snapshot(failedRecord)
        }
      };
    }
    if (startDecision.type === "budget_exhausted") {
      const failedRecord = finishAgentRunLedger(startDecision.run, {
        status: "failed",
        error: "Agent runner tool budget is exhausted."
      });
      await agentRunCommits.saveRunnerTerminalPolicyCommit(failedRecord, policyDecision);
      return {
        status: 409,
        body: {
          error: "runner_budget_exceeded",
          message: "Agent runner tool budget is exhausted.",
          budget: startDecision.budget,
          runner: await agentRunRunnerSnapshots.snapshot(failedRecord)
        }
      };
    }

    const committed = await agentRunCommits.saveRunnerStartCommit(input.record, startDecision.firstRequest, policyDecision);
    await seedRunnerBlackboard(options.seedBlackboard, committed.run);
    return {
      status: 201,
      body: { runner: await agentRunRunnerSnapshots.snapshot(committed.run, [committed.request]) }
    };
  }

  return {
    startRunner
  };
}

async function seedRunnerBlackboard(
  seedBlackboard: ((run: AgentRunLedgerRecord) => Promise<void>) | undefined,
  run: AgentRunLedgerRecord
) {
  if (!seedBlackboard) return;
  try {
    await seedBlackboard(run);
  } catch (error) {
    console.warn("Failed to seed conversation blackboard for runner start", error);
  }
}

function validateRunnerModelPreflight(model: { provider: string; model: string }, attachmentCount: number, locale?: AgentRunLedgerRecord["locale"]) {
  const modelPolicy = getAgentModelPolicy(model);
  if (!modelPolicy.supportsTools) {
    return new Error(
      locale === "en-US"
        ? `The current model is not declared as tool-calling capable: ${model.provider}/${model.model}`
        : `当前模型未声明 tool-calling 能力：${model.provider}/${model.model}`
    );
  }
  if (attachmentCount > 0 && !modelPolicy.supportsImages) {
    return new Error(
      locale === "en-US"
        ? `The current model is not declared as image-input capable: ${model.provider}/${model.model}`
        : `当前模型未声明图片输入能力：${model.provider}/${model.model}`
    );
  }
  return undefined;
}

function agentRunModelMatches(record: AgentRunLedgerRecord, model: { provider: string; model: string }) {
  return record.modelProvider === model.provider && record.modelId === model.model;
}

function failAgentRunForModelError(record: AgentRunLedgerRecord, error: unknown) {
  return finishAgentRunLedger(record, {
    status: "failed",
    usage: null,
    error: `Backend model call failed: ${sanitizeRunnerModelError(error)}`
  });
}

function runnerModelMismatchMessage(record: Pick<AgentRunLedgerRecord, "modelProvider" | "modelId">) {
  return `Agent runner model must match the model recorded on the run ledger: ${record.modelProvider}/${record.modelId}.`;
}

function createRunnerStartPolicyDecision(
  runId: string,
  decision: ReturnType<typeof decideAgentRunRunnerStart>
): AgentRunPolicyDecisionRecord {
  if (decision.type === "enqueue_tool") {
    return createAgentRunPolicyDecision({
      runId,
      stage: "runner_start",
      kind: "runner_start_enqueued",
      allowed: true,
      message: "Runner start enqueued the first remote tool request.",
      toolCallId: decision.firstRequest.toolCallId,
      toolName: decision.firstRequest.toolName,
      details: { request: decision.firstRequest }
    });
  }
  if (decision.type === "workflow_blocked") {
    return createAgentRunPolicyDecision({
      runId,
      stage: "runner_start",
      kind: "workflow_blocked",
      allowed: false,
      message: decision.message
    });
  }
  return createAgentRunPolicyDecision({
    runId,
    stage: "runner_start",
    kind: "budget_exhausted",
    allowed: false,
    message: "Runner start was rejected because the tool budget is exhausted.",
    details: { budget: decision.budget }
  });
}

function createRunnerModelMismatchDecision(
  record: Pick<AgentRunLedgerRecord, "runId" | "modelProvider" | "modelId">,
  receivedModel: Pick<AgentModelConfig, "provider" | "model">,
  stage: AgentRunPolicyDecisionRecord["stage"]
): AgentRunPolicyDecisionRecord {
  return createAgentRunPolicyDecision({
    runId: record.runId,
    stage,
    kind: "model_mismatch",
    allowed: false,
    message: runnerModelMismatchMessage(record),
    details: {
      expected: {
        provider: record.modelProvider,
        model: record.modelId
      },
      received: {
        provider: receivedModel.provider,
        model: receivedModel.model
      }
    }
  });
}

function createRunnerModelErrorDecision(
  runId: string,
  stage: AgentRunPolicyDecisionRecord["stage"],
  message: string | null | undefined
): AgentRunPolicyDecisionRecord {
  return createAgentRunPolicyDecision({
    runId,
    stage,
    kind: "model_error",
    allowed: false,
    message: message ?? "Backend model call failed."
  });
}

function remoteBridgeToolBoundaryMessage(toolName: string) {
  return `${toolName} is owned by the backend executor and cannot be enqueued as a renderer remote tool request.`;
}

function createRemoteBridgeToolBoundaryDecision(input: {
  record: Pick<AgentRunLedgerRecord, "runId" | "status">;
  stage: Extract<AgentRunPolicyDecisionRecord["stage"], "runner_start" | "remote_tool_request">;
  toolCallId: string;
  toolName: AgentRunPolicyDecisionRecord["toolName"];
  details?: { request: AgentRunRemoteToolRequestInput };
}): AgentRunPolicyDecisionRecord {
  const toolName = input.toolName ?? "unknown";
  return createAgentRunPolicyDecision({
    runId: input.record.runId,
    stage: input.stage,
    kind: "tool_boundary_blocked",
    allowed: false,
    message: remoteBridgeToolBoundaryMessage(toolName),
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    details: {
      runStatus: input.record.status,
      executor: "backend",
      rejectedTransport: "renderer_remote_bridge",
      ...(input.details ?? {})
    }
  });
}

function createAgentRunPolicyDecision(
  input: Omit<AgentRunPolicyDecisionRecord, "decisionId" | "createdAt"> & { createdAt?: string }
): AgentRunPolicyDecisionRecord {
  return {
    ...input,
    decisionId: crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    message: input.message ?? null,
    toolCallId: input.toolCallId ?? null,
    toolName: input.toolName ?? null
  };
}

export type AgentRunStartService = ReturnType<typeof createAgentRunStartService>;
