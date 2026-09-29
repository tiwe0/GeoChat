import type { SqliteMigration } from "./types";

export const initialMigration: SqliteMigration = {
  version: 1,
  name: "initial_conversations_and_agent_runs",
  up(sqlite) {
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        owner_user_id TEXT,
        created_at INTEGER NOT NULL
      )
    `);
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        source_title TEXT,
        summary TEXT NOT NULL,
        model TEXT,
        owner_user_id TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      )
    `);
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS conversation_blackboard_entries (
        id TEXT PRIMARY KEY NOT NULL,
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
        archived_at INTEGER
      )
    `);
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS agent_run_ledgers (
        run_id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'ai-sdk' CHECK (mode IN ('ai-sdk', 'local-planner')),
        model_provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        payload TEXT NOT NULL
      )
    `);
    sqlite.run("CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON conversations (updated_at)");
    sqlite.run("CREATE INDEX IF NOT EXISTS conversation_messages_conversation_idx ON conversation_messages (conversation_id, created_at)");
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS conversation_blackboard_entries_conversation_key_uidx ON conversation_blackboard_entries (conversation_id, key)");
    sqlite.run("CREATE INDEX IF NOT EXISTS conversation_blackboard_entries_lookup_idx ON conversation_blackboard_entries (conversation_id, status, category)");
  }
};
