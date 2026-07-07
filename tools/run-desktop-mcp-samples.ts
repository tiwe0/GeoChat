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

const endpoint = process.env.GEOCHAT_DESKTOP_MCP_URL ?? "http://127.0.0.1:17369/mcp";
const pollMs = 3000;
const sampleTimeoutMs = 180_000;
const actionClaimTimeoutMs = 90_000;
const desktopReadyTimeoutMs = 90_000;
const startIndex = Math.max(1, Number(process.env.GEOCHAT_DESKTOP_MCP_SAMPLE_START_INDEX ?? "1"));
const onlyIndexes = new Set(
  (process.env.GEOCHAT_DESKTOP_MCP_SAMPLE_INDEXES ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0)
);

const samples = [
  "画出抛物线 y = x^2，标出顶点和对称轴，并说明图形如何支持结论。",
  "画出直线 y = 2x + 1 和抛物线 y = x^2，求并标出交点。",
  "构造一个以 F(-2,0)、G(2,0) 为焦点，并经过 A(0,3) 的椭圆。",
  "画出函数 y = sin(x) 和 y = cos(x)，标出它们在 [0, 2π] 内的交点。",
  "构造三角形 ABC，其中 A(0,0)、B(4,0)、C(1,3)，画出外接圆和三条中线。",
  "画出单位圆，并标出角 60° 对应的点、正弦线和余弦线。",
  "画出双曲线 x^2/4 - y^2 = 1，标出两个焦点和渐近线。",
  "构造点 A(2,1)，点 B(-1,3)，画出线段 AB，并计算长度。",
  "画出函数 y = e^x 在 x = 0 处的切线，并说明切线与曲线的关系。",
  "构造一个滑块 a，并画出 y = a x^2，展示 a 改变时抛物线开口变化。",
  "画出圆 C: (x-1)^2 + (y+2)^2 = 9，标出圆心和半径。",
  "画出椭圆 x^2/9 + y^2/4 = 1，标出长轴、短轴和焦点。",
  "构造正方形 ABCD，A(0,0)、B(2,0)，并画出两条对角线。",
  "画出函数 y = ln(x)，标出点 (1,0)，并说明定义域。",
  "画出 y = |x|，标出拐点，并说明左右两段斜率。",
  "在 3D 画板中构造棱长为 2 的正方体 ABCD-A1B1C1D1，并标出顶点。",
  "在 3D 画板中画出平面 z = 1 和直线 x = y, z = 0，说明它们是否相交。",
  "构造一个圆和圆上一点 P，画出 P 点处切线。",
  "画出参数曲线 x = cos(t), y = sin(t)，0 ≤ t ≤ 2π，并说明它是单位圆。",
  "给出一个可拖动点 P，画出它到原点 O 的距离，并用文本说明距离如何变化。"
];

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
          accept: "application/json, text/event-stream"
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

async function recentConversations(limit = 10) {
  return callTool<{
    ok: boolean;
    conversations: Array<{
      id: string;
      title: string;
      summary: string | null;
      latest_run_id: string | null;
      latest_run_status: string | null;
      message_count: number;
      error_count: number;
      created_at: number;
      updated_at: number;
    }>;
  }>("list_recent_conversations", { limit });
}

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []) {
  return callTool<{ ok: boolean; rows: T[] }>("safe_sqlite_select", { sql: query, params });
}

async function waitForActionClaimed(actionId: string) {
  const started = Date.now();
  while (Date.now() - started < actionClaimTimeoutMs) {
    const actions = await callTool<{
      ok: boolean;
      actions: Array<{ id: string; status: string; claimedAt?: string | null }>;
    }>("list_desktop_debug_actions", { limit: 20 });
    const action = actions.actions.find((item) => item.id === actionId);
    if (action?.status === "claimed" || action?.status === "succeeded") return action;
    if (action?.status === "failed") throw new Error(`Action ${actionId} failed before claim.`);
    await sleep(500);
  }
  throw new Error(`Action ${actionId} was not claimed by the renderer within ${actionClaimTimeoutMs}ms.`);
}

