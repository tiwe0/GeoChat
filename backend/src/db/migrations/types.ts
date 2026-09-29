import type { Database } from "bun:sqlite";

export type SqliteMigration = {
  version: number;
  name: string;
  up(sqlite: Database): void;
};
