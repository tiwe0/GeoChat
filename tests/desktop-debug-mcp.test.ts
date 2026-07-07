import { describe, expect, test } from "bun:test";
import { createAgentRunLedger, finishAgentRunLedger } from "@geochat-ai/app";
import { agentRunReviewFromLedgerRow } from "../tools/desktop-debug-mcp/tools";

describe("desktop debug MCP", () => {
  test("derives an agent run review from a persisted ledger row payload", () => {
    const run = finishAgentRunLedger(createAgentRunLedger({
      runId: "mcp-review-run",
      conversationId: "mcp-review-conversation",
      mode: "ai-sdk",
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

  test("reports unavailable reviews for legacy or malformed ledger payloads", () => {
    expect(agentRunReviewFromLedgerRow({ payload: "{}" })).toMatchObject({
      ok: false,
      reason: "Agent run ledger payload does not match the current AgentRunLedgerRecord schema."
    });
    expect(agentRunReviewFromLedgerRow({ payload: "{" })).toMatchObject({
      ok: false,
      reason: "Agent run ledger payload is not valid JSON."
    });
  });
});
