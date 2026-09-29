import type { SqliteMigration } from "./types";
import { hasTable, tableColumns } from "./utils";

const createLedgerTable = (table: string) => `
  CREATE TABLE ${table} (
    run_id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    status TEXT NOT NULL CONSTRAINT agent_run_ledgers_status_ck CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
    revision INTEGER NOT NULL DEFAULT 0,
    model_provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    payload TEXT NOT NULL,
    CONSTRAINT agent_run_ledgers_lifecycle_ck CHECK (
      (status = 'running' AND completed_at IS NULL) OR
      (status IN ('succeeded', 'failed', 'cancelled') AND completed_at IS NOT NULL)
    ),
    CONSTRAINT agent_run_ledgers_timeline_ck CHECK (completed_at IS NULL OR completed_at >= started_at)
  )
`;

export const nativeAgentRuntimeMigration: SqliteMigration = {
  version: 3,
  name: "native_agent_runtime",
  up(sqlite) {
    if (!hasTable(sqlite, "agent_run_ledgers")) {
      sqlite.run(createLedgerTable("agent_run_ledgers"));
    } else {
      const columns = tableColumns(sqlite, "agent_run_ledgers");
      const revisionExpression = columns.includes("revision") ? "revision" : "0";
      sqlite.run("DROP TABLE IF EXISTS agent_run_ledgers_v3");
      sqlite.run(createLedgerTable("agent_run_ledgers_v3"));
      sqlite.run(`
        INSERT INTO agent_run_ledgers_v3 (
          run_id, conversation_id, status, revision, model_provider, model_id, started_at, completed_at, payload
        )
        SELECT run_id, conversation_id, status, ${revisionExpression}, model_provider, model_id, started_at, completed_at, payload
        FROM agent_run_ledgers
      `);
      sqlite.run("DROP TABLE agent_run_ledgers");
      sqlite.run("ALTER TABLE agent_run_ledgers_v3 RENAME TO agent_run_ledgers");
    }
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS agent_error_events (
        event_id TEXT PRIMARY KEY NOT NULL,
        run_id TEXT NOT NULL,
        conversation_id TEXT,
        source TEXT NOT NULL CONSTRAINT agent_error_events_source_ck CHECK (source IN ('run', 'tool')),
        code TEXT NOT NULL,
        severity TEXT NOT NULL CONSTRAINT agent_error_events_severity_ck CHECK (severity IN ('warning', 'error')),
        message TEXT NOT NULL,
        model_provider TEXT,
        model_id TEXT,
        tool_call_id TEXT,
        tool_name TEXT,
        created_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      )
    `);
    sqlite.run("CREATE INDEX IF NOT EXISTS agent_error_events_run_id_idx ON agent_error_events (run_id, created_at)");
    sqlite.run("CREATE INDEX IF NOT EXISTS agent_error_events_conversation_idx ON agent_error_events (conversation_id, created_at)");
    sqlite.run("CREATE INDEX IF NOT EXISTS agent_error_events_source_idx ON agent_error_events (source, created_at)");
  }
};
