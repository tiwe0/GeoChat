import type { ExecuteGeoGebraCommandsArgs } from "./functioncalls";

export type GeoGebraStylePolicyViolation = {
  command: string;
  commandName: string;
};

export type GeoGebraViewportPolicyViolation = {
  command: string;
  commandName: string;
  reason: "non_uniform_zoom_bounds" | "non_unit_axis_ratio";
};

export type GeoGebraFixedAxisPolicyViolation = {
  command: string;
  objectName: string;
};

export type GeoGebraCommandBatchPolicyViolation =
  | {
      reason: "too_many_commands";
      commandCount: number;
      maxCommands: number;
    }
  | {
      reason: "dynamic_text_expression";
      command: string;
    };

export const GEOCHAT_MAX_GEOGEBRA_COMMANDS_PER_BATCH = 100;

const twoDimensionalStyleCommandNames = new Set([
  "SetBackgroundColor",
  "SetColor",
  "SetDynamicColor",
  "SetFilling",
  "SetFontSize",
  "SetFontStyle",
  "SetLabelMode",
  "SetLineStyle",
  "SetLineThickness",
  "SetOpacity",
  "SetPointSize",
  "SetPointStyle",
  "SetTextStyle"
]);

const localizedStyleCommandAliases: Record<string, string> = {
  设置颜色: "SetColor",
  设置动态颜色: "SetDynamicColor",
  设置透明度: "SetFilling",
  设置填充: "SetFilling",
  设置点径: "SetPointSize",
  设置点样式: "SetPointStyle",
  设置线宽: "SetLineThickness",
  设置线型: "SetLineStyle",
  设置字体大小: "SetFontSize",
  设置字体样式: "SetFontStyle",
  设置文本样式: "SetTextStyle"
};

const styleCommandNameByLowerCase = new Map(
  [...twoDimensionalStyleCommandNames].map((commandName) => [commandName.toLowerCase(), commandName])
);

const semanticHighlightStyleCommandNames = new Set([
  "SetColor",
  "SetDynamicColor",
  "SetFilling"
]);

