const defaultFreeParameterValue = "0.5";
const coordinateVariables = new Set(["x", "y", "z"]);
const geogebraBuiltinIdentifiers = new Set([
  "true",
  "false",
  "undefined",
  "pi",
  "e",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sqrt",
  "abs",
  "exp",
  "log",
  "ln",
  "min",
  "max",
  "floor",
  "ceil",
  "round",
  "if",
  "and",
  "or",
  "not",
  "xaxis",
  "yaxis",
  "x轴",
  "y轴",
  "xoyplane"
]);

export function normalizeGeoGebraFreeParameterCommands(commands: string[], options: { declaredNames?: Iterable<string> } = {}) {
  const declared = new Set<string>(options.declaredNames ?? []);
  const normalizedCommands: string[] = [];
  for (const command of commands) {
    for (const syntaxSafeCommand of normalizeGeoGebraCommandSyntax(command)) {
      const pointSafeCommand = normalizeLowercaseCoordinatePointCommand(syntaxSafeCommand);
      const assignment = parseGeoGebraAssignment(pointSafeCommand);
      const freeParameters = findGeoGebraFreeParameters(pointSafeCommand, declared, assignment.localVariables);
      for (const parameter of freeParameters) {
        normalizedCommands.push(`${parameter} = ${defaultFreeParameterValue}`);
        declared.add(parameter);
      }
      normalizedCommands.push(pointSafeCommand);
      if (assignment.assignedName) declared.add(assignment.assignedName);
    }
  }
  return normalizedCommands;
}

function normalizeGeoGebraCommandSyntax(command: string): string[] {
  const aliasedCommand = normalizeGeoGebraCommandAliases(command);
  const call = parseGeoGebraCommandCall(aliasedCommand);
  if (!call) return [aliasedCommand];

  if (call.commandName === "SetOpacity") {
    return [`${call.prefix}SetFilling(${call.args.join(", ")})${call.trailing}`];
  }
  if (call.commandName === "HideLabel" && call.args.length >= 1) {
    return [`${call.prefix}ShowLabel(${call.args[0]}, false)${call.trailing}`];
  }
  if (call.commandName === "Maximum") {
    return [`${call.prefix}Extremum(${call.args.join(", ")})${call.trailing}`];
  }
  if (call.commandName === "SetColor") {
    return normalizeSetColorCommand(call);
  }
  if (call.commandName === "Slider") {
    return [normalizeSliderCommand(call)];
  }
  if (call.commandName === "Vector") {
    return [normalizeVectorCommand(call)];
  }

  return [aliasedCommand];
}

