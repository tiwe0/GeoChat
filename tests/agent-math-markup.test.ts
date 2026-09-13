import { describe, expect, test } from "bun:test";
import { normalizeMathMarkup } from "../backend/src/agent/model-runner-toolcalls";
import { GEOCHAT_SYSTEM_PROMPT, GEOCHAT_SYSTEM_PROMPT_EN } from "../packages/app/src/agent-prompts";

describe("normalizeMathMarkup", () => {
  test("repairs JSON control-character corruption inside math delimiters", () => {
    // This is what JSON.parse produces for a model-emitted `\in`/`\frac`
    // when the model forgot to double the backslashes.
    const decoded = "区间 $x\tin[\tfrac{3}{2},3]$。";
    expect(normalizeMathMarkup(decoded)).toBe("区间 $x\\in[\\frac{3}{2},3]$。");
  });

  test("adds a missing slash for common commands without changing prose", () => {
    expect(normalizeMathMarkup("区间 $x in [tfrac32,3]$，其中 frac 不是公式。"))
      .toBe("区间 $x \\in [\\tfrac32,3]$，其中 frac 不是公式。");
  });

  test("leaves ordinary prose and code outside math unchanged", () => {
    const text = "不要把 frac 当作普通单词修改。`frac32`";
    expect(normalizeMathMarkup(text)).toBe(text);
  });
});

describe("agent math formatting contract", () => {
  test("requires display delimiters and JSON-safe backslashes in both locales", () => {
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("showSolutionSteps/showChoiceAnalysis");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("整行公式必须写成 `$$...$$`");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("JSON 规则双写");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("Every visible field in showSolutionSteps/showChoiceAnalysis");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("display math must use `$$...$$`");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("never omit the slash");
  });
});
