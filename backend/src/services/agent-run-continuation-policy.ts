import {
  type decideAgentRunRunnerContinuation,
  type AgentRunLedgerRecord,
  type AgentRunPolicyDecisionRecord,
  type AgentRunRemoteToolRequestInput,
  type AgentRunToolRecord
} from "@geochat-ai/app";
import { canExecuteBackendToolRequest } from "../agent/backend-tools";

export function createRunnerContinuationPolicyDecision(
  runId: string,
  decision: ReturnType<typeof decideAgentRunRunnerContinuation>
): AgentRunPolicyDecisionRecord {
  if (decision.type === "enqueue_tool") {
    return createAgentRunPolicyDecision({
      runId,
      stage: "runner_continuation",
      kind: "runner_continuation_enqueued",
      allowed: true,
      message: "Runner continuation accepted the next tool request.",
      toolCallId: decision.nextRequest.toolCallId,
      toolName: decision.nextRequest.toolName,
      details: { request: decision.nextRequest, executor: canExecuteBackendToolRequest(decision.nextRequest) ? "backend" : "remote_bridge" }
    });
  }
  if (decision.type === "finish") {
    return createAgentRunPolicyDecision({
      runId,
      stage: "runner_continuation",
      kind: "runner_finished",
      allowed: true,
      message: decision.text,
      details: { status: decision.run.status, usage: decision.run.usage ?? null }
    });
  }
  if (decision.type === "workflow_blocked") {
    return createAgentRunPolicyDecision({
      runId,
      stage: "runner_continuation",
      kind: "workflow_blocked",
      allowed: false,
      message: decision.message,
      details: { status: decision.run.status, error: decision.run.error ?? null }
    });
  }
  return createAgentRunPolicyDecision({
    runId,
    stage: "runner_continuation",
    kind: "budget_exhausted",
    allowed: false,
    message: decision.text,
    details: { budget: decision.budget, status: decision.run.status, error: decision.run.error ?? null }
  });
}

export function createRawCommandFallbackPolicyDecision(input: {
  runId: string;
  request: AgentRunRemoteToolRequestInput;
}): AgentRunPolicyDecisionRecord {
  return createAgentRunPolicyDecision({
    runId: input.runId,
    stage: "runner_continuation",
    kind: "raw_command_fallback",
    allowed: true,
    message: "Model requested raw GeoGebra commands before a structured geometry plan was accepted.",
    toolCallId: input.request.toolCallId,
    toolName: input.request.toolName,
    details: {
      request: input.request,
      preferredTool: "createGeometryPlan",
      reason: "No successful createGeometryPlan tool exists in the run ledger before this executeGeoGebraCommands request."
    }
  });
}

export function createAdvancedDrawingNextToolPolicyDecision(input: {
  runId: string;
  request: AgentRunRemoteToolRequestInput;
}): AgentRunPolicyDecisionRecord {
  return createAgentRunPolicyDecision({
    runId: input.runId,
    stage: "runner_continuation",
    kind: "runner_continuation_enqueued",
    allowed: true,
    message: "Advanced drawing command compiled successfully; runner enqueued the compiled GeoGebra command batch.",
    toolCallId: input.request.toolCallId,
    toolName: input.request.toolName,
    details: { request: input.request, executor: canExecuteBackendToolRequest(input.request) ? "backend" : "remote_bridge" }
  });
}

export function createRunnerModelErrorDecision(
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

export function createBackendToolErrorDecision(runId: string, tool: AgentRunToolRecord): AgentRunPolicyDecisionRecord {
  return createAgentRunPolicyDecision({
    runId,
    stage: "runner_continuation",
    kind: "workflow_blocked",
    allowed: false,
    message: tool.error ?? `${tool.toolName} failed.`,
    details: {
      status: "failed",
      error: tool.error ?? null
    }
  });
}

export function createBackendToolAutoStepLimitDecision(input: {
  run: Pick<AgentRunLedgerRecord, "runId" | "status" | "error">;
  request: AgentRunRemoteToolRequestInput;
  limit: number;
  attemptedStep: number;
}): AgentRunPolicyDecisionRecord {
  return createAgentRunPolicyDecision({
    runId: input.run.runId,
    stage: "runner_continuation",
    kind: "backend_tool_auto_step_limit",
    allowed: false,
    message: input.run.error ?? "Backend runner exceeded the automatic backend tool execution limit.",
    toolCallId: input.request.toolCallId,
    toolName: input.request.toolName,
    details: {
      limit: input.limit,
      attemptedStep: input.attemptedStep,
      runStatus: input.run.status
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
