import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { createDatabase } from "../backend/src/db/client";
import { runSqliteMigrations, sqliteMigrations } from "../backend/src/db/migrations";
import * as schema from "../backend/src/db/schema";

type ColumnContract = {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  primaryKeyPosition: number;
};

type IndexContract = { name: string; unique: boolean; columns: string[] };
type ForeignKeyContract = {
  columns: string[];
  foreignTable: string;
  foreignColumns: string[];
  onUpdate: string;
  onDelete: string;
};

type TableContract = {
  columns: ColumnContract[];
  indexes: IndexContract[];
  uniqueConstraints: string[][];
  uniqueColumnSets: string[][];
  foreignKeys: ForeignKeyContract[];
};

const primaryKeyTables = [
  "messages",
  "conversations",
  "legacy_conversation_import_receipts",
  "conversation_messages",
  "conversation_blackboard_entries",
  "agent_run_ledgers",
  "agent_error_events",
  "problem_sources",
  "problems",
  "problem_sets",
  "problem_attempts",
  "benchmark_runs",
  "benchmark_case_results",
  "unified_problem_sources",
  "unified_problem_records",
] as const;

function temporaryDatabasePath(label: string): string {
  return join(tmpdir(), `geochat-${label}-${crypto.randomUUID()}.sqlite`);
}

function normalizeDefault(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return String(value).replace(/^\((.*)\)$/s, "$1").replace(/^'(.*)'$/s, "$1");
}

function normalizeAction(value: string | undefined): string {
  return (value ?? "no action").toLowerCase();
}

function drizzleContracts(): Map<string, TableContract> {
  const contracts = new Map<string, TableContract>();
  for (const value of Object.values(schema)) {
    if (!is(value, SQLiteTable)) continue;
    const config = getTableConfig(value);
    const primaryKeyPositions = new Map<string, number>();
    for (const column of config.columns) {
      if (column.primary) primaryKeyPositions.set(column.name, 1);
    }
    for (const key of config.primaryKeys) {
      key.columns.forEach((column, index) => primaryKeyPositions.set(column.name, index + 1));
    }
    const indexes = config.indexes.map(({ config: index }) => ({
      name: index.name,
      unique: index.unique,
      columns: index.columns.map((column) => {
        if (!("name" in column) || typeof column.name !== "string") {
          throw new Error(`Unsupported expression index ${index.name}.`);
        }
        return column.name;
      }),
    })).toSorted((left, right) => left.name.localeCompare(right.name));
    const uniqueColumnSets = [
      ...indexes.filter(({ unique }) => unique).map(({ columns }) => columns),
      ...config.uniqueConstraints.map(({ columns }) => columns.map(({ name }) => name)),
      ...config.columns.filter(({ isUnique }) => isUnique).map(({ name }) => [name]),
    ];
    const uniqueConstraints = [
      ...config.uniqueConstraints.map(({ columns }) => columns.map(({ name }) => name)),
      ...config.columns.filter(({ isUnique }) => isUnique).map(({ name }) => [name]),
    ];
    contracts.set(config.name, {
      columns: config.columns.map((column) => ({
        name: column.name,
        type: column.getSQLType().toUpperCase(),
        notNull: column.notNull,
        defaultValue: normalizeDefault(column.default),
        primaryKeyPosition: primaryKeyPositions.get(column.name) ?? 0,
      })),
      indexes,
      uniqueConstraints: canonicalColumnSets(uniqueConstraints),
      uniqueColumnSets: canonicalColumnSets(uniqueColumnSets),
      foreignKeys: config.foreignKeys.map((foreignKey) => {
        const reference = foreignKey.reference();
        return {
          columns: reference.columns.map(({ name }) => name),
          foreignTable: getTableConfig(reference.foreignTable).name,
          foreignColumns: reference.foreignColumns.map(({ name }) => name),
          onUpdate: normalizeAction(foreignKey.onUpdate),
          onDelete: normalizeAction(foreignKey.onDelete),
        };
      }).toSorted(compareForeignKeys),
    });
  }
  return contracts;
}

