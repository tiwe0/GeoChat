import { describe, expect, test } from "bun:test";
import { normalizeStreamdownMath, parseLatexSegments } from "../src/renderer/src/math-rendering";

describe("math rendering helpers", () => {
  test("normalizes standard display math delimiters for Streamdown", () => {
    const normalized = normalizeStreamdownMath("可化为:\n\\[\nf(x)=R\\sin(x-\\varphi)\n\\]");

    expect(normalized).toBe("可化为:\n$$\nf(x)=R\\sin(x-\\varphi)\n$$");
  });

  test("normalizes standard inline math delimiters for Streamdown", () => {
    const normalized = normalizeStreamdownMath("其中 \\(\\cos\\varphi=\\frac{1}{\\sqrt5}\\)。");

    expect(normalized).toBe("其中 $\\cos\\varphi=\\frac{1}{\\sqrt5}$。");
  });

  test("does not rewrite inline code while normalizing math", () => {
    const normalized = normalizeStreamdownMath("命令 `\\(not math\\)`，公式 \\(x^2\\)。");

    expect(normalized).toBe("命令 `\\(not math\\)`，公式 $x^2$。");
  });

  test("parses user text with standard display and inline math", () => {
    expect(parseLatexSegments("求 \\(x^2\\)，并展示 \\[y=\\sqrt{x}\\]")).toEqual([
      { type: "text", value: "求 " },
      { type: "math", value: "x^2", display: false },
      { type: "text", value: "，并展示 " },
      { type: "math", value: "y=\\sqrt{x}", display: true }
    ]);
  });
});
