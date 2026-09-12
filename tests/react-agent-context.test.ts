import { describe, expect, test } from "bun:test";
import { conversationPrompt } from "../src/renderer-react/src/hooks/useAgentRunChat";
import { currentUserPromptBeforeBlackboard } from "../packages/app/src/agent-routing-text";

describe("agent conversation context", () => {
  test("includes prior user and assistant turns in the next runner prompt", () => {
    const prompt = conversationPrompt("继续添加一个动点。", [
      { id: "u1", role: "user", parts: [{ type: "text", text: "画一个半径为 3 的圆。" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "圆已经绘制完成。" }] },
    ], "zh-CN");

    expect(prompt).toContain("画一个半径为 3 的圆。");
    expect(prompt).toContain("圆已经绘制完成。");
    expect(prompt).toContain("继续添加一个动点。");
    expect(prompt.indexOf("画一个半径为 3 的圆。")).toBeLessThan(prompt.indexOf("继续添加一个动点。"));
  });

  test("does not add an empty history section to the first turn", () => {
    expect(conversationPrompt("画一个圆。", [], "zh-CN")).toBe("画一个圆。");
  });

  test("keeps blackboard routing focused on the current user message", () => {
    const prompt = conversationPrompt("继续添加一个动点。", [
      { id: "u1", role: "user", parts: [{ type: "text", text: "画一个圆。" }] },
    ], "zh-CN");
    expect(currentUserPromptBeforeBlackboard(prompt)).toBe("继续添加一个动点。");
  });
});
