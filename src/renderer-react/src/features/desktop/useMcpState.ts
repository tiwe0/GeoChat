import { useCallback, useEffect, useRef, useState } from "react";
import {
  createMcpDebugActionPolling,
  DEFAULT_MCP_STATUS,
  fetchNextDesktopDebugAction,
  reportDesktopDebugAction,
  type DesktopDebugAction
} from "../../../../shared/desktop/mcp-debug-actions";
import type { RendererMcpStatus } from "../../../../shared/desktop/workbench-types";

/**
 * The local MCP server's status, and the poll loop that serves it.
 *
 * The server holds no canvas, so it queues actions and waits for the renderer
 * to run them. Polling therefore has to live wherever the app is mounted, not
 * where the toggle is rendered — a server left running with nothing polling
 * accepts every request and answers none.
 */
export function useMcpState(input: {
  authToken: () => string | undefined;
  executeDebugAction: (action: DesktopDebugAction) => Promise<unknown>;
}) {
  const [status, setStatus] = useState<RendererMcpStatus>(DEFAULT_MCP_STATUS);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(input);
  inputRef.current = input;

  const refresh = useCallback(async () => {
    const api = window.geochatDesktop;
    if (!api?.getMcpStatus) {
      setStatus(DEFAULT_MCP_STATUS);
      return;
    }
    const next = await api.getMcpStatus().catch((error) => ({
      ...DEFAULT_MCP_STATUS,
      available: true,
      error: error instanceof Error ? error.message : String(error)
    }));
    setStatus({ ...next, available: next.available ?? true });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    const api = window.geochatDesktop;
    if (!api?.setMcpEnabled) return refresh();
    setBusy(true);
    try {
      const next = await api.setMcpEnabled(enabled).catch((error) => ({
        ...DEFAULT_MCP_STATUS,
        available: true,
        enabled: false,
        running: false,
        error: error instanceof Error ? error.message : String(error)
      }));
      setStatus({ ...next, available: next.available ?? true });
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const endpoint = status.enabled && status.running ? status.endpoint : null;
  useEffect(() => {
    if (!endpoint || !window.geochatDesktop) return;
    return createMcpDebugActionPolling({
      endpoint,
      authToken: () => inputRef.current.authToken(),
      setInterval: (handler, ms) => window.setInterval(handler, ms),
      clearInterval: (handle) => window.clearInterval(handle),
      fetchNextDebugAction: fetchNextDesktopDebugAction,
      reportDebugAction: reportDesktopDebugAction,
      executeDebugAction: (action) => inputRef.current.executeDebugAction(action)
    });
  }, [endpoint]);

  return { status, busy, refresh, setEnabled };
}

export type McpController = ReturnType<typeof useMcpState>;
