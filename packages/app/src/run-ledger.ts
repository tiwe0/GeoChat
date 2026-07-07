import type { AgentModelConfig } from "./model-registry";
import { normalizeAgentRunnerMaxToolSteps } from "./model-registry";
import type { FunctionCallToolName } from "./functioncalls";
import { isFunctionCallArgs } from "./functioncall-schemas";
import { isAgentRunEntityId, isAgentRunToolCallId } from "./agent-run-ids";
import {
  isAgentRunTimestamp,
  isOptionalAgentRunTimestamp,
  isOptionalAgentRunTimestampOrNull
} from "./agent-run-time";

const agentRunToolNames = new Set<string>([
  "searchGeoGebraCommands",
  "readBlackboard",
  "patchBlackboard",
  "listSkills",
  "searchSkills",
  "loadSkill",
  "activateSkill",
  "createGeometryPlan",
  "executeAdvancedDrawingCommand",
  "executeGeoGebraCommands",
  "resetCanvas",
  "getCanvasContext",
  "getPNGBase64",
  "showSolutionSteps",
  "showTeachingHint",
  "showAnimationGuide",
  "showChoiceAnalysis",
  "showSelectedElements",
  "setFinished",
  "setPerspective"
]);

export type AgentRunStatus = "running" | "succeeded" | "failed" | "cancelled";

export type AgentRunMode = "ai-sdk" | "local-planner";
export type AgentRunLocale = "zh-CN" | "en-US";

export type AgentRunUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export const DEFAULT_AGENT_MODEL_STEP_TIMEOUT_MS = 120_000;
export const MIN_AGENT_MODEL_STEP_TIMEOUT_MS = 30_000;
export const MAX_AGENT_MODEL_STEP_TIMEOUT_MS = 300_000;

export type AgentRunPolicyDecisionStage = "runner_start" | "runner_continuation" | "ledger_tool_event" | "remote_tool_request";
export type AgentRunModelStepStage = Extract<AgentRunPolicyDecisionStage, "runner_start" | "runner_continuation">;

export type AgentRunPolicyDecisionKind =
  | "runner_start_enqueued"
  | "runner_continuation_enqueued"
  | "runner_finished"
  | "raw_command_fallback"
  | "workflow_blocked"
  | "tool_boundary_blocked"
  | "budget_exhausted"
  | "backend_tool_auto_step_limit"
  | "model_error"
  | "model_mismatch"
  | "tool_request_dead_letter";

export type AgentRunToolRecord = {
  toolCallId: string;
  toolName: FunctionCallToolName;
  status: AgentRunStatus;
  args: unknown;
  result?: unknown;
  canvasBefore?: unknown;
  canvasAfter?: unknown;
  error?: string | null;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
};

export type AgentRunToolCallConflict = {
  toolCallId: string;
  existingToolName: FunctionCallToolName;
  nextToolName: FunctionCallToolName;
  reason: "duplicate_tool_call_id" | "tool_name_mismatch" | "args_mismatch";
  message: string;
};

export type AgentRunLedgerRecord = {
  runId: string;
  conversationId: string;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  mode: AgentRunMode;
  status: AgentRunStatus;
  modelProvider: AgentModelConfig["provider"];
  modelId: string;
  maxToolSteps?: number | null;
  modelStepTimeoutMs?: number | null;
  locale?: AgentRunLocale | null;
  prompt: string;
  attachmentCount: number;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  usage?: AgentRunUsage | null;
  error?: string | null;
  tools: AgentRunToolRecord[];
};

export type AgentRunPolicyDecisionRecord = {
  decisionId: string;
  runId: string;
  stage: AgentRunPolicyDecisionStage;
  kind: AgentRunPolicyDecisionKind;
  allowed: boolean;
  message?: string | null;
  toolCallId?: string | null;
  toolName?: FunctionCallToolName | null;
  createdAt: string;
  details?: AgentRunPolicyDecisionDetails;
};

export type AgentRunRunnerBudgetSnapshot = {
  maxToolSteps: number;
  completedToolSteps: number;
  activeToolRequests: number;
  remainingToolRequests: number;
  exhausted: boolean;
};

export type AgentRunPolicyDecisionRequestDetails = {
  toolCallId: string;
  toolName: FunctionCallToolName;
  args: unknown;
  requestedAt?: string;
};

export type AgentRunPolicyDecisionConflictDetails = {
  toolCallId: string;
  existingToolName: FunctionCallToolName;
  nextToolName: FunctionCallToolName;
  reason: string;
  message: string;
};

