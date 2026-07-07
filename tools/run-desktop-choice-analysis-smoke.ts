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

type ActionRecord = {
  id: string;
  status: string;
  result?: { conversationId?: string; [key: string]: unknown };
  error?: string | null;
};

type RecentConversation = {
  id: string;
  latest_run_id: string | null;
  latest_run_status: string | null;
  message_count: number;
  error_count: number;
};

type RunBundle = {
  run: { run_id: string; status: string; error: string | null; payload?: unknown };
  toolRequests: Array<{ tool_name: string; status: string; payload: unknown; error: string | null }>;
  errors: Array<{ code: string; severity: string; source: string; tool_name: string | null; message: string }>;
};

type LedgerTool = {
  toolCallId?: string;
  toolName?: string;
  status?: string;
  args?: unknown;
  result?: unknown;
  error?: string | null;
};

const endpoint = process.env.GEOCHAT_DESKTOP_MCP_URL ?? "http://127.0.0.1:17369/mcp";
const localAuthToken =
  process.env.GEOCHAT_DESKTOP_MCP_AUTH_TOKEN ??
  process.env.GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN ??
  process.env.GEOCHAT_DESKTOP_LOCAL_AUTH_TOKEN;
const pollMs = Number(process.env.GEOCHAT_CHOICE_SMOKE_POLL_MS ?? "3000");
const sampleTimeoutMs = Number(process.env.GEOCHAT_CHOICE_SMOKE_TIMEOUT_MS ?? "240000");
const actionClaimTimeoutMs = Number(process.env.GEOCHAT_CHOICE_SMOKE_ACTION_TIMEOUT_MS ?? "90000");
const desktopReadyTimeoutMs = Number(process.env.GEOCHAT_CHOICE_SMOKE_DESKTOP_READY_TIMEOUT_MS ?? "90000");
const prompt =
  process.env.GEOCHAT_CHOICE_SMOKE_PROMPT ??
  [
    "这是一个选择题场景，请按题干公共条件和 A/B/C/D 独立选项场景来展示。",
    "题干：在三角形 ABC 中，A(0,0)、B(4,0)、C(1,3)，M 是 AB 的中点。",
    "判断下列结论正误：",
    "A. AM = MB。",
    "B. M 在 AC 上。",
    "C. 直线 CM 是三角形 ABC 的一条中线。",
    "D. CM 垂直 AB。",
    "请先构造公共底图，再使用 showChoiceAnalysis 分别给出 A、B、C、D 的 verdict、理由和每个选项必要的 commands。"
  ].join("\n");

let nextId = 1;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authHeaders(): Record<string, string> {
  return localAuthToken ? { authorization: `Bearer ${localAuthToken}` } : {};
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
    const actions = await callTool<{ actions: ActionRecord[] }>("list_desktop_debug_actions", { limit: 50 });
    const action = actions.actions.find((item) => item.id === actionId);
    if (action?.status === "claimed" || action?.status === "succeeded") return action;
    if (action?.status === "failed") throw new Error(action.error ?? `Action ${actionId} failed before claim.`);
    await sleep(500);
  }
  throw new Error(`Action ${actionId} was not claimed within ${actionClaimTimeoutMs}ms.`);
}

async function waitForActionSucceeded(actionId: string) {
  const started = Date.now();
  while (Date.now() - started < sampleTimeoutMs + 30_000) {
    const actions = await callTool<{ actions: ActionRecord[] }>("list_desktop_debug_actions", { limit: 80 });
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
    const queued = await callTool<{ action: ActionRecord }>("get_desktop_ui_status", {});
    await waitForActionClaimed(queued.action.id);
    const action = await waitForActionSucceeded(queued.action.id);
    latestStatus = action.result;
    const status = action.result as DesktopUiStatus | undefined;
    if (status?.model.hasApiKey && status.geogebra.ready && status.mcp.running && !status.running) return status;
    await sleep(1500);
  }
  throw new Error(`Desktop UI was not ready within ${desktopReadyTimeoutMs}ms: ${JSON.stringify(latestStatus)}`);
}

async function recentConversations(limit = 30) {
  return callTool<{ conversations: RecentConversation[] }>("list_recent_conversations", { limit });
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
  throw new Error(`Conversation ${conversationId} was still ${latest?.latest_run_status ?? "without a run"} after ${sampleTimeoutMs}ms.`);
}

