import type { FunctionCallToolName } from "./functioncalls";
import { isFunctionCallToolName } from "./functioncalls";
import { isFunctionCallArgs } from "./functioncall-schemas";
import { isAgentModelConfig, type AgentModelConfig } from "./model-registry";
import { isOptionalAgentRunImageAttachments, type AgentRunImageAttachment } from "./attachments";
import { agentRunToolArgsMatch, isAgentRunToolRecord, type AgentRunToolRecord } from "./run-ledger";
import { isAgentRunEntityId, isAgentRunToolCallId } from "./agent-run-ids";
import {
  isAgentRunTimestamp,
  isOptionalAgentRunTimestamp,
  isOptionalAgentRunTimestampOrNull
} from "./agent-run-time";

export type AgentRunRemoteToolRequestStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export type AgentRunRemoteToolRequest = {
  runId: string;
  toolCallId: string;
  toolName: FunctionCallToolName;
  args: unknown;
  status: AgentRunRemoteToolRequestStatus;
  requestedAt: string;
  claimedAt?: string | null;
  claimedBy?: string | null;
  leaseExpiresAt?: string | null;
  attemptCount?: number;
  completedAt?: string | null;
  result?: unknown;
  error?: string | null;
};

export type AgentRunRemoteToolRequestInput = {
  toolCallId: string;
  toolName: FunctionCallToolName;
  args: unknown;
  requestedAt?: string;
};

export type AgentRunRemoteToolResultInput = {
  tool: AgentRunToolRecord;
  claimOwner?: string;
  model?: AgentModelConfig;
  attachments?: AgentRunImageAttachment[];
};

export type AgentRunRemoteToolClaimInput = {
  claimedAt?: string;
  claimedBy?: string | null;
  leaseMs?: number;
  maxAttempts?: number;
};

export type AgentRunRemoteToolExecutionCacheEntry = {
  cacheKey: string;
  fingerprint: string;
  runId: string;
  toolCallId: string;
  toolName: FunctionCallToolName;
  args: unknown;
  tool: AgentRunToolRecord;
  storedAt: string;
};

export type AgentRunRemoteToolRequestConflict = {
  toolCallId: string;
  existingToolName: FunctionCallToolName;
  nextToolName: FunctionCallToolName;
  reason: "tool_name_mismatch" | "args_mismatch";
  message: string;
};

const defaultRemoteToolLeaseMs = 120_000;
export const DEFAULT_AGENT_RUN_REMOTE_TOOL_MAX_ATTEMPTS = 3;

export function createAgentRunRemoteToolRequest(runId: string, input: AgentRunRemoteToolRequestInput): AgentRunRemoteToolRequest {
  return {
    runId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    args: input.args,
    status: "pending",
    requestedAt: input.requestedAt ?? new Date().toISOString(),
    claimedAt: null,
    claimedBy: null,
    leaseExpiresAt: null,
    attemptCount: 0,
    completedAt: null,
    error: null
  };
}

export function claimAgentRunRemoteToolRequest(
  request: AgentRunRemoteToolRequest,
  input: string | AgentRunRemoteToolClaimInput = {}
) {
  const claimedAt = normalizeAgentRunClaimTimestamp(typeof input === "string" ? input : input.claimedAt);
  const claimedBy = typeof input === "string" ? request.claimedBy ?? null : input.claimedBy ?? request.claimedBy ?? null;
  const leaseMs = normalizeRemoteToolLeaseMs(typeof input === "string" ? undefined : input.leaseMs);
  const maxAttempts = normalizeRemoteToolMaxAttempts(typeof input === "string" ? undefined : input.maxAttempts);
  const claimable = request.status === "pending" || isAgentRunRemoteToolRequestLeaseExpired(request, claimedAt);
  if (!claimable) return request;
  if (isAgentRunRemoteToolRequestAttemptLimitReached(request, maxAttempts)) {
    return failAgentRunRemoteToolRequestForAttemptLimit(request, {
      completedAt: claimedAt,
      maxAttempts
    });
  }
  return {
    ...request,
    status: "running",
    claimedAt,
    claimedBy,
    leaseExpiresAt: new Date(new Date(claimedAt).getTime() + leaseMs).toISOString(),
    attemptCount: agentRunRemoteToolRequestNextAttemptCount(request)
  } satisfies AgentRunRemoteToolRequest;
}

