import {
  finishAgentRunLedger,
  type AgentRunLedgerRecord,
  type AgentRunRemoteToolRequestInput,
  type AgentRunToolRecord
} from "@geochat-ai/app";
import { sanitizeRunnerModelError } from "../agent/model-error";

export function failAgentRunForModelError(record: AgentRunLedgerRecord, error: unknown) {
  return finishAgentRunLedger(record, {
    status: "failed",
    usage: null,
    error: `Backend model call failed: ${sanitizeRunnerModelError(error)}`
  });
}

export function failAgentRunForBackendToolError(record: AgentRunLedgerRecord, tool: AgentRunToolRecord) {
  return finishAgentRunLedger(record, {
    status: "failed",
    usage: null,
    completedAt: tool.completedAt ?? undefined,
    error: `Backend tool execution failed: ${tool.error ?? `${tool.toolName} failed.`}`
  });
}

export function failAgentRunForRunnerContinuationError(record: AgentRunLedgerRecord, error: unknown) {
  return finishAgentRunLedger(record, {
    status: "failed",
    usage: null,
    error: `Backend runner continuation failed: ${sanitizeRunnerModelError(error)}`
  });
}

export function backendToolFailureRecord(request: AgentRunRemoteToolRequestInput, error: unknown, startedAt = new Date().toISOString()): AgentRunToolRecord {
  const completedAt = new Date().toISOString();
  return {
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    status: "failed",
    args: request.args,
    error: sanitizeRunnerModelError(error),
    startedAt,
    completedAt,
    durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
  };
}
