import { describe, expect, test } from "bun:test";
import { isInternalToolResultEcho } from "../src/renderer-react/src/features/chat/toolResultEcho";

describe("assistant tool-result echo guard", () => {
  const output = { ok: true, results: [], result: { ready: true, objects: [{ name: "A" }] } };

  test("hides an exact raw JSON echo after a completed tool", () => {
    expect(isInternalToolResultEcho([
      { type: "tool-getCanvasContext", state: "output-available", output },
      { type: "text", text: JSON.stringify(output) }
    ], 1)).toBe(true);
  });

  test("also hides fenced JSON but keeps curated user-facing text", () => {
    expect(isInternalToolResultEcho([
      { type: "tool-getCanvasContext", state: "output-available", output },
      { type: "text", text: `\`\`\`json\n${JSON.stringify(output)}\n\`\`\`` }
    ], 1)).toBe(true);
    expect(isInternalToolResultEcho([
      { type: "tool-getCanvasContext", state: "output-available", output },
      { type: "text", text: "已读取画板，接下来会按 1:1 比例调整坐标轴。" }
    ], 1)).toBe(false);
  });
});