export type AgentRunPolicyDecisionDetails =
  | { request: AgentRunPolicyDecisionRequestDetails; executor?: "backend" | "remote_bridge" }
  | { request: AgentRunPolicyDecisionRequestDetails; preferredTool: "createGeometryPlan"; reason: string }
  | { budget: AgentRunRunnerBudgetSnapshot; status?: AgentRunStatus; runStatus?: AgentRunStatus; error?: string | null }
  | { status: AgentRunStatus; usage?: AgentRunUsage | null; error?: string | null }
  | { status: AgentRunStatus; error?: string | null }
  | { limit: number; attemptedStep: number; runStatus: AgentRunStatus }
  | { expected: { provider: string; model: string }; received: { provider: string; model: string } }
  | {
      runStatus: AgentRunStatus;
      request?: AgentRunPolicyDecisionRequestDetails;
      conflict?: AgentRunPolicyDecisionConflictDetails;
      toolStatus?: AgentRunStatus;
    }
  | {
      runStatus: AgentRunStatus;
      executor: "backend";
      rejectedTransport: "renderer_remote_bridge";
      request?: AgentRunPolicyDecisionRequestDetails;
    }
  | { attemptCount: number; status: "pending" | "running" | "succeeded" | "failed" | "cancelled"; claimedBy?: string | null };

export type AgentRunModelStepSource = "model" | "policy";

export type AgentRunModelStepDetails = {
  protocolRepairAttempts: number;
  protocolRepairErrors: string[];
};

export type AgentRunModelStepRecord = {
  stepId: string;
  runId: string;
  stage: AgentRunModelStepStage;
  source: AgentRunModelStepSource;
  status: AgentRunStatus;
  modelProvider: AgentModelConfig["provider"];
  modelId: string;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  inputToolCount: number;
  attachmentCount: number;
  outputType?: "tool" | "finish" | null;
  outputToolCallId?: string | null;
  outputToolName?: FunctionCallToolName | null;
  outputTextLength?: number | null;
  usage?: AgentRunUsage | null;
  error?: string | null;
  details?: AgentRunModelStepDetails;
};

export type AgentRunStartInput = {
  runId: string;
  conversationId: string;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  mode: AgentRunMode;
  modelProvider: string;
  modelId: string;
  maxToolSteps?: number | null;
  modelStepTimeoutMs?: number | null;
  locale?: AgentRunLocale | null;
  prompt: string;
  attachmentCount: number;
  startedAt?: string;
};

export type AgentRunFinishInput = {
  status: Exclude<AgentRunStatus, "running">;
  completedAt?: string;
  usage?: AgentRunUsage | null;
  error?: string | null;
};

export function createAgentRunLedger(input: {
  runId: string;
  conversationId: string;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  mode: AgentRunMode;
  model: AgentModelConfig;
  modelStepTimeoutMs?: number | null;
  locale?: AgentRunLocale | null;
  prompt: string;
  attachmentCount: number;
  startedAt?: string;
}): AgentRunLedgerRecord {
  return {
    runId: input.runId,
    conversationId: input.conversationId,
    userMessageId: input.userMessageId ?? null,
    assistantMessageId: input.assistantMessageId ?? null,
    mode: input.mode,
    status: "running",
    modelProvider: input.model.provider,
    modelId: input.model.model,
    maxToolSteps: normalizeAgentRunnerMaxToolSteps(input.model.maxToolSteps),
    modelStepTimeoutMs: normalizeAgentModelStepTimeoutMs(input.modelStepTimeoutMs),
    locale: input.locale ?? null,
    prompt: input.prompt,
    attachmentCount: input.attachmentCount,
    startedAt: input.startedAt ?? new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    usage: null,
    error: null,
    tools: []
  };
}

export function createAgentRunLedgerFromStart(input: AgentRunStartInput): AgentRunLedgerRecord {
  return {
    runId: input.runId,
    conversationId: input.conversationId,
    userMessageId: input.userMessageId ?? null,
    assistantMessageId: input.assistantMessageId ?? null,
    mode: input.mode,
    status: "running",
    modelProvider: input.modelProvider,
    modelId: input.modelId,
    maxToolSteps: normalizeAgentRunnerMaxToolSteps(input.maxToolSteps),
    modelStepTimeoutMs: normalizeAgentModelStepTimeoutMs(input.modelStepTimeoutMs),
    locale: input.locale ?? null,
    prompt: input.prompt,
    attachmentCount: input.attachmentCount,
    startedAt: input.startedAt ?? new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    usage: null,
    error: null,
    tools: []
  };
}

