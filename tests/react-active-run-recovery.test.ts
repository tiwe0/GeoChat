import { afterEach, describe, expect, test } from "bun:test";
import { getInstallationId } from "../src/renderer-react/src/features/agent-run/activeRunStorage";
import { installNativePreferences } from "../src/renderer-react/src/lib/nativePreferences";
import {
  activateNativeRun,
  AgentRunSubmissionLease,
  recoverInterruptedNativeRun,
} from "../src/renderer-react/src/hooks/useAgentRunChat";
import {
  BackendRuntimeListener,
  BackendRuntimeRecoveryGate,
  backendRuntimeUnavailable,
  invalidateNativeRunAfterBackendLoss,
} from "../src/renderer-react/src/features/agent-run/nativeRunLifecycle";

const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => {
  if (originalSessionStorage) Object.defineProperty(globalThis, "sessionStorage", originalSessionStorage);
  else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});

async function installTestPreferences(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  await installNativePreferences({
    async getRendererStorage() { return Object.fromEntries(values); },
    async setRendererStorage(entries) {
      for (const [key, value] of Object.entries(entries)) values.set(key, value);
    },
    async removeRendererStorage(keys) {
      for (const key of keys) values.delete(key);
    },
  });
  return values;
}

describe("active native run recovery", () => {
  test("keeps the installation id stable across renderer restarts", async () => {
    const values = await installTestPreferences();

    const first = await getInstallationId({ current: null });
    const afterRestart = await getInstallationId({ current: null });

    expect(afterRestart).toBe(first);
    expect(values.get("geogebraCopilotInstallationId")).toBe(JSON.stringify(first));
  });

  test("queries SQLite-backed runs and cancels an interrupted running ledger", async () => {
    await installTestPreferences({ geogebraCopilotInstallationId: JSON.stringify("installation-1") });
    const calls: string[] = [];
    const restored: unknown[] = [];
    const gate = new BackendRuntimeRecoveryGate();
    expect(gate.observe({
      mode: "external",
      state: "unreachable",
      baseUrl: "http://127.0.0.1:17369",
    })).toBe("interrupt");
    expect(gate.observe({
      mode: "external",
      state: "running",
      baseUrl: "http://127.0.0.1:17369",
    })).toBe("recover");
    const request = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/v1/agent-runs")) {
        return Response.json({ runs: [{
          runId: "run-recover",
          conversationId: "conversation-recover",
          status: "running",
          modelProvider: "deepseek",
          modelId: "deepseek-chat",
          prompt: "恢复这道题",
          thinking: true,
          thinkingEffort: "extended",
        }] });
      }
      return new Response(null, { status: 404 });
    };

    const run = await recoverInterruptedNativeRun({
      apiOrigin: "http://127.0.0.1:17369",
      getAuthToken: () => null,
      getModel: () => "deepseek-chat",
      locale: "zh-CN",
      getThinking: () => true,
      getThinkingEffort: () => "extended",
      onRestore: (value) => { restored.push(value); },
    }, { current: null }, request as typeof fetch);

    expect(run?.status).toBe("running");
    expect(restored).toEqual([{
      conversationId: "conversation-recover",
      modelProvider: "deepseek",
      modelId: "deepseek-chat",
      prompt: "恢复这道题",
      thinking: true,
      thinkingEffort: "extended",
    }]);
    expect(JSON.stringify(restored)).not.toContain("Agent Skill 策略");
    expect(calls).toEqual([
      "GET http://127.0.0.1:17369/v1/agent-runs",
      "POST http://127.0.0.1:17369/v1/agent-runs/run-recover/cancel",
    ]);
  });

  test("activates a run entirely in memory", async () => {
    const active = { current: null as { runId: string; conversationId: string } | null };
    await activateNativeRun(active, { runId: "run-memory", conversationId: "conversation-memory" });
    expect(active.current).toEqual({ runId: "run-memory", conversationId: "conversation-memory" });
  });

  test("invalidates the active generation and submission lease after backend loss", () => {
    const activeRunRef = {
      current: { runId: "run-interrupted", conversationId: "conversation-interrupted" },
    };
    const runGenerationRef = { current: 7 };
    const submissionLease = new AgentRunSubmissionLease();
    expect(submissionLease.tryAcquire()).toBeTypeOf("symbol");

    expect(invalidateNativeRunAfterBackendLoss({
      activeRunRef,
      runGenerationRef,
      submissionLease,
    })).toEqual({ runId: "run-interrupted", conversationId: "conversation-interrupted" });
    expect(activeRunRef.current).toBeNull();
    expect(runGenerationRef.current).toBe(8);
    expect(submissionLease.tryAcquire()).toBeTypeOf("symbol");
  });

  test("drops the renderer run reference while the SQLite ledger remains authoritative", () => {
    const activeRunRef = {
      current: { runId: "run-preserved", conversationId: "conversation-preserved" },
    };
    invalidateNativeRunAfterBackendLoss({
      activeRunRef,
      runGenerationRef: { current: 1 },
      submissionLease: new AgentRunSubmissionLease(),
    });

    expect(activeRunRef.current).toBeNull();
  });

  test("backend recovery transitions are idempotent", () => {
    const gate = new BackendRuntimeRecoveryGate();
    const unreachable = {
      mode: "external",
      state: "unreachable",
      baseUrl: "http://127.0.0.1:17365",
    } as const;
    const running = { ...unreachable, state: "running" } as const;

    expect(gate.observe(unreachable)).toBe("interrupt");
    expect(gate.observe(unreachable)).toBeNull();
    expect(gate.observe(running)).toBe("recover");
    expect(gate.observe(running)).toBeNull();
  });

  test("backend runtime listener subscribes once across handler updates and still receives exit", async () => {
    const listener = new BackendRuntimeListener();
    let subscriptions = 0;
    let emit: ((runtime: Parameters<BackendRuntimeRecoveryGate["observe"]>[0]) => void) | null = null;
    const observed: string[] = [];
    const subscribe = async (handler: NonNullable<typeof emit>) => {
      subscriptions += 1;
      emit = handler;
      return () => { emit = null; };
    };

    listener.updateHandler((runtime) => observed.push(`old:${runtime.state}`));
    await listener.start(subscribe);
    listener.updateHandler((runtime) => observed.push(`latest:${runtime.state}`));
    listener.start(subscribe);
    emit?.({
      mode: "managed",
      state: "exited",
      baseUrl: "http://127.0.0.1:17365",
      error: "process exited",
    });

    expect(subscriptions).toBe(1);
    expect(observed).toEqual(["latest:exited"]);
    listener.stop();
  });

  test("backend runtime listener cleans up when stopped before async registration completes", async () => {
    const listener = new BackendRuntimeListener();
    let finishRegistration: ((unsubscribe: () => void) => void) | undefined;
    let unsubscribeCalls = 0;
    const registration = listener.start(async () => new Promise<() => void>((resolve) => {
      finishRegistration = resolve;
    }));

    listener.stop();
    finishRegistration?.(() => { unsubscribeCalls += 1; });
    await registration;

    expect(unsubscribeCalls).toBe(1);
  });

  test("backend runtime listener can restart without accepting callbacks from an old subscription", async () => {
    const listener = new BackendRuntimeListener();
    const callbacks: Array<(runtime: Parameters<BackendRuntimeRecoveryGate["observe"]>[0]) => void> = [];
    const unsubscribed: number[] = [];
    const observed: string[] = [];
    const subscribe = async (handler: (typeof callbacks)[number]) => {
      const index = callbacks.push(handler) - 1;
      return () => { unsubscribed.push(index); };
    };
    listener.updateHandler((runtime) => observed.push(runtime.state));

    await listener.start(subscribe);
    listener.stop();
    await listener.start(subscribe);
    callbacks[0]?.({ mode: "managed", state: "exited", baseUrl: "http://127.0.0.1:17365" });
    callbacks[1]?.({ mode: "managed", state: "running", baseUrl: "http://127.0.0.1:17365" });

    expect(unsubscribed).toEqual([0]);
    expect(observed).toEqual(["running"]);
  });

  test("backend runtime listener retries after registration rejection", async () => {
    const listener = new BackendRuntimeListener();
    let attempts = 0;
    const observed: string[] = [];
    listener.updateHandler((runtime) => observed.push(runtime.state));

    await expect(listener.start(async () => {
      attempts += 1;
      throw new Error("registration failed");
    })).rejects.toThrow("registration failed");
    await listener.start(async (handler) => {
      attempts += 1;
      handler({ mode: "managed", state: "running", baseUrl: "http://127.0.0.1:17365" });
      return () => undefined;
    });

    expect(attempts).toBe(2);
    expect(observed).toEqual(["running"]);
  });

  test("an old async registration cannot replace a newer subscription", async () => {
    const listener = new BackendRuntimeListener();
    let finishOld: ((unsubscribe: () => void) => void) | undefined;
    let oldUnsubscribeCalls = 0;
    let newUnsubscribeCalls = 0;
    const oldRegistration = listener.start(async () => new Promise<() => void>((resolve) => {
      finishOld = resolve;
    }));

    listener.stop();
    await listener.start(async () => () => { newUnsubscribeCalls += 1; });
    finishOld?.(() => { oldUnsubscribeCalls += 1; });
    await oldRegistration;
    listener.stop();

    expect(oldUnsubscribeCalls).toBe(1);
    expect(newUnsubscribeCalls).toBe(1);
  });

  test("only terminal backend runtime states block new native runs", () => {
    expect(backendRuntimeUnavailable(undefined)).toBe(false);
    expect(backendRuntimeUnavailable({
      mode: "managed",
      state: "running",
      baseUrl: "http://127.0.0.1:17365",
      pid: 42,
    })).toBe(false);
    expect(backendRuntimeUnavailable({
      mode: "managed",
      state: "exited",
      baseUrl: "http://127.0.0.1:17365",
      error: "process exited",
    })).toBe(true);
    expect(backendRuntimeUnavailable({
      mode: "external",
      state: "unreachable",
      baseUrl: "http://127.0.0.1:17365",
    })).toBe(true);
    expect(backendRuntimeUnavailable({
      mode: "managed",
      state: "stopped",
      baseUrl: "http://127.0.0.1:17365",
    })).toBe(true);
  });
});
