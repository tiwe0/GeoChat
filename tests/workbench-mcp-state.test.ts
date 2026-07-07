import { describe, expect, test } from "bun:test";
import { createRoot } from "solid-js";
import type { GeoChatDesktopApi } from "../src/shared/desktop-api";
import {
  createMcpDebugActionPolling,
  createMcpState,
  runMcpDebugActionPollOnce
} from "../src/renderer/src/workbench-mcp-state";
import type { DesktopDebugAction } from "../src/renderer/src/workbench-api";
import type { RendererMcpStatus } from "../src/renderer/src/workbench-types";

const runningMcpStatus: RendererMcpStatus = {
  available: true,
  enabled: true,
  running: true,
  endpoint: "http://127.0.0.1:17369/mcp",
  healthUrl: "http://127.0.0.1:17369/health",
  port: 17369,
  pid: 1234,
  error: null
};

const stoppedMcpStatus: RendererMcpStatus = {
  ...runningMcpStatus,
  enabled: false,
  running: false,
  endpoint: null,
  healthUrl: null,
  pid: null
};

function partialDesktopApi(api: Partial<GeoChatDesktopApi>): GeoChatDesktopApi {
  return api as GeoChatDesktopApi;
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("workbench MCP state runtime boundary", () => {
  test("falls back when desktop MCP APIs are unavailable", async () => {
    await createRoot(async (dispose) => {
      const mcp = createMcpState({
        authToken: () => "token",
        executeDebugAction: async () => ({ ok: true }),
        runtime: {
          desktopRuntime: {
            desktopApi: () => undefined
          }
        }
      });

      await tick();
      const refreshed = await mcp.refresh();

      expect(refreshed.available).toBe(false);
      expect(mcp.status().running).toBe(false);
      expect(mcp.status().endpoint).toBeNull();
      dispose();
    });
  });

  test("sets MCP enabled through the injected desktop API", async () => {
    const calls: boolean[] = [];
    const desktopApi = partialDesktopApi({
      getMcpStatus: async () => stoppedMcpStatus,
      setMcpEnabled: async (enabled) => {
        calls.push(enabled);
        return enabled ? runningMcpStatus : stoppedMcpStatus;
      }
    });

    await createRoot(async (dispose) => {
      const mcp = createMcpState({
        authToken: () => "token",
        executeDebugAction: async () => ({ ok: true }),
        runtime: {
          desktopRuntime: {
            desktopApi: () => desktopApi
          }
        }
      });

      const enabled = await mcp.setEnabled(true);

      expect(calls).toEqual([true]);
      expect(enabled.running).toBe(true);
      expect(mcp.status().endpoint).toBe("http://127.0.0.1:17369/mcp");
      dispose();
    });
  });

  test("polling starts immediately, registers interval, and cleans up fake timers", async () => {
    let intervalHandler: (() => void) | undefined;
    let intervalMs: number | undefined;
    let clearedTimer: number | undefined;
    let fetchCount = 0;

    const dispose = createMcpDebugActionPolling({
      endpoint: "http://127.0.0.1:17369/mcp",
      authToken: () => "token",
      setInterval: ((handler: TimerHandler, timeout?: number) => {
        intervalHandler = typeof handler === "function" ? () => handler() : undefined;
        intervalMs = timeout;
        return 88;
      }) as typeof globalThis.setInterval,
      clearInterval: ((timer?: number) => {
        clearedTimer = timer;
      }) as typeof globalThis.clearInterval,
      fetchNextDebugAction: async () => {
        fetchCount += 1;
        return null;
      },
      reportDebugAction: async () => undefined,
      executeDebugAction: async () => ({ ok: true })
    });

    await tick();
    intervalHandler?.();
    await tick();
    dispose();

    expect(intervalMs).toBe(900);
    expect(fetchCount).toBe(2);
    expect(clearedTimer).toBe(88);
  });

  test("reports debug action success through injected client", async () => {
    const action: DesktopDebugAction = {
      id: "action-1",
      type: "get_ui_status"
    };
    const reports: unknown[] = [];
    let executed: DesktopDebugAction | undefined;

    await runMcpDebugActionPollOnce({
      endpoint: "http://127.0.0.1:17369/mcp",
      authToken: "token",
      busy: () => false,
      setBusy: () => undefined,
      fetchNextDebugAction: async () => action,
      reportDebugAction: async (_endpoint, id, payload, authToken) => {
        reports.push({ id, payload, authToken });
      },
      executeDebugAction: async (input) => {
        executed = input;
        return { ready: true };
      }
    });

    expect(executed).toBe(action);
    expect(reports).toEqual([
      {
        id: "action-1",
        payload: { ok: true, result: { ready: true } },
        authToken: "token"
      }
    ]);
  });

  test("reports debug action failure through injected client", async () => {
    const action: DesktopDebugAction = {
      id: "action-2",
      type: "send_message",
      content: "hello"
    };
    const reports: unknown[] = [];

    await runMcpDebugActionPollOnce({
      endpoint: "http://127.0.0.1:17369/mcp",
      authToken: "token",
      busy: () => false,
      setBusy: () => undefined,
      fetchNextDebugAction: async () => action,
      reportDebugAction: async (_endpoint, id, payload, authToken) => {
        reports.push({ id, payload, authToken });
      },
      executeDebugAction: async () => {
        throw new Error("boom");
      }
    });

    expect(reports).toEqual([
      {
        id: "action-2",
        payload: { ok: false, error: "boom" },
        authToken: "token"
      }
    ]);
  });
});