function sqliteContract(sqlite: Database, table: string): TableContract {
  const columns = sqlite.query(`PRAGMA table_info("${table}")`).all() as Array<{
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>;
  const indexRows = sqlite.query(`PRAGMA index_list("${table}")`).all() as Array<{
    name: string;
    unique: number;
    origin: "c" | "u" | "pk";
  }>;
  const indexColumns = (name: string) => (sqlite.query(`PRAGMA index_info("${name}")`).all() as Array<{
    seqno: number;
    name: string;
  }>).toSorted((left, right) => left.seqno - right.seqno).map(({ name: column }) => column);
  const indexes = indexRows.filter(({ origin }) => origin === "c").map((index) => ({
    name: index.name,
    unique: index.unique === 1,
    columns: indexColumns(index.name),
  })).toSorted((left, right) => left.name.localeCompare(right.name));
  const foreignKeyRows = sqlite.query(`PRAGMA foreign_key_list("${table}")`).all() as Array<{
    id: number;
    seq: number;
    table: string;
    from: string;
    to: string;
    on_update: string;
    on_delete: string;
  }>;
  const foreignKeyGroups = Map.groupBy(foreignKeyRows, ({ id }) => id);
  return {
    columns: columns.map((column) => ({
      name: column.name,
      type: column.type.toUpperCase(),
      notNull: column.notnull === 1,
      defaultValue: normalizeDefault(column.dflt_value),
      primaryKeyPosition: column.pk,
    })),
    indexes,
    uniqueConstraints: canonicalColumnSets(indexRows
      .filter(({ origin }) => origin === "u")
      .map(({ name }) => indexColumns(name))),
    uniqueColumnSets: canonicalColumnSets(indexRows
      .filter(({ unique, origin }) => unique === 1 && origin !== "pk")
      .map(({ name }) => indexColumns(name))),
    foreignKeys: [...foreignKeyGroups.values()].map((rows) => {
      const ordered = rows!.toSorted((left, right) => left.seq - right.seq);
      return {
        columns: ordered.map(({ from }) => from),
        foreignTable: ordered[0]!.table,
        foreignColumns: ordered.map(({ to }) => to),
        onUpdate: normalizeAction(ordered[0]!.on_update),
        onDelete: normalizeAction(ordered[0]!.on_delete),
      };
    }).toSorted(compareForeignKeys),
  };
}

function canonicalColumnSets(values: string[][]): string[][] {
  return [...new Map(values.map((columns) => [columns.join("\u0000"), columns])).values()]
    .toSorted((left, right) => left.join("\u0000").localeCompare(right.join("\u0000")));
}

function compareForeignKeys(left: ForeignKeyContract, right: ForeignKeyContract): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function expectStrongParity(sqlite: Database): void {
  const expected = drizzleContracts();
  const actualTables = (sqlite.query("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>)
    .map(({ name }) => name)
    .filter((name) => !name.startsWith("__geochat_v6_backup_") && name !== "_geochat_schema_migrations")
    .toSorted();
  expect(actualTables).toEqual([...expected.keys()].toSorted());
  for (const [table, contract] of expected) {
    expect(sqliteContract(sqlite, table), `${table} schema contract`).toEqual(contract);
  }
}

function applyLegacyV6Fixture(sqlite: Database): void {
  sqlite.run("CREATE TABLE _geochat_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)");
  const legacySqlite = new Proxy(sqlite, {
    get(target, property) {
      if (property === "run") {
        return (statement: string) => {
          let legacyStatement = statement.replaceAll(/TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL/gi, "TEXT PRIMARY KEY");
          if (/CREATE TABLE IF NOT EXISTS messages/i.test(legacyStatement)) {
            legacyStatement = legacyStatement.replace("        owner_user_id TEXT,\n", "");
          }
          if (/CREATE TABLE IF NOT EXISTS conversations/i.test(legacyStatement)) {
            legacyStatement = legacyStatement
              .replace("        source_title TEXT,\n", "")
              .replace("        model TEXT,\n", "")
              .replace("        owner_user_id TEXT,\n", "");
          }
          if (/CREATE TABLE IF NOT EXISTS conversation_blackboard_entries/i.test(legacyStatement)) {
            legacyStatement = legacyStatement.replace("archived_at INTEGER\n      )", "archived_at INTEGER,\n        UNIQUE (conversation_id, key)\n      )");
          }
          return target.run(legacyStatement);
        };
      }
      const member = Reflect.get(target, property, target);
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
  for (const migration of sqliteMigrations.slice(0, 6)) {
    sqlite.transaction(() => {
      migration.up(legacySqlite);
      sqlite.query("INSERT INTO _geochat_schema_migrations VALUES (?, ?, ?)").run(migration.version, migration.name, 1);
    })();
  }
}

function seedLegacyRows(sqlite: Database): void {
  const statements = [
    "INSERT INTO messages (id, role, content, owner_user_id, created_at) VALUES ('message-1', 'user', 'keep-message', NULL, 1)",
    "INSERT INTO conversations (id, title, source_title, summary, model, owner_user_id, message_count, created_at, updated_at) VALUES ('conversation-1', 'Keep conversation', NULL, '', NULL, NULL, 1, 1, 1)",
    "INSERT INTO legacy_conversation_import_receipts (id, owner_scope_key, owner_user_id, source_fingerprint, content_fingerprint, conversation_id, outcome, reason, created_at) VALUES ('receipt-1', 'scope', NULL, 'source-fp', 'content-fp', 'conversation-1', 'imported', NULL, 1)",
    "INSERT INTO conversation_messages (id, conversation_id, role, content, created_at, payload) VALUES ('conversation-message-1', 'conversation-1', 'user', 'keep-turn', 1, '{}')",
    "INSERT INTO conversation_blackboard_entries (id, conversation_id, key, category, value, status, confidence, reason, source_message_id, source_tool_call_id, source_run_id, created_at, updated_at, archived_at) VALUES ('blackboard-1', 'conversation-1', 'goal', 'goal', 'keep-goal', 'active', 1000, '', NULL, NULL, NULL, 1, 1, NULL)",
    "INSERT INTO agent_run_ledgers (run_id, conversation_id, status, revision, model_provider, model_id, started_at, completed_at, payload) VALUES ('run-1', 'conversation-1', 'succeeded', 0, 'deepseek', 'deepseek-chat', 1, 2, '{}')",
    "INSERT INTO agent_error_events (event_id, run_id, conversation_id, source, code, severity, message, model_provider, model_id, tool_call_id, tool_name, created_at, payload) VALUES ('event-1', 'run-1', 'conversation-1', 'run', 'E_TEST', 'error', 'keep-error', NULL, NULL, NULL, NULL, 1, '{}')",
    "INSERT INTO problem_sources (id, kind, name, version, source_path, source_hash, imported_at, raw_metadata) VALUES ('source-1', 'manual', 'Keep source', '1', NULL, 'hash', 1, '{}')",
    "INSERT INTO problems (id, source_id, source_item_id, title, prompt, answer, analysis, kind, task_type, question_type, paper, year, score, category, difficulty, visual_potential, raw_payload, created_at, updated_at) VALUES ('problem-1', 'source-1', 'item-1', 'Keep problem', 'prompt', NULL, NULL, 'math_problem', 'solve', 'open_ended', NULL, NULL, NULL, NULL, 'easy', 0, '{}', 1, 1)",
    "INSERT INTO problem_sets (id, slug, title, description, source_id, kind, created_at) VALUES ('set-1', 'keep-set', 'Keep set', '', 'source-1', 'curated', 1)",
    "INSERT INTO problem_attempts (id, problem_id, conversation_id, owner_user_id, run_id, status, model_provider, model_id, started_at, completed_at, user_rating, notes) VALUES ('attempt-1', 'problem-1', 'conversation-1', NULL, 'run-1', 'completed', NULL, NULL, 1, 2, NULL, 'keep-attempt')",
    "INSERT INTO benchmark_runs (id, owner_user_id, suite_id, suite_version, suite_hash, config_hash, status, total_cases, completed_cases, passed_cases, failed_cases, config, metrics, evidence_refs, error, started_at, completed_at) VALUES ('benchmark-1', NULL, 'suite', '1', 'suite-hash', 'config-hash', 'completed', 1, 1, 1, 0, '{}', '{}', '[]', NULL, 1, 2)",
    "INSERT INTO benchmark_case_results (id, run_id, case_id, status, score, metrics, evidence_refs, error, started_at, completed_at) VALUES ('case-result-1', 'benchmark-1', 'case-1', 'passed', 1, '{}', '[]', NULL, 1, 2)",
    "INSERT INTO unified_problem_sources (id, requested_id, repo_id, group_name, commit_sha, license, local_dir, source_hash, imported_at, raw_metadata) VALUES ('unified-source-1', NULL, 'repo', 'production', NULL, NULL, NULL, 'hash', 1, '{}')",
    "INSERT INTO unified_problem_records (id, source_id, source_item_id, source_file, source_index, source_split, dataset_id, group_name, modality, construction, prompt, answer_final, answer_type, subject, grade, difficulty, language, license, media_count, choice_count, record_payload, created_at, updated_at) VALUES ('unified-record-1', 'unified-source-1', NULL, 'file.json', 0, NULL, 'dataset', 'production', 'text', 'open_ended', 'keep-unified', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, '{}', 1, 1)",
  ];
  sqlite.transaction(() => statements.forEach((statement) => sqlite.run(statement)))();
}

function tableSnapshots(sqlite: Database): Map<string, unknown[]> {
  return new Map(primaryKeyTables.map((table) => [
    table,
    sqlite.query(`SELECT * FROM "${table}" ORDER BY 1`).all(),
  ]));
}

function backupTables(sqlite: Database): Array<{ name: string }> {
  return sqlite.query("SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE '__geochat_v6_backup_%' ORDER BY name").all() as Array<{ name: string }>;
}

describe("Drizzle and SQLite schema parity", () => {
  test("extracts the contract from Drizzle metadata and matches a fresh migrated database", () => {
    const path = temporaryDatabasePath("fresh-strong-parity");
    createDatabase({ databasePath: path }).close();
    const sqlite = new Database(path, { readonly: true });
    expectStrongParity(sqlite);
    expect(backupTables(sqlite)).toEqual([]);
    sqlite.close();
  });

  test("upgrades a populated v6 fixture to strong parity without retaining recovery tables", () => {
    const sqlite = new Database(temporaryDatabasePath("v6-to-v7-parity"));
    applyLegacyV6Fixture(sqlite);
    seedLegacyRows(sqlite);
    const before = tableSnapshots(sqlite);
    expect((sqlite.query("PRAGMA table_info(messages)").all() as Array<{ name: string; notnull: number }>).find(({ name }) => name === "id")?.notnull).toBe(0);
    expect((sqlite.query("PRAGMA index_list(conversation_blackboard_entries)").all() as Array<{ unique: number; origin: string }>).filter(({ unique, origin }) => unique === 1 && origin !== "pk")).toHaveLength(2);

    runSqliteMigrations(sqlite);

    expectStrongParity(sqlite);
    expect(tableSnapshots(sqlite)).toEqual(before);
    expect(backupTables(sqlite)).toEqual([]);
    expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(sqlite.query("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
    expect(sqlite.query("SELECT MAX(version) AS version FROM _geochat_schema_migrations").get()).toEqual({ version: 7 });
    sqlite.close();
  });

  test("rolls back a blocked v7 rebuild and succeeds after the recovery-name conflict is removed", () => {
    const sqlite = new Database(temporaryDatabasePath("v7-recovery"));
    applyLegacyV6Fixture(sqlite);
    seedLegacyRows(sqlite);
    const before = tableSnapshots(sqlite);
    sqlite.run("CREATE TABLE __geochat_v6_backup_agent_run_ledgers (sentinel TEXT)");

    expect(() => runSqliteMigrations(sqlite)).toThrow("refused to overwrite recovery table");
    expect(tableSnapshots(sqlite)).toEqual(before);
    expect(sqlite.query("SELECT name FROM sqlite_schema WHERE name = '__geochat_v6_backup_messages'").get()).toBeNull();
    expect(sqlite.query("SELECT MAX(version) AS version FROM _geochat_schema_migrations").get()).toEqual({ version: 6 });

    sqlite.run("DROP TABLE __geochat_v6_backup_agent_run_ledgers");
    runSqliteMigrations(sqlite);
    expectStrongParity(sqlite);
    expect(tableSnapshots(sqlite)).toEqual(before);
    expect(backupTables(sqlite)).toEqual([]);
    sqlite.close();
  });
});
