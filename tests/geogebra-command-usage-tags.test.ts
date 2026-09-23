import { describe, expect, test } from "bun:test";
import {
  collectGeoGebraCommandUsageStats,
  createAgentRunLedger,
  finishAgentRunLedger,
  upsertAgentRunTool
} from "@geochat-ai/app";

describe("GeoGebra command search telemetry", () => {
  test("normalizes tags, defaults tagMatch to any, and records untagged searches", () => {
    const base = createAgentRunLedger({
      runId: "command-search-telemetry",
      conversationId: "conversation-command-search-telemetry",
      model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
      prompt: "search commands",
      attachmentCount: 0,
      startedAt: "2026-09-23T00:00:00.000Z"
    });
    const firstSearch = upsertAgentRunTool(base, {
      toolCallId: "search-normalized-default",
      toolName: "searchGeoGebraCommands",
      status: "succeeded",
      args: {
        query: " Circle ",
        tags: [" CATEGORY:CONIC ", "category:geometry", "category:conic"]
      },
      result: { ok: true, result: [{ command: "Circle" }] },
      startedAt: "2026-09-23T00:00:01.000Z",
      completedAt: "2026-09-23T00:00:02.000Z"
    });
    const repeatedSearch = upsertAgentRunTool(firstSearch, {
      toolCallId: "search-normalized-explicit",
      toolName: "searchGeoGebraCommands",
      status: "succeeded",
      args: {
        query: "circle",
        tags: ["category:geometry", "category:conic"],
        tagMatch: "any"
      },
      result: { ok: true, result: [{ command: "Circle" }] },
      startedAt: "2026-09-23T00:00:03.000Z",
      completedAt: "2026-09-23T00:00:04.000Z"
    });
    const untaggedSearch = upsertAgentRunTool(repeatedSearch, {
      toolCallId: "search-untagged-default",
      toolName: "searchGeoGebraCommands",
      status: "succeeded",
      args: { query: "   " },
      result: { ok: true, result: [] },
      startedAt: "2026-09-23T00:00:05.000Z",
      completedAt: "2026-09-23T00:00:06.000Z"
    });
    const run = finishAgentRunLedger(untaggedSearch, {
      status: "succeeded",
      error: null,
      usage: null,
      completedAt: "2026-09-23T00:00:07.000Z"
    });

    const stats = collectGeoGebraCommandUsageStats([run], "2026-09-23T00:00:08.000Z");

    expect(stats.searchToolCallCount).toBe(3);
    expect(stats.searchTags).toEqual([
      expect.objectContaining({ tag: "category:conic", count: 2, runCount: 1 }),
      expect.objectContaining({ tag: "category:geometry", count: 2, runCount: 1 }),
      expect.objectContaining({ tag: "untagged", count: 1, runCount: 1 })
    ]);
    expect(stats.searchQueries).toEqual([
      expect.objectContaining({
        query: "Circle",
        tags: ["category:conic", "category:geometry"],
        tagMatch: "any",
        count: 2,
        runCount: 1
      }),
      expect.objectContaining({
        query: "(empty)",
        tags: ["untagged"],
        tagMatch: "any",
        count: 1,
        runCount: 1
      })
    ]);
  });
});
