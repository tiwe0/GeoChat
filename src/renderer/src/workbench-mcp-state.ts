import { createEffect, createSignal, onCleanup } from "solid-js";
import {
  createMcpDebugActionPolling,
  DEFAULT_MCP_STATUS,
  fetchNextDesktopDebugAction,
  reportDesktopDebugAction,
  runMcpDebugActionPollOnce,
  type DesktopDebugAction
} from "../../shared/desktop/mcp-debug-actions";

// Both are part of this module's public surface and are exercised directly by
// tests/workbench-mcp-state.test.ts.
export { createMcpDebugActionPolling, runMcpDebugActionPollOnce };
import {
  resolveWorkbenchDesktopRuntime,
  type WorkbenchDesktopRuntime
} from "../../shared/desktop/workbench-desktop-runtime";
import type { RendererMcpStatus } from "../../shared/desktop/workbench-types";

export type WorkbenchMcpRuntime = {
  desktopRuntime: WorkbenchDesktopRuntime;
  fetchNextDebugAction: typeof fetchNextDesktopDebugAction;
  reportDebugAction: typeof reportDesktopDebugAction;
};

function resolveWorkbenchMcpRuntime(runtime?: Partial<WorkbenchMcpRuntime>): WorkbenchMcpRuntime {
  return {
    desktopRuntime: resolveWorkbenchDesktopRuntime(runtime?.desktopRuntime),
    fetchNextDebugAction: runtime?.fetchNextDebugAction ?? fetchNextDesktopDebugAction,
    reportDebugAction: runtime?.reportDebugAction ?? reportDesktopDebugAction
  };
}

export function createMcpState(input: {
  authToken: () => string | undefined;
  executeDebugAction: (action: DesktopDebugAction) => Promise<unknown>;
  runtime?: Partial<WorkbenchMcpRuntime>;
}) {
  const runtime = resolveWorkbenchMcpRuntime(input.runtime);
  const [status, setStatus] = createSignal<RendererMcpStatus>(DEFAULT_MCP_STATUS);

  async function refresh() {
    const desktopApi = runtime.desktopRuntime.desktopApi();
    if (!desktopApi?.getMcpStatus) {
      setStatus(DEFAULT_MCP_STATUS);
      return DEFAULT_MCP_STATUS;
    }
    const nextStatus = await desktopApi.getMcpStatus().catch((error) => ({
      ...DEFAULT_MCP_STATUS,
      available: true,
      error: error instanceof Error ? error.message : String(error)
    }));
    const normalized = { ...nextStatus, available: nextStatus.available ?? true };
    setStatus(normalized);
    return normalized;
  }

  async function setEnabled(enabled: boolean) {
    const desktopApi = runtime.desktopRuntime.desktopApi();
    if (!desktopApi?.setMcpEnabled) return refresh();
    const nextStatus = await desktopApi.setMcpEnabled(enabled).catch((error) => ({
      ...status(),
      enabled: false,
      running: false,
      error: error instanceof Error ? error.message : String(error)
    }));
    const normalized = { ...nextStatus, available: nextStatus.available ?? true };
    setStatus(normalized);
    return normalized;
  }

  void refresh();

  createEffect(() => {
    const current = status();
    const desktopApi = runtime.desktopRuntime.desktopApi();
    if (!current.enabled || !current.running || !current.endpoint || !desktopApi) return;
    const endpoint = current.endpoint;
    const disposePolling = createMcpDebugActionPolling({
        endpoint,
        authToken: input.authToken,
        setInterval: runtime.desktopRuntime.setInterval,
        clearInterval: runtime.desktopRuntime.clearInterval,
        fetchNextDebugAction: runtime.fetchNextDebugAction,
        reportDebugAction: runtime.reportDebugAction,
        executeDebugAction: input.executeDebugAction
    });
    onCleanup(disposePolling);
  });

  return {
    refresh,
    setEnabled,
    status
  };
}
