import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDatabase } from "../backend/src/db/client";
import {
  latestSqliteSchemaVersion,
  runSqliteMigrations,
  sqliteMigrations
} from "../backend/src/db/migrations";
import type { SqliteMigration } from "../backend/src/db/migrations/types";
import { sqlitePrimaryKeyContract, sqliteSchemaContract } from "../backend/src/db/schema";

function temporaryDatabasePath(label: string): string {
  return join(tmpdir(), `geochat-${label}-${crypto.randomUUID()}.sqlite`);
}

function normalizeSql(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim().toLowerCase();
}

describe("SQLite schema baseline", () => {
  test("creates the current Drizzle-compatible schema from an empty database", () => {
    const databasePath = temporaryDatabasePath("schema-baseline");
    createDatabase({ databasePath }).close();
    const sqlite = new Database(databasePath);

    expect(sqliteMigrations).toHaveLength(1);
    expect(latestSqliteSchemaVersion).toBe(1);
    expect(sqlite.query("SELECT version, name FROM _geochat_schema_migrations").all()).toEqual([
      { version: 1, name: "current_schema_baseline" }
    ]);

    for (const [table, expected] of Object.entries(sqliteSchemaContract)) {
      const columnRows = sqlite.query(`PRAGMA table_info("${table}")`).all() as Array<{ name: string; pk: number }>;
      expect(columnRows.map(({ name }) => name).toSorted(), `${table} columns`).toEqual(expected.columns.toSorted());
      const expectedPrimaryKey = sqlitePrimaryKeyContract[table as keyof typeof sqlitePrimaryKeyContract] ?? [];
      const primaryKey = columnRows.filter(({ pk }) => pk > 0)
        .toSorted((left, right) => left.pk - right.pk)
        .map(({ name }) => name);
      expect(primaryKey, `${table} primary key`).toEqual(expectedPrimaryKey);

      const indexes = new Set((sqlite.query(`PRAGMA index_list("${table}")`).all() as Array<{ name: string }>).map(({ name }) => name));
      for (const index of expected.indexes) expect(indexes.has(index), `${table} index ${index}`).toBe(true);

      const row = sqlite.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string };
      const tableSql = normalizeSql(row.sql);
      for (const check of expected.checks) {
        expect(tableSql.includes(normalizeSql(check)), `${table} constraint ${check}`).toBe(true);
      }
    }
    sqlite.close();
  });

  test("is idempotent after the baseline is recorded", () => {
    const sqlite = new Database(temporaryDatabasePath("idempotent"));
    runSqliteMigrations(sqlite);
    const before = sqlite.query("SELECT version, name, applied_at FROM _geochat_schema_migrations").all();
    runSqliteMigrations(sqlite);
    expect(sqlite.query("SELECT version, name, applied_at FROM _geochat_schema_migrations").all()).toEqual(before);
    sqlite.close();
  });

  test("rolls back a failed baseline and can retry cleanly", () => {
    const sqlite = new Database(temporaryDatabasePath("rollback"));
    const failingMigration: SqliteMigration = {
      version: 1,
      name: "transaction_probe",
      up(database) {
        database.run("CREATE TABLE should_rollback (id TEXT PRIMARY KEY)");
        throw new Error("injected migration failure");
      }
    };
    expect(() => runSqliteMigrations(sqlite, [failingMigration])).toThrow("injected migration failure");
    expect(sqlite.query("SELECT name FROM sqlite_master WHERE name = 'should_rollback'").get()).toBeNull();
    expect(sqlite.query("SELECT * FROM _geochat_schema_migrations").all()).toEqual([]);

    const recoveredMigration: SqliteMigration = {
      version: 1,
      name: "transaction_probe",
      up(database) {
        database.run("CREATE TABLE recovered_after_rollback (id TEXT PRIMARY KEY)");
      }
    };
    runSqliteMigrations(sqlite, [recoveredMigration]);
    expect(sqlite.query("SELECT version, name FROM _geochat_schema_migrations").get())
      .toEqual({ version: 1, name: "transaction_probe" });
    sqlite.close();
  });

  test("rejects unversioned schemas and unknown or rewritten histories", () => {
    const unversioned = new Database(temporaryDatabasePath("unversioned"));
    unversioned.run("CREATE TABLE conversations (id TEXT PRIMARY KEY)");
    expect(() => runSqliteMigrations(unversioned)).toThrow("Unsupported unversioned SQLite schema");
    expect(unversioned.query("SELECT name FROM sqlite_schema WHERE name = '_geochat_schema_migrations'").get()).toBeNull();
    unversioned.close();

    const future = new Database(temporaryDatabasePath("future"));
    future.run("CREATE TABLE _geochat_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)");
    future.run("INSERT INTO _geochat_schema_migrations VALUES (999, 'future_schema', 1)");
    expect(() => runSqliteMigrations(future)).toThrow("Unsupported SQLite migration history");
    future.close();

    const rewritten = new Database(temporaryDatabasePath("rewritten"));
    rewritten.run("CREATE TABLE _geochat_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)");
    rewritten.run("INSERT INTO _geochat_schema_migrations VALUES (1, 'old_initial_schema', 1)");
    expect(() => runSqliteMigrations(rewritten)).toThrow("Unsupported SQLite migration history");
    rewritten.close();
  });
});