function normalizeGeoGebraCommandAliases(command: string) {
  const aliases: Record<string, string> = {
    设置颜色: "SetColor",
    设置透明度: "SetFilling",
    设置点径: "SetPointSize",
    隐藏标签: "HideLabel",
    显示标签: "ShowLabel",
    棱锥: "Pyramid",
    棱柱: "Prism",
    球面: "Sphere",
    平面: "Plane"
  };
  return command.replace(/^(\s*(?:[\p{L}_][\p{L}\p{N}_]*\s*=\s*)?)([\p{L}_][\p{L}\p{N}_]*)\s*\(/u, (full, prefix: string, name: string) => {
    const replacement = aliases[name];
    return replacement ? `${prefix}${replacement}(` : full;
  });
}

function parseGeoGebraCommandCall(command: string) {
  const match = command.match(/^(\s*(?:[\p{L}_][\p{L}\p{N}_]*\s*=\s*)?)([\p{L}_][\p{L}\p{N}_]*)\s*\((.*)\)(\s*)$/u);
  if (!match) return null;
  const [, prefix, commandName, rawArgs, trailing] = match;
  return {
    prefix,
    commandName,
    args: splitGeoGebraTopLevelCommaList(rawArgs),
    trailing
  };
}

function normalizeSetColorCommand(call: NonNullable<ReturnType<typeof parseGeoGebraCommandCall>>) {
  if (call.args.length < 2) return [`${call.prefix}SetColor(${call.args.join(", ")})${call.trailing}`];
  const objectName = call.args[0];
  const color = colorTupleFromGeoGebraArgument(call.args[1]);
  if (color) {
    return [`${call.prefix}SetColor(${objectName}, ${color.join(", ")})${call.trailing}`];
  }
  if (call.args.length >= 5) {
    const alpha = normalizeOpacityArgument(call.args[4]);
    const colorCommand = `${call.prefix}SetColor(${call.args.slice(0, 4).join(", ")})${call.trailing}`;
    return alpha === null ? [colorCommand] : [colorCommand, `SetFilling(${objectName}, ${alpha})`];
  }
  return [`${call.prefix}SetColor(${call.args.join(", ")})${call.trailing}`];
}

function normalizeSliderCommand(call: NonNullable<ReturnType<typeof parseGeoGebraCommandCall>>) {
  if (call.args.length >= 9) return `${call.prefix}Slider(${call.args.slice(0, 9).join(", ")})${call.trailing}`;
  const [min = "0", max = "1", increment = "0.1"] = call.args;
  return `${call.prefix}Slider(${min}, ${max}, ${increment}, 1, 120, false, true, false, false)${call.trailing}`;
}

function normalizeVectorCommand(call: NonNullable<ReturnType<typeof parseGeoGebraCommandCall>>) {
  if (call.prefix.trim().endsWith("=") && (call.args.length === 2 || call.args.length === 3) && call.args.every(isNumericGeoGebraExpression)) {
    const origin = call.args.length === 2 ? "(0, 0)" : "(0, 0, 0)";
    return `${call.prefix}Vector(${origin}, (${call.args.join(", ")}))${call.trailing}`;
  }
  return `${call.prefix}Vector(${call.args.join(", ")})${call.trailing}`;
}

function colorTupleFromGeoGebraArgument(value: string) {
  const normalized = value.trim().replace(/^["']|["']$/g, "").toLowerCase();
  const namedColors: Record<string, [number, number, number]> = {
    red: [220, 60, 60],
    crimson: [220, 60, 60],
    blue: [42, 111, 219],
    green: [24, 150, 95],
    orange: [230, 142, 38],
    yellow: [235, 184, 45],
    purple: [115, 92, 230],
    violet: [115, 92, 230],
    black: [35, 39, 47],
    gray: [110, 118, 129],
    grey: [110, 118, 129],
    white: [255, 255, 255],
    红色: [220, 60, 60],
    蓝色: [42, 111, 219],
    绿色: [24, 150, 95],
    橙色: [230, 142, 38],
    黄色: [235, 184, 45],
    紫色: [115, 92, 230],
    黑色: [35, 39, 47],
    灰色: [110, 118, 129],
    白色: [255, 255, 255]
  };
  return namedColors[normalized] ?? null;
}

function normalizeOpacityArgument(value: string) {
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric)).toString();
}

function isNumericGeoGebraExpression(value: string) {
  return /^[\d\s+\-*/().piπe]+$/iu.test(value);
}

function normalizeLowercaseCoordinatePointCommand(command: string) {
  const match = command.match(/^(\s*)([a-z][\p{L}\p{N}_]*)\s*=\s*(.+?)(\s*)$/u);
  if (!match) return command;
  const [, leading, name, rawExpression, trailing] = match;
  const expression = rawExpression.trim();
  if (!expression.startsWith("(") || !expression.endsWith(")") || expression.startsWith("Point(")) return command;
  const parts = splitGeoGebraTopLevelCommaList(expression.slice(1, -1));
  if (parts.length !== 2 && parts.length !== 3) return command;
  return `${leading}${name} = Point((${parts.join(", ")}))${trailing}`;
}

function splitGeoGebraTopLevelCommaList(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function parseGeoGebraAssignment(command: string) {
  const assignmentIndex = command.indexOf("=");
  if (assignmentIndex < 0) return { assignedName: undefined, localVariables: new Set<string>() };
  const left = command.slice(0, assignmentIndex).trim();
  const labeledObjectMatch = left.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*:/u);
  if (labeledObjectMatch) {
    return { assignedName: labeledObjectMatch[1], localVariables: new Set<string>() };
  }
  const functionMatch = left.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\(([^)]*)\)\s*$/u);
  if (functionMatch) {
    return {
      assignedName: functionMatch[1],
      localVariables: new Set(
        functionMatch[2]
          .split(",")
          .map((item) => item.trim())
          .filter((item) => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(item))
      )
    };
  }
  const objectMatch = left.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*$/u);
  return { assignedName: objectMatch?.[1], localVariables: new Set<string>() };
}