export function agentRunRemoteToolRequestNextAttemptCount(request: Pick<AgentRunRemoteToolRequest, "attemptCount">) {
  return (request.attemptCount ?? 0) + 1;
}

export function isAgentRunRemoteToolRequestAttemptLimitReached(
  request: Pick<AgentRunRemoteToolRequest, "attemptCount">,
  maxAttempts = DEFAULT_AGENT_RUN_REMOTE_TOOL_MAX_ATTEMPTS
) {
  return (request.attemptCount ?? 0) >= normalizeRemoteToolMaxAttempts(maxAttempts);
}

function normalizeAgentRunClaimTimestamp(value: unknown) {
  return isAgentRunTimestamp(value) ? value : new Date().toISOString();
}

function normalizeRemoteToolCompletionTimestamp(
  request: Pick<AgentRunRemoteToolRequest, "requestedAt" | "claimedAt">,
  value: unknown
) {
  const completedAt = normalizeAgentRunClaimTimestamp(value);
  const minimumMs = Math.max(
    new Date(request.requestedAt).getTime(),
    request.claimedAt ? new Date(request.claimedAt).getTime() : 0
  );
  return new Date(Math.max(new Date(completedAt).getTime(), minimumMs)).toISOString();
}

function normalizeRemoteToolLeaseMs(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : defaultRemoteToolLeaseMs;
}

function normalizeRemoteToolMaxAttempts(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : DEFAULT_AGENT_RUN_REMOTE_TOOL_MAX_ATTEMPTS;
}

export function failAgentRunRemoteToolRequestForAttemptLimit(
  request: AgentRunRemoteToolRequest,
  input: { completedAt?: string; maxAttempts?: number; error?: string } = {}
) {
  const completedAt = normalizeRemoteToolCompletionTimestamp(request, input.completedAt);
  const maxAttempts = normalizeRemoteToolMaxAttempts(input.maxAttempts);
  return {
    ...request,
    status: "failed",
    leaseExpiresAt: null,
    completedAt,
    error: input.error ?? `Remote tool request exceeded ${maxAttempts} claim attempts.`
  } satisfies AgentRunRemoteToolRequest;
}

export function cancelAgentRunRemoteToolRequest(
  request: AgentRunRemoteToolRequest,
  input: { completedAt?: string; error?: string } = {}
) {
  if (isAgentRunRemoteToolRequestTerminal(request)) return request;
  return {
    ...request,
    status: "cancelled",
    leaseExpiresAt: null,
    completedAt: normalizeRemoteToolCompletionTimestamp(request, input.completedAt),
    error: input.error ?? "Agent run closed before remote tool completion."
  } satisfies AgentRunRemoteToolRequest;
}

export function completeAgentRunRemoteToolRequest(request: AgentRunRemoteToolRequest, tool: AgentRunToolRecord) {
  if (request.status !== "running") return request;
  if (request.toolCallId !== tool.toolCallId) return request;
  if (request.toolName !== tool.toolName) return request;
  if (!agentRunToolArgsMatch(request.args, tool.args)) return request;
  return {
    ...request,
    status: tool.status === "succeeded" ? "succeeded" : "failed",
    completedAt: normalizeRemoteToolCompletionTimestamp(request, tool.completedAt),
    result: tool.result,
    error: tool.error ?? null
  } satisfies AgentRunRemoteToolRequest;
}

export function isAgentRunRemoteToolRequestTerminal(request: Pick<AgentRunRemoteToolRequest, "status">) {
  return request.status === "succeeded" || request.status === "failed" || request.status === "cancelled";
}

