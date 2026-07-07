import {
  agentRunRemoteToolExecutionCacheKey,
  cachedRemoteToolExecutionMatchesRequest,
  createAgentRunCoordinator,
  createAgentRunRemoteToolExecutionCacheEntry,
  isAgentRunRemoteToolExecutionCacheEntry,
  type AgentRunFinishInput,
  type AgentRunLedgerRecord,
  type AgentRunRemoteToolRequest,
  type AgentRunRunnerSnapshot,
  type AgentRunToolRecord,
  type DesktopFunctionCall,
  type RuntimeInfo
} from "@geochat-ai/app";
import { desktopHeaders } from "./workbench-api";
import { ledgerToolFromCall } from "./workbench-tool-calls";

export type AgentRunCoordinator = ReturnType<typeof createAgentRunCoordinator>;

export const REMOTE_TOOL_CLAIM_OWNER = "desktop-renderer";

export function createAgentRunBridge(runtime: RuntimeInfo | string | undefined) {
  const backendBaseUrl = typeof runtime === "string" ? runtime : runtime?.backendBaseUrl;
  const runtimeInfo = typeof runtime === "string" ? undefined : runtime;
  return createAgentRunCoordinator({ backendBaseUrl, headers: () => desktopHeaders(runtimeInfo) });
}

export async function claimNextRunnableToolRequest(
  coordinator: AgentRunCoordinator,
  runner: AgentRunRunnerSnapshot | undefined,
  preferredToolCallId?: string
) {
  if (!runner || runner.status === "succeeded" || runner.status === "failed" || runner.status === "cancelled") return undefined;
  const claimed = await coordinator.pendingToolRequests(runner.run.runId, { claimOwner: REMOTE_TOOL_CLAIM_OWNER });
  if (preferredToolCallId) {
    const preferred = claimed.find((request) => request.toolCallId === preferredToolCallId);
    if (preferred) return preferred;
  }
  return claimed[0];
}

export function readRemoteToolExecutionCache(request: AgentRunRemoteToolRequest) {
  const key = agentRunRemoteToolExecutionCacheKey(request);
  const raw = globalThis.localStorage?.getItem(key);
  if (!raw) return undefined;
  try {
    const entry = JSON.parse(raw) as unknown;
    if (!isAgentRunRemoteToolExecutionCacheEntry(entry) || !cachedRemoteToolExecutionMatchesRequest(entry, request)) {
      globalThis.localStorage?.removeItem(key);
      return undefined;
    }
    return entry.tool;
  } catch {
    globalThis.localStorage?.removeItem(key);
    return undefined;
  }
}

export function writeRemoteToolExecutionCache(request: AgentRunRemoteToolRequest, tool: AgentRunToolRecord) {
  const entry = createAgentRunRemoteToolExecutionCacheEntry(request, tool);
  globalThis.localStorage?.setItem(entry.cacheKey, JSON.stringify(entry));
}

export function removeRemoteToolExecutionCache(request: AgentRunRemoteToolRequest) {
  globalThis.localStorage?.removeItem(agentRunRemoteToolExecutionCacheKey(request));
}

export function createAgentRunPersistence(runtime: RuntimeInfo | undefined, record: AgentRunLedgerRecord) {
  const coordinator = createAgentRunBridge(runtime);
  let queue = coordinator.start(record).then(() => undefined);
  const sentToolSnapshots = new Map<string, string>();

  return {
    recordTool(tool: AgentRunToolRecord) {
      const snapshot = safeStableJson(tool);
      if (sentToolSnapshots.get(tool.toolCallId) === snapshot) return queue;
      sentToolSnapshots.set(tool.toolCallId, snapshot);
      queue = queue.then(() => coordinator.recordTool(record.runId, tool).then(() => undefined));
      return queue;
    },
    drain() {
      return queue;
    },
    async finish(input: AgentRunFinishInput) {
      await queue;
      await coordinator.finish(record.runId, input);
    }
  };
}

export async function failBackendRunnerFromRenderer(input: {
  coordinator: AgentRunCoordinator;
  run: AgentRunLedgerRecord;
  completedCalls: readonly DesktopFunctionCall[];
  error: string;
}) {
  for (const call of input.completedCalls) {
    if (call.status !== "done" && call.status !== "error") continue;
    await input.coordinator.recordTool(input.run.runId, ledgerToolFromCall(call)).catch(() => undefined);
  }
  await input.coordinator.finish(input.run.runId, {
    status: "failed",
    usage: null,
    error: input.error
  }).catch(() => undefined);
}

function safeStableJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function agentRunPersistenceErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
