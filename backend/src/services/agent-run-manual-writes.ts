import {
  agentRunRunnerBudgetFor,
  evaluateAgentWorkflowToolRecord,
  findAgentRunRemoteToolRequestConflict,
  findAgentRunToolCallConflict,
  findAgentRunToolCallIdReuseConflict,
  getFunctionCallRemoteBridgeToolNames,
  isAgentRunTimestamp,
  isTerminalAgentRunStatus,
  upsertAgentRunTool,
  type AgentRunLedgerRecord,
  type AgentRunPolicyDecisionRecord,
  type AgentRunRemoteToolRequestConflict,
  type AgentRunRemoteToolRequestInput,
  type AgentRunStatus,
  type AgentRunToolCallConflict,
  type AgentRunToolRecord
} from "@geochat-ai/app";
import type { AgentRunRepository } from "../db/agent-run-repository";
import type { AgentRunCommitService } from "./agent-run-commits";
import type { AgentRunRunnerSnapshotService } from "./agent-run-runner-snapshots";

type ManualWriteOutcome = {
  status: 200 | 201 | 400 | 409;
  body: Record<string, unknown>;
};

type ManualWorkflowBlockedDetails =
  | { request: AgentRunRemoteToolRequestInput }
  | { conflict: AgentRunToolCallConflict | AgentRunRemoteToolRequestConflict }
  | { toolStatus: AgentRunStatus };

type RemoteBridgeToolBoundaryDetails = { request: AgentRunRemoteToolRequestInput };

export function createAgentRunManualWriteService(
  agentRunRepository: AgentRunRepository,
  agentRunCommits: AgentRunCommitService,
  agentRunRunnerSnapshots: AgentRunRunnerSnapshotService
) {
  async function saveManualToolEvent(
    record: AgentRunLedgerRecord,
    payload: AgentRunToolRecord
  ): Promise<ManualWriteOutcome> {
    if (isTerminalAgentRunStatus(record.status)) {
      return runClosedOutcome(record);
    }

    const toolCallConflict = findAgentRunToolCallConflict(record.tools, payload);
    if (toolCallConflict) {
      await agentRunCommits.saveAgentRunPolicyDecision(
        createManualWorkflowBlockedDecision({
          record,
          stage: "ledger_tool_event",
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          message: toolCallConflict.message,
          details: { conflict: toolCallConflict }
        })
      );
      return workflowBlockedOutcome(toolCallConflict.message, record);
    }
    const workflowDecision = evaluateAgentWorkflowToolRecord(record.tools, payload);
    if (!workflowDecision.allowed) {
      const message = workflowDecision.reason ?? "Agent workflow rejected this tool call.";
      await agentRunCommits.saveAgentRunPolicyDecision(
        createManualWorkflowBlockedDecision({
          record,
          stage: "ledger_tool_event",
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          message,
          details: { toolStatus: payload.status }
        })
      );
      return workflowBlockedOutcome(message, record);
    }

    const nextRecord = upsertAgentRunTool(record, payload);
    const dateError = validateAgentRunDates(nextRecord);
    if (dateError) return dateError;
    await agentRunCommits.saveAgentRunLedger(nextRecord);
    return { status: 200, body: { run: nextRecord } };
  }

  async function createManualRemoteToolRequest(
    record: AgentRunLedgerRecord,
    payload: AgentRunRemoteToolRequestInput
  ): Promise<ManualWriteOutcome> {
    if (isTerminalAgentRunStatus(record.status)) {
      return runClosedOutcome(record);
    }

    if (!getFunctionCallRemoteBridgeToolNames().includes(payload.toolName)) {
      await agentRunCommits.saveAgentRunPolicyDecision(
        createRemoteBridgeToolBoundaryDecision({
          record,
          stage: "remote_tool_request",
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          details: { request: payload }
        })
      );
      return {
        status: 409,
        body: {
          error: "tool_not_remote_bridge_executable",
          message: remoteBridgeToolBoundaryMessage(payload.toolName),
          runner: await agentRunRunnerSnapshots.snapshot(record)
        }
      };
    }

    const toolCallConflict = findAgentRunToolCallIdReuseConflict(record.tools, payload);
    if (toolCallConflict) {
      await agentRunCommits.saveAgentRunPolicyDecision(
        createManualWorkflowBlockedDecision({
          record,
          stage: "remote_tool_request",
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          message: toolCallConflict.message,
          details: { conflict: toolCallConflict }
        })
      );
      return workflowBlockedOutcome(toolCallConflict.message, record);
    }
    const workflowDecision = evaluateAgentWorkflowToolRecord(record.tools, payload);
    if (!workflowDecision.allowed) {
      const message = workflowDecision.reason ?? "Agent workflow rejected this tool request.";
      await agentRunCommits.saveAgentRunPolicyDecision(
        createManualWorkflowBlockedDecision({
          record,
          stage: "remote_tool_request",
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          message,
          details: { request: payload }
        })
      );
      return workflowBlockedOutcome(message, record);
    }

    const existingRequest = await agentRunRepository.findRemoteToolRequest(record.runId, payload.toolCallId);
    const remoteRequestConflict = existingRequest
      ? findAgentRunRemoteToolRequestConflict([existingRequest], payload)
      : undefined;
    if (remoteRequestConflict) {
      await agentRunCommits.saveAgentRunPolicyDecision(
        createManualWorkflowBlockedDecision({
          record,
          stage: "remote_tool_request",
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          message: remoteRequestConflict.message,
          details: { conflict: remoteRequestConflict }
        })
      );
      return workflowBlockedOutcome(remoteRequestConflict.message, record);
    }
    if (existingRequest && !["pending", "running"].includes(existingRequest.status)) {
      return {
        status: 409,
        body: { error: "tool_request_closed", message: "Remote tool request is already completed." }
      };
    }
    if (existingRequest) {
      return { status: 200, body: { request: existingRequest } };
    }

    const budget = agentRunRunnerBudgetFor({
      run: record,
      pendingToolRequests: await agentRunRepository.listRemoteToolRequests(record.runId)
    });
    if (budget.exhausted) {
      await agentRunCommits.saveAgentRunPolicyDecision(createManualRemoteToolBudgetDecision(record, budget));
      return {
        status: 409,
        body: {
          error: "runner_budget_exceeded",
          message: "Agent runner tool budget is exhausted.",
          budget
        }
      };
    }
    const requestRecord = await agentRunCommits.saveRemoteToolRequest(record.runId, payload);
    return { status: 201, body: { request: requestRecord } };
  }

  async function workflowBlockedOutcome(message: string, record: AgentRunLedgerRecord): Promise<ManualWriteOutcome> {
    return {
      status: 409,
      body: {
        error: "workflow_blocked",
        message,
        runner: await agentRunRunnerSnapshots.snapshot(record)
      }
    };
  }

  return {
    createManualRemoteToolRequest,
    saveManualToolEvent
  };
}

