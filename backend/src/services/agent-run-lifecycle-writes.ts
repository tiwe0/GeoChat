import {
  canTransitionAgentRunStatus,
  evaluateAgentWorkflowToolRecord,
  finishAgentRunLedger,
  isAgentRunTimestamp,
  type AgentRunFinishInput,
  type AgentRunLedgerRecord
} from "@geochat-ai/app";
import type { AgentRunRepository } from "../db/agent-run-repository";
import type { AgentRunCommitService } from "./agent-run-commits";

type LifecycleWriteOutcome = {
  status: 200 | 201 | 400 | 409;
  body: Record<string, unknown>;
};

export function createAgentRunLifecycleWriteService(
  agentRunRepository: AgentRunRepository,
  agentRunCommits: AgentRunCommitService
) {
  async function finishAgentRun(
    record: AgentRunLedgerRecord,
    payload: AgentRunFinishInput
  ): Promise<LifecycleWriteOutcome> {
    if (!canTransitionAgentRunStatus(record.status, payload.status)) {
      return invalidStatusTransitionOutcome(record.status, payload.status);
    }

    const nextRecord = finishAgentRunLedger(record, payload);
    const dateError = validateAgentRunDates(nextRecord);
    if (dateError) return dateError;
    const committed = await agentRunCommits.saveAgentRunFinishCommit(nextRecord);
    return { status: 200, body: { run: committed.run, cancelledRequests: committed.cancelledRequests } };
  }

  async function saveCompatibilityLedger(payload: AgentRunLedgerRecord): Promise<LifecycleWriteOutcome> {
    const existing = await agentRunRepository.getLedger(payload.runId);
    if (existing && !canTransitionAgentRunStatus(existing.status, payload.status)) {
      return invalidStatusTransitionOutcome(existing.status, payload.status);
    }

    const dateError = validateAgentRunDates(payload);
    if (dateError) return dateError;
    const workflowError = validateAgentRunWorkflow(payload);
    if (workflowError) return workflowError;
    const committed = await agentRunCommits.saveAgentRunLedgerCommit(payload);
    return { status: 201, body: { run: committed.run, cancelledRequests: committed.cancelledRequests } };
  }

  return {
    finishAgentRun,
    saveCompatibilityLedger
  };
}

function invalidStatusTransitionOutcome(
  fromStatus: AgentRunLedgerRecord["status"],
  toStatus: AgentRunLedgerRecord["status"]
): LifecycleWriteOutcome {
  return {
    status: 409,
    body: {
      error: "invalid_status_transition",
      message: `Cannot transition agent run from ${fromStatus} to ${toStatus}.`
    }
  };
}

function validateAgentRunDates(record: AgentRunLedgerRecord): LifecycleWriteOutcome | undefined {
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

function validateAgentRunWorkflow(record: AgentRunLedgerRecord): LifecycleWriteOutcome | undefined {
  const acceptedTools: AgentRunLedgerRecord["tools"] = [];
  for (const tool of record.tools) {
    const decision = evaluateAgentWorkflowToolRecord(acceptedTools, tool);
    if (!decision.allowed) {
      return {
        status: 409,
        body: {
          error: "workflow_blocked",
          message: decision.reason ?? "Agent workflow rejected this tool call.",
          toolCallId: tool.toolCallId,
          toolName: tool.toolName
        }
      };
    }
    acceptedTools.push(tool);
  }
  return undefined;
}

export type AgentRunLifecycleWriteService = ReturnType<typeof createAgentRunLifecycleWriteService>;
