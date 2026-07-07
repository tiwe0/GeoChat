import type { FunctionCallLocale } from "../../functioncalls";
import { advancedCompilation } from "../compilation";
import { formatNumber } from "../formatting";
import type { AdvancedDrawingCompilation } from "../types";
import { finiteNumber, nonZeroNumber, normalizedArgs, positiveNumber } from "../validation";

export function compileQuadraticVertexDiagram(input: Record<string, unknown> | null | undefined, locale?: FunctionCallLocale | null): AdvancedDrawingCompilation {
  const args = normalizedArgs(input, ["a", "h", "k", "sampleOffset"], "drawQuadraticVertexDiagram");
  const a = nonZeroNumber(args.a, 1, "drawQuadraticVertexDiagram", "a");
  const h = finiteNumber(args.h, 1, "drawQuadraticVertexDiagram", "h");
  const k = finiteNumber(args.k, -2, "drawQuadraticVertexDiagram", "k");
  const sampleOffset = positiveNumber(args.sampleOffset, 2, "drawQuadraticVertexDiagram", "sampleOffset");
  const commands = [
    `a = ${a}`,
    `h = ${h}`,
    `k = ${k}`,
    `f(x) = a (x - h)^2 + k`,
    `V = (h, k)`,
    `axis: x = h`,
    `L = (h - ${formatNumber(sampleOffset)}, f(h - ${formatNumber(sampleOffset)}))`,
    `R = (h + ${formatNumber(sampleOffset)}, f(h + ${formatNumber(sampleOffset)}))`,
    `symmetryChord = Segment(L, R)`,
    `SetColor(f, 0, 114, 178)`,
    `SetColor(axis, 213, 94, 0)`,
    `SetColor(symmetryChord, 0, 158, 115)`,
    `ShowLabel(V, true)`,
    `ShowLabel(L, true)`,
    `ShowLabel(R, true)`
  ];
  return advancedCompilation("drawQuadraticVertexDiagram", locale, {
    titleZh: "绘制二次函数顶点图",
    titleEn: "Draw quadratic vertex diagram",
    commands,
    perspective: "G",
    expectedObjects: ["f", "V", "axis", "L", "R", "symmetryChord"],
    outcomeZh: "展示二次函数顶点式、顶点、对称轴和一组对称点。",
    outcomeEn: "Show a quadratic in vertex form, its vertex, axis of symmetry, and symmetric points.",
    hintsZh: ["验证 V 位于对称轴 axis 上，L/R 关于 axis 对称。", "若题目给的是一般式，后续先配方或求顶点再替换参数。"],
    hintsEn: ["Verify that V lies on axis and L/R are symmetric about the axis.", "If the problem gives standard form, complete the square or compute the vertex before replacing parameters."]
  });
}
