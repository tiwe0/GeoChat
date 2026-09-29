import type { SqliteMigration } from "./types";

export const benchmarksMigration: SqliteMigration = {
  version: 5,
  name: "benchmarks",
  up(sqlite) {
    sqlite.run(`CREATE TABLE IF NOT EXISTS benchmark_runs (id TEXT PRIMARY KEY, owner_user_id TEXT, suite_id TEXT NOT NULL, suite_version TEXT NOT NULL, suite_hash TEXT NOT NULL, config_hash TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'interrupted', 'cancelled')), total_cases INTEGER NOT NULL CHECK (total_cases >= 0), completed_cases INTEGER NOT NULL DEFAULT 0, passed_cases INTEGER NOT NULL DEFAULT 0, failed_cases INTEGER NOT NULL DEFAULT 0, config TEXT NOT NULL, metrics TEXT NOT NULL, evidence_refs TEXT NOT NULL, error TEXT, started_at INTEGER NOT NULL, completed_at INTEGER, CONSTRAINT benchmark_runs_case_counts_ck CHECK (completed_cases >= 0 AND passed_cases >= 0 AND failed_cases >= 0 AND completed_cases <= total_cases AND passed_cases + failed_cases <= completed_cases), CONSTRAINT benchmark_runs_lifecycle_ck CHECK ((status = 'running' AND completed_at IS NULL) OR (status IN ('completed', 'failed', 'interrupted', 'cancelled') AND completed_at IS NOT NULL)))`);
    sqlite.run(`CREATE TABLE IF NOT EXISTS benchmark_case_results (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, case_id TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error', 'skipped')), score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 1)), metrics TEXT NOT NULL, evidence_refs TEXT NOT NULL, error TEXT, started_at INTEGER, completed_at INTEGER NOT NULL, CONSTRAINT benchmark_case_results_timeline_ck CHECK (started_at IS NULL OR completed_at >= started_at))`);
    sqlite.run("CREATE INDEX IF NOT EXISTS benchmark_runs_owner_started_idx ON benchmark_runs (owner_user_id, started_at)");
    sqlite.run("CREATE INDEX IF NOT EXISTS benchmark_runs_suite_started_idx ON benchmark_runs (suite_id, started_at)");
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS benchmark_case_results_run_case_uidx ON benchmark_case_results (run_id, case_id)");
    sqlite.run("CREATE INDEX IF NOT EXISTS benchmark_case_results_run_idx ON benchmark_case_results (run_id, completed_at)");
  }
};
