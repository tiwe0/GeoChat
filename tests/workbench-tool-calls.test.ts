import { describe, expect, test } from "bun:test";
import { toolCallVisualStatus } from "../src/renderer/src/workbench-tool-calls";

describe("tool call visual status", () => {
  test("stays neutral without tool calls", () => {
    expect(toolCallVisualStatus(undefined)).toBe("neutral");
    expect(toolCallVisualStatus([])).toBe("neutral");
  });

  test("uses the latest terminal behavior instead of sticky historical failures", () => {
    expect(toolCallVisualStatus([
      { status: "error", error: "unknown command", createdAt: "2026-06-13T10:00:00.000Z", updatedAt: "2026-06-13T10:00:01.000Z" },
      { status: "done", error: null, createdAt: "2026-06-13T10:00:02.000Z", updatedAt: "2026-06-13T10:00:03.000Z" }
    ])).toBe("success");
  });

  test("shows repairing while a newer tool call is active after an error", () => {
    expect(toolCallVisualStatus([
      { status: "error", error: "syntax error", createdAt: "2026-06-13T10:00:00.000Z", updatedAt: "2026-06-13T10:00:01.000Z" },
      { status: "running", error: null, createdAt: "2026-06-13T10:00:02.000Z", updatedAt: "2026-06-13T10:00:02.000Z" }
    ])).toBe("repairing");
  });

  test("shows failed only when the latest meaningful behavior failed", () => {
    expect(toolCallVisualStatus([
      { status: "done", error: null, createdAt: "2026-06-13T10:00:00.000Z", updatedAt: "2026-06-13T10:00:01.000Z" },
      { status: "error", error: "command rejected", createdAt: "2026-06-13T10:00:02.000Z", updatedAt: "2026-06-13T10:00:03.000Z" }
    ])).toBe("failed");
  });
});
