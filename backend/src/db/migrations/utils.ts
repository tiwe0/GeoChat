import type { Database } from "bun:sqlite";

export function tableColumns(sqlite: Database, table: string): string[] {
  return (sqlite.query(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>)
    .map((column) => column.name);
}

export function hasTable(sqlite: Database, table: string): boolean {
  return Boolean(sqlite.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

export function addColumnIfMissing(sqlite: Database, table: string, column: string, definition: string): void {
  if (!hasTable(sqlite, table) || tableColumns(sqlite, table).includes(column)) return;
  sqlite.run(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${definition}`);
}

export function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