export function isAgentRunRemoteToolRequestLeaseExpired(
  request: Pick<AgentRunRemoteToolRequest, "status" | "leaseExpiresAt">,
  now = new Date().toISOString()
) {
  if (request.status !== "running") return false;
  if (!request.leaseExpiresAt) return true;
  if (!isAgentRunTimestamp(request.leaseExpiresAt)) return true;
  return new Date(request.leaseExpiresAt).getTime() <= new Date(normalizeAgentRunClaimTimestamp(now)).getTime();
}

export function isAgentRunRemoteToolRequestClaimable(request: AgentRunRemoteToolRequest, now = new Date().toISOString()) {
  return request.status === "pending" || isAgentRunRemoteToolRequestLeaseExpired(request, now);
}

export function agentRunRemoteToolExecutionFingerprint(
  request: Pick<AgentRunRemoteToolRequest, "runId" | "toolCallId" | "toolName" | "args">
) {
  return stableJson({
    runId: request.runId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    args: request.args
  });
}

export function agentRunRemoteToolExecutionCacheKey(request: Pick<AgentRunRemoteToolRequest, "runId" | "toolCallId" | "toolName" | "args">) {
  return `geochat:remote-tool-execution:${fnv1a32(agentRunRemoteToolExecutionFingerprint(request))}`;
}

export function createAgentRunRemoteToolExecutionCacheEntry(
  request: Pick<AgentRunRemoteToolRequest, "runId" | "toolCallId" | "toolName" | "args">,
  tool: AgentRunToolRecord,
  storedAt = new Date().toISOString()
): AgentRunRemoteToolExecutionCacheEntry {
  const fingerprint = agentRunRemoteToolExecutionFingerprint(request);
  return {
    cacheKey: agentRunRemoteToolExecutionCacheKey(request),
    fingerprint,
    runId: request.runId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    args: request.args,
    tool,
    storedAt
  };
}

export function cachedRemoteToolExecutionMatchesRequest(
  entry: AgentRunRemoteToolExecutionCacheEntry,
  request: Pick<AgentRunRemoteToolRequest, "runId" | "toolCallId" | "toolName" | "args">
) {
  return (
    entry.cacheKey === agentRunRemoteToolExecutionCacheKey(request) &&
    entry.fingerprint === agentRunRemoteToolExecutionFingerprint(request) &&
    entry.runId === request.runId &&
    entry.toolCallId === request.toolCallId &&
    entry.toolName === request.toolName &&
    agentRunToolArgsMatch(entry.args, request.args) &&
    entry.tool.toolCallId === request.toolCallId &&
    entry.tool.toolName === request.toolName &&
    agentRunToolArgsMatch(entry.tool.args, request.args)
  );
}

export function findAgentRunRemoteToolRequestConflict(
  requests: readonly Pick<AgentRunRemoteToolRequest, "toolCallId" | "toolName" | "args" | "status">[],
  nextRequest: Pick<AgentRunRemoteToolRequestInput, "toolCallId" | "toolName" | "args">
): AgentRunRemoteToolRequestConflict | undefined {
  const existing = requests.find(
    (request) =>
      request.toolCallId === nextRequest.toolCallId &&
      (request.status === "pending" || request.status === "running")
  );
  if (!existing) return undefined;
  if (existing.toolName !== nextRequest.toolName) {
    return {
      toolCallId: nextRequest.toolCallId,
      existingToolName: existing.toolName,
      nextToolName: nextRequest.toolName,
      reason: "tool_name_mismatch",
      message: `Remote tool request id ${nextRequest.toolCallId} is already pending for ${existing.toolName}, not ${nextRequest.toolName}.`
    };
  }
  if (!agentRunToolArgsMatch(existing.args, nextRequest.args)) {
    return {
      toolCallId: nextRequest.toolCallId,
      existingToolName: existing.toolName,
      nextToolName: nextRequest.toolName,
      reason: "args_mismatch",
      message: `Remote tool request id ${nextRequest.toolCallId} is already pending with a different ${nextRequest.toolName} argument payload.`
    };
  }
  return undefined;
}

