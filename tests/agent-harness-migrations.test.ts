import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { createDatabase } from "../backend/src/db/client";
import { createAgentRunLedger } from "@geochat-ai/app";

function tableNames(sqlite: Database) {
  return (sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name);
}

describe("native AI SDK sqlite schema", () => {
  test("creates only the active run ledger and error-event tables", () => {
    const previousPath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    const databasePath = `/tmp/geochat-native-schema-${crypto.randomUUID()}.sqlite`;
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    try {
      const db = createDatabase();
      const sqlite = new Database(databasePath);
      const names = tableNames(sqlite);
      expect(names).toContain("agent_run_ledgers");
      expect(names).toContain("agent_error_events");
      expect(names).not.toContain("agent_run_remote_tool_requests");
      expect(names).not.toContain("agent_run_policy_decisions");
      expect(names).not.toContain("agent_run_model_steps");
      sqlite.close();

      expect(() => db.run(sql`
        INSERT INTO agent_run_ledgers (
          run_id, conversation_id, status, model_provider, model_id, started_at, completed_at, payload
        ) VALUES (
          'bad-lifecycle', 'conversation-1', 'succeeded', 'openai', 'gpt-5.5', 1, NULL, '{}'
        )
      `)).toThrow();
      expect(() => db.run(sql`
        INSERT INTO agent_error_events (
          event_id, run_id, source, code, severity, message, created_at, payload
        ) VALUES (
          'bad-source', 'run-1', 'policy', 'bad', 'error', 'bad', 1, '{}'
        )
      `)).toThrow();
    } finally {
      if (previousPath === undefined) delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      else Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousPath;
    }
  });

  test("removes the legacy run mode column without losing ledgers", () => {
    const previousPath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    const databasePath = `/tmp/geochat-native-schema-legacy-${crypto.randomUUID()}.sqlite`;
    const legacy = new Database(databasePath);
    legacy.run(`
      CREATE TABLE agent_run_ledgers (
        run_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('ai-sdk', 'local-planner')),
        model_provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        payload TEXT NOT NULL
      )
    `);
    legacy.run(`
      INSERT INTO agent_run_ledgers (
        run_id, conversation_id, status, mode, model_provider, model_id, started_at, completed_at, payload
      ) VALUES (
        'legacy-run', 'legacy-conversation', 'succeeded', 'ai-sdk', 'deepseek', 'deepseek-chat', 1, 2, '{"runId":"legacy-run"}'
      )
    `);
    legacy.close();
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;

    try {
      createDatabase();
      const migrated = new Database(databasePath);
      const columns = migrated.query("PRAGMA table_info(agent_run_ledgers)").all() as Array<{ name: string }>;
      expect(columns.map((column) => column.name)).not.toContain("mode");
      expect(migrated.query("SELECT run_id FROM agent_run_ledgers").get()).toEqual({ run_id: "legacy-run" });
      migrated.close();
    } finally {
      if (previousPath === undefined) delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      else Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousPath;
    }
  });

  test("marks runs interrupted by a backend restart as cancelled", () => {
    const previousPath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    const databasePath = `/tmp/geochat-native-schema-interrupted-${crypto.randomUUID()}.sqlite`;
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    try {
      createDatabase();
      const sqlite = new Database(databasePath);
      const run = createAgentRunLedger({
        runId: "interrupted-run",
        conversationId: "interrupted-conversation",
        model: { provider: "deepseek", model: "deepseek-chat", apiKey: "test", customBaseUrl: "" },
        prompt: "draw",
        attachmentCount: 0,
        startedAt: "2026-09-22T00:00:00.000Z",
      });
      sqlite.query(`
        INSERT INTO agent_run_ledgers (
          run_id, conversation_id, status, model_provider, model_id, started_at, completed_at, payload
        ) VALUES (?, ?, 'running', ?, ?, ?, NULL, ?)
      `).run(run.runId, run.conversationId, run.modelProvider, run.modelId, Date.parse(run.startedAt), JSON.stringify(run));
      sqlite.close();

      createDatabase();
      const reopened = new Database(databasePath);
      const row = reopened.query("SELECT status, revision, completed_at, payload FROM agent_run_ledgers WHERE run_id = ?").get(run.runId) as {
        status: string;
        revision: number;
        completed_at: number | null;
        payload: string;
      };
      const payload = JSON.parse(row.payload);
      expect(row.status).toBe("cancelled");
      expect(row.revision).toBe(1);
      expect(row.completed_at).toBeNumber();
      expect(payload).toMatchObject({ status: "cancelled", revision: 1, error: "Interrupted before completion." });
      reopened.close();
    } finally {
      if (previousPath === undefined) delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      else Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousPath;
    }
  });

  test("preserves a successful setFinished result across a backend restart", () => {
    const previousPath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    const databasePath = `/tmp/geochat-native-schema-finished-${crypto.randomUUID()}.sqlite`;
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    try {
      createDatabase();
      const sqlite = new Database(databasePath);
      const run = createAgentRunLedger({
        runId: "finished-before-restart",
        conversationId: "finished-conversation",
        model: { provider: "deepseek", model: "deepseek-chat", apiKey: "test", customBaseUrl: "" },
        prompt: "draw",
        attachmentCount: 0,
        startedAt: "2026-09-22T00:00:00.000Z",
      });
      const finishedToolAt = "2026-09-22T00:00:01.000Z";
      const interrupted = {
        ...run,
        continuationLeaseId: "stale-lease",
        continuationLeaseExpiresAt: "2026-09-22T00:10:00.000Z",
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
        tools: [{
          toolCallId: "call_finished",
          toolName: "setFinished",
          status: "succeeded",
          args: { summary: "done" },
          result: { ok: true },
          error: null,
          startedAt: finishedToolAt,
          completedAt: finishedToolAt,
          durationMs: 0,
        }],
      };
      sqlite.query(`
        INSERT INTO agent_run_ledgers (
          run_id, conversation_id, status, model_provider, model_id, started_at, completed_at, payload
        ) VALUES (?, ?, 'running', ?, ?, ?, NULL, ?)
      `).run(run.runId, run.conversationId, run.modelProvider, run.modelId, Date.parse(run.startedAt), JSON.stringify(interrupted));
      sqlite.close();

      createDatabase();
      const reopened = new Database(databasePath);
      const row = reopened.query("SELECT status, revision, completed_at, payload FROM agent_run_ledgers WHERE run_id = ?").get(run.runId) as {
        status: string;
        revision: number;
        completed_at: number | null;
        payload: string;
      };
      const payload = JSON.parse(row.payload);
      expect(row.status).toBe("succeeded");
      expect(row.revision).toBe(1);
      expect(row.completed_at).toBeNumber();
      expect(payload).toMatchObject({
        status: "succeeded",
        revision: 1,
        continuationLeaseId: null,
        continuationLeaseExpiresAt: null,
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
        error: null,
      });
      reopened.close();
    } finally {
      if (previousPath === undefined) delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      else Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousPath;
    }
  });
});
