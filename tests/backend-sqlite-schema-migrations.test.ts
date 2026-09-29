import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDatabase } from "../backend/src/db/client";
import {
  latestSqliteSchemaVersion,
  runSqliteMigrations,
  sqliteMigrations,
} from "../backend/src/db/migrations";
import { initialMigration } from "../backend/src/db/migrations/0001_initial";
import type { SqliteMigration } from "../backend/src/db/migrations/types";
import { sqlitePrimaryKeyContract, sqliteSchemaContract } from "../backend/src/db/schema";

function temporaryDatabasePath(label: string): string {
  return join(tmpdir(), `geochat-${label}-${crypto.randomUUID()}.sqlite`);
}

function normalizeSql(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim().toLowerCase();
}

describe("versioned SQLite schema migrations", () => {
  test("migrates an empty database through every version to Drizzle schema parity", () => {
    const databasePath = temporaryDatabasePath("schema-parity");
    createDatabase({ databasePath }).close();
    const sqlite = new Database(databasePath);

    const applied = sqlite.query("SELECT version, name FROM _geochat_schema_migrations ORDER BY version").all();
    expect(applied).toEqual(sqliteMigrations.map(({ version, name }) => ({ version, name })));
    expect((applied.at(-1) as { version: number }).version).toBe(latestSqliteSchemaVersion);

    for (const [table, expected] of Object.entries(sqliteSchemaContract)) {
      const columnRows = sqlite.query(`PRAGMA table_info("${table}")`).all() as Array<{ name: string; pk: number }>;
      const columns = columnRows.map(({ name }) => name);
      expect(columns.toSorted(), `${table} columns`).toEqual(expected.columns.toSorted());
      const expectedPrimaryKey = sqlitePrimaryKeyContract[table as keyof typeof sqlitePrimaryKeyContract] ?? [];
      const primaryKey = columnRows.filter(({ pk }) => pk > 0).toSorted((left, right) => left.pk - right.pk).map(({ name }) => name);
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

  test("upgrades a version-one legacy fixture step by step without losing data", () => {
    const databasePath = temporaryDatabasePath("legacy-upgrade");
    const sqlite = new Database(databasePath);
    sqlite.run(`CREATE TABLE _geochat_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)`);
    sqlite.transaction(() => {
      initialMigration.up(sqlite);
      sqlite.query("INSERT INTO _geochat_schema_migrations VALUES (?, ?, ?)")
        .run(initialMigration.version, initialMigration.name, 1);
      sqlite.run("INSERT INTO messages (id, role, content, created_at) VALUES ('legacy-message', 'user', 'keep me', 1)");
      sqlite.run("INSERT INTO conversations (id, title, summary, message_count, created_at, updated_at) VALUES ('legacy-conversation', 'Legacy', '', 1, 1, 1)");
      sqlite.run("INSERT INTO agent_run_ledgers (run_id, conversation_id, status, mode, model_provider, model_id, started_at, completed_at, payload) VALUES ('legacy-run', 'legacy-conversation', 'succeeded', 'ai-sdk', 'deepseek', 'deepseek-chat', 1, 2, '{}')");
    })();

    runSqliteMigrations(sqlite);
    expect(sqlite.query("SELECT content, owner_user_id FROM messages WHERE id = 'legacy-message'").get())
      .toEqual({ content: "keep me", owner_user_id: null });
    expect(sqlite.query("SELECT title, source_title, model, owner_user_id FROM conversations WHERE id = 'legacy-conversation'").get())
      .toEqual({ title: "Legacy", source_title: null, model: null, owner_user_id: null });
    expect(sqlite.query("SELECT run_id, revision FROM agent_run_ledgers WHERE run_id = 'legacy-run'").get())
      .toEqual({ run_id: "legacy-run", revision: 0 });
    expect((sqlite.query("PRAGMA table_info(agent_run_ledgers)").all() as Array<{ name: string }>).map(({ name }) => name))
      .not.toContain("mode");
    expect((sqlite.query("SELECT MAX(version) AS version FROM _geochat_schema_migrations").get() as { version: number }).version)
      .toBe(latestSqliteSchemaVersion);
    sqlite.close();
  });

  test("adopts an unversioned current database without losing existing data", () => {
    const databasePath = temporaryDatabasePath("unversioned-current");
    createDatabase({ databasePath }).close();
    const sqlite = new Database(databasePath);
    sqlite.run("INSERT INTO conversations (id, title, summary, message_count, created_at, updated_at) VALUES ('existing-conversation', 'Existing', '', 0, 1, 1)");
    sqlite.run("DROP TABLE _geochat_schema_migrations");

    runSqliteMigrations(sqlite);

    expect(sqlite.query("SELECT id, title FROM conversations WHERE id = 'existing-conversation'").get())
      .toEqual({ id: "existing-conversation", title: "Existing" });
    expect(sqlite.query("SELECT version, name FROM _geochat_schema_migrations ORDER BY version").all())
      .toEqual(sqliteMigrations.map(({ version, name }) => ({ version, name })));
    sqlite.close();
  });

  test("is idempotent after the latest version is recorded", () => {
    const sqlite = new Database(temporaryDatabasePath("idempotent"));
    runSqliteMigrations(sqlite);
    const before = sqlite.query("SELECT version, name, applied_at FROM _geochat_schema_migrations ORDER BY version").all();
    runSqliteMigrations(sqlite);
    const after = sqlite.query("SELECT version, name, applied_at FROM _geochat_schema_migrations ORDER BY version").all();
    expect(after).toEqual(before);
    sqlite.close();
  });

  test("rolls back a failed migration and can recover on the next run", () => {
    const sqlite = new Database(temporaryDatabasePath("rollback"));
    const failingMigration: SqliteMigration = {
      version: 1,
      name: "transaction_probe",
      up(database) {
        database.run("CREATE TABLE should_rollback (id TEXT PRIMARY KEY)");
        throw new Error("injected migration failure");
      },
    };
    expect(() => runSqliteMigrations(sqlite, [failingMigration])).toThrow("injected migration failure");
    expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'").get()).toBeNull();
    expect(sqlite.query("SELECT * FROM _geochat_schema_migrations").all()).toEqual([]);

    const recoveredMigration: SqliteMigration = {
      version: 1,
      name: "transaction_probe",
      up(database) {
        database.run("CREATE TABLE recovered_after_rollback (id TEXT PRIMARY KEY)");
      },
    };
    runSqliteMigrations(sqlite, [recoveredMigration]);
    expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recovered_after_rollback'").get())
      .toEqual({ name: "recovered_after_rollback" });
    expect(sqlite.query("SELECT version, name FROM _geochat_schema_migrations").get())
      .toEqual({ version: 1, name: "transaction_probe" });
    sqlite.close();
  });

  test("fails closed for an unknown or rewritten migration history", () => {
    const sqlite = new Database(temporaryDatabasePath("future-version"));
    sqlite.run(`CREATE TABLE _geochat_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)`);
    sqlite.run("INSERT INTO _geochat_schema_migrations VALUES (999, 'future_schema', 1)");
    expect(() => runSqliteMigrations(sqlite)).toThrow("Unsupported SQLite migration history");
    sqlite.close();

    const gapDatabase = new Database(temporaryDatabasePath("migration-gap"));
    gapDatabase.run(`CREATE TABLE _geochat_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)`);
    gapDatabase.query("INSERT INTO _geochat_schema_migrations VALUES (?, ?, ?)")
      .run(sqliteMigrations[1]!.version, sqliteMigrations[1]!.name, 1);
    expect(() => runSqliteMigrations(gapDatabase)).toThrow("Unsupported SQLite migration history");
    gapDatabase.close();
  });
});