async function waitForActionSucceeded(actionId: string) {
  const started = Date.now();
  while (Date.now() - started < sampleTimeoutMs + 30_000) {
    const actions = await callTool<{
      ok: boolean;
      actions: Array<{ id: string; status: string; result?: { conversationId?: string }; error?: string | null }>;
    }>("list_desktop_debug_actions", { limit: 50 });
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
    const queued = await callTool<{
      ok: boolean;
      action: { id: string; status: string };
    }>("get_desktop_ui_status", {});
    await waitForActionClaimed(queued.action.id);
    const action = await waitForActionSucceeded(queued.action.id) as { result?: DesktopUiStatus };
    latestStatus = action.result;
    if (action.result?.model?.hasApiKey && action.result?.geogebra?.ready && !action.result.running) {
      return action.result;
    }
    await sleep(1500);
  }
  throw new Error(`Desktop UI was not ready within ${desktopReadyTimeoutMs}ms: ${JSON.stringify(latestStatus)}`);
}

async function waitForConversationDone(conversationId: string) {
  const started = Date.now();
  let latest: Awaited<ReturnType<typeof recentConversations>>["conversations"][number] | undefined;
  while (Date.now() - started < sampleTimeoutMs) {
    const recent = await recentConversations(30);
    latest = recent.conversations.find((conversation) => conversation.id === conversationId);
    if (latest && latest.latest_run_status && latest.latest_run_status !== "running") return latest;
    await sleep(pollMs);
  }
  if (latest) throw new Error(`Conversation ${conversationId} was still ${latest.latest_run_status ?? "without a run"} after ${sampleTimeoutMs}ms.`);
  throw new Error(`Conversation ${conversationId} did not finish within ${sampleTimeoutMs}ms.`);
}

async function readRunDetails(runId: string | null) {
  if (!runId) return { errors: [], tools: [], messages: [] };
  await waitForLedgerVisible(runId);
  const [errors, tools, messages] = await Promise.all([
    sql<{ code: string; severity: string; source: string; tool_name: string | null; message: string; created_at: number }>(
      "select code, severity, source, tool_name, message, created_at from agent_error_events where run_id = ? order by created_at desc limit 5",
      [runId]
    ),
    sql<{ tool_name: string; status: string; payload: string; completed_at: number | null }>(
      "select tool_name, status, payload, completed_at from agent_run_remote_tool_requests where run_id = ? order by requested_at asc",
      [runId]
    ),
    sql<{ role: string; content: string | null; created_at: number }>(
      "select role, content, created_at from conversation_messages where conversation_id = (select conversation_id from agent_run_ledgers where run_id = ?) order by created_at asc",
      [runId]
    )
  ]);
  return {
    errors: errors.rows,
    tools: tools.rows,
    messages: messages.rows
  };
}

async function waitForLedgerVisible(runId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await sql<{ run_id: string }>("select run_id from agent_run_ledgers where run_id = ? limit 1", [runId]);
    if (result.rows.length > 0) return;
    await sleep(250);
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const results: Array<Record<string, unknown>> = [];
  console.log(`GeoChat desktop MCP sample test started at ${startedAt}`);
  console.log(`MCP endpoint: ${endpoint}`);
  const desktopStatus = await waitForDesktopReady();
  console.log(`Desktop ready: ${desktopStatus.model.provider}/${desktopStatus.model.model}, geogebra=${desktopStatus.geogebra.ready}`);

  for (const [index, content] of samples.entries()) {
    if (index + 1 < startIndex) continue;
    if (onlyIndexes.size > 0 && !onlyIndexes.has(index + 1)) continue;
    const conversationId = `mcp${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
    const sent = await callTool<{
      ok: boolean;
      action: { id: string; status: string };
      note?: string;
    }>("send_desktop_message", { content, conversationId });
    await waitForActionClaimed(sent.action.id);
    const action = await waitForActionSucceeded(sent.action.id);
    const completed = await waitForConversationDone(action.result?.conversationId ?? conversationId);
    const details = await readRunDetails(completed.latest_run_id);
    const result = {
      index: index + 1,
      prompt: content,
      conversationId: completed.id,
      runId: completed.latest_run_id,
      status: completed.latest_run_status,
      messageCount: completed.message_count,
      errorCount: completed.error_count,
      summary: completed.summary,
      toolCount: details.tools.length,
      failedTools: details.tools.filter((tool) => tool.status === "failed").map((tool) => ({ tool: tool.tool_name, payload: tool.payload.slice(0, 240) })),
      latestErrors: details.errors.map((error) => ({ code: error.code, tool: error.tool_name, message: error.message })),
      assistantPreview: details.messages.find((message) => message.role === "assistant")?.content?.slice(0, 180) ?? ""
    };
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  const succeeded = results.filter((result) => result.status === "succeeded").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const other = results.length - succeeded - failed;
  console.log(
    JSON.stringify(
      {
        ok: true,
        total: results.length,
        succeeded,
        failed,
        other,
        results
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
