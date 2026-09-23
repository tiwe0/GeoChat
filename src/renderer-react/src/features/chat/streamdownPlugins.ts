import { cjk } from "@streamdown/cjk";
import { createMathPlugin } from "@streamdown/math";
import { curatedCodeHighlighter } from "./curatedCodeHighlighter";

export const STREAMDOWN_PLUGINS = {
  cjk,
  code: curatedCodeHighlighter,
  math: createMathPlugin({ singleDollarTextMath: true }),
};
