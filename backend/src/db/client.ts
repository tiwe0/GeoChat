import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sql } from "drizzle-orm";

const agentRunLedgersTableSql = `
  CREATE TABLE agent_run_ledgers (
    run_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    status TEXT NOT NULL CONSTRAINT agent_run_ledgers_status_ck CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
    mode TEXT NOT NULL CONSTRAINT agent_run_ledgers_mode_ck CHECK (mode IN ('ai-sdk', 'local-planner')),
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

const agentRunRemoteToolRequestsTableSql = `
  CREATE TABLE agent_run_remote_tool_requests (
    request_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    tool_call_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    status TEXT NOT NULL CONSTRAINT agent_run_remote_tool_requests_status_ck CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
    requested_at INTEGER NOT NULL,
    claimed_at INTEGER,
    claimed_by TEXT,
    lease_expires_at INTEGER,
    attempt_count INTEGER NOT NULL DEFAULT 0 CONSTRAINT agent_run_remote_tool_requests_attempt_count_ck CHECK (attempt_count >= 0),
    completed_at INTEGER,
    payload TEXT NOT NULL,
    UNIQUE (run_id, tool_call_id),
    CONSTRAINT agent_run_remote_tool_requests_lifecycle_ck CHECK (
      (status = 'pending' AND claimed_at IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL) OR
      (status = 'running' AND claimed_at IS NOT NULL AND lease_expires_at IS NOT NULL AND completed_at IS NULL) OR
      (status IN ('succeeded', 'failed', 'cancelled') AND completed_at IS NOT NULL)
    ),
    CONSTRAINT agent_run_remote_tool_requests_claim_state_ck CHECK (
      (claimed_by IS NULL AND lease_expires_at IS NULL) OR claimed_at IS NOT NULL
    ),
    CONSTRAINT agent_run_remote_tool_requests_timeline_ck CHECK (
      claimed_at IS NULL OR claimed_at >= requested_at
    ),
    CONSTRAINT agent_run_remote_tool_requests_lease_timeline_ck CHECK (
      lease_expires_at IS NULL OR lease_expires_at >= claimed_at
    ),
    CONSTRAINT agent_run_remote_tool_requests_completion_timeline_ck CHECK (
      completed_at IS NULL OR (
        completed_at >= requested_at AND
        (claimed_at IS NULL OR completed_at >= claimed_at)
      )
    )
  )
`;

const agentRunPolicyDecisionsTableSql = `
  CREATE TABLE agent_run_policy_decisions (
    decision_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    stage TEXT NOT NULL CONSTRAINT agent_run_policy_decisions_stage_ck CHECK (stage IN ('runner_start', 'runner_continuation', 'ledger_tool_event', 'remote_tool_request')),
    kind TEXT NOT NULL,
    allowed INTEGER NOT NULL CONSTRAINT agent_run_policy_decisions_allowed_ck CHECK (allowed IN (0, 1)),
    tool_call_id TEXT,
    tool_name TEXT,
    created_at INTEGER NOT NULL,
    payload TEXT NOT NULL
  )
`;

const agentRunModelStepsTableSql = `
  CREATE TABLE agent_run_model_steps (
    step_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    stage TEXT NOT NULL CONSTRAINT agent_run_model_steps_stage_ck CHECK (stage IN ('runner_start', 'runner_continuation')),
    source TEXT NOT NULL CONSTRAINT agent_run_model_steps_source_ck CHECK (source IN ('model', 'policy')),
    status TEXT NOT NULL CONSTRAINT agent_run_model_steps_status_ck CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
    model_provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    input_tool_count INTEGER NOT NULL CONSTRAINT agent_run_model_steps_input_tool_count_ck CHECK (input_tool_count >= 0),
    attachment_count INTEGER NOT NULL CONSTRAINT agent_run_model_steps_attachment_count_ck CHECK (attachment_count >= 0),
    output_type TEXT CONSTRAINT agent_run_model_steps_output_type_ck CHECK (output_type IN ('tool', 'finish')),
    output_tool_call_id TEXT,
    output_tool_name TEXT,
    payload TEXT NOT NULL,
    CONSTRAINT agent_run_model_steps_lifecycle_ck CHECK (
      (status = 'running' AND completed_at IS NULL) OR
      (status IN ('succeeded', 'failed', 'cancelled') AND completed_at IS NOT NULL)
    ),
    CONSTRAINT agent_run_model_steps_timeline_ck CHECK (completed_at IS NULL OR completed_at >= started_at)
  )
