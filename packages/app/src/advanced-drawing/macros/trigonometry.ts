import type { FunctionCallLocale } from "../../functioncalls";
import { advancedCompilation } from "../compilation";
import { angleExpression } from "../expressions";
import { formatNumber } from "../formatting";
import type { AdvancedDrawingCompilation } from "../types";
import { identifierValue, normalizedArgs, positiveNumber } from "../validation";

export function compileUnitCircleTrigProjection(input: Record<string, unknown> | null | undefined, locale?: FunctionCallLocale | null): AdvancedDrawingCompilation {
  const args = normalizedArgs(input, ["angleDegrees", "angleName", "centerName", "pointName", "radius"], "drawUnitCircleTrigProjection");
  const angle = angleExpression(args.angleDegrees, "45°", "drawUnitCircleTrigProjection", "angleDegrees");
  const angleName = identifierValue(args.angleName, "theta", "drawUnitCircleTrigProjection", "angleName");
  const centerName = identifierValue(args.centerName, "O", "drawUnitCircleTrigProjection", "centerName");
  const pointName = identifierValue(args.pointName, "P", "drawUnitCircleTrigProjection", "pointName");
  const radius = positiveNumber(args.radius, 1, "drawUnitCircleTrigProjection", "radius");
  const commands = [
    `${centerName} = (0, 0)`,
    `U = (${formatNumber(radius)}, 0)`,
    `${angleName} = ${angle.expression}`,
    `unitCircle = Circle(${centerName}, ${formatNumber(radius)})`,
    `${pointName} = (${formatNumber(radius)} * cos(${angleName}), ${formatNumber(radius)} * sin(${angleName}))`,
    `C = (x(${pointName}), 0)`,
    `S = (0, y(${pointName}))`,
    `terminal = Segment(${centerName}, ${pointName})`,
    `cosSegment = Segment(${centerName}, C)`,
    `sinSegment = Segment(C, ${pointName})`,
    `sinMirror = Segment(${centerName}, S)`,
    `angleMark = Angle(U, ${centerName}, ${pointName})`,
    `SetColor(terminal, 0, 114, 178)`,
    `SetColor(cosSegment, 230, 159, 0)`,
    `SetColor(sinSegment, 213, 94, 0)`,
    `ShowLabel(${pointName}, true)`,
    `ShowLabel(C, true)`,
    `ShowLabel(S, true)`
  ];
  return advancedCompilation("drawUnitCircleTrigProjection", locale, {
    titleZh: "绘制单位圆三角函数投影",
    titleEn: "Draw unit-circle trigonometric projection",
    commands,
    perspective: "G",
    expectedObjects: ["unitCircle", pointName, "C", "S", "terminal", "cosSegment", "sinSegment", "angleMark"],
    outcomeZh: "展示单位圆终边点，以及 cos 和 sin 的投影意义。",
    outcomeEn: "Show the unit-circle terminal point and the projection meanings of cos and sin.",
    hintsZh: ["角标注使用 Angle(U, O, P)，顺序对应从 x 正半轴到 OP 的逆时针角。", "2D 后续只允许语义高亮，不要任意改变线宽和装饰样式。"],
    hintsEn: ["The angle uses Angle(U, O, P), measuring counterclockwise from the positive x-axis to OP.", "Follow-up 2D styling should stay semantic, not decorative."]
  });
}
