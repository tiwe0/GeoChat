import type { Database } from "bun:sqlite";
import { initialMigration } from "./0001_initial";
import type { SqliteMigration } from "./types";

export const sqliteMigrations: readonly SqliteMigration[] = [
  initialMigration
];

export const latestSqliteSchemaVersion = sqliteMigrations.at(-1)?.version ?? 0;

export function runSqliteMigrations(
  sqlite: Database,
  migrations: readonly SqliteMigration[] = sqliteMigrations,
): void {
  assertMigrationSequence(migrations);
  if (!hasMigrationTable(sqlite) && hasUserSchema(sqlite)) {
    throw new Error("Unsupported unversioned SQLite schema. Start with an empty database.");
  }
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS _geochat_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = sqlite.query("SELECT version, name FROM _geochat_schema_migrations ORDER BY version").all() as Array<{
    version: number;
    name: string;
  }>;
  if (applied.length === 0 && hasSchemaOutsideMigrationTable(sqlite)) {
    throw new Error("Unsupported unversioned SQLite schema. Start with an empty database.");
  }
  for (const [index, row] of applied.entries()) {
    const migration = migrations[index];
    if (!migration || migration.version !== row.version || migration.name !== row.name) {
      throw new Error(`Unsupported SQLite migration history at version ${row.version} (${row.name}).`);
    }
  }

  const appliedVersions = new Set(applied.map((row) => row.version));
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    sqlite.transaction(() => {
      migration.up(sqlite);
      sqlite.query("INSERT INTO _geochat_schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
        .run(migration.version, migration.name, Date.now());
    })();
  }
}

function hasMigrationTable(sqlite: Database): boolean {
  return sqlite.query(`
    SELECT 1
    FROM sqlite_schema
    WHERE type = 'table' AND name = '_geochat_schema_migrations'
  `).get() !== null;
}

function hasUserSchema(sqlite: Database): boolean {
  return sqlite.query(`
    SELECT 1
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
    LIMIT 1
  `).get() !== null;
}

function hasSchemaOutsideMigrationTable(sqlite: Database): boolean {
  return sqlite.query(`
    SELECT 1
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
      AND name <> '_geochat_schema_migrations'
    LIMIT 1
  `).get() !== null;
}

function assertMigrationSequence(migrations: readonly SqliteMigration[]): void {
  for (const [index, migration] of migrations.entries()) {
    if (migration.version !== index + 1) {
      throw new Error(`SQLite migrations must be contiguous; expected ${index + 1}, received ${migration.version}.`);
    }
  }
}
