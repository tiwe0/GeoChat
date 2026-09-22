import type { AgentModelConfig } from "./model-registry";
import { normalizeAgentMaxToolSteps } from "./model-registry";
import type { FunctionCallToolName } from "./functioncalls";
import { isFunctionCallArgs } from "./functioncall-schemas";
import { isAgentRunEntityId, isAgentRunToolCallId } from "./agent-run-ids";
import {
  isAgentRunTimestamp,
  isOptionalAgentRunTimestamp,
  isOptionalAgentRunTimestampOrNull
} from "./agent-run-time";
import {
  MAX_AGENT_MODEL_STEP_TIMEOUT_MS,
  MIN_AGENT_MODEL_STEP_TIMEOUT_MS
} from "./agent-run-config";

export {
  DEFAULT_AGENT_MODEL_STEP_TIMEOUT_MS,
  MAX_AGENT_MODEL_STEP_TIMEOUT_MS,
  MIN_AGENT_MODEL_STEP_TIMEOUT_MS
} from "./agent-run-config";

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

export type AgentRunLocale = "zh-CN" | "en-US";

export type AgentRunUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};


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


export type AgentRunLedgerRecord = {
  runId: string;
  conversationId: string;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  status: AgentRunStatus;
  /** Monotonic persistence version used for compare-and-swap updates. */
  revision: number;
  /** Identifies the single HTTP continuation currently allowed to mutate this run. */
  continuationLeaseId?: string | null;
  continuationLeaseExpiresAt?: string | null;
  modelProvider: AgentModelConfig["provider"];
  modelId: string;
  modelProtocol?: AgentModelConfig["protocol"] | null;
  modelBaseUrl?: string | null;
  requestFingerprint?: string | null;
  maxToolSteps?: number | null;
  /** Number of model steps consumed across every HTTP continuation of this run. */
  modelStepCount?: number;
  modelStepTimeoutMs?: number | null;
  locale?: AgentRunLocale | null;
  /**
   * Whether the model was asked to reason before answering, and how hard.
   * Recorded on the run rather than read from live UI state, so a run
   * recovered after a reload resumes with the setting it actually started on.
   */
  thinking?: boolean | null;
  thinkingEffort?: AgentRunThinkingEffort | null;
  prompt: string;
  attachmentCount: number;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  usage?: AgentRunUsage | null;
  error?: string | null;
  tools: AgentRunToolRecord[];
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
  model: AgentModelConfig;
  modelStepTimeoutMs?: number | null;
  locale?: AgentRunLocale | null;
  thinking?: boolean | null;
  thinkingEffort?: AgentRunThinkingEffort | null;
  prompt: string;
  attachmentCount: number;
  startedAt?: string;
}): AgentRunLedgerRecord {
  return {
    runId: input.runId,
    conversationId: input.conversationId,
    userMessageId: input.userMessageId ?? null,
    assistantMessageId: input.assistantMessageId ?? null,
    status: "running",
    revision: 0,
    continuationLeaseId: null,
    continuationLeaseExpiresAt: null,
    modelProvider: input.model.provider,
    modelId: input.model.model,
    modelProtocol: input.model.protocol ?? null,
    modelBaseUrl: input.model.customBaseUrl.trim() || null,
    requestFingerprint: null,
    maxToolSteps: normalizeAgentMaxToolSteps(input.model.maxToolSteps),
    modelStepCount: 0,
    modelStepTimeoutMs: normalizeAgentModelStepTimeoutMs(input.modelStepTimeoutMs),
    locale: input.locale ?? null,
    thinking: input.thinking ?? null,
    thinkingEffort: normalizeAgentRunThinkingEffort(input.thinkingEffort),
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

export function finishAgentRunLedger(
  record: AgentRunLedgerRecord,
  input: AgentRunFinishInput
): AgentRunLedgerRecord {
  const completedAt = input.completedAt ?? new Date().toISOString();
  const usage = input.usage ?? record.usage ?? null;
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

export function incrementAgentRunModelStep(record: AgentRunLedgerRecord): AgentRunLedgerRecord {
  return { ...record, modelStepCount: (record.modelStepCount ?? 0) + 1 };
}

export function mergeAgentRunUsage(
  current: AgentRunUsage | null | undefined,
  addition: AgentRunUsage | null | undefined
): AgentRunUsage | null {
  if (!current && !addition) return null;
  const add = (left?: number, right?: number) => left === undefined && right === undefined
    ? undefined
    : (left ?? 0) + (right ?? 0);
  return {
    inputTokens: add(current?.inputTokens, addition?.inputTokens),
    outputTokens: add(current?.outputTokens, addition?.outputTokens),
    totalTokens: add(current?.totalTokens, addition?.totalTokens)
  };
}

export function isAgentRunStatus(value: unknown): value is AgentRunStatus {
  return typeof value === "string" && ["running", "succeeded", "failed", "cancelled"].includes(value);
}

export function isAgentRunLocale(value: unknown): value is AgentRunLocale {
  return value === "zh-CN" || value === "en-US";
}

function isOptionalAgentRunLocale(value: unknown): value is AgentRunLocale | null | undefined {
  return value === undefined || value === null || isAgentRunLocale(value);
}

function isOptionalAgentMaxToolSteps(value: unknown) {
  return value === undefined || value === null || normalizeAgentMaxToolSteps(value) === value;
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

function isOptionalThinking(value: unknown) {
  return value === undefined || value === null || typeof value === "boolean";
}

function isOptionalThinkingEffort(value: unknown) {
  return value === undefined || value === null || normalizeAgentRunThinkingEffort(value) !== null;
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
    isAgentRunStatus(payload.status) &&
    isNonNegativeInteger(payload.revision) &&
    isOptionalStringOrNull(payload.continuationLeaseId) &&
    isOptionalAgentRunTimestampOrNull(payload.continuationLeaseExpiresAt) &&
    typeof payload.modelProvider === "string" &&
    typeof payload.modelId === "string" &&
    isOptionalStringOrNull(payload.modelProtocol) &&
    isOptionalStringOrNull(payload.modelBaseUrl) &&
    isOptionalStringOrNull(payload.requestFingerprint) &&
    isOptionalAgentMaxToolSteps(payload.maxToolSteps) &&
    (payload.modelStepCount === undefined || isNonNegativeInteger(payload.modelStepCount)) &&
    isOptionalAgentModelStepTimeoutMs(payload.modelStepTimeoutMs) &&
    isOptionalAgentRunLocale(payload.locale) &&
    isOptionalThinking(payload.thinking) &&
    isOptionalThinkingEffort(payload.thinkingEffort) &&
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

function isOptionalStringOrNull(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
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
  return isAgentRunUsage(usage);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
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





/** How much deliberation the model is asked for on a run. */
export type AgentRunThinkingEffort = "light" | "standard" | "extended";

export const AGENT_RUN_THINKING_EFFORTS = ["light", "standard", "extended"] as const;

/** Anything unrecognised becomes null, so a bad value cannot reach a provider. */
export function normalizeAgentRunThinkingEffort(value: unknown): AgentRunThinkingEffort | null {
  return value === "light" || value === "standard" || value === "extended" ? value : null;
}

/**
 * Compact large ledger payloads before persistence while preserving replayable
 * tool status, errors, and the current user turn. In-memory records remain intact.
 */
export function compactAgentRunLedgerForStorage(record: AgentRunLedgerRecord, maxBytes = 2_000_000): AgentRunLedgerRecord {
  const serialized = JSON.stringify(record);
  const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (byteLength(record) <= maxBytes) return record;

  const compactValue = (value: unknown, depth = 0, stringLimit = 2048): unknown => {
    if (typeof value === "string") {
      if (value.length > stringLimit) return `[omitted ${value.length} chars]`;
      return value;
    }
    if (depth > 4) return "[omitted nested payload]";
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => compactValue(item, depth + 1, stringLimit));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, child]) => [key, compactValue(child, depth + 1, stringLimit)]));
  };

  const compactPrompt = (prompt: string) => {
    const limit = Math.min(120_000, Math.max(512, Math.floor(maxBytes / 4)));
    if (prompt.length <= limit) return prompt;
    const markerCandidates = ["【GeoChat 本轮用户消息】", "[GeoChat current user message]"];
    const marker = markerCandidates.find((candidate) => prompt.includes(candidate));
    if (!marker) return `${prompt.slice(0, limit)}\n[history omitted during ledger compaction]`;
    const markerIndex = prompt.indexOf(marker);
    const currentTurn = prompt.slice(markerIndex);
    const tail = currentTurn.slice(-Math.min(40_000, Math.max(128, limit - 1)));
    const headBudget = Math.max(0, limit - tail.length - 1);
    return `${prompt.slice(0, headBudget)}\n${tail}`;
  };

  let tools = record.tools.map((tool) => ({
    ...tool,
    args: compactValue(tool.args),
    result: compactValue(tool.result),
    canvasBefore: compactValue(tool.canvasBefore),
    canvasAfter: compactValue(tool.canvasAfter)
  }));
  let compacted: AgentRunLedgerRecord = { ...record, prompt: compactPrompt(record.prompt), tools };

  // Enforce a global budget, not only per-field limits. Keep the newest tool
  // records first because they are the most relevant for continuation/replay.
  while (byteLength(compacted) > maxBytes && tools.length > 1) {
    tools = tools.slice(1);
    compacted = { ...compacted, tools };
  }
  if (byteLength(compacted) > maxBytes) {
    const aggressive = (value: unknown) => compactValue(value, 0, 512);
    compacted = {
      ...compacted,
      prompt: compactPrompt(compacted.prompt),
      tools: tools.map((tool) => ({
        ...tool,
        args: aggressive(tool.args),
        result: aggressive(tool.result),
        canvasBefore: aggressive(tool.canvasBefore),
        canvasAfter: aggressive(tool.canvasAfter)
      }))
    };
  }
  return compacted;
}
