import { resolve } from "node:path";

export type GeoChatDatabaseDriver = "sqlite";

export type GeoChatDatabaseRuntimeConfig = {
  requestedDriver: GeoChatDatabaseDriver;
  sqlitePath: string;
  migrationsSchema: "sqlite";
};

export function readDatabaseRuntimeConfig(): GeoChatDatabaseRuntimeConfig {
  return {
    requestedDriver: "sqlite",
    sqlitePath: resolve(Bun.env.GEOCHAT_DESKTOP_DB_PATH ?? "./data/geochat-desktop.sqlite"),
    migrationsSchema: "sqlite"
  };
}
