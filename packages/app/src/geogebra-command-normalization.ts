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

export function normalizeGeoGebraCommandSyntax(command: string): string[] {
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
    const rgb = normalizeRgbChannels(color);
    return rgb
      ? [`${call.prefix}SetColor(${objectName}, ${rgb.join(", ")})${call.trailing}`]
      : [`${call.prefix}SetColor(${call.args.join(", ")})${call.trailing}`];
  }
  const rgb = normalizeRgbChannels(call.args.slice(1, 4));
  if (call.args.length >= 5 && rgb) {
    const alpha = normalizeOpacityArgument(call.args[4]);
    const colorCommand = `${call.prefix}SetColor(${objectName}, ${rgb.join(", ")})${call.trailing}`;
    return alpha === null ? [colorCommand] : [colorCommand, `SetFilling(${objectName}, ${alpha})`];
  }
  if (call.args.length === 4 && rgb) {
    return [`${call.prefix}SetColor(${objectName}, ${rgb.join(", ")})${call.trailing}`];
  }
  return [`${call.prefix}SetColor(${call.args.join(", ")})${call.trailing}`];
}

function normalizeRgbChannels(values: readonly (string | number)[]) {
  if (values.length !== 3) return null;
  const channels = values.map((value) => Number(String(value).trim()));
  if (channels.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) return null;
  if (channels.every((value) => value <= 1)) return channels.map(formatGeoGebraNumber);
  return channels.map(formatGeoGebraRgbByte);
}

function formatGeoGebraNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}

function formatGeoGebraRgbByte(value: number) {
  if (value <= 0) return "0";
  if (value >= 255) return "1";
  // GeoGebra converts unit-range channels back to bytes by truncating. A
  // conventional decimal rounding can therefore turn e.g. 120/255 into 119.
  // Ceiling at eight decimal places preserves the requested byte without a
  // visually meaningful overshoot.
  const scale = 100_000_000;
  return (Math.ceil((value * scale) / 255) / scale).toString();
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
