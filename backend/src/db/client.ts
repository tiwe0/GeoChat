import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
  compactAgentRunLedgerForStorage,
  finishAgentRunLedger,
  isAgentRunLedgerRecord,
} from "@geochat-ai/app/agent-run";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { runSqliteMigrations } from "./migrations";

const logger = createStructuredLogger("db.lifecycle");

export type CreateDatabaseOptions = {
  databasePath?: string;
  reconcileInterruptedRuntimeState?: boolean;
};

export function createDatabase(options: CreateDatabaseOptions = {}) {
  const databasePath = resolve(options.databasePath ?? Bun.env.GEOCHAT_DESKTOP_DB_PATH ?? "./data/geochat-desktop.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  try {
    configureSqliteConnection(sqlite);
    runSqliteMigrations(sqlite);
    if (options.reconcileInterruptedRuntimeState) {
      reconcileInterruptedAgentRuns(sqlite);
      reconcileInterruptedBenchmarkRuns(sqlite);
    }
  } catch (error) {
    sqlite.close();
    throw error;
  }

  const db = drizzle(sqlite);
  let closed = false;
  return Object.assign(db, {
    close() {
      if (closed) return;
      closed = true;
      sqlite.close();
    }
  });
}

function configureSqliteConnection(sqlite: Database): void {
  sqlite.run("PRAGMA busy_timeout = 5000");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA synchronous = NORMAL");
}

function reconcileInterruptedAgentRuns(sqlite: Database): void {
  const rows = sqlite.query("SELECT run_id, revision, payload FROM agent_run_ledgers WHERE status = 'running'").all() as Array<{
    run_id: string;
    revision: number;
    payload: string;
  }>;
  if (!rows.length) return;
  const completedAt = new Date().toISOString();
  const update = sqlite.query(`
    UPDATE agent_run_ledgers
    SET status = ?, revision = ?, completed_at = ?, payload = ?
    WHERE run_id = ? AND status = 'running'
  `);
  sqlite.transaction(() => {
    for (const row of rows) {
      try {
        const payload = { ...JSON.parse(row.payload), revision: row.revision };
        if (!isAgentRunLedgerRecord(payload)) continue;
        const hasFinished = payload.tools.some((tool) => tool.toolName === "setFinished" && tool.status === "succeeded");
        const terminal = compactAgentRunLedgerForStorage(finishAgentRunLedger({
          ...payload,
          revision: row.revision + 1,
          continuationLeaseId: null,
          continuationLeaseExpiresAt: null,
        }, {
          status: hasFinished ? "succeeded" : "cancelled",
          completedAt,
          ...(hasFinished ? { usage: payload.usage } : { error: "Interrupted before completion." }),
        }));
        update.run(terminal.status, terminal.revision, Date.parse(completedAt), JSON.stringify(terminal), row.run_id);
      } catch (error) {
        logger.warn("interrupted_run_reconcile_failed", "DB_RUN_RECONCILE_FAILED", { error, runId: row.run_id });
      }
    }
  })();
}

function reconcileInterruptedBenchmarkRuns(sqlite: Database): void {
  const completedAt = Date.now();
  sqlite.query(`
    UPDATE benchmark_runs
    SET status = 'interrupted',
        completed_at = ?,
        error = COALESCE(error, 'Backend restarted before benchmark completion.')
    WHERE status = 'running'
  `).run(completedAt);
}
