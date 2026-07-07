import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./backend/src/db/schema.ts",
  out: "./backend/drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.GEOCHAT_DESKTOP_DB_PATH ?? "./data/geochat-desktop.sqlite"
  }
});