export function upsertAgentRunTool(
  record: AgentRunLedgerRecord,
  tool: Omit<AgentRunToolRecord, "durationMs"> & { durationMs?: number | null }
): AgentRunLedgerRecord {
  const currentIndex = record.tools.findIndex((item) => item.toolCallId === tool.toolCallId);
  const startedAt = currentIndex >= 0 ? record.tools[currentIndex].startedAt : tool.startedAt;
  const completedAt = tool.completedAt ?? null;
  const durationMs = completedAt ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()) : tool.durationMs ?? null;
  const nextTool: AgentRunToolRecord = {
    ...tool,
    startedAt,
    completedAt,
    durationMs
  };
  const tools = [...record.tools];
  if (currentIndex >= 0) tools[currentIndex] = nextTool;
  else tools.push(nextTool);
  return { ...record, tools };
}

export function agentRunToolArgsMatch(left: unknown, right: unknown) {
  return stableJson(left) === stableJson(right);
}

export function findAgentRunToolCallConflict(
  tools: readonly Pick<AgentRunToolRecord, "toolCallId" | "toolName" | "args">[],
  nextTool: Pick<AgentRunToolRecord, "toolCallId" | "toolName" | "args">
): AgentRunToolCallConflict | undefined {
  const existing = tools.find((tool) => tool.toolCallId === nextTool.toolCallId);
  if (!existing) return undefined;
  if (existing.toolName !== nextTool.toolName) {
    return {
      toolCallId: nextTool.toolCallId,
      existingToolName: existing.toolName,
      nextToolName: nextTool.toolName,
      reason: "tool_name_mismatch",
      message: `Tool call id ${nextTool.toolCallId} already belongs to ${existing.toolName}, not ${nextTool.toolName}.`
    };
  }
  if (!agentRunToolArgsMatch(existing.args, nextTool.args)) {
    return {
      toolCallId: nextTool.toolCallId,
      existingToolName: existing.toolName,
      nextToolName: nextTool.toolName,
      reason: "args_mismatch",
      message: `Tool call id ${nextTool.toolCallId} already belongs to a different ${nextTool.toolName} argument payload.`
    };
  }
  return undefined;
}

export function findAgentRunToolCallIdReuseConflict(
  tools: readonly Pick<AgentRunToolRecord, "toolCallId" | "toolName" | "args">[],
  nextTool: Pick<AgentRunToolRecord, "toolCallId" | "toolName" | "args">
): AgentRunToolCallConflict | undefined {
  const existing = tools.find((tool) => tool.toolCallId === nextTool.toolCallId);
  if (!existing) return undefined;
  return (
    findAgentRunToolCallConflict(tools, nextTool) ?? {
      toolCallId: nextTool.toolCallId,
      existingToolName: existing.toolName,
      nextToolName: nextTool.toolName,
      reason: "duplicate_tool_call_id",
      message: `Tool call id ${nextTool.toolCallId} already exists in the run ledger.`
    }
  );
}

export function finishAgentRunLedger(
  record: AgentRunLedgerRecord,
  input: AgentRunFinishInput
): AgentRunLedgerRecord {
  const completedAt = input.completedAt ?? new Date().toISOString();
  const usage = input.status === "succeeded" ? input.usage ?? record.usage ?? null : null;
  const error = input.status === "succeeded" ? null : input.error ?? null;
  return {
    ...record,
    status: input.status,
    completedAt,
    durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(record.startedAt).getTime()),
    usage,
    error
  };
}