`;

const agentErrorEventsTableSql = `
  CREATE TABLE agent_error_events (
    event_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    conversation_id TEXT,
    source TEXT NOT NULL CONSTRAINT agent_error_events_source_ck CHECK (source IN ('run', 'tool', 'remote_tool_request', 'policy', 'model_step')),
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
  db.run(sql.raw(agentRunRemoteToolRequestsTableSql.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")));
  db.run(sql.raw(agentRunPolicyDecisionsTableSql.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")));
  db.run(sql.raw(agentRunModelStepsTableSql.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")));
  db.run(sql.raw(agentErrorEventsTableSql.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")));

  ensureColumn(sqlite, "agent_run_remote_tool_requests", "claimed_by", "claimed_by TEXT");
  ensureColumn(sqlite, "agent_run_remote_tool_requests", "lease_expires_at", "lease_expires_at INTEGER");
  ensureColumn(sqlite, "agent_run_remote_tool_requests", "attempt_count", "attempt_count INTEGER NOT NULL DEFAULT 0");
  ensureTableConstraints(sqlite, {
    table: "agent_run_ledgers",
    marker: "agent_run_ledgers_lifecycle_ck",
    createSql: agentRunLedgersTableSql,
    columns: [
      "run_id",
      "conversation_id",
      "status",
      "mode",
      "model_provider",
      "model_id",
      "started_at",
      "completed_at",
      "payload"
    ],
    selectExpressions: [
      "run_id",
      "conversation_id",
      "status",
      "mode",
      "model_provider",
      "model_id",
      "started_at",
      "CASE WHEN status = 'running' THEN NULL WHEN completed_at IS NULL OR completed_at < started_at THEN started_at ELSE completed_at END",
      "payload"
    ]
  });
  ensureTableConstraints(sqlite, {
    table: "agent_run_remote_tool_requests",
    marker: "agent_run_remote_tool_requests_lifecycle_ck",
    createSql: agentRunRemoteToolRequestsTableSql,
    columns: [
      "request_id",
      "run_id",
      "tool_call_id",
      "tool_name",
      "status",
      "requested_at",
      "claimed_at",
      "claimed_by",
      "lease_expires_at",
      "attempt_count",
      "completed_at",
      "payload"
    ],
    selectExpressions: [
      "request_id",
      "run_id",
      "tool_call_id",
      "tool_name",
      "status",
      "requested_at",
      "CASE WHEN status = 'pending' THEN NULL WHEN claimed_at IS NULL OR claimed_at < requested_at THEN requested_at ELSE claimed_at END",
      "CASE WHEN status = 'pending' THEN NULL ELSE claimed_by END",
      `CASE
        WHEN status IN ('pending', 'succeeded', 'failed', 'cancelled') THEN NULL
        WHEN lease_expires_at IS NULL OR lease_expires_at < (CASE WHEN claimed_at IS NULL OR claimed_at < requested_at THEN requested_at ELSE claimed_at END)
          THEN (CASE WHEN claimed_at IS NULL OR claimed_at < requested_at THEN requested_at ELSE claimed_at END)
        ELSE lease_expires_at
      END`,
      "CASE WHEN attempt_count IS NULL OR attempt_count < 0 THEN 0 ELSE attempt_count END",
      `CASE
        WHEN status IN ('pending', 'running') THEN NULL
        WHEN completed_at IS NULL OR completed_at < requested_at THEN requested_at
        WHEN claimed_at IS NOT NULL AND completed_at < claimed_at THEN claimed_at
        ELSE completed_at
      END`,
      "payload"
    ]
  });
  ensureTableConstraints(sqlite, {
    table: "agent_run_policy_decisions",
    marker: "agent_run_policy_decisions_allowed_ck",
    createSql: agentRunPolicyDecisionsTableSql,
    columns: [
      "decision_id",
      "run_id",
      "stage",
      "kind",
      "allowed",
      "tool_call_id",
      "tool_name",
      "created_at",
      "payload"
    ],
    selectExpressions: [
      "decision_id",
      "run_id",
      "stage",
      "kind",
      "CASE WHEN allowed = 1 THEN 1 ELSE 0 END",
      "tool_call_id",
      "tool_name",
      "created_at",
      "payload"
    ]
  });
  ensureTableConstraints(sqlite, {
    table: "agent_run_model_steps",
    marker: "agent_run_model_steps_lifecycle_ck",
    createSql: agentRunModelStepsTableSql,
    columns: [
      "step_id",
      "run_id",
      "stage",
      "source",
      "status",
      "model_provider",
      "model_id",
      "started_at",
      "completed_at",
      "input_tool_count",
      "attachment_count",
      "output_type",
      "output_tool_call_id",
      "output_tool_name",
      "payload"
    ],
    selectExpressions: [
      "step_id",
      "run_id",
      "stage",
      "source",
      "status",
      "model_provider",
      "model_id",
      "started_at",
      "CASE WHEN status = 'running' THEN NULL WHEN completed_at IS NULL OR completed_at < started_at THEN started_at ELSE completed_at END",
      "CASE WHEN input_tool_count IS NULL OR input_tool_count < 0 THEN 0 ELSE input_tool_count END",
      "CASE WHEN attachment_count IS NULL OR attachment_count < 0 THEN 0 ELSE attachment_count END",
      "output_type",
      "output_tool_call_id",
      "output_tool_name",
      "payload"
    ]
  });
  ensureTableConstraints(sqlite, {
    table: "agent_error_events",
    marker: "agent_error_events_source_ck",
    createSql: agentErrorEventsTableSql,
    columns: [
      "event_id",
      "run_id",
      "conversation_id",
      "source",
      "code",
      "severity",
      "message",
      "model_provider",
      "model_id",
      "tool_call_id",
      "tool_name",
      "created_at",
      "payload"
    ],
    selectExpressions: [
      "event_id",
      "run_id",
      "conversation_id",
      "source",
      "code",
      "severity",
      "message",
      "model_provider",
      "model_id",
      "tool_call_id",
      "tool_name",
      "created_at",
      "payload"
    ]
  });

  db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS agent_run_remote_tool_requests_run_tool_call_uidx
    ON agent_run_remote_tool_requests (run_id, tool_call_id)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS agent_run_remote_tool_requests_run_id_idx
    ON agent_run_remote_tool_requests (run_id, status, requested_at)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS agent_run_policy_decisions_run_id_idx
    ON agent_run_policy_decisions (run_id, created_at)
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS agent_run_model_steps_run_id_idx
    ON agent_run_model_steps (run_id, started_at)
  `);

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

function ensureColumn(sqlite: Database, table: string, column: string, columnDefinition: string) {
  const columns = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  sqlite.run(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`);
}

function ensureTableConstraints(
  sqlite: Database,
  input: { table: string; marker: string; createSql: string; columns: string[]; selectExpressions?: string[] }
) {
  const row = sqlite
    .query(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(input.table) as { sql?: string } | undefined;
  if (row?.sql?.includes(input.marker)) return;

  const oldTable = `${input.table}_old`;
  const columnList = input.columns.join(", ");
  const selectList = (input.selectExpressions ?? input.columns).join(", ");
  sqlite.run("BEGIN");
  try {
    sqlite.run(`DROP TABLE IF EXISTS ${oldTable}`);
    sqlite.run(`ALTER TABLE ${input.table} RENAME TO ${oldTable}`);
    sqlite.run(input.createSql);
    sqlite.run(`
      INSERT INTO ${input.table} (${columnList})
      SELECT ${selectList}
      FROM ${oldTable}
    `);
    sqlite.run(`DROP TABLE ${oldTable}`);
    sqlite.run("COMMIT");
  } catch (error) {
    sqlite.run("ROLLBACK");
    throw error;
  }
}
