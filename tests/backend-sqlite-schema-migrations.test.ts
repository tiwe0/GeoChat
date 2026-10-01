import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDatabase } from "../backend/src/db/client";
import { currentSchemaBaselineName } from "../backend/src/db/migrations/0001_initial";
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

const LEGACY_V7_HISTORY = [
  [1, "initial_conversations_and_agent_runs"],
  [2, "conversation_ownership_and_legacy_imports"],
  [3, "native_agent_runtime"],
  [4, "problem_bank"],
  [5, "benchmarks"],
  [6, "unified_problem_bank"],
  [7, "drizzle_schema_parity"],
] as const;

function createLegacyV7Fixture(databasePath: string): void {
  const sqlite = new Database(databasePath);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run(`CREATE TABLE _geochat_schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  const recordMigration = sqlite.query(
    "INSERT INTO _geochat_schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
  );
  for (const [version, name] of LEGACY_V7_HISTORY) recordMigration.run(version, name, version);
  sqlite.run(`CREATE TABLE conversations (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    source_title TEXT,
    summary TEXT NOT NULL,
    model TEXT,
    owner_user_id TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  sqlite.run(`CREATE TABLE conversation_messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    payload TEXT NOT NULL
  )`);
  sqlite.query(`INSERT INTO conversations (
    id, title, source_title, summary, model, owner_user_id, message_count, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "legacy-conversation",
    "Legacy title",
    "Legacy source",
    "Legacy summary",
    "legacy-model",
    "legacy-owner",
    1,
    100,
    200,
  );
  sqlite.query(`INSERT INTO conversation_messages (
    id, conversation_id, role, content, created_at, payload
  ) VALUES (?, ?, ?, ?, ?, ?)`).run(
    "legacy-message",
    "legacy-conversation",
    "assistant",
    "legacy answer",
    150,
    JSON.stringify({ id: "legacy-message", role: "assistant", content: "legacy answer" }),
  );
  sqlite.run("PRAGMA wal_checkpoint(TRUNCATE)");
  sqlite.close();
}

function createBaselineFromCommit626112a(databasePath: string): void {
  const sqlite = new Database(databasePath);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run(`CREATE TABLE _geochat_schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  sqlite.run("INSERT INTO _geochat_schema_migrations VALUES (1, 'current_schema_baseline', 1)");
  sqlite.run(`CREATE TABLE geogebra_documents (
    owner_scope_key TEXT NOT NULL,
    owner_user_id TEXT,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    content_kind TEXT NOT NULL CHECK (content_kind IN ('text', 'binary')),
    content BLOB NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 16777216),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (owner_scope_key, id)
  )`);
  sqlite.run(`CREATE TABLE agent_run_ledgers (
    run_id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    status TEXT NOT NULL CONSTRAINT agent_run_ledgers_status_ck
      CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
    revision INTEGER NOT NULL DEFAULT 0,
    model_provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    payload TEXT NOT NULL,
    CONSTRAINT agent_run_ledgers_lifecycle_ck CHECK (
      (status = 'running' AND completed_at IS NULL)
      OR (status IN ('succeeded', 'failed', 'cancelled') AND completed_at IS NOT NULL)
    ),
    CONSTRAINT agent_run_ledgers_timeline_ck CHECK (
      completed_at IS NULL OR completed_at >= started_at
    )
  )`);
  sqlite.run("CREATE INDEX geogebra_documents_scope_updated_idx ON geogebra_documents (owner_scope_key, updated_at)");
  sqlite.run("PRAGMA wal_checkpoint(TRUNCATE)");
  sqlite.close();
}

describe("SQLite schema baseline", () => {
  test("creates the current Drizzle-compatible schema from an empty database", () => {
    const databasePath = temporaryDatabasePath("schema-baseline");
    createDatabase({ databasePath }).close();
    const sqlite = new Database(databasePath);

    expect(sqliteMigrations).toHaveLength(1);
    expect(latestSqliteSchemaVersion).toBe(1);
    expect(sqlite.query("SELECT version, name FROM _geochat_schema_migrations").all()).toEqual([
      { version: 1, name: currentSchemaBaselineName }
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

  test("rejects a complete legacy v7 history without modifying its database or user data", () => {
    const databasePath = temporaryDatabasePath("legacy-v7-preservation");
    createLegacyV7Fixture(databasePath);
    const bytesBefore = readFileSync(databasePath);
    const walExistedBefore = existsSync(`${databasePath}-wal`);
    const shmExistedBefore = existsSync(`${databasePath}-shm`);

    expect(() => createDatabase({ databasePath })).toThrow(
      "Unsupported SQLite migration history at version 1 (initial_conversations_and_agent_runs)",
    );

    expect(readFileSync(databasePath)).toEqual(bytesBefore);
    expect(existsSync(`${databasePath}-wal`)).toBe(walExistedBefore);
    expect(existsSync(`${databasePath}-shm`)).toBe(shmExistedBefore);
    const reopened = new Database(databasePath, { readonly: true });
    expect(reopened.query("SELECT version, name, applied_at FROM _geochat_schema_migrations ORDER BY version").all())
      .toEqual(LEGACY_V7_HISTORY.map(([version, name]) => ({ version, name, applied_at: version })));
    expect(reopened.query("SELECT * FROM conversations").get()).toEqual({
      id: "legacy-conversation",
      title: "Legacy title",
      source_title: "Legacy source",
      summary: "Legacy summary",
      model: "legacy-model",
      owner_user_id: "legacy-owner",
      message_count: 1,
      created_at: 100,
      updated_at: 200,
    });
    expect(reopened.query("SELECT id, content, payload FROM conversation_messages").get()).toEqual({
      id: "legacy-message",
      content: "legacy answer",
      payload: JSON.stringify({ id: "legacy-message", role: "assistant", content: "legacy answer" }),
    });
    reopened.close();
  });

  test("rejects the 626112a baseline without modifying its database", () => {
    const databasePath = temporaryDatabasePath("626112a-baseline-preservation");
    createBaselineFromCommit626112a(databasePath);
    const bytesBefore = readFileSync(databasePath);
    const walExistedBefore = existsSync(`${databasePath}-wal`);
    const shmExistedBefore = existsSync(`${databasePath}-shm`);

    expect(() => createDatabase({ databasePath })).toThrow(
      "Unsupported SQLite migration history at version 1 (current_schema_baseline)",
    );

    expect(readFileSync(databasePath)).toEqual(bytesBefore);
    expect(existsSync(`${databasePath}-wal`)).toBe(walExistedBefore);
    expect(existsSync(`${databasePath}-shm`)).toBe(shmExistedBefore);
    const reopened = new Database(databasePath, { readonly: true });
    expect(reopened.query("SELECT version, name, applied_at FROM _geochat_schema_migrations").get()).toEqual({
      version: 1,
      name: "current_schema_baseline",
      applied_at: 1,
    });
    expect(reopened.query("SELECT sql FROM sqlite_schema WHERE name = 'geogebra_documents'").get()).toEqual({
      sql: expect.stringContaining("content_kind IN ('text', 'binary')"),
    });
    expect(reopened.query("PRAGMA table_info(agent_run_ledgers)").all())
      .not.toContainEqual(expect.objectContaining({ name: "client_session_id" }));
    reopened.close();
  });
});
