import { describe, expect, test } from "bun:test";
import type { BundledLanguage } from "streamdown";
import { curatedCodeHighlighter } from "../src/renderer-react/src/features/chat/curatedCodeHighlighter";

describe("curated Streamdown code highlighting", () => {
  test("supports common languages and aliases without exposing the complete Shiki catalog", () => {
    expect(curatedCodeHighlighter.supportsLanguage("typescript")).toBe(true);
    expect(curatedCodeHighlighter.supportsLanguage("zsh" as BundledLanguage)).toBe(true);
    expect(curatedCodeHighlighter.supportsLanguage("emacs-lisp")).toBe(false);
    expect(curatedCodeHighlighter.getSupportedLanguages()).not.toContain("emacs-lisp");
  });

  test("loads the JavaScript regex highlighter on demand and caches the result", async () => {
    const options = {
      code: "const radius = 3;",
      language: "typescript" as const,
      themes: curatedCodeHighlighter.getThemes(),
    };

    const firstResult = await new Promise<NonNullable<ReturnType<typeof curatedCodeHighlighter.highlight>>>((resolve) => {
      expect(curatedCodeHighlighter.highlight(options, resolve)).toBeNull();
    });

    expect(firstResult.tokens.flat().map((token) => token.content).join(""))
      .toBe(options.code);
    expect(curatedCodeHighlighter.highlight(options)).toEqual(firstResult);
  });
});