export function isTerminalAgentRunStatus(status: AgentRunStatus) {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export function canTransitionAgentRunStatus(from: AgentRunStatus, to: AgentRunStatus) {
  if (from === to) return true;
  if (from === "running") return isTerminalAgentRunStatus(to);
  return false;
}

export function isAgentRunStatus(value: unknown): value is AgentRunStatus {
  return typeof value === "string" && ["running", "succeeded", "failed", "cancelled"].includes(value);
}

export function isAgentRunMode(value: unknown): value is AgentRunMode {
  return typeof value === "string" && ["ai-sdk", "local-planner"].includes(value);
}

export function isAgentRunLocale(value: unknown): value is AgentRunLocale {
  return value === "zh-CN" || value === "en-US";
}

function isOptionalAgentRunLocale(value: unknown): value is AgentRunLocale | null | undefined {
  return value === undefined || value === null || isAgentRunLocale(value);
}

function isOptionalAgentRunnerMaxToolSteps(value: unknown) {
  return value === undefined || value === null || normalizeAgentRunnerMaxToolSteps(value) === value;
}

function isOptionalAgentModelStepTimeoutMs(value: unknown) {
  return value === undefined || value === null || normalizeAgentModelStepTimeoutMs(value) === value;
}

export function normalizeAgentModelStepTimeoutMs(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const integer = Math.round(numeric);
  if (integer < MIN_AGENT_MODEL_STEP_TIMEOUT_MS || integer > MAX_AGENT_MODEL_STEP_TIMEOUT_MS) return null;
  return integer;
}

export function agentModelStepTimeoutMsOrDefault(value: unknown) {
  return normalizeAgentModelStepTimeoutMs(value) ?? DEFAULT_AGENT_MODEL_STEP_TIMEOUT_MS;
}

export function isAgentRunUsage(value: unknown): value is AgentRunUsage {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object") return false;
  const usage = value as Record<string, unknown>;
  return (
    isOptionalNonNegativeInteger(usage.inputTokens) &&
    isOptionalNonNegativeInteger(usage.outputTokens) &&
    isOptionalNonNegativeInteger(usage.totalTokens) &&
    isAgentRunUsageTotalState(usage.inputTokens, usage.outputTokens, usage.totalTokens)
  );
}

export function isAgentRunStartInput(value: unknown): value is AgentRunStartInput {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isAgentRunEntityId(payload.runId) &&
    isAgentRunEntityId(payload.conversationId) &&
    isOptionalStringOrNull(payload.userMessageId) &&
    isOptionalStringOrNull(payload.assistantMessageId) &&
    isAgentRunMode(payload.mode) &&
    typeof payload.modelProvider === "string" &&
    typeof payload.modelId === "string" &&
    isOptionalAgentRunnerMaxToolSteps(payload.maxToolSteps) &&
    isOptionalAgentModelStepTimeoutMs(payload.modelStepTimeoutMs) &&
    isOptionalAgentRunLocale(payload.locale) &&
    typeof payload.prompt === "string" &&
    isNonNegativeInteger(payload.attachmentCount) &&
    isOptionalAgentRunTimestamp(payload.startedAt)
  );
}

export function isAgentRunToolRecord(value: unknown): value is AgentRunToolRecord {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isAgentRunToolCallId(payload.toolCallId) &&
    typeof payload.toolName === "string" &&
    agentRunToolNames.has(payload.toolName) &&
    isAgentRunStatus(payload.status) &&
    "args" in payload &&
    isFunctionCallArgs(payload.toolName as FunctionCallToolName, payload.args) &&
    isOptionalStringOrNull(payload.error) &&
    isAgentRunTimestamp(payload.startedAt) &&
    isOptionalAgentRunTimestampOrNull(payload.completedAt) &&
    isOptionalNonNegativeIntegerOrNull(payload.durationMs) &&
    isAgentRunLifecycleTiming(payload.status, payload.completedAt, payload.durationMs) &&
    isAgentRunDurationTiming(payload.startedAt, payload.completedAt, payload.durationMs) &&
    isAgentRunStatusErrorState(payload.status, payload.error)
  );
}

export function isAgentRunFinishInput(value: unknown): value is AgentRunFinishInput {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isAgentRunStatus(payload.status) &&
    payload.status !== "running" &&
    isOptionalAgentRunTimestamp(payload.completedAt) &&
    isAgentRunUsage(payload.usage) &&
    isAgentRunStatusUsageState(payload.status, payload.usage) &&
    isOptionalStringOrNull(payload.error) &&
    isAgentRunStatusErrorState(payload.status, payload.error)
  );
}

export function isAgentRunLedgerRecord(value: unknown): value is AgentRunLedgerRecord {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isAgentRunEntityId(payload.runId) &&
    isAgentRunEntityId(payload.conversationId) &&
    isOptionalStringOrNull(payload.userMessageId) &&
    isOptionalStringOrNull(payload.assistantMessageId) &&
    isAgentRunMode(payload.mode) &&
    isAgentRunStatus(payload.status) &&
    typeof payload.modelProvider === "string" &&
    typeof payload.modelId === "string" &&
    isOptionalAgentRunnerMaxToolSteps(payload.maxToolSteps) &&
    isOptionalAgentModelStepTimeoutMs(payload.modelStepTimeoutMs) &&
    isOptionalAgentRunLocale(payload.locale) &&
    typeof payload.prompt === "string" &&
    isNonNegativeInteger(payload.attachmentCount) &&
    isAgentRunTimestamp(payload.startedAt) &&
    isOptionalAgentRunTimestampOrNull(payload.completedAt) &&
    isOptionalNonNegativeIntegerOrNull(payload.durationMs) &&
    isAgentRunLifecycleTiming(payload.status, payload.completedAt, payload.durationMs) &&
    isAgentRunDurationTiming(payload.startedAt, payload.completedAt, payload.durationMs) &&
    isAgentRunUsage(payload.usage) &&
    isAgentRunStatusUsageState(payload.status, payload.usage) &&
    isOptionalStringOrNull(payload.error) &&
    isAgentRunStatusErrorState(payload.status, payload.error) &&
    Array.isArray(payload.tools) &&
    payload.tools.every(isAgentRunToolRecord)
  );
}