export function isAgentRunRemoteToolRequestInput(value: unknown): value is AgentRunRemoteToolRequestInput {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isAgentRunToolCallId(payload.toolCallId) &&
    typeof payload.toolName === "string" &&
    isFunctionCallToolName(payload.toolName) &&
    "args" in payload &&
    isFunctionCallArgs(payload.toolName, payload.args) &&
    isOptionalAgentRunTimestamp(payload.requestedAt)
  );
}

export function isAgentRunRemoteToolRequest(value: unknown): value is AgentRunRemoteToolRequest {
  return agentRunRemoteToolRequestInvalidReasons(value).length === 0;
}

export function agentRunRemoteToolRequestInvalidReasons(value: unknown): string[] {
  const reasons: string[] = [];
  if (!value || typeof value !== "object") return ["request must be an object"];
  const payload = value as Record<string, unknown>;
  if (!isAgentRunEntityId(payload.runId)) reasons.push("runId must be a valid agent run id");
  if (!isAgentRunToolCallId(payload.toolCallId)) reasons.push("toolCallId must be a valid tool call id");
  if (typeof payload.toolName !== "string" || !isFunctionCallToolName(payload.toolName)) {
    reasons.push("toolName must be a known function-call tool");
  }
  if (!("args" in payload)) {
    reasons.push("args is required");
  } else if (typeof payload.toolName === "string" && isFunctionCallToolName(payload.toolName) && !isFunctionCallArgs(payload.toolName, payload.args)) {
    reasons.push(`args must match ${payload.toolName} schema`);
  }
  if (!isAgentRunRemoteToolRequestStatus(payload.status)) reasons.push("status must be pending, running, succeeded, failed, or cancelled");
  if (!isAgentRunTimestamp(payload.requestedAt)) reasons.push("requestedAt must be a valid timestamp");
  if (!isOptionalAgentRunTimestampOrNull(payload.claimedAt)) reasons.push("claimedAt must be null, omitted, or a valid timestamp");
  if (!isOptionalStringOrNull(payload.claimedBy)) reasons.push("claimedBy must be null, omitted, or a string");
  if (!isOptionalAgentRunTimestampOrNull(payload.leaseExpiresAt)) reasons.push("leaseExpiresAt must be null, omitted, or a valid timestamp");
  if (!isOptionalNonNegativeInteger(payload.attemptCount)) reasons.push("attemptCount must be a non-negative integer when present");
  if (!isOptionalAgentRunTimestampOrNull(payload.completedAt)) reasons.push("completedAt must be null, omitted, or a valid timestamp");
  if (!isOptionalStringOrNull(payload.error)) reasons.push("error must be null, omitted, or a string");
  if (isAgentRunRemoteToolRequestStatus(payload.status)) {
    if (!isAgentRunRemoteToolRequestLifecycle(payload.status, {
      claimedAt: payload.claimedAt,
      leaseExpiresAt: payload.leaseExpiresAt,
      completedAt: payload.completedAt
    })) {
      reasons.push("lifecycle timestamps do not match request status");
    }
    if (!isAgentRunRemoteToolRequestLeaseState(payload.claimedAt, payload.claimedBy, payload.leaseExpiresAt)) {
      reasons.push("lease state requires claimedAt when claimedBy or leaseExpiresAt is present");
    }
    if (!isAgentRunRemoteToolRequestTimeline(payload.requestedAt, payload.claimedAt, payload.leaseExpiresAt, payload.completedAt)) {
      reasons.push("timeline is invalid: claim, lease, or completion precedes the required prior timestamp");
    }
    if (!isAgentRunRemoteToolRequestResultState(payload.status, payload.result, payload.error)) {
      reasons.push("result/error state does not match request status");
    }
  }
  return reasons;
}

export function isAgentRunRemoteToolResultInput(value: unknown): value is AgentRunRemoteToolResultInput {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isAgentRunToolRecord(payload.tool) &&
    isOptionalString(payload.claimOwner) &&
    (payload.model === undefined || isAgentModelConfig(payload.model)) &&
    isOptionalAgentRunImageAttachments(payload.attachments)
  );
}

