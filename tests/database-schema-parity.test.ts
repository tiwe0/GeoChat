import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { createDatabase } from "../backend/src/db/client";
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
      })
    })).toSorted((left, right) => left.name.localeCompare(right.name));
    const uniqueColumnSets = [
      ...indexes.filter(({ unique }) => unique).map(({ columns }) => columns),
      ...config.uniqueConstraints.map(({ columns }) => columns.map(({ name }) => name)),
      ...config.columns.filter(({ isUnique }) => isUnique).map(({ name }) => [name])
    ];
    contracts.set(config.name, {
      columns: config.columns.map((column) => ({
        name: column.name,
        type: column.getSQLType().toUpperCase(),
        notNull: column.notNull,
        defaultValue: normalizeDefault(column.default),
        primaryKeyPosition: primaryKeyPositions.get(column.name) ?? 0
      })),
      indexes,
      uniqueConstraints: canonicalColumnSets([
        ...config.uniqueConstraints.map(({ columns }) => columns.map(({ name }) => name)),
        ...config.columns.filter(({ isUnique }) => isUnique).map(({ name }) => [name])
      ]),
      uniqueColumnSets: canonicalColumnSets(uniqueColumnSets),
      foreignKeys: config.foreignKeys.map((foreignKey) => {
        const reference = foreignKey.reference();
        return {
          columns: reference.columns.map(({ name }) => name),
          foreignTable: getTableConfig(reference.foreignTable).name,
          foreignColumns: reference.foreignColumns.map(({ name }) => name),
          onUpdate: normalizeAction(foreignKey.onUpdate),
          onDelete: normalizeAction(foreignKey.onDelete)
        };
      }).toSorted(compareForeignKeys)
    });
  }
  return contracts;
}

function sqliteContract(sqlite: Database, table: string): TableContract {
  const columns = sqlite.query(`PRAGMA table_info("${table}")`).all() as Array<{
    name: string; type: string; notnull: number; dflt_value: string | null; pk: number;
  }>;
  const indexRows = sqlite.query(`PRAGMA index_list("${table}")`).all() as Array<{
    name: string; unique: number; origin: "c" | "u" | "pk";
  }>;
  const indexColumns = (name: string) => (sqlite.query(`PRAGMA index_info("${name}")`).all() as Array<{
    seqno: number; name: string;
  }>).toSorted((left, right) => left.seqno - right.seqno).map(({ name: column }) => column);
  const indexes = indexRows.filter(({ origin }) => origin === "c").map((index) => ({
    name: index.name,
    unique: index.unique === 1,
    columns: indexColumns(index.name)
  })).toSorted((left, right) => left.name.localeCompare(right.name));
  const foreignKeyRows = sqlite.query(`PRAGMA foreign_key_list("${table}")`).all() as Array<{
    id: number; seq: number; table: string; from: string; to: string; on_update: string; on_delete: string;
  }>;
  const foreignKeyGroups = Map.groupBy(foreignKeyRows, ({ id }) => id);
  return {
    columns: columns.map((column) => ({
      name: column.name,
      type: column.type.toUpperCase(),
      notNull: column.notnull === 1,
      defaultValue: normalizeDefault(column.dflt_value),
      primaryKeyPosition: column.pk
    })),
    indexes,
    uniqueConstraints: canonicalColumnSets(indexRows.filter(({ origin }) => origin === "u").map(({ name }) => indexColumns(name))),
    uniqueColumnSets: canonicalColumnSets(indexRows.filter(({ unique, origin }) => unique === 1 && origin !== "pk").map(({ name }) => indexColumns(name))),
    foreignKeys: [...foreignKeyGroups.values()].map((rows) => {
      const ordered = rows!.toSorted((left, right) => left.seq - right.seq);
      return {
        columns: ordered.map(({ from }) => from),
        foreignTable: ordered[0]!.table,
        foreignColumns: ordered.map(({ to }) => to),
        onUpdate: normalizeAction(ordered[0]!.on_update),
        onDelete: normalizeAction(ordered[0]!.on_delete)
      };
    }).toSorted(compareForeignKeys)
  };
}

function canonicalColumnSets(values: string[][]): string[][] {
  return [...new Map(values.map((columns) => [columns.join("\u0000"), columns])).values()]
    .toSorted((left, right) => left.join("\u0000").localeCompare(right.join("\u0000")));
}

function compareForeignKeys(left: ForeignKeyContract, right: ForeignKeyContract): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

describe("Drizzle and SQLite schema parity", () => {
  test("matches a fresh baseline database exactly", () => {
    const path = temporaryDatabasePath("fresh-strong-parity");
    createDatabase({ databasePath: path }).close();
    const sqlite = new Database(path, { readonly: true });
    const expected = drizzleContracts();
    const actualTables = (sqlite.query("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>)
      .map(({ name }) => name)
      .filter((name) => name !== "_geochat_schema_migrations")
      .toSorted();
    expect(actualTables).toEqual([...expected.keys()].toSorted());
    for (const [table, contract] of expected) {
      expect(sqliteContract(sqlite, table), `${table} schema contract`).toEqual(contract);
    }
    expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(sqlite.query("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
    sqlite.close();
  });
});
