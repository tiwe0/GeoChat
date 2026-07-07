import { type AgentRunLedgerRecord, type AgentRunModelStepRecord } from "@geochat-ai/app";
import { sanitizeRunnerModelError } from "../agent/model-error";
import type { BackendModelNextAction } from "../agent/model-runner";

export function createRunnerModelStepStart(input: {
  run: AgentRunLedgerRecord;
  model: { provider: string; model: string };
  attachmentCount: number;
  startedAt?: string;
}): AgentRunModelStepRecord {
  return {
    stepId: crypto.randomUUID(),
    runId: input.run.runId,
    stage: "runner_continuation",
    source: "model",
    status: "running",
    modelProvider: input.model.provider,
    modelId: input.model.model,
    startedAt: input.startedAt ?? new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    inputToolCount: input.run.tools.length,
    attachmentCount: input.attachmentCount,
    outputType: null,
    outputToolCallId: null,
    outputToolName: null,
    outputTextLength: null,
    usage: null,
    error: null
  };
}

export function completeRunnerModelStepSuccess(
  step: AgentRunModelStepRecord,
  action: BackendModelNextAction,
  completedAt = new Date().toISOString()
): AgentRunModelStepRecord {
  return {
    ...step,
    source: action.source,
    status: "succeeded",
    completedAt,
    durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(step.startedAt).getTime()),
    outputType: action.type,
    outputToolCallId: action.type === "tool" ? action.tool.toolCallId : null,
    outputToolName: action.type === "tool" ? action.tool.toolName : null,
    outputTextLength: action.type === "finish" ? action.text.length : null,
    usage: action.type === "finish" ? action.usage ?? null : null,
    error: null,
    details: persistableModelStepDetails(action.diagnostics)
  };
}

export function completeRunnerModelStepFailure(
  step: AgentRunModelStepRecord,
  error: unknown,
  completedAt = new Date().toISOString()
): AgentRunModelStepRecord {
  return {
    ...step,
    source: "model",
    status: "failed",
    completedAt,
    durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(step.startedAt).getTime()),
    error: `Backend model call failed: ${sanitizeRunnerModelError(error)}`
  };
}

function persistableModelStepDetails(
  diagnostics: BackendModelNextAction["diagnostics"] | undefined
): AgentRunModelStepRecord["details"] {
  if (!diagnostics?.protocolRepairAttempts) return undefined;
  if (diagnostics.protocolRepairAttempts <= 0) return undefined;
  if (!Array.isArray(diagnostics.protocolRepairErrors)) return undefined;
  return {
    protocolRepairAttempts: diagnostics.protocolRepairAttempts,
    protocolRepairErrors: diagnostics.protocolRepairErrors
  };
}
