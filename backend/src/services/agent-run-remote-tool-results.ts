import {
  agentRunToolArgsMatch,
  completeAgentRunRemoteToolRequest,
  enrichCanvasReadToolWithGeometryVerification,
  findAgentRunToolCallConflict,
  isAgentRunRemoteToolRequestLeaseExpired,
  isAgentRunRemoteToolRequestTerminal,
  isAgentRunTimestamp,
  isTerminalAgentRunStatus,
  upsertAgentRunTool,
  type AgentModelConfig,
  type AgentRunLedgerRecord,
  type AgentRunPolicyDecisionRecord,
  type AgentRunRemoteToolResultInput
} from "@geochat-ai/app";
import type { AgentRunRepository } from "../db/agent-run-repository";
import type { AgentRunCommitService } from "./agent-run-commits";
import type { AgentRunContinuationService } from "./agent-run-continuations";

type RemoteToolResultOutcome = {
  status: 200 | 400 | 404 | 409 | 502;
  body: Record<string, unknown>;
};

export function createAgentRunRemoteToolResultService(
  agentRunRepository: AgentRunRepository,
  agentRunCommits: AgentRunCommitService,
  agentRunContinuations: AgentRunContinuationService
) {
  async function submitRemoteToolResult(input: {
    record: AgentRunLedgerRecord;
    toolCallId: string;
    payload: AgentRunRemoteToolResultInput;
    onModelTextDelta?: (text: string) => void;
  }): Promise<RemoteToolResultOutcome> {
    const { record, payload } = input;
    if (isTerminalAgentRunStatus(record.status)) {
      return { status: 409, body: { error: "run_closed", message: `Agent run is already ${record.status}.` } };
    }

    const requests = await agentRunRepository.listRemoteToolRequests(record.runId);
    const requestIndex = requests.findIndex((item) => item.toolCallId === input.toolCallId);
    if (requestIndex < 0) return { status: 404, body: { error: "not_found", message: "Remote tool request was not found." } };

    if (payload.tool.toolCallId !== input.toolCallId) {
      return {
        status: 400,
        body: { error: "invalid_request", message: "Remote tool result toolCallId does not match request path." }
      };
    }
    if (payload.tool.toolName !== requests[requestIndex].toolName) {
      return {
        status: 400,
        body: { error: "invalid_request", message: "Remote tool result toolName does not match request." }
      };
    }
    if (!agentRunToolArgsMatch(payload.tool.args, requests[requestIndex].args)) {
      return {
        status: 400,
        body: { error: "invalid_request", message: "Remote tool result args do not match request." }
      };
    }

    const toolCallConflict = findAgentRunToolCallConflict(record.tools, payload.tool);
    if (toolCallConflict) {
      return {
        status: 409,
        body: {
          error: "workflow_blocked",
          message: toolCallConflict.message,
          runner: await agentRunContinuations.runnerSnapshot(record)
        }
      };
    }

    const currentRequest = requests[requestIndex];
    if (isAgentRunRemoteToolRequestTerminal(currentRequest)) {
      return {
        status: 200,
        body: {
          run: record,
          request: currentRequest,
          runner: await agentRunContinuations.runnerSnapshot(record)
        }
      };
    }
    if (currentRequest.status !== "running") {
      return {
        status: 409,
        body: { error: "tool_request_not_claimed", message: "Remote tool request must be claimed before submitting a result." }
      };
    }
    if (isAgentRunRemoteToolRequestLeaseExpired(currentRequest)) {
      return {
        status: 409,
        body: { error: "tool_request_lease_expired", message: "Remote tool request lease expired before result submission." }
      };
    }
    if (currentRequest.claimedBy && !payload.claimOwner) {
      return {
        status: 409,
        body: { error: "tool_request_claim_owner_required", message: "Remote tool request result must include the claim owner." }
      };
    }
    if (currentRequest.claimedBy && currentRequest.claimedBy !== payload.claimOwner) {
      return {
        status: 409,
        body: { error: "tool_request_claim_owner_mismatch", message: "Remote tool request is claimed by a different owner." }
      };
    }
    if (payload.model && !agentRunModelMatches(record, payload.model)) {
      await agentRunCommits.saveAgentRunPolicyDecision(createRunnerModelMismatchDecision(record, payload.model, "runner_continuation"));
      return await runnerModelMismatchOutcome(record);
    }

    const completedTool = enrichCanvasReadToolWithGeometryVerification(record.tools, payload.tool);
    const nextRecord = upsertAgentRunTool(record, completedTool);
    const dateError = validateAgentRunDates(nextRecord);
    if (dateError) return dateError;
    const completedRequestInput = completeAgentRunRemoteToolRequest(currentRequest, completedTool);
    if (!payload.model) {
      return await agentRunContinuations.commitCompletedToolResult({
        run: nextRecord,
        completedRequest: completedRequestInput,
        expectedCompletedRequest: currentRequest
      });
    }

    return await agentRunContinuations.continueAfterToolResult({
      run: nextRecord,
      completedRequest: completedRequestInput,
      expectedCompletedRequest: currentRequest,
      model: payload.model,
      attachments: payload.attachments,
      pendingToolRequests: requests.map((request, index) => index === requestIndex ? completedRequestInput : request),
      onModelTextDelta: input.onModelTextDelta
    });
  }

  async function runnerModelMismatchOutcome(record: AgentRunLedgerRecord): Promise<RemoteToolResultOutcome> {
    return {
      status: 409,
      body: {
        error: "runner_model_mismatch",
        message: runnerModelMismatchMessage(record),
        runner: await agentRunContinuations.runnerSnapshot(record)
      }
    };
  }

  return {
    submitRemoteToolResult
  };
}

function agentRunModelMatches(record: AgentRunLedgerRecord, model: { provider: string; model: string }) {
  return record.modelProvider === model.provider && record.modelId === model.model;
}

function runnerModelMismatchMessage(record: Pick<AgentRunLedgerRecord, "modelProvider" | "modelId">) {
  return `Agent runner model must match the model recorded on the run ledger: ${record.modelProvider}/${record.modelId}.`;
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

function validateAgentRunDates(record: AgentRunLedgerRecord): RemoteToolResultOutcome | undefined {
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

export type AgentRunRemoteToolResultService = ReturnType<typeof createAgentRunRemoteToolResultService>;
