import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { createAgentRunLedger } from "@geochat-ai/app";
import { createDatabase } from "../backend/src/db/client";
import { createBackendHttpContext } from "../backend/src/http/context";
import { createHttpHarness } from "./agent-harness-http-utils";

const repositoryRoot = resolve(import.meta.dir, "..");

describe("backend import and resource lifecycle", () => {
  test("importing HTTP modules does not create a database or data directory", async () => {
    const workingDirectory = mkdtempSync(join(tmpdir(), "geochat-import-lifecycle-"));
    const environment = { ...Bun.env };
    delete environment.GEOCHAT_DESKTOP_DB_PATH;

    const child = Bun.spawn({
      cmd: [
        Bun.argv[0],
        "-e",
        `await import(${JSON.stringify(`${repositoryRoot}/backend/src/http/context.ts`)}); await import(${JSON.stringify(`${repositoryRoot}/backend/src/http.ts`)})`
      ],
      cwd: workingDirectory,
      env: environment,
      stdout: "pipe",
      stderr: "pipe"
    });
    const exitCode = await child.exited;
    const stderr = await new Response(child.stderr).text();

    expect(exitCode, stderr).toBe(0);
    expect(existsSync(join(workingDirectory, "data"))).toBe(false);
  });

  test("database and HTTP context close idempotently", () => {
    const databasePath = join(tmpdir(), `geochat-close-${crypto.randomUUID()}.sqlite`);
    const database = createDatabase({ databasePath });
    database.close();
    database.close();
    expect(() => database.run(sql`SELECT 1`)).toThrow();

    const context = createBackendHttpContext({ databasePath });
    context.close();
    context.close();
    expect(() => context.database.run(sql`SELECT 1`)).toThrow();
  });

  test("runtime recovery is explicit and disabled for ordinary connections", async () => {
    const databasePath = join(tmpdir(), `geochat-recovery-${crypto.randomUUID()}.sqlite`);
    const first = createDatabase({ databasePath });
    const run = createAgentRunLedger({
      runId: "still-running",
      conversationId: "conversation-1",
      model: { provider: "deepseek", model: "deepseek-chat", apiKey: "test", customBaseUrl: "" },
      prompt: "draw",
      attachmentCount: 0,
      startedAt: "2026-09-22T00:00:00.000Z"
    });
    first.run(sql`
      INSERT INTO agent_run_ledgers (
        run_id, conversation_id, status, model_provider, model_id, started_at, completed_at, payload
      ) VALUES (
        ${run.runId}, ${run.conversationId}, 'running', ${run.modelProvider}, ${run.modelId},
        ${Date.parse(run.startedAt)}, NULL, ${JSON.stringify(run)}
      )
    `);
    first.close();

    const ordinaryConnection = createDatabase({ databasePath });
    expect(ordinaryConnection.$client.query("SELECT status FROM agent_run_ledgers WHERE run_id = ?").get(run.runId))
      .toEqual({ status: "running" });
    ordinaryConnection.close();

    const harness = await createHttpHarness({ databasePath });
    expect((await harness.context.repositories.agentRuns.getLedger(run.runId))?.status).toBe("running");
    harness.close();
    harness.close();
    expect(() => harness.context.database.run(sql`SELECT 1`)).toThrow();

    const runtimeConnection = createDatabase({ databasePath, reconcileInterruptedRuntimeState: true });
    expect(runtimeConnection.$client.query("SELECT status FROM agent_run_ledgers WHERE run_id = ?").get(run.runId))
      .toEqual({ status: "cancelled" });
    runtimeConnection.close();
  });
});
