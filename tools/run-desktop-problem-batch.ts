export {};

type JsonRpcResponse<T = unknown> = {
  result?: {
    structuredContent?: T;
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: unknown;
};

type DesktopUiStatus = {
  type: "get_ui_status";
  conversationId: string;
  view: string;
  model: {
    provider: string;
    model: string;
    hasApiKey: boolean;
    customBaseUrlConfigured: boolean;
  };
  geogebra: {
    ready: boolean;
  };
  running: boolean;
  mcp: {
    running: boolean;
    endpoint: string | null;
  };
};

type RecentConversation = {
  id: string;
  title: string;
  summary: string | null;
  latest_run_id: string | null;
  latest_run_status: string | null;
  message_count: number;
  error_count: number;
  created_at: number;
  updated_at: number;
};

type ActionRecord = {
  id: string;
  status: string;
  result?: { conversationId?: string; [key: string]: unknown };
  error?: string | null;
};

type RunQuality = "clean_success" | "recovered_success" | "canvas_failed" | "model_failed";

type RunQualityItem = {
  runId: string;
  conversationId: string;
  status: string;
  quality: RunQuality;
  reason: string;
  failedExecuteCount: number;
  succeededExecuteCount: number;
  verifiedAfterWrite: boolean;
  failureCard: boolean;
  maxCanvasElementCount: number;
};

const endpoint = process.env.GEOCHAT_DESKTOP_MCP_URL ?? "http://127.0.0.1:17369/mcp";
const backendBaseUrl = process.env.GEOCHAT_DESKTOP_BACKEND_URL ?? "http://127.0.0.1:17365";
const localAuthToken =
  process.env.GEOCHAT_DESKTOP_MCP_AUTH_TOKEN ??
  process.env.GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN ??
  process.env.GEOCHAT_DESKTOP_LOCAL_AUTH_TOKEN;
const pollMs = Number(process.env.GEOCHAT_BATCH_POLL_MS ?? "3000");
const sampleTimeoutMs = Number(process.env.GEOCHAT_BATCH_SAMPLE_TIMEOUT_MS ?? "480000");
const desktopReadyTimeoutMs = Number(process.env.GEOCHAT_BATCH_DESKTOP_READY_TIMEOUT_MS ?? "90000");
const actionClaimTimeoutMs = Number(process.env.GEOCHAT_BATCH_ACTION_CLAIM_TIMEOUT_MS ?? "90000");
const startIndex = Math.max(1, Number(process.env.GEOCHAT_BATCH_START_INDEX ?? "1"));
const cloudBaseUrl = process.env.GEOCHAT_BATCH_CLOUD_BASE_URL ?? "";
const cloudBankSlug = process.env.GEOCHAT_BATCH_CLOUD_BANK_SLUG ?? "";
const onlyIndexes = new Set(
  (process.env.GEOCHAT_BATCH_INDEXES ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0)
);

const defaultProblemIds = [
  "gaokao-full-math-ii-mcq-2010-001",
  "gaokao-full-math-ii-mcq-2010-002",
  "gaokao-full-math-ii-mcq-2010-003",
  "gaokao-full-math-ii-mcq-2010-004",
  "gaokao-full-math-ii-mcq-2010-005",
  "gaokao-full-math-ii-mcq-2010-006",
  "gaokao-full-math-ii-mcq-2010-007",
  "gaokao-full-math-ii-mcq-2010-008",
  "gaokao-full-math-ii-mcq-2011-009",
  "gaokao-full-math-ii-mcq-2011-010",
  "gaokao-full-math-ii-mcq-2011-011",
  "gaokao-full-math-ii-mcq-2011-012",
  "gaokao-full-math-ii-mcq-2011-013",
  "gaokao-full-math-ii-mcq-2011-014",
  "gaokao-full-math-ii-mcq-2011-015",
  "gaokao-full-math-ii-mcq-2011-016",
  "gaokao-full-math-ii-mcq-2012-017",
  "gaokao-full-math-ii-mcq-2012-018",
  "gaokao-full-math-ii-mcq-2012-019",
  "gaokao-full-math-ii-mcq-2012-020"
];

const problemIds = (process.env.GEOCHAT_BATCH_PROBLEM_IDS ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!cloudBaseUrl || !cloudBankSlug) {
  throw new Error("Set GEOCHAT_BATCH_CLOUD_BASE_URL and GEOCHAT_BATCH_CLOUD_BANK_SLUG before running the problem batch tool.");
}

let nextId = 1;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...authHeaders()
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: nextId++,
          method: "tools/call",
          params: { name, arguments: args }
        })
      });
      if (!response.ok) throw new Error(`MCP HTTP ${response.status}: ${await response.text()}`);
      const payload = (await response.json()) as JsonRpcResponse<T>;
      if (payload.error) throw new Error(`MCP JSON-RPC error: ${JSON.stringify(payload.error)}`);
      if (payload.result?.isError) {
        const text = payload.result.content?.find((item) => item.type === "text")?.text ?? "Unknown MCP tool error";
        throw new Error(text);
      }
      const structured = payload.result?.structuredContent;
      if (structured && typeof structured === "object" && "ok" in structured && structured.ok === false) {
        const message = "message" in structured && typeof structured.message === "string"
          ? structured.message
          : JSON.stringify(structured);
        throw new Error(message);
      }
      if (structured) return structured;
      const text = payload.result?.content?.find((item) => item.type === "text")?.text;
      if (!text) throw new Error(`MCP response did not include structuredContent: ${JSON.stringify(payload)}`);
      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("database is locked")) break;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastError;
}

