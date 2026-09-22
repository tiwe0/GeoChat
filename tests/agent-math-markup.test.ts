import { describe, expect, test } from "bun:test";
import { GEOCHAT_SYSTEM_PROMPT, GEOCHAT_SYSTEM_PROMPT_EN } from "../packages/app/src/agent-prompts";

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