export function isAgentRunRemoteToolExecutionCacheEntry(value: unknown): value is AgentRunRemoteToolExecutionCacheEntry {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isAgentRunEntityId(payload.cacheKey) &&
    isAgentRunEntityId(payload.fingerprint) &&
    isAgentRunEntityId(payload.runId) &&
    isAgentRunToolCallId(payload.toolCallId) &&
    typeof payload.toolName === "string" &&
    isFunctionCallToolName(payload.toolName) &&
    "args" in payload &&
    isFunctionCallArgs(payload.toolName, payload.args) &&
    isAgentRunToolRecord(payload.tool) &&
    isAgentRunTimestamp(payload.storedAt)
  );
}

function isAgentRunRemoteToolRequestStatus(value: unknown): value is AgentRunRemoteToolRequestStatus {
  return typeof value === "string" && ["pending", "running", "succeeded", "failed", "cancelled"].includes(value);
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isOptionalStringOrNull(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function isAgentRunRemoteToolRequestLifecycle(
  status: unknown,
  timestamps: { claimedAt: unknown; leaseExpiresAt: unknown; completedAt: unknown }
) {
  if (!isAgentRunRemoteToolRequestStatus(status)) return false;
  if (status === "pending") {
    return (
      (timestamps.claimedAt === undefined || timestamps.claimedAt === null) &&
      (timestamps.leaseExpiresAt === undefined || timestamps.leaseExpiresAt === null) &&
      (timestamps.completedAt === undefined || timestamps.completedAt === null)
    );
  }
  if (status === "running") {
    return (
      isAgentRunTimestamp(timestamps.claimedAt) &&
      isAgentRunTimestamp(timestamps.leaseExpiresAt) &&
      (timestamps.completedAt === undefined || timestamps.completedAt === null)
    );
  }
  return isAgentRunTimestamp(timestamps.completedAt);
}

function isAgentRunRemoteToolRequestLeaseState(claimedAt: unknown, claimedBy: unknown, leaseExpiresAt: unknown) {
  const hasClaimedAt = isAgentRunTimestamp(claimedAt);
  const hasClaimedBy = claimedBy !== undefined && claimedBy !== null;
  const hasLeaseExpiresAt = leaseExpiresAt !== undefined && leaseExpiresAt !== null;
  if ((hasClaimedBy || hasLeaseExpiresAt) && !hasClaimedAt) return false;
  return true;
}

function isAgentRunRemoteToolRequestTimeline(
  requestedAt: unknown,
  claimedAt: unknown,
  leaseExpiresAt: unknown,
  completedAt: unknown
) {
  if (!isAgentRunTimestamp(requestedAt)) return false;
  const requestedMs = new Date(requestedAt).getTime();
  const claimedMs = claimedAt === undefined || claimedAt === null ? undefined : timestampMs(claimedAt);
  const leaseExpiresMs = leaseExpiresAt === undefined || leaseExpiresAt === null ? undefined : timestampMs(leaseExpiresAt);
  const completedMs = completedAt === undefined || completedAt === null ? undefined : timestampMs(completedAt);
  if (claimedMs !== undefined && claimedMs < requestedMs) return false;
  if (leaseExpiresMs !== undefined && claimedMs !== undefined && leaseExpiresMs < claimedMs) return false;
  if (completedMs !== undefined && completedMs < requestedMs) return false;
  if (completedMs !== undefined && claimedMs !== undefined && completedMs < claimedMs) return false;
  return true;
}

function timestampMs(value: unknown) {
  return isAgentRunTimestamp(value) ? new Date(value).getTime() : undefined;
}

function isAgentRunRemoteToolRequestResultState(status: unknown, result: unknown, error: unknown) {
  if (!isAgentRunRemoteToolRequestStatus(status)) return false;
  if (status === "pending" || status === "running") {
    return result === undefined && (error === undefined || error === null);
  }
  if (status === "succeeded") return error === undefined || error === null;
  return true;
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isOptionalNonNegativeInteger(value: unknown) {
  return value === undefined || isNonNegativeInteger(value);
}

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function fnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
