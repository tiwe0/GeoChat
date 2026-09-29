import type { Database } from "bun:sqlite";
import type { SqliteMigration } from "./types";
import { quoteIdentifier } from "./utils";

const textPrimaryKeyTables = [
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

type SchemaObject = { name: string; sql: string };
type TableColumn = { name: string; notnull: number; pk: number; type: string };

const targetColumnOrder: Partial<Record<(typeof textPrimaryKeyTables)[number], readonly string[]>> = {
  messages: ["id", "role", "content", "owner_user_id", "created_at"],
  conversations: ["id", "title", "source_title", "summary", "model", "owner_user_id", "message_count", "created_at", "updated_at"],
};

export const schemaParityMigration: SqliteMigration = {
  version: 7,
  name: "drizzle_schema_parity",
  up(sqlite) {
    const backupTables: string[] = [];
    for (const table of textPrimaryKeyTables) {
      const backupTable = rebuildTableWhenRequired(sqlite, table);
      if (backupTable) backupTables.push(backupTable);
    }
    assertDatabaseIntegrity(sqlite);
    for (const backupTable of backupTables) {
      sqlite.run(`DROP TABLE ${quoteIdentifier(backupTable)}`);
    }
    assertDatabaseIntegrity(sqlite);
  },
};

function rebuildTableWhenRequired(
  sqlite: Database,
  table: (typeof textPrimaryKeyTables)[number],
): string | null {
  const columns = sqlite.query(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as TableColumn[];
  const primaryKey = columns.filter(({ pk }) => pk > 0);
  if (primaryKey.length !== 1 || primaryKey[0]!.type.toUpperCase() !== "TEXT") {
    throw new Error(`Migration 0007 expected ${table} to have one TEXT primary key.`);
  }

  const tableRow = sqlite.query("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) as { sql: string } | null;
  if (!tableRow?.sql) throw new Error(`Migration 0007 could not read the ${table} table definition.`);

  const hasDuplicateBlackboardUnique = table === "conversation_blackboard_entries"
    && /UNIQUE\s*\(\s*conversation_id\s*,\s*key\s*\)/i.test(tableRow.sql);
  const desiredColumns = targetColumnOrder[table];
  const hasColumnOrderDrift = desiredColumns !== undefined
    && columns.map(({ name }) => name).join("\u0000") !== desiredColumns.join("\u0000");
  if (primaryKey[0]!.notnull === 1 && !hasDuplicateBlackboardUnique && !hasColumnOrderDrift) return null;

  const shadowTable = `__geochat_v7_shadow_${table}`;
  const backupTable = `__geochat_v6_backup_${table}`;
  assertTableAbsent(sqlite, shadowTable);
  assertTableAbsent(sqlite, backupTable);

  const sourceCount = rowCount(sqlite, table);
  const indexes = schemaObjects(sqlite, "index", table);
  const triggers = schemaObjects(sqlite, "trigger", table);
  const shadowSql = buildShadowTableSql(table, tableRow.sql, shadowTable, primaryKey[0]!.name);
  const targetColumns = desiredColumns ?? columns.map(({ name }) => name);
  const targetColumnList = targetColumns.map(quoteIdentifier).join(", ");

  sqlite.run(shadowSql);
  sqlite.run(`INSERT INTO ${quoteIdentifier(shadowTable)} (${targetColumnList}) SELECT ${targetColumnList} FROM ${quoteIdentifier(table)}`);
  assertRowCount(sqlite, shadowTable, sourceCount);

  for (const object of [...triggers, ...indexes]) {
    sqlite.run(`DROP ${objectKind(object, indexes)} ${quoteIdentifier(object.name)}`);
  }
  sqlite.run(`ALTER TABLE ${quoteIdentifier(table)} RENAME TO ${quoteIdentifier(backupTable)}`);
  sqlite.run(`ALTER TABLE ${quoteIdentifier(shadowTable)} RENAME TO ${quoteIdentifier(table)}`);
  for (const object of indexes) sqlite.run(object.sql);
  for (const object of triggers) sqlite.run(object.sql);

  assertRowCount(sqlite, table, sourceCount);
  assertRowCount(sqlite, backupTable, sourceCount);
  const migratedPrimaryKey = (sqlite.query(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as TableColumn[])
    .find(({ pk }) => pk > 0);
  if (!migratedPrimaryKey || migratedPrimaryKey.notnull !== 1) {
    throw new Error(`Migration 0007 did not enforce NOT NULL on ${table}'s primary key.`);
  }
  return backupTable;
}

function buildShadowTableSql(table: string, sourceSql: string, shadowTable: string, primaryKey: string): string {
  if (table === "messages") {
    return `CREATE TABLE ${quoteIdentifier(shadowTable)} (
      id TEXT PRIMARY KEY NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      owner_user_id TEXT,
      created_at INTEGER NOT NULL
    )`;
  }
  if (table === "conversations") {
    return `CREATE TABLE ${quoteIdentifier(shadowTable)} (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      source_title TEXT,
      summary TEXT NOT NULL,
      model TEXT,
      owner_user_id TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`;
  }
  let sql = sourceSql.replace(
    /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\S+)/i,
    `CREATE TABLE ${quoteIdentifier(shadowTable)}`,
  );
  const primaryKeyPattern = new RegExp(`(${escapeRegExp(primaryKey)}\\s+TEXT\\s+PRIMARY\\s+KEY)(?!\\s+NOT\\s+NULL)`, "i");
  sql = sql.replace(primaryKeyPattern, "$1 NOT NULL");
  sql = sql.replace(/,\s*UNIQUE\s*\(\s*conversation_id\s*,\s*key\s*\)\s*(?=\))/i, "");
  if (!new RegExp(`${escapeRegExp(primaryKey)}\\s+TEXT\\s+PRIMARY\\s+KEY\\s+NOT\\s+NULL`, "i").test(sql)) {
    throw new Error(`Migration 0007 could not produce a NOT NULL primary key for ${primaryKey}.`);
  }
  return sql;
}

function schemaObjects(sqlite: Database, type: "index" | "trigger", table: string): SchemaObject[] {
  return sqlite.query(
    "SELECT name, sql FROM sqlite_schema WHERE type = ? AND tbl_name = ? AND sql IS NOT NULL ORDER BY name",
  ).all(type, table) as SchemaObject[];
}

function objectKind(object: SchemaObject, indexes: readonly SchemaObject[]): "INDEX" | "TRIGGER" {
  return indexes.includes(object) ? "INDEX" : "TRIGGER";
}

function rowCount(sqlite: Database, table: string): number {
  return (sqlite.query(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get() as { count: number }).count;
}

function assertRowCount(sqlite: Database, table: string, expected: number): void {
  const actual = rowCount(sqlite, table);
  if (actual !== expected) throw new Error(`Migration 0007 row-count mismatch for ${table}: expected ${expected}, received ${actual}.`);
}

function assertTableAbsent(sqlite: Database, table: string): void {
  const row = sqlite.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table);
  if (row) throw new Error(`Migration 0007 refused to overwrite recovery table ${table}.`);
}

function assertDatabaseIntegrity(sqlite: Database): void {
  const foreignKeyViolations = sqlite.query("PRAGMA foreign_key_check").all();
  if (foreignKeyViolations.length > 0) throw new Error("Migration 0007 detected foreign-key violations.");
  const integrity = sqlite.query("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>;
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
    throw new Error(`Migration 0007 integrity check failed: ${JSON.stringify(integrity)}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
