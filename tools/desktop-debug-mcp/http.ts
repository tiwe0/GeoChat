import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createGeoChatDesktopDebugServer } from "./index";
import { readConfig } from "./config";
import { createDesktopDebugActionQueue } from "./debug-actions";

const host = process.env.GEOCHAT_DESKTOP_MCP_HOST ?? "127.0.0.1";
const port = readPort(process.env.GEOCHAT_DESKTOP_MCP_PORT, 17369);
const endpoint = `http://${host}:${port}/mcp`;
const config = readConfig();
const actions = createDesktopDebugActionQueue();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version"
};

const server = Bun.serve({
  hostname: host,
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }
    const authResponse = authorizeMcpRequest(request);
    if (authResponse) return authResponse;
    if (url.pathname === "/health") {
      return json({
        ok: true,
        name: "geochat-desktop-debug-mcp",
        transport: "streamable-http",
        endpoint,
        databasePath: config.databasePath,
        backendBaseUrl: config.backendBaseUrl,
        readonly: true
      });
    }
    if (request.method === "GET" && url.pathname === "/debug-actions") {
      return json({ ok: true, actions: actions.list(readLimit(url.searchParams.get("limit"), 30)) });
    }
    if (request.method === "GET" && url.pathname === "/debug-actions/next") {
      return json({ ok: true, action: actions.claimNext() ?? null });
    }
    const debugActionResult = debugActionResultPath(url.pathname);
    if (request.method === "POST" && debugActionResult) {
      const payload = await request.json().catch(() => ({})) as { ok?: unknown; result?: unknown; error?: unknown };
      const action = payload.ok === false
        ? actions.fail(debugActionResult, typeof payload.error === "string" ? payload.error : "Desktop debug action failed.")
        : actions.complete(debugActionResult, payload.result ?? { ok: true });
      if (!action) return json({ ok: false, error: "Debug action was not found." }, 404);
      return json({ ok: true, action });
    }
    if (url.pathname !== "/mcp") {
      return json({ ok: false, error: "Not found" }, 404);
    }
    if (request.method !== "POST") {
      return json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed. Use Streamable HTTP POST /mcp."
        },
        id: null
      }, 405);
    }

    const { server: mcpServer } = createGeoChatDesktopDebugServer({ actions });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: [`${host}:${port}`, `127.0.0.1:${port}`, `localhost:${port}`],
      allowedOrigins: [`http://${host}:${port}`, `http://127.0.0.1:${port}`, `http://localhost:${port}`]
    });

    try {
      await mcpServer.connect(transport);
      const response = await transport.handleRequest(request);
      return withCors(response);
    } catch (error) {
      return json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal MCP server error"
        },
        id: null
      }, 500);
    } finally {
      await transport.close().catch(() => undefined);
      await mcpServer.close().catch(() => undefined);
    }
  }
});

console.log(JSON.stringify({
  ok: true,
  name: "geochat-desktop-debug-mcp",
  transport: "streamable-http",
  endpoint,
  health: `http://${host}:${port}/health`,
  databasePath: config.databasePath,
  backendBaseUrl: config.backendBaseUrl
}));

function json(payload: unknown, status = 200) {
  return withCors(new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  }));
}

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function authorizeMcpRequest(request: Request) {
  if (!config.mcpAuthToken) return undefined;
  if (request.headers.get("authorization") === `Bearer ${config.mcpAuthToken}`) return undefined;
  return json({
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Desktop MCP requests require the local runtime authorization token."
    },
    id: null
  }, 401);
}

function readPort(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : fallback;
}

function readLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 200) : fallback;
}

function debugActionResultPath(pathname: string) {
  const match = pathname.match(/^\/debug-actions\/([^/]+)\/result$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

process.once("SIGINT", () => {
  server.stop(true);
  process.exit(0);
});
process.once("SIGTERM", () => {
  server.stop(true);
  process.exit(0);
});