export function isAgentRunPolicyDecisionRecord(value: unknown): value is AgentRunPolicyDecisionRecord {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isAgentRunEntityId(payload.decisionId) &&
    isAgentRunEntityId(payload.runId) &&
    isAgentRunPolicyDecisionStage(payload.stage) &&
    isAgentRunPolicyDecisionKind(payload.kind) &&
    typeof payload.allowed === "boolean" &&
    isAgentRunPolicyDecisionAllowedState(payload.kind, payload.allowed) &&
    isAgentRunPolicyDecisionStageKindState(payload.stage, payload.kind) &&
    isOptionalStringOrNull(payload.message) &&
    isOptionalAgentRunToolCallIdOrNull(payload.toolCallId) &&
    isOptionalToolNameOrNull(payload.toolName) &&
    isAgentRunPolicyDecisionToolReferenceState(payload.stage, payload.kind, payload.toolCallId, payload.toolName) &&
    isAgentRunTimestamp(payload.createdAt) &&
    isOptionalAgentRunPolicyDecisionDetails(payload.stage, payload.kind, payload.details)
  );
}

export function isAgentRunModelStepRecord(value: unknown): value is AgentRunModelStepRecord {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isAgentRunEntityId(payload.stepId) &&
    isAgentRunEntityId(payload.runId) &&
    isAgentRunModelStepStage(payload.stage) &&
    isAgentRunModelStepSource(payload.source) &&
    isAgentRunStatus(payload.status) &&
    typeof payload.modelProvider === "string" &&
    typeof payload.modelId === "string" &&
    isAgentRunTimestamp(payload.startedAt) &&
    isOptionalAgentRunTimestampOrNull(payload.completedAt) &&
    isOptionalNonNegativeIntegerOrNull(payload.durationMs) &&
    isAgentRunLifecycleTiming(payload.status, payload.completedAt, payload.durationMs) &&
    isAgentRunDurationTiming(payload.startedAt, payload.completedAt, payload.durationMs) &&
    isNonNegativeInteger(payload.inputToolCount) &&
    isNonNegativeInteger(payload.attachmentCount) &&
    isOptionalModelStepOutputType(payload.outputType) &&
    isOptionalAgentRunToolCallIdOrNull(payload.outputToolCallId) &&
    isOptionalToolNameOrNull(payload.outputToolName) &&
    isOptionalNonNegativeIntegerOrNull(payload.outputTextLength) &&
    isAgentRunModelStepOutputState(payload.status, payload.outputType, payload.outputToolCallId, payload.outputToolName, payload.outputTextLength) &&
    isAgentRunUsage(payload.usage) &&
    isAgentRunStatusUsageState(payload.status, payload.usage) &&
    isOptionalStringOrNull(payload.error) &&
    isAgentRunStatusErrorState(payload.status, payload.error) &&
    isOptionalAgentRunModelStepDetails(payload.details)
  );
}

export function isAgentRunModelStepSource(value: unknown): value is AgentRunModelStepSource {
  return typeof value === "string" && ["model", "policy"].includes(value);
}

export function isAgentRunModelStepStage(value: unknown): value is AgentRunModelStepStage {
  return typeof value === "string" && ["runner_start", "runner_continuation"].includes(value);
}

export function isAgentRunPolicyDecisionStage(value: unknown): value is AgentRunPolicyDecisionStage {
  return typeof value === "string" && ["runner_start", "runner_continuation", "ledger_tool_event", "remote_tool_request"].includes(value);
}

export function isAgentRunPolicyDecisionKind(value: unknown): value is AgentRunPolicyDecisionKind {
  return (
    typeof value === "string" &&
    [
      "runner_start_enqueued",
      "runner_continuation_enqueued",
      "runner_finished",
      "raw_command_fallback",
      "workflow_blocked",
      "tool_boundary_blocked",
      "budget_exhausted",
      "backend_tool_auto_step_limit",
      "model_error",
      "model_mismatch",
      "tool_request_dead_letter"
    ].includes(value)
  );
}