async function getRunBundle(runId: string) {
  return callTool<{ run: RunBundle["run"]; toolRequests: RunBundle["toolRequests"]; errors: RunBundle["errors"] }>(
    "get_agent_run_debug_bundle",
    { runId, includeFullContent: true }
  );
}

function ledgerToolsFromRun(run: RunBundle["run"]): LedgerTool[] {
  if (!run.payload) return [];
  try {
    const payload = typeof run.payload === "string" ? JSON.parse(run.payload) as { tools?: unknown } : run.payload as { tools?: unknown };
    return Array.isArray(payload.tools) ? payload.tools.filter((tool): tool is LedgerTool => Boolean(tool && typeof tool === "object")) : [];
  } catch {
    return [];
  }
}

function parseChoiceAnalysisCard(tool: LedgerTool) {
  const result = tool.result;
  if (result && typeof result === "object" && "result" in result) {
    const card = (result as { result?: unknown }).result;
    if (card && typeof card === "object") {
      const choices = (card as { choices?: unknown }).choices;
      return Array.isArray(choices) ? { card, choices } : undefined;
    }
  }
  const args = tool.args;
  if (args && typeof args === "object") {
    const choices = (args as { choices?: unknown }).choices;
    return Array.isArray(choices) ? { card: args, choices } : undefined;
  }
  return undefined;
}

function parseChoiceAnalysisPayload(tool: RunBundle["toolRequests"][number]) {
  try {
    const payload = typeof tool.payload === "string" ? JSON.parse(tool.payload) as { args?: unknown; result?: { result?: unknown } } : tool.payload as { args?: unknown; result?: { result?: unknown } };
    const card = payload.result?.result ?? payload.args;
    if (!card || typeof card !== "object") return undefined;
    const choices = (card as { choices?: unknown }).choices;
    return Array.isArray(choices) ? { card, choices } : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  console.log(`GeoChat desktop choice analysis smoke: ${new Date().toISOString()}`);
  console.log(`MCP endpoint: ${endpoint}`);
  const desktopStatus = await waitForDesktopReady();
  console.log(`Desktop ready: ${desktopStatus.model.provider}/${desktopStatus.model.model}`);

  const conversationId = `choice-smoke-${Date.now()}`;
  const sent = await callTool<{ action: ActionRecord }>("send_desktop_message", { content: prompt, conversationId });
  await waitForActionClaimed(sent.action.id);
  const action = await waitForActionSucceeded(sent.action.id);
  const completed = await waitForConversationDone(action.result?.conversationId ?? conversationId);
  if (!completed.latest_run_id) throw new Error(`Conversation ${completed.id} completed without a run id.`);
  const bundle = await getRunBundle(completed.latest_run_id);
  const ledgerTools = ledgerToolsFromRun(bundle.run);
  const choiceTool = ledgerTools.find((tool) => tool.toolName === "showChoiceAnalysis");
  const parsed = choiceTool ? parseChoiceAnalysisCard(choiceTool) : undefined;
  const remoteChoiceTool = bundle.toolRequests.find((tool) => tool.tool_name === "showChoiceAnalysis");
  const remoteParsed = remoteChoiceTool ? parseChoiceAnalysisPayload(remoteChoiceTool) : undefined;
  const labels = parsed?.choices
    .map((choice) => (choice && typeof choice === "object" ? (choice as { label?: unknown }).label : undefined))
    .filter(Boolean);
  const remoteLabels = remoteParsed?.choices
    .map((choice) => (choice && typeof choice === "object" ? (choice as { label?: unknown }).label : undefined))
    .filter(Boolean);
  const choiceStatus = choiceTool?.status ?? remoteChoiceTool?.status ?? null;
  const choiceLabels = labels?.length ? labels : remoteLabels;
  const ok = completed.latest_run_status === "succeeded" && choiceStatus === "succeeded" && choiceLabels?.length === 4;
  const summary = {
    ok,
    conversationId: completed.id,
    runId: completed.latest_run_id,
    runStatus: completed.latest_run_status,
    messageCount: completed.message_count,
    errorCount: completed.error_count,
    showChoiceAnalysisStatus: choiceStatus,
    choiceLabels: choiceLabels ?? [],
    ledgerToolNames: ledgerTools.map((tool) => `${tool.toolName}:${tool.status}`),
    remoteToolNames: bundle.toolRequests.map((tool) => `${tool.tool_name}:${tool.status}`),
    latestErrors: bundle.errors.slice(0, 5).map((error) => ({
      code: error.code,
      tool: error.tool_name,
      message: error.message.slice(0, 240)
    }))
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
