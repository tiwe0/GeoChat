import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentRunLedger, finishAgentRunLedger } from "@geochat-ai/app";
import { agentRunReviewFromLedgerRow, waitForConversationRun } from "../tools/desktop-debug-mcp/tools";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("desktop debug MCP", () => {
  test("derives an agent run review from a persisted ledger row payload", () => {
    const run = finishAgentRunLedger(createAgentRunLedger({
      runId: "mcp-review-run",
      conversationId: "mcp-review-conversation",
      model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
      prompt: "构造一个椭圆。",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    }), {
      status: "succeeded",
      completedAt: "2026-06-06T00:00:01.000Z",
      usage: null,
      error: null
    });

    const review = agentRunReviewFromLedgerRow({ payload: JSON.stringify(run) });

    expect(review).toMatchObject({
      ok: true,
      report: {
        runId: "mcp-review-run",
        verdict: "warn",
        findings: [
          expect.objectContaining({
            role: "critic",
            code: "empty_successful_run"
          })
        ]
      }
    });
  });

  test("reports unavailable reviews for malformed ledger payloads", () => {
    expect(agentRunReviewFromLedgerRow({ payload: "{}" })).toMatchObject({
      ok: false,
      reason: "Agent run ledger payload does not match the current AgentRunLedgerRecord schema."
    });
    expect(agentRunReviewFromLedgerRow({ payload: "{" })).toMatchObject({
      ok: false,
      reason: "Agent run ledger payload is not valid JSON."
    });
  });

  test("waits for the newly sent conversation run to reach a terminal state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "geochat-mcp-run-wait-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "desktop.sqlite");
    const db = new Database(databasePath);
    db.run("create table agent_run_ledgers (run_id text primary key, conversation_id text not null, status text not null, started_at integer not null, completed_at integer)");
    db.run("insert into agent_run_ledgers values ('old-run', 'conversation-1', 'succeeded', 100, 200)");
    const notBeforeMs = Date.now();
    db.run("insert into agent_run_ledgers values ('new-run', 'conversation-1', 'running', ?, null)", [notBeforeMs + 1]);

    setTimeout(() => {
      db.run("update agent_run_ledgers set status = 'succeeded', completed_at = ? where run_id = 'new-run'", [notBeforeMs + 20]);
      db.close(false);
    }, 30);

    const result = await waitForConversationRun({
      databasePath,
      backendBaseUrl: "http://127.0.0.1:17365",
      defaultLimit: 30,
      maxLimit: 200,
      defaultContentLimit: 4_000,
      includeSensitiveByDefault: false
    }, "conversation-1", notBeforeMs, 1_000, 10);

    expect(result).toEqual({
      run: {
        runId: "new-run",
        status: "succeeded",
        startedAt: notBeforeMs + 1,
        completedAt: notBeforeMs + 20
      },
      timedOut: false
    });
  });
});
