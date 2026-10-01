import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  createMcpDebugActionPolling,
  desktopMcpHttpBase,
  MCP_DEBUG_ACTION_POLL_INTERVAL_MS,
  reportDesktopDebugAction,
  runMcpDebugActionPollOnce,
  type DesktopDebugAction
} from "../src/shared/desktop/mcp-debug-actions";
import {
  createTestProviderCleanupState,
  finalizeTestProviderProfile,
  recordTestProviderRecoveryFailure,
} from "../tools/desktop-debug-e2e/evidence";
import {
  createDesktopDebugActionQueue,
  desktopDebugActionFailureDetails,
} from "../tools/desktop-debug-mcp/debug-actions";

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("MCP debug-action transport", () => {
  test("keeps localhost MCP authorization opt-in instead of reusing the backend token", async () => {
    const source = await readFile("src-tauri/src/sidecar.rs", "utf8");
    const start = source.indexOf("pub(crate) fn start_desktop_mcp");
    const end = source.indexOf("\nfn capture_child_output", start);
    const launcher = source.slice(start, end);

    expect(launcher).toContain('.env("GEOCHAT_DESKTOP_MCP_HOST", "127.0.0.1")');
    expect(launcher).toContain('"GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN"');
    expect(launcher).not.toContain('"GEOCHAT_DESKTOP_MCP_AUTH_TOKEN"');
  });

  test("derives the HTTP base from the MCP endpoint", () => {
    expect(desktopMcpHttpBase("http://127.0.0.1:17369/mcp")).toBe("http://127.0.0.1:17369");
    expect(desktopMcpHttpBase("http://127.0.0.1:17369/mcp/")).toBe("http://127.0.0.1:17369");
    expect(desktopMcpHttpBase(null)).toBe("");
  });

  test("rejects a debug-action result response that the server did not accept", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("queue unavailable", {
      status: 503,
      statusText: "Service Unavailable"
    })) as typeof fetch;

    try {
      await expect(reportDesktopDebugAction(
        "http://127.0.0.1:17369/mcp",
        "action/1",
        { ok: true, result: { ready: true } },
        "token"
      )).rejects.toThrow(/503.*queue unavailable/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("polling runs once immediately and then on the interval, and cleans up", async () => {
    let intervalHandler: (() => void) | undefined;
    let intervalMs: number | undefined;
    let clearedTimer: number | undefined;
    let fetchCount = 0;

    const dispose = createMcpDebugActionPolling({
      endpoint: "http://127.0.0.1:17369/mcp",
      authToken: () => "token",
      setInterval: ((handler: () => void, timeout?: number) => {
        intervalHandler = handler;
        intervalMs = timeout;
        return 88;
      }) as never,
      clearInterval: ((timer?: number) => { clearedTimer = timer; }) as never,
      fetchNextDebugAction: async () => { fetchCount += 1; return null; },
      reportDebugAction: async () => undefined,
      executeDebugAction: async () => ({ ok: true })
    });

    await tick();
    intervalHandler?.();
    await tick();
    dispose();

    expect(intervalMs).toBe(MCP_DEBUG_ACTION_POLL_INTERVAL_MS);
    expect(fetchCount).toBe(2);
    expect(clearedTimer).toBe(88);
  });

  test("reports a successful action back to the server", async () => {
    const action: DesktopDebugAction = { id: "action-1", type: "get_ui_status" };
    const reports: unknown[] = [];
    let executed: DesktopDebugAction | undefined;

    await runMcpDebugActionPollOnce({
      endpoint: "http://127.0.0.1:17369/mcp",
      authToken: "token",
      busy: () => false,
      setBusy: () => undefined,
      fetchNextDebugAction: async () => action,
      reportDebugAction: async (_endpoint, id, payload, authToken) => { reports.push({ id, payload, authToken }); },
      executeDebugAction: async (input) => { executed = input; return { ready: true }; }
    });

    expect(executed).toBe(action);
    expect(reports).toEqual([{ id: "action-1", payload: { ok: true, result: { ready: true } }, authToken: "token" }]);
  });

  test("a failed action is still reported, so the client is not left hanging", async () => {
    const reports: unknown[] = [];
    await runMcpDebugActionPollOnce({
      endpoint: "http://127.0.0.1:17369/mcp",
      authToken: "token",
      busy: () => false,
      setBusy: () => undefined,
      fetchNextDebugAction: async () => ({ id: "action-2", type: "send_message", content: "hello" }),
      reportDebugAction: async (_endpoint, id, payload, authToken) => { reports.push({ id, payload, authToken }); },
      executeDebugAction: async () => { throw new Error("boom"); }
    });

    expect(reports).toEqual([{ id: "action-2", payload: { ok: false, error: "boom" }, authToken: "token" }]);
  });

  test("preserves credential recovery ownership through renderer report, action queue, and runner evidence", async () => {
    const actions = createDesktopDebugActionQueue();
    actions.enqueue({
      type: "configure_test_provider",
      baseUrl: "http://127.0.0.1:8787/v1",
      model: "debug-model",
      nonce: "12345678-1234-4123-8123-123456789abc",
    });
    const operationId = "11111111-1111-4111-8111-111111111111";
    const recovery = {
      kind: "native-credential-journal" as const,
      preserveUserDataDir: true as const,
    };

    await runMcpDebugActionPollOnce({
      endpoint: "http://127.0.0.1:17369/mcp",
      authToken: "token",
      busy: () => false,
      setBusy: () => undefined,
      fetchNextDebugAction: async () => actions.claimNext() as DesktopDebugAction,
      reportDebugAction: async (_endpoint, id, payload) => {
        actions.fail(
          id,
          payload.error ?? "missing error",
          desktopDebugActionFailureDetails(payload),
        );
      },
      executeDebugAction: async () => {
        throw Object.assign(new Error("commit and reconciliation failed"), {
          operationId,
          recovery,
        });
      },
    });

    const failed = actions.list(1)[0];
    expect(failed).toMatchObject({
      status: "failed",
      error: "commit and reconciliation failed",
      operationId,
      recovery,
    });
    const cleanup = createTestProviderCleanupState();
    expect(recordTestProviderRecoveryFailure(cleanup, failed)).toBe(true);
    expect(cleanup.evidence()).toMatchObject({
      attempted: true,
      completed: false,
      recoveryPending: true,
      operationId,
      recovery,
    });

    const profile = mkdtempSync(resolve(tmpdir(), "geochat-action-recovery-"));
    expect(finalizeTestProviderProfile(profile, true, cleanup)).toEqual({
      preserved: true,
      recoveryPath: profile,
    });
    expect(existsSync(profile)).toBe(true);
    expect(cleanup.evidence()).toMatchObject({ operationId, recoveryPath: profile });
    rmSync(profile, { recursive: true, force: true });
  });

  test("a poll already in flight is skipped rather than overlapped", async () => {
    let fetchCount = 0;
    await runMcpDebugActionPollOnce({
      endpoint: "http://127.0.0.1:17369/mcp",
      busy: () => true,
      setBusy: () => undefined,
      fetchNextDebugAction: async () => { fetchCount += 1; return null; },
      reportDebugAction: async () => undefined,
      executeDebugAction: async () => ({ ok: true })
    });
    expect(fetchCount).toBe(0);
  });

  test("a cancelled poll neither executes nor reports", async () => {
    const reports: unknown[] = [];
    let executed = false;
    await runMcpDebugActionPollOnce({
      endpoint: "http://127.0.0.1:17369/mcp",
      busy: () => false,
      setBusy: () => undefined,
      isCancelled: () => true,
      fetchNextDebugAction: async () => ({ id: "action-3", type: "get_ui_status" }),
      reportDebugAction: async (_endpoint, id) => { reports.push(id); },
      executeDebugAction: async () => { executed = true; return {}; }
    });
    expect(executed).toBe(false);
    expect(reports).toEqual([]);
  });
});
