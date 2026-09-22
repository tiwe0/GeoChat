import { afterEach, describe, expect, test } from "bun:test";
import {
  parseStoredActiveNativeRun,
} from "../src/renderer-react/src/features/agent-run/activeRunStorage";
import { activateNativeRun, recoverInterruptedNativeRun } from "../src/renderer-react/src/hooks/useAgentRunChat";

const originalBrowser = (globalThis as Record<string, unknown>).browser;

afterEach(() => {
  Object.defineProperty(globalThis, "browser", { configurable: true, value: originalBrowser });
});

describe("active native run recovery", () => {
  test("validates stored recovery markers and migrates a missing effort to null", () => {
    expect(parseStoredActiveNativeRun({
      runId: "run-1",
      conversationId: "conversation-1",
      modelProvider: "deepseek",
      modelId: "deepseek-chat",
      prompt: "画一个圆",
      thinking: false,
    })).toEqual({
      runId: "run-1",
      conversationId: "conversation-1",
      modelProvider: "deepseek",
      modelId: "deepseek-chat",
      prompt: "画一个圆",
      thinking: false,
      thinkingEffort: null,
    });
    expect(parseStoredActiveNativeRun({ runId: "run-1" })).toBeNull();
  });

  test("restores the prompt and explicitly cancels a non-reattachable running ledger", async () => {
    const values: Record<string, unknown> = {
      geochatActiveNativeRun: {
        runId: "run-recover",
        conversationId: "conversation-recover",
        modelProvider: "deepseek",
        modelId: "deepseek-chat",
        prompt: "恢复这道题",
        thinking: true,
        thinkingEffort: "extended",
      },
      geogebraCopilotInstallationId: "installation-1",
    };
    Object.defineProperty(globalThis, "browser", {
      configurable: true,
      value: {
        storage: {
          local: {
            get: async (key: string) => ({ [key]: values[key] }),
            set: async (entries: Record<string, unknown>) => { Object.assign(values, entries); },
            remove: async (key: string) => { delete values[key]; },
          },
        },
      },
    });
    const calls: string[] = [];
    const restored: unknown[] = [];
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
    expect(restored).toEqual([expect.objectContaining({ prompt: "恢复这道题", thinking: true, modelProvider: "deepseek" })]);
    expect(calls).toEqual([
      "GET http://127.0.0.1:17369/v1/agent-runs",
      "POST http://127.0.0.1:17369/v1/agent-runs/run-recover/cancel",
    ]);
    expect(values.geochatActiveNativeRun).toBeUndefined();
  });

  test("clears the in-memory active run when its recovery marker cannot be persisted", async () => {
    const active = { current: null as { runId: string; conversationId: string } | null };
    await expect(activateNativeRun(active, {
      runId: "run-storage-failure",
      conversationId: "conversation-storage-failure",
      modelProvider: "deepseek",
      modelId: "deepseek-chat",
      prompt: "test",
      thinking: false,
      thinkingEffort: null,
    }, async () => { throw new Error("storage unavailable"); })).rejects.toThrow("storage unavailable");
    expect(active.current).toBeNull();
  });
});
