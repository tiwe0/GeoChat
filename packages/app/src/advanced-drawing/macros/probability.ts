import type { FunctionCallLocale } from "../../functioncalls";
import { advancedCompilation } from "../compilation";
import { formatNumber } from "../formatting";
import type { AdvancedDrawingCompilation } from "../types";
import { integerBetween, normalizedArgs } from "../validation";

export function compileClassicalProbabilityGrid(input: Record<string, unknown> | null | undefined, locale?: FunctionCallLocale | null): AdvancedDrawingCompilation {
  const args = normalizedArgs(input, ["sides", "targetSum"], "drawClassicalProbabilityGrid");
  const sides = integerBetween(args.sides, 2, 8, 6, "drawClassicalProbabilityGrid", "sides");
  const targetSum = integerBetween(args.targetSum, 2, sides * 2, Math.min(7, sides * 2), "drawClassicalProbabilityGrid", "targetSum");
  const gridLines = Array.from({ length: sides + 1 }, (_, index) => [
    `v${index} = Segment((${index}, 0), (${index}, ${sides}))`,
    `h${index} = Segment((0, ${index}), (${sides}, ${index}))`
  ]).flat();
  const eventPoints = Array.from({ length: sides }, (_, index) => index + 1)
    .map((first) => [first, targetSum - first] as const)
    .filter(([, second]) => second >= 1 && second <= sides)
    .map(([first, second]) => `E${first}${second} = (${first - 0.5}, ${second - 0.5})`);
  const commands = [
    ...gridLines,
    ...eventPoints,
    ...eventPoints.map((command) => `SetColor(${command.split(" = ")[0]}, 213, 94, 0)`),
    `eventLabel = Text("sum = ${targetSum}", (0.2, ${formatNumber(sides + 0.4)}))`,
    `ShowLabel(eventLabel, false)`
  ];
  return advancedCompilation("drawClassicalProbabilityGrid", locale, {
    titleZh: "绘制古典概型样本空间网格",
    titleEn: "Draw classical probability sample-space grid",
    commands,
    perspective: "G",
    expectedObjects: [
      "eventLabel",
      ...Array.from({ length: sides + 1 }, (_, index) => `v${index}`),
      ...Array.from({ length: sides + 1 }, (_, index) => `h${index}`),
      ...eventPoints.map((command) => command.split(" = ")[0])
    ],
    outcomeZh: `展示两个 ${sides} 面等可能结果的样本空间网格，并标出和为 ${targetSum} 的事件。`,
    outcomeEn: `Show a ${sides}-by-${sides} equally likely sample-space grid and mark outcomes whose sum is ${targetSum}.`,
    hintsZh: [`验证 ${sides + 1} 条竖线、${sides + 1} 条横线和目标事件点都存在。`, "该宏只负责样本空间起图，后续概率计算仍需用有利结果数/总结果数说明。"],
    hintsEn: [`Verify ${sides + 1} vertical lines, ${sides + 1} horizontal lines, and the target event points.`, "This macro only starts the sample-space diagram; explain probability as favorable outcomes over total outcomes."]
  });
}
