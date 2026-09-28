import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canNavigateComposerHistory,
  composerHistoryFromMessages,
  EMPTY_COMPOSER_HISTORY_STATE,
  navigateComposerHistory,
} from "../src/renderer-react/src/features/chat/composerHistory";

describe("composer input history", () => {
  test("extracts only previously sent user text in chronological order", () => {
    expect(composerHistoryFromMessages([
      { role: "user", parts: [{ type: "text", text: "画一个圆" }] },
      { role: "assistant", parts: [{ type: "text", text: "好的" }] },
      { role: "user", parts: [{ type: "file" }, { type: "text", text: "分析这个图" }] },
      { role: "user", parts: [{ type: "file" }] },
    ])).toEqual(["画一个圆", "分析这个图"]);
  });

  test("walks backward from the newest entry and restores the unsent draft", () => {
    const entries = ["first", "second", "third"];
    const newest = navigateComposerHistory({
      entries,
      value: "draft",
      state: EMPTY_COMPOSER_HISTORY_STATE,
      direction: "older",
    })!;
    expect(newest).toEqual({ value: "third", state: { cursor: 2, draft: "draft" } });

    const older = navigateComposerHistory({ entries, value: newest.value, state: newest.state, direction: "older" })!;
    expect(older).toEqual({ value: "second", state: { cursor: 1, draft: "draft" } });

    const newer = navigateComposerHistory({ entries, value: older.value, state: older.state, direction: "newer" })!;
    expect(newer).toEqual({ value: "third", state: { cursor: 2, draft: "draft" } });

    const restored = navigateComposerHistory({ entries, value: newer.value, state: newer.state, direction: "newer" })!;
    expect(restored).toEqual({ value: "draft", state: EMPTY_COMPOSER_HISTORY_STATE });
  });

  test("stays on the oldest entry and ignores forward navigation before history starts", () => {
    const entries = ["first", "second"];
    expect(navigateComposerHistory({
      entries,
      value: "first",
      state: { cursor: 0, draft: "draft" },
      direction: "older",
    })).toEqual({ value: "first", state: { cursor: 0, draft: "draft" } });
    expect(navigateComposerHistory({
      entries,
      value: "draft",
      state: EMPTY_COMPOSER_HISTORY_STATE,
      direction: "newer",
    })).toBeNull();
  });

  test("preserves normal multiline cursor movement away from the first and last lines", () => {
    const value = "first line\nsecond line\nthird line";
    expect(canNavigateComposerHistory({
      value,
      direction: "older",
      selectionStart: value.indexOf("second"),
      selectionEnd: value.indexOf("second"),
    })).toBe(false);
    expect(canNavigateComposerHistory({
      value,
      direction: "older",
      selectionStart: 3,
      selectionEnd: 3,
    })).toBe(true);
    expect(canNavigateComposerHistory({
      value,
      direction: "newer",
      selectionStart: value.length - 2,
      selectionEnd: value.length - 2,
    })).toBe(true);
  });

  test("shares the same history controller across window and fusion composers", () => {
    const windowComposer = readFileSync(join(import.meta.dir, "../src/renderer-react/src/components/ChatComposer.tsx"), "utf8");
    const fusionComposer = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionComposer.tsx"), "utf8");
    const panel = readFileSync(join(import.meta.dir, "../src/renderer-react/src/components/AssistantPanel.tsx"), "utf8");
    expect(windowComposer).toContain("useComposerHistory({");
    expect(fusionComposer).toContain("useComposerHistory({");
    expect(windowComposer).toContain("inputHistory.handleKeyDown(event)");
    expect(fusionComposer).toContain("inputHistory.handleKeyDown(event)");
    expect(panel).toContain("composerHistoryFromMessages(messages)");
    expect(panel).toContain("inputHistory={composerHistory}");
    expect(panel).toContain("history={composerHistory}");
  });
});
