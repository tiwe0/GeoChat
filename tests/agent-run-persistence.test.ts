import { describe, expect, test } from "bun:test";
import { createAgentRunLedger, finishAgentRunLedger, isAgentRunFinishInput, isAgentRunLedgerRecord, isAgentRunToolRecord, isAgentRunUsage, upsertAgentRunTool } from "@geochat-ai/app";
import { createDatabase } from "../backend/src/db/client";
import { createAgentRunRepository } from "../backend/src/db/agent-run-repository";

const model = {
  provider: "openai" as const,
  model: "gpt-5.5",
  apiKey: "secret-not-for-persistence",
  customBaseUrl: "",
};

function createRun(runId = `run-${crypto.randomUUID()}`) {
  return createAgentRunLedger({
    runId,
    conversationId: "conversation-1",
    userMessageId: "user-1",
    assistantMessageId: "assistant-1",
    model,
    locale: "zh-CN",
    thinking: true,
    thinkingEffort: "standard",
    prompt: "读取画布并作圆",
    attachmentCount: 0,
    startedAt: "2026-06-06T00:00:00.000Z",
  });
}

describe("AI SDK run ledger", () => {
  test("creates an AI SDK ledger without persisting provider credentials", () => {
    const run = createRun("run-no-secrets");
    expect(run).toMatchObject({
      modelProvider: "openai",
      modelId: "gpt-5.5",
      status: "running",
    });
    expect(JSON.stringify(run)).not.toContain(model.apiKey);
    expect(isAgentRunLedgerRecord(run)).toBe(true);
  });

  test("validates AI SDK tool records and persists canvas snapshots", () => {
    const startedAt = "2026-06-06T00:00:01.000Z";
    const completedAt = "2026-06-06T00:00:02.000Z";
    const tool = {
      toolCallId: "canvas-1",
      toolName: "getCanvasContext" as const,
      status: "succeeded" as const,
      args: { includeXml: false },
      result: { ok: true, objects: [] },
      canvasBefore: { objectCount: 0 },
      canvasAfter: { objectCount: 0 },
      error: null,
      startedAt,
      completedAt,
      durationMs: 1000,
    };
    expect(isAgentRunToolRecord(tool)).toBe(true);
    expect(isAgentRunToolRecord({ ...tool, toolCallId: "   " })).toBe(false);
    expect(isAgentRunToolRecord({ ...tool, args: { includeXml: "yes" } })).toBe(false);

    const run = upsertAgentRunTool(createRun("run-tool"), tool);
    expect(run.tools[0]).toMatchObject({
      toolCallId: "canvas-1",
      canvasBefore: { objectCount: 0 },
      canvasAfter: { objectCount: 0 },
    });
    expect(isAgentRunLedgerRecord(run)).toBe(true);
  });

  test("normalizes terminal usage and error state", () => {
    const run = createRun("run-finish");
    const succeeded = finishAgentRunLedger(run, {
      status: "succeeded",
      completedAt: "2026-06-06T00:00:01.000Z",
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    });
    expect(succeeded).toMatchObject({ status: "succeeded", error: null, durationMs: 1000 });
    expect(isAgentRunLedgerRecord(succeeded)).toBe(true);

    const failed = finishAgentRunLedger(run, {
      status: "failed",
      completedAt: "2026-06-06T00:00:01.000Z",
      usage: { totalTokens: 7 },
      error: "provider failed",
    });
    expect(failed).toMatchObject({ status: "failed", usage: { totalTokens: 7 }, error: "provider failed" });
    expect(isAgentRunLedgerRecord(failed)).toBe(true);
    expect(isAgentRunFinishInput({ status: "running" })).toBe(false);
    expect(isAgentRunUsage({ inputTokens: 3, outputTokens: 4, totalTokens: 7 })).toBe(true);
    expect(isAgentRunUsage({ inputTokens: 3, outputTokens: 4, totalTokens: 8 })).toBe(false);
  });

  test("persists only ledgers and run/tool error events", async () => {
    const previousPath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    const databasePath = `/tmp/geochat-native-run-${crypto.randomUUID()}.sqlite`;
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    try {
      const db = createDatabase();
      const repository = createAgentRunRepository({ driver: "sqlite", sqlitePath: databasePath }, db);
      const run = finishAgentRunLedger(createRun("run-persist"), {
        status: "failed",
        completedAt: "2026-06-06T00:00:01.000Z",
        error: "provider failed",
      });
      await repository.saveLedger(run);
      await repository.saveErrorEvent({
        eventId: "error-run-persist",
        runId: run.runId,
        conversationId: run.conversationId,
        source: "run",
        code: "agent_run_failed",
        severity: "error",
        message: "provider failed",
        modelProvider: run.modelProvider,
        modelId: run.modelId,
        payload: { status: run.status },
      });

      expect(await repository.getLedger(run.runId)).toEqual(run);
      expect(await repository.listErrorEvents({ runId: run.runId, limit: 10 })).toHaveLength(1);
      expect(await repository.diagnostics(run.conversationId)).toEqual({
        conversations: 0,
        conversationMessages: 0,
        agentRunLedgers: 1,
        agentErrorEvents: 1,
      });
    } finally {
      if (previousPath === undefined) delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      else Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousPath;
    }
  });

  test("rejects stale ledger revisions and never lets a stale writer replace a terminal state", async () => {
    const previousPath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    const databasePath = `/tmp/geochat-native-run-cas-${crypto.randomUUID()}.sqlite`;
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    try {
      const db = createDatabase();
      const repository = createAgentRunRepository({ driver: "sqlite", sqlitePath: databasePath }, db);
      const created = await repository.createLedger(createRun("run-cas"));
      const claimed = await repository.compareAndSwapLedger({ ...created, continuationLeaseId: "lease-1" }, created.revision ?? 0);
      expect(claimed.revision).toBe(1);

      const cancelled = finishAgentRunLedger({ ...claimed, continuationLeaseId: null }, {
        status: "cancelled",
        completedAt: "2026-06-06T00:00:01.000Z",
        error: "Stopped by user.",
      });
      const terminal = await repository.compareAndSwapLedger(cancelled, claimed.revision ?? 0);
      expect(terminal.status).toBe("cancelled");

      await expect(repository.compareAndSwapLedger({ ...claimed, prompt: "stale write" }, claimed.revision ?? 0))
        .rejects.toThrow("Agent run ledger revision conflict");
      expect((await repository.getLedger(created.runId))?.status).toBe("cancelled");
    } finally {
      if (previousPath === undefined) delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      else Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousPath;
    }
  });
});
