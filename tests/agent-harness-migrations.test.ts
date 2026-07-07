import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";

import { createDatabase } from "../backend/src/db/client";
import {
  agentRunLedgers,
  agentRunModelSteps,
  agentRunPolicyDecisions,
  agentRunRemoteToolRequests
} from "../backend/src/db/schema";

describe("sqlite harness migrations", () => {
  test("migrates old policy decision stage constraints for manual event decisions", () => {
    const databasePath = `/tmp/geochat-policy-stage-migration-${crypto.randomUUID()}.sqlite`;
    const sqlite = new Database(databasePath);
    sqlite.run(`
      CREATE TABLE agent_run_policy_decisions (
        decision_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('runner_start', 'runner_continuation')),
        kind TEXT NOT NULL,
        allowed INTEGER NOT NULL,
        tool_call_id TEXT,
        tool_name TEXT,
        created_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      )
    `);
    sqlite.run(
      `
        INSERT INTO agent_run_policy_decisions (
          decision_id,
          run_id,
          stage,
          kind,
          allowed,
          created_at,
          payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "old-decision-1",
        "old-run-1",
        "runner_start",
        "runner_start_enqueued",
        1,
        new Date("2026-06-06T00:02:30.000Z").getTime(),
        JSON.stringify({
          decisionId: "old-decision-1",
          runId: "old-run-1",
          stage: "runner_start",
          kind: "runner_start_enqueued",
          allowed: true,
          createdAt: "2026-06-06T00:02:30.000Z"
        })
      ]
    );
    sqlite.close();

    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    const db = createDatabase();
    db.insert(agentRunPolicyDecisions)
      .values({
        decisionId: "new-decision-1",
        runId: "new-run-1",
        stage: "remote_tool_request",
        kind: "workflow_blocked",
        allowed: false,
        toolCallId: "blocked-request-1",
        toolName: "getCanvasContext",
        createdAt: new Date("2026-06-06T00:02:31.000Z"),
        payload: {
          decisionId: "new-decision-1",
          runId: "new-run-1",
          stage: "remote_tool_request",
          kind: "workflow_blocked",
          allowed: false,
          toolCallId: "blocked-request-1",
          toolName: "getCanvasContext",
          createdAt: "2026-06-06T00:02:31.000Z"
        }
      })
      .run();

    expect(db.select().from(agentRunPolicyDecisions).all().map((row) => row.stage)).toEqual([
      "runner_start",
      "remote_tool_request"
    ]);
  });

  test("migrates old remote tool request tables to enforce run scoped tool-call ids", () => {
    const databasePath = `/tmp/geochat-remote-request-unique-migration-${crypto.randomUUID()}.sqlite`;
    const sqlite = new Database(databasePath);
    sqlite.run(`
      CREATE TABLE agent_run_remote_tool_requests (
        request_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        tool_call_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
        requested_at INTEGER NOT NULL,
        claimed_at INTEGER,
        claimed_by TEXT,
        lease_expires_at INTEGER,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        completed_at INTEGER,
        payload TEXT NOT NULL
      )
    `);
    sqlite.run(
      `
        INSERT INTO agent_run_remote_tool_requests (
          request_id,
          run_id,
          tool_call_id,
          tool_name,
          status,
          requested_at,
          payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "legacy-request-a",
        "legacy-run-remote-unique",
        "legacy-tool-call",
        "getCanvasContext",
        "pending",
        new Date("2026-06-06T00:02:40.000Z").getTime(),
        JSON.stringify({
          runId: "legacy-run-remote-unique",
          toolCallId: "legacy-tool-call",
          toolName: "getCanvasContext",
          args: { includeXml: false },
          status: "pending",
          requestedAt: "2026-06-06T00:02:40.000Z",
          claimedAt: null,
          leaseExpiresAt: null,
          completedAt: null,
          error: null
        })
      ]
    );
    sqlite.close();

    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    const db = createDatabase();

    expect(() =>
      db.insert(agentRunRemoteToolRequests)
        .values({
          requestId: "legacy-request-b",
          runId: "legacy-run-remote-unique",
          toolCallId: "legacy-tool-call",
          toolName: "getCanvasContext",
          status: "pending",
          requestedAt: new Date("2026-06-06T00:02:41.000Z"),
          payload: {
            runId: "legacy-run-remote-unique",
            toolCallId: "legacy-tool-call",
            toolName: "getCanvasContext",
            args: { includeXml: false },
            status: "pending",
            requestedAt: "2026-06-06T00:02:41.000Z",
            claimedAt: null,
            leaseExpiresAt: null,
            completedAt: null,
            error: null
          }
        })
        .run()
    ).toThrow(/UNIQUE constraint failed/);
  });

  test("migrates and enforces sqlite lifecycle and counter constraints", () => {
    const databasePath = `/tmp/geochat-sqlite-harness-constraints-${crypto.randomUUID()}.sqlite`;
    const sqlite = new Database(databasePath);
    sqlite.run(`
      CREATE TABLE agent_run_ledgers (
        run_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
        mode TEXT NOT NULL CHECK (mode IN ('ai-sdk', 'local-planner')),
        model_provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        payload TEXT NOT NULL
      )
    `);
    sqlite.run(
      `
        INSERT INTO agent_run_ledgers (
          run_id,
          conversation_id,
          status,
          mode,
          model_provider,
          model_id,
          started_at,
          completed_at,
          payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "legacy-run-constraints",
        "conversation-1",
        "running",
        "ai-sdk",
        "openai",
        "gpt-5.5",
        new Date("2026-06-06T00:02:50.000Z").getTime(),
        null,
        JSON.stringify({
          runId: "legacy-run-constraints",
          conversationId: "conversation-1",
          status: "running",
          mode: "ai-sdk",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          prompt: "legacy",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:02:50.000Z",
          completedAt: null,
          durationMs: null,
          usage: null,
          error: null,
          tools: []
        })
      ]
    );
    sqlite.run(
      `
        INSERT INTO agent_run_ledgers (
          run_id,
          conversation_id,
          status,
          mode,
          model_provider,
          model_id,
          started_at,
          completed_at,
          payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "legacy-run-terminal-missing-completed",
        "conversation-1",
        "succeeded",
        "ai-sdk",
        "openai",
        "gpt-5.5",
        new Date("2026-06-06T00:02:55.000Z").getTime(),
        null,
        "{}"
      ]
    );
    sqlite.run(`
      CREATE TABLE agent_run_remote_tool_requests (
        request_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        tool_call_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
        requested_at INTEGER NOT NULL,
        claimed_at INTEGER,
        claimed_by TEXT,
        lease_expires_at INTEGER,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        completed_at INTEGER,
        payload TEXT NOT NULL
      )
    `);
    sqlite.run(
      `
        INSERT INTO agent_run_remote_tool_requests (
          request_id,
          run_id,
          tool_call_id,
          tool_name,
          status,
          requested_at,
          claimed_at,
          claimed_by,
          lease_expires_at,
          attempt_count,
          completed_at,
          payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "legacy-remote-dirty",
        "legacy-run-constraints",
        "legacy-remote-dirty",
        "getCanvasContext",
        "running",
        new Date("2026-06-06T00:03:00.000Z").getTime(),
        null,
        "renderer-a",
        null,
        -4,
        new Date("2026-06-06T00:02:59.000Z").getTime(),
        "{}"
      ]
    );
    sqlite.run(`
      CREATE TABLE agent_run_policy_decisions (
        decision_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('runner_start', 'runner_continuation', 'ledger_tool_event', 'remote_tool_request')),
        kind TEXT NOT NULL,
        allowed INTEGER NOT NULL,
        tool_call_id TEXT,
        tool_name TEXT,
        created_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      )
    `);
    sqlite.run(
      `
        INSERT INTO agent_run_policy_decisions (
          decision_id,
          run_id,
          stage,
          kind,
          allowed,
          created_at,
          payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "legacy-policy-dirty",
        "legacy-run-constraints",
        "runner_start",
        "model_error",
        2,
        new Date("2026-06-06T00:03:05.000Z").getTime(),
        "{}"
      ]
    );
    sqlite.run(`
      CREATE TABLE agent_run_model_steps (
        step_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('runner_start', 'runner_continuation')),
        source TEXT NOT NULL CHECK (source IN ('model', 'policy')),
        status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
        model_provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        input_tool_count INTEGER NOT NULL,
        attachment_count INTEGER NOT NULL,
        output_type TEXT CHECK (output_type IN ('tool', 'finish')),
        output_tool_call_id TEXT,
        output_tool_name TEXT,
        payload TEXT NOT NULL
      )
    `);
    sqlite.run(
      `
        INSERT INTO agent_run_model_steps (
          step_id,
          run_id,
          stage,
          source,
          status,
          model_provider,
          model_id,
          started_at,
          completed_at,
          input_tool_count,
          attachment_count,
          payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "legacy-model-step-dirty",
        "legacy-run-constraints",
        "runner_continuation",
        "model",
        "succeeded",
        "openai",
        "gpt-5.5",
        new Date("2026-06-06T00:03:10.000Z").getTime(),
        null,
        -2,
        -1,
        "{}"
      ]
    );
    sqlite.close();

    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    const db = createDatabase();
    const migratedSqlite = new Database(databasePath);
    const migratedLedgerTable = migratedSqlite
      .query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_run_ledgers'")
      .get() as { sql?: string } | undefined;
    const migratedDirtyLedger = migratedSqlite
      .query("SELECT started_at, completed_at FROM agent_run_ledgers WHERE run_id = 'legacy-run-terminal-missing-completed'")
      .get() as { started_at: number; completed_at: number } | undefined;
    const migratedDirtyRemote = migratedSqlite
      .query("SELECT requested_at, claimed_at, claimed_by, lease_expires_at, attempt_count, completed_at FROM agent_run_remote_tool_requests WHERE request_id = 'legacy-remote-dirty'")
      .get() as
      | {
        requested_at: number;
        claimed_at: number | null;
        claimed_by: string | null;
        lease_expires_at: number | null;
        attempt_count: number;
        completed_at: number | null;
      }
      | undefined;
    const migratedDirtyPolicy = migratedSqlite
      .query("SELECT allowed FROM agent_run_policy_decisions WHERE decision_id = 'legacy-policy-dirty'")
      .get() as { allowed: number } | undefined;
    const migratedDirtyModelStep = migratedSqlite
      .query("SELECT started_at, completed_at, input_tool_count, attachment_count FROM agent_run_model_steps WHERE step_id = 'legacy-model-step-dirty'")
      .get() as { started_at: number; completed_at: number; input_tool_count: number; attachment_count: number } | undefined;
    migratedSqlite.close();

    expect(migratedLedgerTable?.sql).toContain("agent_run_ledgers_lifecycle_ck");
    expect(db.select().from(agentRunLedgers).all().map((row) => row.runId)).toContain("legacy-run-constraints");
    expect(migratedDirtyLedger?.completed_at).toBe(migratedDirtyLedger?.started_at);
    expect(migratedDirtyRemote).toMatchObject({
      claimed_at: migratedDirtyRemote?.requested_at,
      claimed_by: "renderer-a",
      lease_expires_at: migratedDirtyRemote?.requested_at,
      attempt_count: 0,
      completed_at: null
    });
    expect(migratedDirtyPolicy?.allowed).toBe(0);
    expect(migratedDirtyModelStep).toMatchObject({
      completed_at: migratedDirtyModelStep?.started_at,
      input_tool_count: 0,
      attachment_count: 0
    });
    expect(() =>
      db.run(sql`
        INSERT INTO agent_run_ledgers (
          run_id,
          conversation_id,
          status,
          mode,
          model_provider,
          model_id,
          started_at,
          completed_at,
          payload
        ) VALUES (
          'bad-ledger-terminal',
          'conversation-1',
          'succeeded',
          'ai-sdk',
          'openai',
          'gpt-5.5',
          ${new Date("2026-06-06T00:02:50.000Z").getTime()},
          NULL,
          '{}'
        )
      `)
    ).toThrow();
    expect(() =>
      db.run(sql`
        INSERT INTO agent_run_remote_tool_requests (
          request_id,
          run_id,
          tool_call_id,
          tool_name,
          status,
          requested_at,
          attempt_count,
          payload
        ) VALUES (
          'bad-remote-attempt',
          'run-constraints',
          'remote-constraints',
          'getCanvasContext',
          'pending',
          ${new Date("2026-06-06T00:02:51.000Z").getTime()},
          -1,
          '{}'
        )
      `)
    ).toThrow();
    expect(() =>
      db.run(sql`
        INSERT INTO agent_run_model_steps (
          step_id,
          run_id,
          stage,
          source,
          status,
          model_provider,
          model_id,
          started_at,
          completed_at,
          input_tool_count,
          attachment_count,
          payload
        ) VALUES (
          'bad-model-step',
          'run-constraints',
          'runner_continuation',
          'model',
          'succeeded',
          'openai',
          'gpt-5.5',
          ${new Date("2026-06-06T00:02:52.000Z").getTime()},
          ${new Date("2026-06-06T00:02:53.000Z").getTime()},
          -1,
          0,
          '{}'
        )
      `)
    ).toThrow();
    expect(() =>
      db.run(sql`
        INSERT INTO agent_run_policy_decisions (
          decision_id,
          run_id,
          stage,
          kind,
          allowed,
          created_at,
          payload
        ) VALUES (
          'bad-policy-allowed',
          'run-constraints',
          'runner_start',
          'model_error',
          2,
          ${new Date("2026-06-06T00:02:54.000Z").getTime()},
          '{}'
        )
      `)
    ).toThrow();
    expect(db.select().from(agentRunModelSteps).all().map((row) => row.stepId)).toEqual(["legacy-model-step-dirty"]);
    expect(db.select().from(agentRunPolicyDecisions).all().map((row) => row.decisionId)).toEqual(["legacy-policy-dirty"]);
  });
});
