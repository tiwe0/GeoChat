import { existsSync, statSync } from "node:fs";
import { Database as BunDatabase } from "bun:sqlite";
import type { DesktopDebugMcpConfig } from "./config";

export type SqliteRow = Record<string, unknown>;
export type SqliteBinding = string | number | bigint | boolean | null | Uint8Array;

const mutationKeywordPattern =
  /\b(insert|update|delete|drop|alter|create|replace|vacuum|attach|detach|reindex|analyze|pragma\s+writable_schema)\b/i;

export function databaseFileInfo(config: DesktopDebugMcpConfig) {
  const database = fileInfo(config.databasePath);
  return {
    path: config.databasePath,
    exists: database.exists,
    sizeBytes: database.sizeBytes,
    modifiedAt: database.modifiedAt,
    wal: fileInfo(`${config.databasePath}-wal`),
    shm: fileInfo(`${config.databasePath}-shm`)
  };
}

export function withReadonlyDatabase<T>(config: DesktopDebugMcpConfig, fn: (db: BunDatabase) => T): T {
  if (!existsSync(config.databasePath)) {
    throw new Error(`SQLite database not found: ${config.databasePath}`);
  }
  const db = new BunDatabase(config.databasePath, { readonly: true, strict: true });
  try {
    db.run("PRAGMA busy_timeout = 5000");
    db.run("PRAGMA query_only = ON");
    return fn(db);
  } finally {
    db.close(false);
  }
}

export function all(db: BunDatabase, sql: string, params: SqliteBinding[] = []): SqliteRow[] {
  return db.query(sql).all(...params) as SqliteRow[];
}

export function get(db: BunDatabase, sql: string, params: SqliteBinding[] = []): SqliteRow | undefined {
  return db.query(sql).get(...params) as SqliteRow | undefined;
}

export function ensureSafeReadOnlySql(sql: string) {
  const trimmed = sql.trim();
  if (!/^(select|pragma)\b/i.test(trimmed)) {
    throw new Error("Only SELECT and read-only PRAGMA statements are allowed.");
  }
  if (trimmed.includes(";")) {
    throw new Error("Only one SQL statement is allowed; semicolons are rejected.");
  }
  if (mutationKeywordPattern.test(trimmed)) {
    throw new Error("The SQL contains a mutation or unsafe SQLite keyword.");
  }
}

export function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function fileInfo(path: string) {
  if (!existsSync(path)) {
    return { exists: false, sizeBytes: 0, modifiedAt: null as string | null };
  }
  const stat = statSync(path);
  return {
    exists: true,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString()
  };
}