function findGeoGebraFreeParameters(command: string, declared: Set<string>, localVariables: Set<string>) {
  const assignmentIndex = command.indexOf("=");
  const expression = stripGeoGebraStrings(assignmentIndex >= 0 ? command.slice(assignmentIndex + 1) : command);
  const freeParameters: string[] = [];
  const seen = new Set<string>();
  for (const match of expression.matchAll(/[\p{L}_][\p{L}\p{N}_]*/gu)) {
    const name = match[0];
    if (seen.has(name) || declared.has(name) || localVariables.has(name)) continue;
    seen.add(name);
    const lower = name.toLowerCase();
    if (coordinateVariables.has(lower) || geogebraBuiltinIdentifiers.has(lower)) continue;
    const next = nextNonSpaceChar(expression, match.index + name.length);
    if (next === "(") continue;
    freeParameters.push(name);
  }
  return freeParameters;
}

function stripGeoGebraStrings(command: string) {
  return command.replace(/"[^"]*"|'[^']*'/g, "");
}

function nextNonSpaceChar(value: string, index: number) {
  for (let cursor = index; cursor < value.length; cursor += 1) {
    if (!/\s/.test(value[cursor])) return value[cursor];
  }
  return "";
}

export type NormalizedGeoGebraPerspectiveMode = {
  input: string;
  code: string;
  label: string;
  kind: "standard" | "layout" | "view_toggle";
};

const standardPerspectiveAliases = new Map<string, { code: string; label: string }>([
  ["1", { code: "1", label: "Algebra and Graphics" }],
  ["algebra", { code: "AG", label: "Algebra and Graphics" }],
  ["algebra graphics", { code: "AG", label: "Algebra and Graphics" }],
  ["algebra+graphics", { code: "AG", label: "Algebra and Graphics" }],
  ["ag", { code: "AG", label: "Algebra and Graphics" }],
  ["代数", { code: "AG", label: "Algebra and Graphics" }],
  ["代数区", { code: "AG", label: "Algebra and Graphics" }],
  ["代数视图", { code: "AG", label: "Algebra and Graphics" }],
  ["代数和图形", { code: "AG", label: "Algebra and Graphics" }],
  ["2", { code: "2", label: "Geometry" }],
  ["g", { code: "G", label: "Graphics" }],
  ["graphics", { code: "G", label: "Graphics" }],
  ["graphic", { code: "G", label: "Graphics" }],
  ["geometry", { code: "G", label: "Graphics" }],
  ["2d", { code: "G", label: "Graphics" }],
  ["二维", { code: "G", label: "Graphics" }],
  ["二维视图", { code: "G", label: "Graphics" }],
  ["图形", { code: "G", label: "Graphics" }],
  ["图形视图", { code: "G", label: "Graphics" }],
  ["画板", { code: "G", label: "Graphics" }],
  ["3", { code: "3", label: "Spreadsheet" }],
  ["spreadsheet", { code: "SG", label: "Spreadsheet and Graphics" }],
  ["sheet", { code: "SG", label: "Spreadsheet and Graphics" }],
  ["表格", { code: "SG", label: "Spreadsheet and Graphics" }],
  ["电子表格", { code: "SG", label: "Spreadsheet and Graphics" }],
  ["4", { code: "4", label: "CAS" }],
  ["cas", { code: "CG", label: "CAS and Graphics" }],
  ["符号计算", { code: "CG", label: "CAS and Graphics" }],
  ["5", { code: "5", label: "3D Graphics Perspective" }],
  ["t", { code: "T", label: "3D Graphics" }],
  ["3d", { code: "T", label: "3D Graphics" }],
  ["3d graphics", { code: "T", label: "3D Graphics" }],
  ["3d view", { code: "T", label: "3D Graphics" }],
  ["三维", { code: "T", label: "3D Graphics" }],
  ["三维视图", { code: "T", label: "3D Graphics" }],
  ["立体", { code: "T", label: "3D Graphics" }],
  ["6", { code: "6", label: "Probability" }],
  ["b", { code: "B", label: "Probability Calculator" }],
  ["probability", { code: "B", label: "Probability Calculator" }],
  ["概率", { code: "B", label: "Probability Calculator" }]
]);