async function waitForActionClaimed(actionId: string) {
  const started = Date.now();
  while (Date.now() - started < actionClaimTimeoutMs) {
    const actions = await callTool<{ ok: boolean; actions: ActionRecord[] }>("list_desktop_debug_actions", { limit: 50 });
    const action = actions.actions.find((item) => item.id === actionId);
    if (action?.status === "claimed" || action?.status === "succeeded") return action;
    if (action?.status === "failed") throw new Error(action.error ?? `Action ${actionId} failed before claim.`);
    await sleep(500);
  }
  throw new Error(`Action ${actionId} was not claimed by the renderer within ${actionClaimTimeoutMs}ms.`);
}

async function waitForActionSucceeded(actionId: string) {
  const started = Date.now();
  while (Date.now() - started < sampleTimeoutMs + 30_000) {
    const actions = await callTool<{ ok: boolean; actions: ActionRecord[] }>("list_desktop_debug_actions", { limit: 80 });
    const action = actions.actions.find((item) => item.id === actionId);
    if (action?.status === "succeeded") return action;
    if (action?.status === "failed") throw new Error(action.error ?? `Action ${actionId} failed.`);
    await sleep(1000);
  }
  throw new Error(`Action ${actionId} did not finish within ${sampleTimeoutMs + 30_000}ms.`);
}

async function waitForDesktopReady() {
  const started = Date.now();
  let latestStatus: unknown;
  while (Date.now() - started < desktopReadyTimeoutMs) {
    const queued = await callTool<{ ok: boolean; action: ActionRecord }>("get_desktop_ui_status", {});
    await waitForActionClaimed(queued.action.id);
    const action = await waitForActionSucceeded(queued.action.id) as ActionRecord;
    latestStatus = action.result;
    const status = action.result as DesktopUiStatus | undefined;
    if (status?.model.hasApiKey && status.mcp.running && !status.running) return status;
    await sleep(1500);
  }
  throw new Error(`Desktop UI was not ready within ${desktopReadyTimeoutMs}ms: ${JSON.stringify(latestStatus)}`);
}

async function recentConversations(limit = 30) {
  return callTool<{ ok: boolean; conversations: RecentConversation[] }>("list_recent_conversations", { limit });
}

async function waitForConversationDone(conversationId: string) {
  const started = Date.now();
  let latest: RecentConversation | undefined;
  while (Date.now() - started < sampleTimeoutMs) {
    const recent = await recentConversations(80);
    latest = recent.conversations.find((conversation) => conversation.id === conversationId);
    if (latest?.latest_run_status && latest.latest_run_status !== "running") return latest;
    await sleep(pollMs);
  }
  if (latest) {
    throw new Error(`Conversation ${conversationId} was still ${latest.latest_run_status ?? "without a run"} after ${sampleTimeoutMs}ms.`);
  }
  throw new Error(`Conversation ${conversationId} did not finish within ${sampleTimeoutMs}ms.`);
}

