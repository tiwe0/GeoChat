import type { SqliteMigration } from "./types";

export const unifiedProblemBankMigration: SqliteMigration = {
  version: 6,
  name: "unified_problem_bank",
  up(sqlite) {
    sqlite.run(`CREATE TABLE IF NOT EXISTS unified_problem_sources (id TEXT PRIMARY KEY NOT NULL, requested_id TEXT, repo_id TEXT NOT NULL, group_name TEXT NOT NULL CHECK (group_name IN ('production', 'external', 'reasoning', 'evaluation')), commit_sha TEXT, license TEXT, local_dir TEXT, source_hash TEXT NOT NULL, imported_at INTEGER NOT NULL, raw_metadata TEXT NOT NULL)`);
    sqlite.run(`CREATE TABLE IF NOT EXISTS unified_problem_records (id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, source_item_id TEXT, source_file TEXT NOT NULL, source_index INTEGER NOT NULL, source_split TEXT, dataset_id TEXT NOT NULL, group_name TEXT NOT NULL CHECK (group_name IN ('production', 'external', 'reasoning', 'evaluation')), modality TEXT NOT NULL CHECK (modality IN ('text', 'image', 'multimodal')), construction TEXT NOT NULL CHECK (construction IN ('open_ended', 'multiple_choice', 'fill_blank', 'worked_solution', 'reasoning_trace')), prompt TEXT NOT NULL, answer_final TEXT, answer_type TEXT CHECK (answer_type IN ('label', 'free_form', 'numeric', 'expression', 'multi_label', 'unknown')), subject TEXT, grade TEXT, difficulty TEXT, language TEXT, license TEXT, media_count INTEGER NOT NULL DEFAULT 0, choice_count INTEGER NOT NULL DEFAULT 0, record_payload TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS unified_problem_sources_repo_uidx ON unified_problem_sources (repo_id, group_name)");
    sqlite.run("CREATE INDEX IF NOT EXISTS unified_problem_sources_group_idx ON unified_problem_sources (group_name)");
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS unified_problem_records_source_item_uidx ON unified_problem_records (source_id, source_file, source_index)");
    sqlite.run("CREATE INDEX IF NOT EXISTS unified_problem_records_dataset_split_idx ON unified_problem_records (dataset_id, source_split)");
    sqlite.run("CREATE INDEX IF NOT EXISTS unified_problem_records_group_idx ON unified_problem_records (group_name, dataset_id)");
    sqlite.run("CREATE INDEX IF NOT EXISTS unified_problem_records_shape_idx ON unified_problem_records (construction, modality)");
    sqlite.run("CREATE INDEX IF NOT EXISTS unified_problem_records_taxonomy_idx ON unified_problem_records (subject, grade)");
  }
};
