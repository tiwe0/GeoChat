import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { readConfig } from "./config";
import { databaseFileInfo, ensureSafeReadOnlySql, withReadonlyDatabase } from "./sqlite";

const dir = mkdtempSync(join(tmpdir(), "geochat-desktop-mcp-"));
const dbPath = join(dir, "geochat-desktop.sqlite");

try {
  const db = new Database(dbPath);
  db.run("create table conversations (id text primary key, title text not null, summary text not null, owner_user_id text, message_count integer not null, created_at integer not null, updated_at integer not null)");
  db.run("create table agent_run_ledgers (run_id text primary key, conversation_id text not null, status text not null, mode text not null, model_provider text not null, model_id text not null, started_at integer not null, completed_at integer, payload text not null)");
  db.run("create table agent_error_events (event_id text primary key, run_id text not null, conversation_id text, source text not null, code text not null, severity text not null, message text not null, model_provider text, model_id text, tool_call_id text, tool_name text, created_at integer not null, payload text not null)");
  db.run("insert into conversations values ('c1', '测试会话', 'summary', null, 1, 1, 2)");
  db.run("insert into agent_run_ledgers values ('r1', 'c1', 'failed', 'ai-sdk', 'test', 'test-model', 1, 2, '{}')");
  db.run("insert into agent_error_events values ('e1', 'r1', 'c1', 'run', 'test_error', 'error', 'Backend runner exceeded limit', 'test', 'test-model', null, null, 2, '{}')");
  db.close();

  process.env.GEOCHAT_DESKTOP_MCP_DB_PATH = dbPath;
  const config = readConfig();
  const file = databaseFileInfo(config);
  if (!file.exists || file.sizeBytes <= 0) throw new Error("smoke database file was not detected");

  const count = withReadonlyDatabase(config, (readonlyDb) => readonlyDb.query("select count(*) as count from conversations").get() as { count: number });
  if (Number(count.count) !== 1) throw new Error(`unexpected conversation count: ${count.count}`);

  ensureSafeReadOnlySql("select * from conversations");
  let blocked = false;
  try {
    ensureSafeReadOnlySql("delete from conversations");
  } catch {
    blocked = true;
  }
  if (!blocked) throw new Error("unsafe SQL was not blocked");

  console.log(JSON.stringify({ ok: true, dbPath, count: count.count }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
