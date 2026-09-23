/**
 * The MCP debug-action channel, shared between renderers.
 *
 * The desktop can run a local MCP server so an external client drives the
 * canvas. The server cannot touch the canvas itself — only the renderer holds
 * the applet — so it queues actions and the renderer polls for them, executes
 * them, and reports back. That transport is identical in both renderers; only
 * the executor differs, because it reaches into renderer-specific surfaces.
 */
import type { RendererMcpStatus } from "./workbench-types";

export type DesktopDebugAction =
  | {
      id: string;
      type: "get_ui_status";
    }
  | {
      id: string;
      type: "export_png";
      exportScale?: number;
      transparent?: boolean;
      dpi?: number;
    }
  | {
      id: string;
      type: "execute_geogebra_tool";
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      id: string;
      type: "send_message";
      conversationId?: string;
      content: string;
    };

export const DEFAULT_MCP_STATUS: RendererMcpStatus = {
  available: false,
  enabled: false,
  running: false,
  endpoint: null,
  healthUrl: null,
  port: 17369,
  pid: null,
  error: null
};

export const MCP_DEBUG_ACTION_POLL_INTERVAL_MS = 900;

function authHeaders(authToken?: string): HeadersInit {
  return authToken ? { authorization: `Bearer ${authToken}` } : {};
}

export function desktopMcpHttpBase(endpoint: string | null | undefined) {
  return endpoint?.replace(/\/mcp\/?$/, "") ?? "";
}

export async function fetchNextDesktopDebugAction(endpoint: string, authToken?: string) {
  const response = await fetch(`${desktopMcpHttpBase(endpoint)}/debug-actions/next`, {
    headers: authHeaders(authToken)
  });
  if (!response.ok) throw new Error(`MCP debug action poll failed: ${response.status}`);
  const payload = await response.json() as { action?: DesktopDebugAction | null };
  return payload.action ?? null;
}

export async function reportDesktopDebugAction(endpoint: string, id: string, payload: { ok: boolean; result?: unknown; error?: string }, authToken?: string) {
  const response = await fetch(`${desktopMcpHttpBase(endpoint)}/debug-actions/${encodeURIComponent(id)}/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(authToken) },
    body: JSON.stringify(payload)
  });
  if (response.ok) return;
  const detail = (await response.text().catch(() => "")).trim();
  throw new Error([
    `MCP debug action report failed: ${response.status} ${response.statusText}`.trim(),
    detail
  ].filter(Boolean).join(" - "));
}

/**
 * A failed action is still reported. Leaving the server waiting on an action
 * the renderer already gave up on is worse than reporting the failure: the
 * client hangs instead of seeing why.
 */
export async function runMcpDebugActionPollOnce(input: {
  endpoint: string;
  authToken?: string;
  busy: () => boolean;
  setBusy: (busy: boolean) => void;
  fetchNextDebugAction: typeof fetchNextDesktopDebugAction;
  reportDebugAction: typeof reportDesktopDebugAction;
  executeDebugAction: (action: DesktopDebugAction) => Promise<unknown>;
  isCancelled?: () => boolean;
}) {
  if (input.isCancelled?.() || input.busy()) return;
  input.setBusy(true);
  let action: DesktopDebugAction | null = null;
  try {
    try {
      action = await input.fetchNextDebugAction(input.endpoint, input.authToken);
    } catch (error) {
      console.error("[ERROR] Failed to poll the desktop MCP debug-action queue", error);
      return;
    }
    if (!action || input.isCancelled?.()) return;

    let result: unknown;
    try {
      result = await input.executeDebugAction(action);
    } catch (error) {
      console.error("[ERROR] Failed to execute the desktop MCP debug action", error);
      await input.reportDebugAction(input.endpoint, action.id, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }, input.authToken);
      return;
    }
    await input.reportDebugAction(input.endpoint, action.id, { ok: true, result }, input.authToken);
  } finally {
    input.setBusy(false);
  }
}

export function createMcpDebugActionPolling(input: {
  endpoint: string;
  authToken: () => string | undefined;
  setInterval: (handler: () => void, ms: number) => number;
  clearInterval: (handle: number) => void;
  fetchNextDebugAction: typeof fetchNextDesktopDebugAction;
  reportDebugAction: typeof reportDesktopDebugAction;
  executeDebugAction: (action: DesktopDebugAction) => Promise<unknown>;
}) {
  let cancelled = false;
  let debugActionBusy = false;

  async function poll() {
    await runMcpDebugActionPollOnce({
      endpoint: input.endpoint,
      authToken: input.authToken(),
      busy: () => debugActionBusy,
      setBusy: (busy) => {
        debugActionBusy = busy;
      },
      fetchNextDebugAction: input.fetchNextDebugAction,
      reportDebugAction: input.reportDebugAction,
      executeDebugAction: input.executeDebugAction,
      isCancelled: () => cancelled
    }).catch((error) => {
      console.error("[ERROR] Failed to report the desktop MCP debug-action result", error);
    });
  }

  void poll();
  const timer = input.setInterval(() => void poll(), MCP_DEBUG_ACTION_POLL_INTERVAL_MS);
  return () => {
    cancelled = true;
    input.clearInterval(timer);
  };
}
