import { createEffect, createSignal, onCleanup } from "solid-js";
import {
  fetchNextDesktopDebugAction,
  reportDesktopDebugAction,
  type DesktopDebugAction
} from "./workbench-api";
import {
  resolveWorkbenchDesktopRuntime,
  type WorkbenchDesktopRuntime
} from "./workbench-desktop-runtime";
import type { RendererMcpStatus } from "./workbench-types";

const DEFAULT_MCP_STATUS: RendererMcpStatus = {
  available: false,
  enabled: false,
  running: false,
  endpoint: null,
  healthUrl: null,
  port: 17369,
  pid: null,
  error: null
};

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
    action = await input.fetchNextDebugAction(input.endpoint, input.authToken);
    if (!action || input.isCancelled?.()) return;
    const result = await input.executeDebugAction(action);
    await input.reportDebugAction(input.endpoint, action.id, { ok: true, result }, input.authToken);
  } catch (error) {
    if (action) {
      await input.reportDebugAction(input.endpoint, action.id, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }, input.authToken);
    }
  } finally {
    input.setBusy(false);
  }
}

export function createMcpDebugActionPolling(input: {
  endpoint: string;
  authToken: () => string | undefined;
  setInterval: WorkbenchDesktopRuntime["setInterval"];
  clearInterval: WorkbenchDesktopRuntime["clearInterval"];
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
    });
  }

  void poll();
  const timer = input.setInterval(() => void poll(), 900);
  return () => {
    cancelled = true;
    input.clearInterval(timer);
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
