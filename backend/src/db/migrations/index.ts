import type { Database } from "bun:sqlite";
import { initialMigration } from "./0001_initial";
import { conversationOwnershipMigration } from "./0002_conversation_ownership";
import { nativeAgentRuntimeMigration } from "./0003_native_agent_runtime";
import { problemBankMigration } from "./0004_problem_bank";
import { benchmarksMigration } from "./0005_benchmarks";
import { unifiedProblemBankMigration } from "./0006_unified_problem_bank";
import type { SqliteMigration } from "./types";

export const sqliteMigrations: readonly SqliteMigration[] = [
  initialMigration,
  conversationOwnershipMigration,
  nativeAgentRuntimeMigration,
  problemBankMigration,
  benchmarksMigration,
  unifiedProblemBankMigration,
];

export const latestSqliteSchemaVersion = sqliteMigrations.at(-1)?.version ?? 0;

export function runSqliteMigrations(
  sqlite: Database,
  migrations: readonly SqliteMigration[] = sqliteMigrations,
): void {
  assertMigrationSequence(migrations);
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

function assertMigrationSequence(migrations: readonly SqliteMigration[]): void {
  for (const [index, migration] of migrations.entries()) {
    if (migration.version !== index + 1) {
      throw new Error(`SQLite migrations must be contiguous; expected ${index + 1}, received ${migration.version}.`);
    }
  }
}
