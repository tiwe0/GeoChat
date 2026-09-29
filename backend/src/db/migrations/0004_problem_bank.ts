import type { SqliteMigration } from "./types";
import { addColumnIfMissing } from "./utils";

export const problemBankMigration: SqliteMigration = {
  version: 4,
  name: "problem_bank",
  up(sqlite) {
    sqlite.run(`CREATE TABLE IF NOT EXISTS problem_sources (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('geochat_benchmark_case', 'gaokao_source_collection', 'manual')), name TEXT NOT NULL, version TEXT NOT NULL, source_path TEXT, source_hash TEXT NOT NULL, imported_at INTEGER NOT NULL, raw_metadata TEXT NOT NULL)`);
    sqlite.run(`CREATE TABLE IF NOT EXISTS problems (id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, source_item_id TEXT NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL, answer TEXT, analysis TEXT, kind TEXT NOT NULL CHECK (kind IN ('math_problem', 'exploration', 'regression')), task_type TEXT NOT NULL CHECK (task_type IN ('draw', 'solve', 'explain', 'construct', 'diagnose', 'revise', 'mixed', 'animation')), question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'fill_blank', 'open_ended', 'curated')), paper TEXT, year TEXT, score INTEGER, category TEXT, difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')), visual_potential INTEGER NOT NULL CHECK (visual_potential IN (0, 1)), raw_payload TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS problems_source_item_uidx ON problems (source_id, source_item_id)");
    sqlite.run("CREATE INDEX IF NOT EXISTS problems_search_idx ON problems (task_type, difficulty, visual_potential)");
    sqlite.run("CREATE TABLE IF NOT EXISTS problem_tags (problem_id TEXT NOT NULL, tag TEXT NOT NULL)");
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS problem_tags_uidx ON problem_tags (problem_id, tag)");
    sqlite.run("CREATE INDEX IF NOT EXISTS problem_tags_tag_idx ON problem_tags (tag)");
    sqlite.run("CREATE TABLE IF NOT EXISTS problem_topics (problem_id TEXT NOT NULL, topic TEXT NOT NULL)");
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS problem_topics_uidx ON problem_topics (problem_id, topic)");
    sqlite.run("CREATE INDEX IF NOT EXISTS problem_topics_topic_idx ON problem_topics (topic)");
    sqlite.run(`CREATE TABLE IF NOT EXISTS problem_sets (id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, source_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('curated', 'generated', 'imported', 'eval')), created_at INTEGER NOT NULL)`);
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS problem_sets_slug_uidx ON problem_sets (slug)");
    sqlite.run("CREATE TABLE IF NOT EXISTS problem_set_items (set_id TEXT NOT NULL, problem_id TEXT NOT NULL, sort_order INTEGER NOT NULL)");
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS problem_set_items_uidx ON problem_set_items (set_id, problem_id)");
    sqlite.run("CREATE INDEX IF NOT EXISTS problem_set_items_set_order_idx ON problem_set_items (set_id, sort_order)");
    sqlite.run(`CREATE TABLE IF NOT EXISTS problem_attempts (id TEXT PRIMARY KEY NOT NULL, problem_id TEXT NOT NULL, conversation_id TEXT NOT NULL, owner_user_id TEXT, run_id TEXT, status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')), model_provider TEXT, model_id TEXT, started_at INTEGER NOT NULL, completed_at INTEGER, user_rating INTEGER, notes TEXT, CONSTRAINT problem_attempts_lifecycle_ck CHECK ((status = 'started' AND completed_at IS NULL) OR (status IN ('completed', 'failed') AND completed_at IS NOT NULL)))`);
    addColumnIfMissing(sqlite, "problem_attempts", "owner_user_id", "owner_user_id TEXT");
    sqlite.run("CREATE INDEX IF NOT EXISTS problem_attempts_owner_idx ON problem_attempts (owner_user_id, started_at)");
    sqlite.run("CREATE INDEX IF NOT EXISTS problem_attempts_problem_idx ON problem_attempts (problem_id, started_at)");
  }
};