function runClosedOutcome(record: AgentRunLedgerRecord): ManualWriteOutcome {
  return {
    status: 409,
    body: { error: "run_closed", message: `Agent run is already ${record.status}.` }
  };
}

function remoteBridgeToolBoundaryMessage(toolName: string) {
  return `${toolName} is owned by the backend executor and cannot be enqueued as a renderer remote tool request.`;
}

function createManualWorkflowBlockedDecision(input: {
  record: Pick<AgentRunLedgerRecord, "runId" | "status">;
  stage: Extract<AgentRunPolicyDecisionRecord["stage"], "ledger_tool_event" | "remote_tool_request">;
  toolCallId: string;
  toolName: AgentRunPolicyDecisionRecord["toolName"];
  message: string;
  details?: ManualWorkflowBlockedDetails;
}): AgentRunPolicyDecisionRecord {
  return createAgentRunPolicyDecision({
    runId: input.record.runId,
    stage: input.stage,
    kind: "workflow_blocked",
    allowed: false,
    message: input.message,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    details: {
      runStatus: input.record.status,
      ...(input.details ?? {})
    }
  });
}

function createManualRemoteToolBudgetDecision(
  record: Pick<AgentRunLedgerRecord, "runId" | "status">,
  budget: ReturnType<typeof agentRunRunnerBudgetFor>
): AgentRunPolicyDecisionRecord {
  return createAgentRunPolicyDecision({
    runId: record.runId,
    stage: "remote_tool_request",
    kind: "budget_exhausted",
    allowed: false,
    message: "Manual remote tool request was rejected because the runner tool budget is exhausted.",
    details: {
      runStatus: record.status,
      budget
    }
  });
}

function createRemoteBridgeToolBoundaryDecision(input: {
  record: Pick<AgentRunLedgerRecord, "runId" | "status">;
  stage: Extract<AgentRunPolicyDecisionRecord["stage"], "runner_start" | "remote_tool_request">;
  toolCallId: string;
  toolName: AgentRunPolicyDecisionRecord["toolName"];
  details?: RemoteBridgeToolBoundaryDetails;
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

function validateAgentRunDates(record: AgentRunLedgerRecord): ManualWriteOutcome | undefined {
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

export type AgentRunManualWriteService = ReturnType<typeof createAgentRunManualWriteService>;