const fixedAxisObjectNames = ["xAxis", "yAxis", "zAxis", "x轴", "y轴", "z轴", "xOyPlane"] as const;
const threeDimensionalCommandPattern = /\b(?:Sphere|Plane|Surface|Pyramid|Prism|Tetrahedron|Cube|Polyhedron|Cone|Cylinder)\s*\(/iu;
const threeDimensionalCoordinatePattern = /=\s*\([^()]*,[^()]*,[^()]*\)/u;

export function hasExplicitTwoDimensionalStyleIntent(prompt?: string | null): boolean {
  const text = prompt?.trim();
  if (!text) return false;
  const negativeStyleIntentPattern =
    /(?:不要|别|禁止|不能|无需|不用|不必|do\s+not|don't|without|no)\s*.{0,12}(?:颜色|上色|涂色|填充|透明|线宽|线型|点大小|点样式|字体|样式|外观|高亮|color|colour|fill|filling|opacity|transparent|line\s+thickness|line\s+style|point\s+size|font|style|highlight)/iu;
  if (negativeStyleIntentPattern.test(text)) return false;
  return /(?:填充|上色|涂色|改成|变成|染成|设成|设置成|高亮|颜色|粉色|红色|蓝色|绿色|黄色|紫色|橙色|黑色|白色|灰色|半透明|透明|线宽|线型|点大小|点样式|字体|样式|外观|fill|filling|color|colour|make\s+.*(?:pink|red|blue|green|yellow|purple|orange|black|white|gray|grey)|turn\s+.*(?:pink|red|blue|green|yellow|purple|orange|black|white|gray|grey)|highlight|pink|red|blue|green|yellow|purple|orange|black|white|gray|grey|opacity|transparent|line\s+thickness|line\s+style|point\s+size|font|style)/iu.test(text);
}

export function hasSemanticTwoDimensionalHighlightIntent(prompt?: string | null): boolean {
  const text = prompt?.trim();
  if (!text) return false;
  const negativeStyleIntentPattern =
    /(?:不要|别|禁止|不能|无需|不用|不必|do\s+not|don't|without|no)\s*.{0,12}(?:颜色|上色|涂色|填充|透明|线宽|线型|点大小|点样式|字体|样式|外观|高亮|突出|强调|color|colour|fill|filling|opacity|transparent|line\s+thickness|line\s+style|point\s+size|font|style|highlight|emphasize)/iu;
  if (negativeStyleIntentPattern.test(text)) return false;
  return /(?:突出显示|突出|强调|可行域|目标函数|最优|截面|截线|截得|事件|样本空间|和为|满足条件|区域|阴影|边界|关键线段|辅助线|投影|等距|对应关系|单位圆|三角函数|sin|cos|highlight|emphasize|shade|projection|unit\s+circle|trigonometric|feasible\s+region|sample\s+space|event|section|cross[-\s]?section|boundary|target\s+function|objective\s+function)/iu.test(text);
}

export function findForbiddenTwoDimensionalStyleCommands(
  args: unknown,
  options: { userPrompt?: string | null } = {}
): GeoGebraStylePolicyViolation[] {
  if (!isExecuteGeoGebraCommandsArgsLike(args)) return [];
  if (isThreeDimensionalExecuteRequest(args)) return [];
  if (hasExplicitTwoDimensionalStyleIntent(options.userPrompt)) return [];
  const allowSemanticHighlight = hasSemanticTwoDimensionalHighlightIntent(options.userPrompt);
  return args.commands
    .map((command) => {
      const commandName = geoGebraCommandName(command);
      if (!commandName) return undefined;
      const normalizedName = localizedStyleCommandAliases[commandName] ?? styleCommandNameByLowerCase.get(commandName.toLowerCase()) ?? commandName;
      if (allowSemanticHighlight && semanticHighlightStyleCommandNames.has(normalizedName)) return undefined;
      return twoDimensionalStyleCommandNames.has(normalizedName)
        ? { command, commandName: normalizedName }
        : undefined;
    })
    .filter((item): item is GeoGebraStylePolicyViolation => Boolean(item));
}

export function twoDimensionalStylePolicyMessage(
  violations: readonly GeoGebraStylePolicyViolation[],
  locale?: "zh-CN" | "en-US" | null
) {
  const names = [...new Set(violations.map((violation) => violation.commandName))].join(", ");
  if (locale === "en-US") {
    return `2D GeoGebra drawings must keep default visual styles unless the user explicitly asks to edit appearance or the problem needs semantic highlighting for regions, events, sections, key segments, or comparison targets. Semantic 2D highlighting may use only color and light filling; do not change line thickness, line style, point size, fonts, background, or unrelated object styles. Forbidden commands: ${names}.`;
  }
  return `2D GeoGebra 绘图默认必须保持 GeoGebra 视觉样式，除非用户明确要求编辑外观，或题目需要对区域、事件、截面、关键线段、比较目标做语义高亮。2D 语义高亮只允许使用颜色和轻量填充，不要修改线段粗细、线型、点大小、字体、背景或无关对象样式。违规命令：${names}。`;
}

export function findForbiddenViewportScaleCommands(args: unknown): GeoGebraViewportPolicyViolation[] {
  if (!isExecuteGeoGebraCommandsArgsLike(args)) return [];
  return args.commands
    .map((command) => {
      const parsed = parseGeoGebraCommandCall(command);
      if (!parsed) return undefined;
      const commandName = parsed.commandName.toLowerCase();
      if (commandName === "zoomin") {
        const numbers = parseNumericArgs(parsed.argsText);
        if (numbers.length === 4) {
          const width = Math.abs(numbers[2] - numbers[0]);
          const height = Math.abs(numbers[3] - numbers[1]);
          if (!nearlyEqual(width, height)) {
            return { command, commandName: "ZoomIn", reason: "non_uniform_zoom_bounds" as const };
          }
        }
      }
      if (commandName === "setaxesratio") {
        const numbers = parseNumericArgs(parsed.argsText);
        if (numbers.length >= 2 && numbers.some((value) => !nearlyEqual(value, 1))) {
          return { command, commandName: "SetAxesRatio", reason: "non_unit_axis_ratio" as const };
        }
      }
      return undefined;
    })
    .filter((item): item is GeoGebraViewportPolicyViolation => Boolean(item));
}

export function repairViewportScaleCommand(command: string): string | undefined {
  const parsed = parseGeoGebraCommandCall(command);
  if (!parsed) return undefined;
  const commandName = parsed.commandName.toLowerCase();
  const numbers = parseNumericArgs(parsed.argsText);
  if (commandName === "zoomin" && numbers.length === 4) {
    const [minX, minY, maxX, maxY] = numbers;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const halfRange = Math.max(Math.abs(maxX - minX), Math.abs(maxY - minY)) / 2;
    return `ZoomIn(${formatPolicyNumber(centerX - halfRange)}, ${formatPolicyNumber(centerY - halfRange)}, ${formatPolicyNumber(centerX + halfRange)}, ${formatPolicyNumber(centerY + halfRange)})`;
  }
  if (commandName === "setaxesratio" && numbers.length >= 3) return "SetAxesRatio(1, 1, 1)";
  if (commandName === "setaxesratio" && numbers.length >= 2) return "SetAxesRatio(1, 1)";
  return undefined;
}

export function viewportScalePolicyMessage(
  violations: readonly GeoGebraViewportPolicyViolation[],
  locale?: "zh-CN" | "en-US" | null
) {
  const names = [...new Set(violations.map((violation) => violation.commandName))].join(", ");
  if (locale === "en-US") {
    return `GeoGebra viewport changes must preserve 1:1 axis scale unless the user explicitly asks for distorted axes. Use uniform zoom or SetAxesRatio(1, 1) / SetAxesRatio(1, 1, 1). Forbidden commands: ${names}.`;
  }
  return `GeoGebra 视野调整必须保持 x/y/z 轴 1:1 比例，除非用户明确要求拉伸坐标轴。请使用等比缩放，或使用 SetAxesRatio(1, 1) / SetAxesRatio(1, 1, 1)。违规命令：${names}。`;
}

export function findForbiddenFixedAxisObjectCommands(args: unknown): GeoGebraFixedAxisPolicyViolation[] {
  if (!isExecuteGeoGebraCommandsArgsLike(args)) return [];
  return args.commands
    .map((command) => {
      const stripped = stripGeoGebraStrings(command);
      const objectName = fixedAxisObjectNames.find((name) => assignsGeoGebraIdentifier(stripped, name));
      return objectName ? { command, objectName: String(objectName) } : undefined;
    })
    .filter((item): item is GeoGebraFixedAxisPolicyViolation => Boolean(item));
}

export function fixedAxisObjectPolicyMessage(
  violations: readonly GeoGebraFixedAxisPolicyViolation[],
  locale?: "zh-CN" | "en-US" | null
) {
  const names = [...new Set(violations.map((violation) => violation.objectName))].join(", ");
  if (locale === "en-US") {
    return `Do not assign values to GeoGebra built-in fixed axis objects: ${names}. If you need an editable axis helper, create xRef: y = 0 or yRef: x = 0 first.`;
  }
  return `不要给 GeoGebra 内置固定坐标轴对象赋值：${names}。如果需要可操作的坐标轴辅助线，先创建 xRef: y = 0 或 yRef: x = 0。`;
}

export function findGeoGebraCommandBatchPolicyViolations(args: unknown): GeoGebraCommandBatchPolicyViolation[] {
  if (!isExecuteGeoGebraCommandsArgsLike(args)) return [];
  const violations: GeoGebraCommandBatchPolicyViolation[] = [];
  if (args.commands.length > GEOCHAT_MAX_GEOGEBRA_COMMANDS_PER_BATCH) {
    violations.push({
      reason: "too_many_commands",
      commandCount: args.commands.length,
      maxCommands: GEOCHAT_MAX_GEOGEBRA_COMMANDS_PER_BATCH
    });
  }
  for (const command of args.commands) {
    if (hasDynamicTextExpression(command)) {
      violations.push({
        reason: "dynamic_text_expression",
        command
      });
    }
  }
  return violations;
}

export function geogebraCommandBatchPolicyMessage(
  violations: readonly GeoGebraCommandBatchPolicyViolation[],
  locale?: "zh-CN" | "en-US" | null
) {
  const tooMany = violations.find((violation) => violation.reason === "too_many_commands");
  const dynamicText = violations.find((violation) => violation.reason === "dynamic_text_expression");
  if (locale === "en-US") {
    const parts = [];
    if (tooMany?.reason === "too_many_commands") {
      parts.push(`This GeoGebra batch has ${tooMany.commandCount} commands, above the ${tooMany.maxCommands}-command limit. Split complex drawings into core construction, styling/labels, and explanation batches, and verify the canvas after each batch.`);
    }
    if (dynamicText) {
      parts.push("Do not build Text(...) labels by concatenating dynamic x(...) or y(...) expressions; use short static labels or put numerical explanation in the solution text.");
    }
    return parts.join(" ");
  }
  const parts = [];
  if (tooMany?.reason === "too_many_commands") {
    parts.push(`本次 GeoGebra 批次有 ${tooMany.commandCount} 条命令，超过 ${tooMany.maxCommands} 条上限。复杂图必须拆成核心构造、样式/标签、说明三个批次，并在每批后读取画布验证。`);
  }
  if (dynamicText) {
    parts.push("不要在 Text(...) 中拼接动态 x(...) 或 y(...) 表达式；请使用简短静态标签，数值解释放到解题文本里。");
  }
  return parts.join(" ");
}

function isExecuteGeoGebraCommandsArgsLike(value: unknown): value is Pick<ExecuteGeoGebraCommandsArgs, "commands" | "perspective"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const commands = (value as { commands?: unknown }).commands;
  return Array.isArray(commands) && commands.every((command) => typeof command === "string");
}

function isThreeDimensionalExecuteRequest(args: Pick<ExecuteGeoGebraCommandsArgs, "commands" | "perspective">) {
  const perspective = args.perspective?.trim().toUpperCase();
  if (perspective === "T" || perspective === "3D") return true;
  const text = args.commands.join("\n");
  return threeDimensionalCommandPattern.test(text) || threeDimensionalCoordinatePattern.test(text);
}

function geoGebraCommandName(command: string) {
  const match = command.match(/^\s*(?:[\p{L}_][\p{L}\p{N}_]*\s*=\s*)?([\p{L}_][\p{L}\p{N}_]*)\s*\(/u);
  return match?.[1] ?? null;
}

function parseGeoGebraCommandCall(command: string) {
  const match = command.match(/^\s*(?:[\p{L}_][\p{L}\p{N}_]*\s*=\s*)?([\p{L}_][\p{L}\p{N}_]*)\s*\((.*)\)\s*;?\s*$/u);
  return match ? { commandName: match[1], argsText: match[2] } : null;
}

function parseNumericArgs(argsText: string) {
  const parts = argsText.split(",").map((part) => part.trim());
  const numbers = parts.map((part) => Number(part));
  return numbers.every((value) => Number.isFinite(value)) ? numbers : [];
}

function stripGeoGebraStrings(command: string) {
  return command.replace(/"[^"]*"|'[^']*'/g, "");
}

function assignsGeoGebraIdentifier(command: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escaped}\\s*(?:=|:)`, "iu").test(command);
}

function hasDynamicTextExpression(command: string) {
  return /\bText\s*\(.*\+\s*(?:x|y)\s*\(/iu.test(command);
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) < 1e-9;
}

function formatPolicyNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "");
}