function isOptionalModelStepOutputType(value: unknown) {
  return value === undefined || value === null || value === "tool" || value === "finish";
}

function isAgentRunPolicyDecisionAllowedState(kind: unknown, allowed: unknown) {
  if (!isAgentRunPolicyDecisionKind(kind) || typeof allowed !== "boolean") return false;
  return allowed === ["runner_start_enqueued", "runner_continuation_enqueued", "runner_finished", "raw_command_fallback"].includes(kind);
}

function isAgentRunPolicyDecisionStageKindState(stage: unknown, kind: unknown) {
  if (!isAgentRunPolicyDecisionStage(stage) || !isAgentRunPolicyDecisionKind(kind)) return false;
  switch (kind) {
    case "runner_start_enqueued":
      return stage === "runner_start";
    case "runner_continuation_enqueued":
    case "runner_finished":
    case "raw_command_fallback":
    case "backend_tool_auto_step_limit":
    case "tool_request_dead_letter":
      return stage === "runner_continuation";
    case "model_error":
    case "model_mismatch":
      return stage === "runner_start" || stage === "runner_continuation";
    case "tool_boundary_blocked":
      return stage === "runner_start" || stage === "remote_tool_request";
    case "budget_exhausted":
      return stage === "runner_start" || stage === "runner_continuation" || stage === "remote_tool_request";
    case "workflow_blocked":
      return true;
  }
}

function isAgentRunPolicyDecisionToolReferenceState(
  stage: unknown,
  kind: unknown,
  toolCallId: unknown,
  toolName: unknown
) {
  if (!isAgentRunPolicyDecisionStage(stage) || !isAgentRunPolicyDecisionKind(kind)) return false;
  const hasToolReference = isAgentRunToolCallId(toolCallId) && isOptionalToolNameOrNull(toolName) && toolName !== undefined && toolName !== null;
  const hasNoToolReference = (toolCallId === undefined || toolCallId === null) && (toolName === undefined || toolName === null);
  switch (kind) {
    case "runner_start_enqueued":
    case "runner_continuation_enqueued":
    case "raw_command_fallback":
    case "tool_boundary_blocked":
    case "backend_tool_auto_step_limit":
    case "tool_request_dead_letter":
      return hasToolReference;
    case "workflow_blocked":
      return stage === "ledger_tool_event" || stage === "remote_tool_request" ? hasToolReference : hasNoToolReference;
    case "runner_finished":
    case "budget_exhausted":
    case "model_error":
    case "model_mismatch":
      return hasNoToolReference;
  }
}

function isOptionalAgentRunPolicyDecisionDetails(
  stage: unknown,
  kind: unknown,
  value: unknown
): value is AgentRunPolicyDecisionDetails | undefined {
  if (value === undefined) return true;
  if (!isAgentRunPolicyDecisionStage(stage) || !isAgentRunPolicyDecisionKind(kind)) return false;
  if (!isPlainRecord(value)) return false;
  switch (kind) {
    case "runner_start_enqueued":
      return (
        stage === "runner_start" &&
        hasOnlyKeys(value, ["request"]) &&
        isAgentRunPolicyDecisionRequestDetails(value.request)
      );
    case "runner_continuation_enqueued":
      return (
        stage === "runner_continuation" &&
        hasOnlyKeys(value, ["request", "executor"]) &&
        isAgentRunPolicyDecisionRequestDetails(value.request) &&
        (value.executor === undefined || value.executor === "backend" || value.executor === "remote_bridge")
      );
    case "raw_command_fallback":
      return (
        stage === "runner_continuation" &&
        hasOnlyKeys(value, ["request", "preferredTool", "reason"]) &&
        isAgentRunPolicyDecisionRequestDetails(value.request) &&
        value.preferredTool === "createGeometryPlan" &&
        isNonEmptyString(value.reason)
      );
    case "runner_finished":
      return (
        hasOnlyKeys(value, ["status", "usage"]) &&
        isAgentRunStatus(value.status) &&
        isTerminalAgentRunStatus(value.status) &&
        isAgentRunUsage(value.usage)
      );
    case "workflow_blocked":
      return isAgentRunPolicyDecisionWorkflowDetails(stage, value);
    case "tool_boundary_blocked":
      return (
        hasOnlyKeys(value, ["runStatus", "executor", "rejectedTransport", "request"]) &&
        isAgentRunStatus(value.runStatus) &&
        value.executor === "backend" &&
        value.rejectedTransport === "renderer_remote_bridge" &&
        (value.request === undefined || isAgentRunPolicyDecisionRequestDetails(value.request))
      );
    case "budget_exhausted":
      return (
        hasOnlyKeys(value, ["budget", "status", "runStatus", "error"]) &&
        isAgentRunRunnerBudgetSnapshot(value.budget) &&
        (value.status === undefined || isAgentRunStatus(value.status)) &&
        (value.runStatus === undefined || isAgentRunStatus(value.runStatus)) &&
        isOptionalStringOrNull(value.error)
      );
    case "backend_tool_auto_step_limit":
      return (
        hasOnlyKeys(value, ["limit", "attemptedStep", "runStatus"]) &&
        isNonNegativeInteger(value.limit) &&
        isNonNegativeInteger(value.attemptedStep) &&
        isAgentRunStatus(value.runStatus)
      );
    case "model_error":
      return false;
    case "model_mismatch":
      return (
        hasOnlyKeys(value, ["expected", "received"]) &&
        isAgentRunPolicyDecisionModelPair(value.expected) &&
        isAgentRunPolicyDecisionModelPair(value.received)
      );
    case "tool_request_dead_letter":
      return (
        hasOnlyKeys(value, ["attemptCount", "status", "claimedBy"]) &&
        isNonNegativeInteger(value.attemptCount) &&
        isRemoteToolRequestStatus(value.status) &&
        isOptionalStringOrNull(value.claimedBy)
      );
  }
}

