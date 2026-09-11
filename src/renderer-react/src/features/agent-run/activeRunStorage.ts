import {
  agentRunRemoteToolExecutionCacheKey,
  cachedRemoteToolExecutionMatchesRequest,
  createAgentRunRemoteToolExecutionCacheEntry,
  isAgentRunRemoteToolExecutionCacheEntry,
  type AgentRunLedgerRecord,
  type AgentRunRemoteToolRequest,
  type AgentRunRunnerSnapshot,
  type AgentRunToolRecord,
  type createAgentRunCoordinator,
} from "@geochat-ai/app/client";

const INSTALLATION_ID_KEY = "geogebraCopilotInstallationId";
const ACTIVE_RUN_PREFIX = "geogebraCopilotActiveAgentRun:";
export const RUNNER_RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type StoredActiveRun = { runId: string; conversationId: string; userMessageId: string | null; assistantMessageId: string | null; prompt: string; modelId: string; startedAt: string; attachmentCount: number };

export function activeRunStorageKey(installationId: string, canvasSessionId: string) {
  return `${ACTIVE_RUN_PREFIX}${installationId}:${canvasSessionId}`;
}

export function activeRunRecord(record: AgentRunLedgerRecord): StoredActiveRun {
  return { runId: record.runId, conversationId: record.conversationId, userMessageId: record.userMessageId ?? null, assistantMessageId: record.assistantMessageId ?? null, prompt: record.prompt, modelId: record.modelId, startedAt: record.startedAt, attachmentCount: record.attachmentCount };
}

export async function getInstallationId(ref: { current: string | null }) {
  if (ref.current) return ref.current;
  const stored = await browser.storage.local.get(INSTALLATION_ID_KEY);
  let installationId = typeof stored[INSTALLATION_ID_KEY] === "string" ? stored[INSTALLATION_ID_KEY] : "";
  if (!installationId) {
    installationId = crypto.randomUUID();
    await browser.storage.local.set({ [INSTALLATION_ID_KEY]: installationId });
  }
  ref.current = installationId;
  return installationId;
}

export function isStoredActiveRun(value: unknown): value is StoredActiveRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const run = value as Record<string, unknown>;
  return typeof run.runId === "string" && typeof run.conversationId === "string" && (typeof run.userMessageId === "string" || run.userMessageId === null) && (typeof run.assistantMessageId === "string" || run.assistantMessageId === null) && typeof run.prompt === "string" && typeof run.modelId === "string" && typeof run.startedAt === "string" && typeof run.attachmentCount === "number";
}

export function isStuckRunner(snapshot: AgentRunRunnerSnapshot) {
  return snapshot.status === "running" && snapshot.pendingToolRequests.length === 0;
}

export function isExpiredActiveRun(run: StoredActiveRun, now = Date.now()) {
  const startedAt = Date.parse(run.startedAt);
  return !Number.isFinite(startedAt) || now - startedAt > RUNNER_RECOVERY_MAX_AGE_MS;
}

export async function saveActiveRun(installationId: string, canvasSessionId: string, record: AgentRunLedgerRecord) {
  await browser.storage.local.set({ [activeRunStorageKey(installationId, canvasSessionId)]: activeRunRecord(record) });
}

export async function removeActiveRun(installationId: string, canvasSessionId: string) {
  await browser.storage.local.remove(activeRunStorageKey(installationId, canvasSessionId));
}

/**
 * A marker is evidence that the server may still own a reservation. Only
 * remove it after the finish endpoint confirms a terminal ledger record.
 * A false result deliberately leaves the marker for a later recovery pass.
 */
export async function finishActiveRun(input: {
  coordinator: ReturnType<typeof createAgentRunCoordinator>;
  runId: string;
  installationId: string;
  canvasSessionId: string;
  status: "failed" | "cancelled";
  error: string;
}) {
  const finished = await input.coordinator.finish(input.runId, { status: input.status, error: input.error });
  if (!finished || finished.status === "running") return false;
  await removeActiveRun(input.installationId, input.canvasSessionId);
  return true;
}

export async function readCachedToolResult(request: AgentRunRemoteToolRequest) {
  const cacheKey = agentRunRemoteToolExecutionCacheKey(request);
  const entry = (await browser.storage.local.get(cacheKey))[cacheKey];
  return isAgentRunRemoteToolExecutionCacheEntry(entry) && cachedRemoteToolExecutionMatchesRequest(entry, request) ? entry.tool : null;
}

export async function saveCachedToolResult(request: AgentRunRemoteToolRequest, tool: AgentRunToolRecord) {
  await browser.storage.local.set({ [agentRunRemoteToolExecutionCacheKey(request)]: createAgentRunRemoteToolExecutionCacheEntry(request, tool) });
}

export async function removeCachedToolResult(request: AgentRunRemoteToolRequest) {
  await browser.storage.local.remove(agentRunRemoteToolExecutionCacheKey(request));
}

export async function restoreActiveRun(input: {
  coordinator: ReturnType<typeof createAgentRunCoordinator>;
  installationIdRef: { current: string | null };
  canvasSessionId: string;
  signal: AbortSignal;
  onRestore: (run: StoredActiveRun) => void;
  onDiscard: () => void;
}) {
  const installationId = await getInstallationId(input.installationIdRef);
  const storageKey = activeRunStorageKey(installationId, input.canvasSessionId);
  const stored = (await browser.storage.local.get(storageKey))[storageKey];
  if (!isStoredActiveRun(stored) || input.signal.aborted) return;
  if (isExpiredActiveRun(stored)) {
    const finished = await finishActiveRun({
      coordinator: input.coordinator,
      runId: stored.runId,
      installationId,
      canvasSessionId: input.canvasSessionId,
      status: "failed",
      error: "Recovered an expired agent run after the renderer was unavailable.",
    });
    if (!finished) throw new Error("The expired agent run could not be reconciled.");
    input.onDiscard();
    return;
  }
  const snapshot = await input.coordinator.runnerSnapshot(stored.runId);
  if (input.signal.aborted) return;
  if (!snapshot) throw new Error("The pending agent run could not be inspected.");
  if (snapshot.run.status !== "running") {
    await removeActiveRun(installationId, input.canvasSessionId);
    input.onDiscard();
    return;
  }
  if (stored.attachmentCount > 0 || isStuckRunner(snapshot)) {
    const finished = await finishActiveRun({
      coordinator: input.coordinator,
      runId: stored.runId,
      installationId,
      canvasSessionId: input.canvasSessionId,
      status: "failed",
      error: stored.attachmentCount > 0
        ? "Image attachment runs cannot be safely recovered after a content-script reload."
        : "Recovered a runner that was active without a remote tool request.",
    });
    if (!finished) throw new Error("The pending agent run could not be reconciled.");
    input.onDiscard();
    return;
  }
  input.onRestore(stored);
}