const togglePerspectiveAliases = new Map<string, string>([
  ["algebra", "A"],
  ["代数", "A"],
  ["probability", "B"],
  ["概率", "B"],
  ["cas", "C"],
  ["graphics2", "D"],
  ["graphics 2", "D"],
  ["第二图形", "D"],
  ["图形2", "D"],
  ["graphics", "G"],
  ["geometry", "G"],
  ["图形", "G"],
  ["画板", "G"],
  ["construction", "L"],
  ["construction protocol", "L"],
  ["构造协议", "L"],
  ["properties", "P"],
  ["属性", "P"],
  ["data", "R"],
  ["data analysis", "R"],
  ["数据分析", "R"],
  ["spreadsheet", "S"],
  ["表格", "S"],
  ["sheet", "S"],
  ["3d", "T"],
  ["3d graphics", "T"],
  ["三维", "T"],
  ["tools", "Tools"],
  ["工具", "Tools"],
  ["table", "Table"],
  ["数值表", "Table"]
]);

export function normalizeGeoGebraPerspectiveMode(value: unknown): NormalizedGeoGebraPerspectiveMode | undefined {
  if (typeof value !== "string") return undefined;
  const input = value.trim();
  if (!input) return undefined;
  const unquoted = input.replace(/^["']|["']$/g, "").trim();
  if (!unquoted) return undefined;
  const lower = unquoted.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const standard = standardPerspectiveAliases.get(lower);
  if (standard) {
    return {
      input,
      code: standard.code,
      label: standard.label,
      kind: /^[1-6]$/.test(standard.code) ? "standard" : "layout"
    };
  }
  const toggleMatch = unquoted.match(/^([+-])\s*(.+)$/);
  if (toggleMatch) {
    const toggleTarget = togglePerspectiveAliases.get(toggleMatch[2].trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "));
    const rawTarget = toggleMatch[2].trim();
    const target = toggleTarget ?? (/^(?:[ABCDGLPRST]|Tools|Table)$/i.test(rawTarget) ? rawTarget : "");
    if (!target) return undefined;
    const normalizedTarget = target === "Tools" || target === "Table" ? target : target.toUpperCase();
    return {
      input,
      code: `${toggleMatch[1]}${normalizedTarget}`,
      label: `${toggleMatch[1] === "+" ? "Open" : "Close"} ${normalizedTarget}`,
      kind: "view_toggle"
    };
  }
  const layout = unquoted.replace(/\s+/g, "").toUpperCase();
  if (/^[ABCDGLPRST()+/\-]+$/.test(layout) && /[ABCDGLPRST]/.test(layout)) {
    return {
      input,
      code: layout,
      label: `Layout ${layout}`,
      kind: "layout"
    };
  }
  return undefined;
}
