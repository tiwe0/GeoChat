import type { FunctionCallLocale } from "../../functioncalls";
import { advancedCompilation } from "../compilation";
import { formatNumber } from "../formatting";
import type { AdvancedDrawingCompilation } from "../types";
import { finiteNumber, identifierValue, normalizedArgs, numberAtLeast } from "../validation";

export function compileParabolaFocusDirectrix(input: Record<string, unknown> | null | undefined, locale?: FunctionCallLocale | null): AdvancedDrawingCompilation {
  const args = normalizedArgs(input, ["parameterName", "p", "sampleX"], "drawParabolaFocusDirectrix");
  const pName = identifierValue(args.parameterName, "p", "drawParabolaFocusDirectrix", "parameterName");
  const p = numberAtLeast(args.p, 0.25, 1, "drawParabolaFocusDirectrix", "p");
  const sampleX = finiteNumber(args.sampleX, 2, "drawParabolaFocusDirectrix", "sampleX");
  const commands = [
    `${pName} = ${p}`,
    `parabola = x^2 / (4 * ${pName})`,
    `F = (0, ${pName})`,
    `directrix: y = -${pName}`,
    `P = (${formatNumber(sampleX)}, (${formatNumber(sampleX)})^2 / (4 * ${pName}))`,
    `H = (x(P), -${pName})`,
    `axis = yAxis`,
    `focusRadius = Segment(P, F)`,
    `directrixDistance = Segment(P, H)`,
    `SetColor(parabola, 0, 114, 178)`,
    `SetColor(directrix, 213, 94, 0)`,
    `SetColor(focusRadius, 0, 158, 115)`,
    `SetColor(directrixDistance, 230, 159, 0)`,
    `ShowLabel(F, true)`,
    `ShowLabel(P, true)`,
    `ShowLabel(H, true)`
  ];
  return advancedCompilation("drawParabolaFocusDirectrix", locale, {
    titleZh: "绘制抛物线焦点准线",
    titleEn: "Draw parabola focus-directrix diagram",
    commands,
    perspective: "G",
    expectedObjects: ["parabola", "F", "directrix", "P", "H", "focusRadius", "directrixDistance"],
    outcomeZh: "展示抛物线、焦点、准线和点到焦点/准线的等距关系。",
    outcomeEn: "Show the parabola, focus, directrix, and equal-distance relation.",
    hintsZh: ["验证 P 到 F 的线段和 P 到准线垂足 H 的线段同时存在。", "后续讲解应围绕焦点准线定义，而不是只描述函数图像。"],
    hintsEn: ["Verify both segment P-F and perpendicular segment P-H to the directrix.", "Explain through the focus-directrix definition, not only the graph shape."]
  });
}