function isAgentRunPolicyDecisionWorkflowDetails(stage: AgentRunPolicyDecisionStage, details: Record<string, unknown>) {
  if (stage === "ledger_tool_event" || stage === "remote_tool_request") {
    return (
      hasOnlyKeys(details, ["runStatus", "request", "conflict", "toolStatus"]) &&
      isAgentRunStatus(details.runStatus) &&
      (details.request === undefined || isAgentRunPolicyDecisionRequestDetails(details.request)) &&
      (details.conflict === undefined || isAgentRunPolicyDecisionConflictDetails(details.conflict)) &&
      (details.toolStatus === undefined || isAgentRunStatus(details.toolStatus))
    );
  }
  return (
    hasOnlyKeys(details, ["status", "error"]) &&
    (details.status === undefined || isAgentRunStatus(details.status)) &&
    isOptionalStringOrNull(details.error)
  );
}

function isAgentRunPolicyDecisionRequestDetails(value: unknown): value is AgentRunPolicyDecisionRequestDetails {
  if (!isPlainRecord(value)) return false;
  return (
    hasOnlyKeys(value, ["toolCallId", "toolName", "args", "requestedAt"]) &&
    isAgentRunToolCallId(value.toolCallId) &&
    isOptionalToolNameOrNull(value.toolName) &&
    value.toolName !== undefined &&
    value.toolName !== null &&
    "args" in value &&
    isFunctionCallArgs(value.toolName as FunctionCallToolName, value.args) &&
    isOptionalAgentRunTimestamp(value.requestedAt)
  );
}

function isAgentRunPolicyDecisionConflictDetails(value: unknown): value is AgentRunPolicyDecisionConflictDetails {
  if (!isPlainRecord(value)) return false;
  return (
    hasOnlyKeys(value, ["toolCallId", "existingToolName", "nextToolName", "reason", "message"]) &&
    isAgentRunToolCallId(value.toolCallId) &&
    isOptionalToolNameOrNull(value.existingToolName) &&
    value.existingToolName !== undefined &&
    value.existingToolName !== null &&
    isOptionalToolNameOrNull(value.nextToolName) &&
    value.nextToolName !== undefined &&
    value.nextToolName !== null &&
    typeof value.reason === "string" &&
    value.reason.length > 0 &&
    typeof value.message === "string" &&
    value.message.length > 0
  );
}

function isAgentRunRunnerBudgetSnapshot(value: unknown): value is AgentRunRunnerBudgetSnapshot {
  if (!isPlainRecord(value)) return false;
  return (
    hasOnlyKeys(value, ["maxToolSteps", "completedToolSteps", "activeToolRequests", "remainingToolRequests", "exhausted"]) &&
    isNonNegativeInteger(value.maxToolSteps) &&
    isNonNegativeInteger(value.completedToolSteps) &&
    isNonNegativeInteger(value.activeToolRequests) &&
    isNonNegativeInteger(value.remainingToolRequests) &&
    typeof value.exhausted === "boolean"
  );
}

