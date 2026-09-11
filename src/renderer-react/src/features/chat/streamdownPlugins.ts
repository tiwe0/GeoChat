import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";

export const STREAMDOWN_PLUGINS = {
  cjk,
  code,
  math: createMathPlugin({ singleDollarTextMath: true }),
};