async function getRunBundle(runId: string) {
  return callTool<{
    ok: boolean;
    run: { run_id: string; status: string; error: string | null; completed_at: number | null };
    toolRequests: Array<{ tool_name: string; status: string; payload: string; error: string | null }>;
    modelSteps: Array<{ status: string; error: string | null }>;
    errors: Array<{ code: string; severity: string; source: string; tool_name: string | null; message: string }>;
  }>("get_agent_run_debug_bundle", { runId, includeFullContent: false });
}

async function getRunQuality(runId: string) {
  const response = await fetch(`${backendBaseUrl}/v1/agent-command-usage?limit=5000`, {
    headers: authHeaders()
  });
  if (!response.ok) throw new Error(`agent-command-usage ${response.status}: ${await response.text()}`);
  const payload = await response.json() as { stats?: { runQualityItems?: RunQualityItem[] } };
  return payload.stats?.runQualityItems?.find((item) => item.runId === runId);
}

function authHeaders(): Record<string, string> {
  return localAuthToken ? { authorization: `Bearer ${localAuthToken}` } : {};
}

async function main() {
  const ids = problemIds.length ? problemIds : defaultProblemIds;
  const scheduledIds = ids.filter((_, index) => {
    const itemIndex = index + 1;
    if (itemIndex < startIndex) return false;
    return onlyIndexes.size === 0 || onlyIndexes.has(itemIndex);
  });
  const startedAt = new Date().toISOString();
  const results: Array<Record<string, unknown>> = [];
  console.log(`GeoChat desktop problem batch started at ${startedAt}`);
  console.log(`MCP endpoint: ${endpoint}`);
  console.log(`Backend: ${backendBaseUrl}`);
  console.log(`Problem count: ${scheduledIds.length}`);
  console.log(`Problem source: ${cloudBaseUrl}/${cloudBankSlug}`);
  const desktopStatus = await waitForDesktopReady();
  console.log(`Desktop ready: ${desktopStatus.model.provider}/${desktopStatus.model.model}, geogebra=${desktopStatus.geogebra.ready}, mcp=${desktopStatus.mcp.running}`);

  for (const [index, problemId] of ids.entries()) {
    const itemIndex = index + 1;
    if (itemIndex < startIndex) continue;
    if (onlyIndexes.size > 0 && !onlyIndexes.has(itemIndex)) continue;
    const conversationId = `batch-${Date.now()}-${String(itemIndex).padStart(2, "0")}`;
    const sent = await callTool<{
      ok: boolean;
      action: ActionRecord;
      problem?: { id?: string; title?: string };
    }>("select_desktop_problem", {
      problemId,
      mode: "send",
      conversationId,
      source: "cloud",
      cloudBaseUrl,
      bankSlug: cloudBankSlug
    });
    await waitForActionClaimed(sent.action.id);
    const action = await waitForActionSucceeded(sent.action.id);
    const completed = await waitForConversationDone(action.result?.conversationId ?? conversationId);
    const runId = completed.latest_run_id;
    const bundle = runId ? await getRunBundle(runId) : undefined;
    const quality = runId ? await getRunQuality(runId).catch(() => undefined) : undefined;
    const result = {
      index: itemIndex,
      problemId,
      title: sent.problem?.title ?? completed.title,
      conversationId: completed.id,
      runId,
      status: completed.latest_run_status,
      quality: quality?.quality ?? "unknown",
      reason: quality?.reason ?? null,
      failedExecuteCount: quality?.failedExecuteCount ?? null,
      succeededExecuteCount: quality?.succeededExecuteCount ?? null,
      maxCanvasElementCount: quality?.maxCanvasElementCount ?? null,
      errorCount: completed.error_count,
      latestErrors: bundle?.errors.slice(0, 3).map((error) => ({
        code: error.code,
        tool: error.tool_name,
        message: error.message.slice(0, 240)
      })) ?? [],
      failedTools: bundle?.toolRequests
        .filter((tool) => tool.status === "failed")
        .map((tool) => ({ tool: tool.tool_name, error: tool.error?.slice(0, 240) ?? null }))
        .slice(0, 6) ?? []
    };
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  const summary = {
    ok: true,
    total: results.length,
    clean_success: results.filter((result) => result.quality === "clean_success").length,
    recovered_success: results.filter((result) => result.quality === "recovered_success").length,
    canvas_failed: results.filter((result) => result.quality === "canvas_failed").length,
    model_failed: results.filter((result) => result.quality === "model_failed").length,
    unknown: results.filter((result) => result.quality === "unknown").length,
    results
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