function isAgentRunPolicyDecisionModelPair(value: unknown) {
  if (!isPlainRecord(value)) return false;
  return (
    hasOnlyKeys(value, ["provider", "model"]) &&
    typeof value.provider === "string" &&
    value.provider.trim().length > 0 &&
    typeof value.model === "string" &&
    value.model.trim().length > 0
  );
}

function isRemoteToolRequestStatus(value: unknown) {
  return typeof value === "string" && ["pending", "running", "succeeded", "failed", "cancelled"].includes(value);
}

function isOptionalStringOrNull(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalAgentRunToolCallIdOrNull(value: unknown) {
  return value === undefined || value === null || isAgentRunToolCallId(value);
}

function isAgentRunLifecycleTiming(status: unknown, completedAt: unknown, durationMs: unknown) {
  if (!isAgentRunStatus(status)) return false;
  if (status === "running") {
    return (completedAt === undefined || completedAt === null) && (durationMs === undefined || durationMs === null);
  }
  return isAgentRunTimestamp(completedAt);
}

function isAgentRunDurationTiming(startedAt: unknown, completedAt: unknown, durationMs: unknown) {
  if (!isAgentRunTimestamp(startedAt)) return false;
  if (completedAt === undefined || completedAt === null) return durationMs === undefined || durationMs === null;
  if (!isAgentRunTimestamp(completedAt)) return false;
  const elapsedMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (elapsedMs < 0) return false;
  return durationMs === undefined || durationMs === null || durationMs === elapsedMs;
}

function isAgentRunStatusErrorState(status: unknown, error: unknown) {
  if (!isAgentRunStatus(status)) return false;
  if (status === "succeeded" || status === "running") return error === undefined || error === null;
  return true;
}

function isAgentRunStatusUsageState(status: unknown, usage: unknown) {
  if (!isAgentRunStatus(status)) return false;
  if (status === "succeeded") return true;
  return usage === undefined || usage === null;
}

function isAgentRunModelStepOutputState(
  status: unknown,
  outputType: unknown,
  outputToolCallId: unknown,
  outputToolName: unknown,
  outputTextLength: unknown
) {
  if (!isAgentRunStatus(status)) return false;
  if (status !== "succeeded") {
    return (
      (outputType === undefined || outputType === null) &&
      (outputToolCallId === undefined || outputToolCallId === null) &&
      (outputToolName === undefined || outputToolName === null) &&
      (outputTextLength === undefined || outputTextLength === null)
    );
  }
  if (outputType === "tool") {
    return (
      isAgentRunToolCallId(outputToolCallId) &&
      isOptionalToolNameOrNull(outputToolName) &&
      outputToolName !== undefined &&
      outputToolName !== null &&
      (outputTextLength === undefined || outputTextLength === null)
    );
  }
  if (outputType === "finish") {
    return (
      (outputToolCallId === undefined || outputToolCallId === null) &&
      (outputToolName === undefined || outputToolName === null) &&
      isNonNegativeInteger(outputTextLength)
    );
  }
  return false;
}

function isOptionalAgentRunModelStepDetails(value: unknown): value is AgentRunModelStepDetails | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const details = value as Record<string, unknown>;
  const keys = Object.keys(details);
  const protocolRepairAttempts = details.protocolRepairAttempts;
  const protocolRepairErrors = details.protocolRepairErrors;
  return (
    keys.length === 2 &&
    keys.includes("protocolRepairAttempts") &&
    keys.includes("protocolRepairErrors") &&
    isNonNegativeInteger(protocolRepairAttempts) &&
    protocolRepairAttempts > 0 &&
    Array.isArray(protocolRepairErrors) &&
    protocolRepairErrors.length === protocolRepairAttempts &&
    protocolRepairErrors.every((error) => typeof error === "string" && error.length > 0)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalNonNegativeInteger(value: unknown) {
  return value === undefined || isNonNegativeInteger(value);
}

function isAgentRunUsageTotalState(inputTokens: unknown, outputTokens: unknown, totalTokens: unknown) {
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined) {
    return true;
  }
  if (
    typeof inputTokens !== "number" ||
    typeof outputTokens !== "number" ||
    typeof totalTokens !== "number" ||
    !isNonNegativeInteger(inputTokens) ||
    !isNonNegativeInteger(outputTokens) ||
    !isNonNegativeInteger(totalTokens)
  ) {
    return false;
  }
  return inputTokens + outputTokens === totalTokens;
}

function isOptionalNonNegativeIntegerOrNull(value: unknown) {
  return value === undefined || value === null || isNonNegativeInteger(value);
}

function isOptionalToolNameOrNull(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && agentRunToolNames.has(value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}
