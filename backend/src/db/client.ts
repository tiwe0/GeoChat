import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sql } from "drizzle-orm";
import {
  compactAgentRunLedgerForStorage,
  finishAgentRunLedger,
  isAgentRunLedgerRecord,
} from "@geochat-ai/app";

const agentRunLedgersTableSql = `
  CREATE TABLE agent_run_ledgers (
    run_id TEXT PRIMARY KEY,
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


const agentErrorEventsTableSql = `
  CREATE TABLE agent_error_events (
    event_id TEXT PRIMARY KEY,
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
`;

export function createDatabase() {
  const databasePath = resolve(Bun.env.GEOCHAT_DESKTOP_DB_PATH ?? "./data/geochat-desktop.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  configureSqliteConnection(sqlite);
  migrateLegacyAgentRunLedgers(sqlite);
  const db = drizzle(sqlite);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      owner_user_id TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  ensureColumn(sqlite, "messages", "owner_user_id", "owner_user_id TEXT");

  db.run(sql`
    CREATE INDEX IF NOT EXISTS messages_owner_created_at_idx
    ON messages (owner_user_id, created_at)
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      owner_user_id TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS conversation_blackboard_entries (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      key TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('original_problem', 'givens', 'goal', 'math_analysis', 'construction_plan', 'canvas_state', 'assumptions', 'open_issues', 'failed_attempts', 'teaching_notes')),
      value TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
      confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 1000),
      reason TEXT NOT NULL,
      source_message_id TEXT,
      source_tool_call_id TEXT,
      source_run_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER,
      UNIQUE (conversation_id, key)
    )
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS conversations_updated_at_idx
    ON conversations (updated_at)
  `);

  ensureColumn(sqlite, "conversations", "owner_user_id", "owner_user_id TEXT");

  db.run(sql`
    CREATE INDEX IF NOT EXISTS conversations_owner_updated_at_idx
    ON conversations (owner_user_id, updated_at)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS conversation_messages_conversation_idx
    ON conversation_messages (conversation_id, created_at)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS conversation_blackboard_entries_lookup_idx
    ON conversation_blackboard_entries (conversation_id, status, category)
  `);

  db.run(sql.raw(agentRunLedgersTableSql.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")));
  ensureColumn(sqlite, "agent_run_ledgers", "revision", "revision INTEGER NOT NULL DEFAULT 0");
  reconcileInterruptedAgentRuns(sqlite);
  db.run(sql.raw(agentErrorEventsTableSql.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")));

  db.run(sql`
    CREATE INDEX IF NOT EXISTS agent_error_events_run_id_idx
    ON agent_error_events (run_id, created_at)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS agent_error_events_conversation_idx
    ON agent_error_events (conversation_id, created_at)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS agent_error_events_source_idx
    ON agent_error_events (source, created_at)
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS problem_sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('geochat_benchmark_case', 'gaokao_source_collection', 'manual')),
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      source_path TEXT,
      source_hash TEXT NOT NULL,
      imported_at INTEGER NOT NULL,
      raw_metadata TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS problems (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      answer TEXT,
      analysis TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('math_problem', 'exploration', 'regression')),
      task_type TEXT NOT NULL CHECK (task_type IN ('draw', 'solve', 'explain', 'construct', 'diagnose', 'revise', 'mixed', 'animation')),
      question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'fill_blank', 'open_ended', 'curated')),
      paper TEXT,
      year TEXT,
      score INTEGER,
      category TEXT,
      difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
      visual_potential INTEGER NOT NULL CHECK (visual_potential IN (0, 1)),
      raw_payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (source_id, source_item_id)
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS problem_tags (
      problem_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      UNIQUE (problem_id, tag)
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS problem_topics (
      problem_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      UNIQUE (problem_id, topic)
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS problem_sets (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('curated', 'generated', 'imported', 'eval')),
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS problem_set_items (
      set_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      UNIQUE (set_id, problem_id)
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS problem_attempts (
      id TEXT PRIMARY KEY,
      problem_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      owner_user_id TEXT,
      run_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
      model_provider TEXT,
      model_id TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      user_rating INTEGER,
      notes TEXT,
      CONSTRAINT problem_attempts_lifecycle_ck CHECK (
        (status = 'started' AND completed_at IS NULL) OR
        (status IN ('completed', 'failed') AND completed_at IS NOT NULL)
      )
    )
  `);

  db.run(sql`CREATE INDEX IF NOT EXISTS problems_search_idx ON problems (task_type, difficulty, visual_potential)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS problem_tags_tag_idx ON problem_tags (tag)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS problem_topics_topic_idx ON problem_topics (topic)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS problem_set_items_set_order_idx ON problem_set_items (set_id, sort_order)`);
  ensureColumn(sqlite, "problem_attempts", "owner_user_id", "owner_user_id TEXT");
  db.run(sql`CREATE INDEX IF NOT EXISTS problem_attempts_owner_idx ON problem_attempts (owner_user_id, started_at)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS problem_attempts_problem_idx ON problem_attempts (problem_id, started_at)`);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS benchmark_runs (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      suite_id TEXT NOT NULL,
      suite_version TEXT NOT NULL,
      suite_hash TEXT NOT NULL,
      config_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'interrupted', 'cancelled')),
      total_cases INTEGER NOT NULL CHECK (total_cases >= 0),
      completed_cases INTEGER NOT NULL DEFAULT 0,
      passed_cases INTEGER NOT NULL DEFAULT 0,
      failed_cases INTEGER NOT NULL DEFAULT 0,
      config TEXT NOT NULL,
      metrics TEXT NOT NULL,
      evidence_refs TEXT NOT NULL,
      error TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      CONSTRAINT benchmark_runs_case_counts_ck CHECK (
        completed_cases >= 0 AND passed_cases >= 0 AND failed_cases >= 0 AND
        completed_cases <= total_cases AND passed_cases + failed_cases <= completed_cases
      ),
      CONSTRAINT benchmark_runs_lifecycle_ck CHECK (
        (status = 'running' AND completed_at IS NULL) OR
        (status IN ('completed', 'failed', 'interrupted', 'cancelled') AND completed_at IS NOT NULL)
      )
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS benchmark_case_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error', 'skipped')),
      score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
      metrics TEXT NOT NULL,
      evidence_refs TEXT NOT NULL,
      error TEXT,
      started_at INTEGER,
      completed_at INTEGER NOT NULL,
      CONSTRAINT benchmark_case_results_timeline_ck CHECK (started_at IS NULL OR completed_at >= started_at),
      UNIQUE (run_id, case_id)
    )
  `);

  db.run(sql`CREATE INDEX IF NOT EXISTS benchmark_runs_owner_started_idx ON benchmark_runs (owner_user_id, started_at)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS benchmark_runs_suite_started_idx ON benchmark_runs (suite_id, started_at)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS benchmark_case_results_run_idx ON benchmark_case_results (run_id, completed_at)`);
  reconcileInterruptedBenchmarkRuns(sqlite);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS unified_problem_sources (
      id TEXT PRIMARY KEY,
      requested_id TEXT,
      repo_id TEXT NOT NULL,
      group_name TEXT NOT NULL CHECK (group_name IN ('production', 'external', 'reasoning', 'evaluation')),
      commit_sha TEXT,
      license TEXT,
      local_dir TEXT,
      source_hash TEXT NOT NULL,
      imported_at INTEGER NOT NULL,
      raw_metadata TEXT NOT NULL,
      UNIQUE (repo_id, group_name)
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS unified_problem_records (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_item_id TEXT,
      source_file TEXT NOT NULL,
      source_index INTEGER NOT NULL,
      source_split TEXT,
      dataset_id TEXT NOT NULL,
      group_name TEXT NOT NULL CHECK (group_name IN ('production', 'external', 'reasoning', 'evaluation')),
      modality TEXT NOT NULL CHECK (modality IN ('text', 'image', 'multimodal')),
      construction TEXT NOT NULL CHECK (construction IN ('open_ended', 'multiple_choice', 'fill_blank', 'worked_solution', 'reasoning_trace')),
      prompt TEXT NOT NULL,
      answer_final TEXT,
      answer_type TEXT CHECK (answer_type IN ('label', 'free_form', 'numeric', 'expression', 'multi_label', 'unknown')),
      subject TEXT,
      grade TEXT,
      difficulty TEXT,
      language TEXT,
      license TEXT,
      media_count INTEGER NOT NULL DEFAULT 0,
      choice_count INTEGER NOT NULL DEFAULT 0,
      record_payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (source_id, source_file, source_index)
    )
  `);

  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS unified_problem_sources_repo_uidx ON unified_problem_sources (repo_id, group_name)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS unified_problem_sources_group_idx ON unified_problem_sources (group_name)`);
  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS unified_problem_records_source_item_uidx ON unified_problem_records (source_id, source_file, source_index)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS unified_problem_records_dataset_split_idx ON unified_problem_records (dataset_id, source_split)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS unified_problem_records_group_idx ON unified_problem_records (group_name, dataset_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS unified_problem_records_shape_idx ON unified_problem_records (construction, modality)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS unified_problem_records_taxonomy_idx ON unified_problem_records (subject, grade)`);

  return db;
}

function configureSqliteConnection(sqlite: Database) {
  sqlite.run("PRAGMA busy_timeout = 5000");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA synchronous = NORMAL");
}

function migrateLegacyAgentRunLedgers(sqlite: Database) {
  const columns = sqlite.query("PRAGMA table_info(agent_run_ledgers)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "mode")) return;

  const replacementTable = "agent_run_ledgers_native";
  const replacementSql = agentRunLedgersTableSql.replace("agent_run_ledgers", replacementTable);
  sqlite.transaction(() => {
    sqlite.run(`DROP TABLE IF EXISTS ${replacementTable}`);
    sqlite.run(replacementSql);
    sqlite.run(`
      INSERT INTO ${replacementTable} (
        run_id, conversation_id, status, model_provider, model_id, started_at, completed_at, payload
      )
      SELECT
        run_id, conversation_id, status, model_provider, model_id, started_at, completed_at, payload
      FROM agent_run_ledgers
    `);
    sqlite.run("DROP TABLE agent_run_ledgers");
    sqlite.run(`ALTER TABLE ${replacementTable} RENAME TO agent_run_ledgers`);
  })();
}

function reconcileInterruptedAgentRuns(sqlite: Database) {
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
        console.error(`[ERROR] Failed to reconcile interrupted agent run runId=${row.run_id}`, error);
      }
    }
  })();
}

function reconcileInterruptedBenchmarkRuns(sqlite: Database) {
  const completedAt = Date.now();
  sqlite.query(`
    UPDATE benchmark_runs
    SET status = 'interrupted',
        completed_at = ?,
        error = COALESCE(error, 'Backend restarted before benchmark completion.')
    WHERE status = 'running'
  `).run(completedAt);
}

function ensureColumn(sqlite: Database, table: string, column: string, columnDefinition: string) {
  const columns = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  sqlite.run(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`);
}
