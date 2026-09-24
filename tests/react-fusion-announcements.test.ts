import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveFusionRunAnnouncement } from "../src/renderer-react/src/features/fusion-mode/announcements";

const messages = [{
  id: "assistant-final",
  role: "assistant" as const,
  parts: [
    { type: "reasoning" as const, text: "internal reasoning" },
    { type: "tool-getCanvasContext", toolCallId: "tool-1", state: "output-available", output: { ok: true } } as never,
    { type: "text" as const, text: "最终答案。" },
  ],
}];

describe("fusion screen-reader announcements", () => {
  test("keeps transcript streaming outside live regions to avoid duplicate announcements", () => {
    const source = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionTranscript.tsx"), "utf8");
    expect(source).toContain('role="region"');
    expect(source).not.toContain('role="log"');
    expect(source).not.toContain('aria-live="polite"');
  });

  test("announces only final assistant text after a busy run completes", () => {
    expect(deriveFusionRunAnnouncement({
      previousStatus: "streaming",
      status: "ready",
      messages,
      activeMessageIds: ["assistant-final"],
    })).toBe("最终答案。");
  });

  test("does not announce reasoning or tool deltas while the run is active", () => {
    expect(deriveFusionRunAnnouncement({
      previousStatus: "streaming",
      status: "streaming",
      messages,
      activeMessageIds: ["assistant-final"],
    })).toBeNull();
  });

  test("announces a terminal error once the busy run fails", () => {
    expect(deriveFusionRunAnnouncement({
      previousStatus: "submitted",
      status: "error",
      messages: [],
      activeMessageIds: [],
      error: "网络连接中断",
    })).toBe("网络连接中断");
  });

  test("does not announce an already completed transcript on mount", () => {
    expect(deriveFusionRunAnnouncement({
      previousStatus: "ready",
      status: "ready",
      messages,
      activeMessageIds: ["assistant-final"],
    })).toBeNull();
  });

  test("finds a newly completed answer before the spatial turn sync commits", () => {
    expect(deriveFusionRunAnnouncement({
      previousStatus: "submitted",
      status: "ready",
      messages: [
        { id: "assistant-old", role: "assistant", parts: [{ type: "text", text: "旧回答" }] },
        ...messages,
      ],
      activeMessageIds: [],
      baselineMessageIds: ["assistant-old"],
    })).toBe("最终答案。");
  });
});
