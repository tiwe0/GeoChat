import {
  agentRoutingPrompt,
  findGeoGebraCommandReferenceEntry,
  searchGeoGebraCommandReference,
  type FunctionCallLocale,
  type GeoGebraCommandReferenceEntry,
  type GeoGebraCommandSearchScope
} from "@geochat-ai/app";

type CommandSearchSelectionInput = {
  status: string;
  visualProfile?: string;
  curriculumNodes: readonly {
    skillIds: readonly string[];
    recipeIds: readonly string[];
    visualProfiles: readonly string[];
  }[];
  selectedSkills: readonly {
    name: string;
    category?: string;
    parent?: string;
    recipes: readonly string[];
  }[];
  enabledAdvancedTools: readonly string[];
};

export type AgentCommandSearchIntent = {
  scope: GeoGebraCommandSearchScope;
  query: string;
  reason: string;
  commands: string[];
};

export type AgentCommandReferenceSummary = {
  command: string;
  syntax: string;
  description: string;
  examples: string[];
  scopes: GeoGebraCommandSearchScope[];
};

export type AgentCommandReferencePacket = {
  status: "not_needed" | "selected";
  queryIntents: AgentCommandSearchIntent[];
  references: AgentCommandReferenceSummary[];
  injectedContext: string;
};

const MAX_COMMAND_REFERENCE_COUNT = 14;

const ADVANCED_TOOL_COMMANDS: Record<string, readonly string[]> = {
  drawTriangularPrismSkeleton: ["Point", "Polygon", "Segment", "Prism", "ShowLabel", "SetColor", "SetFilling"],
  drawSquarePyramidSkeleton: ["Point", "Polygon", "Segment", "Pyramid", "ShowLabel", "SetColor", "SetFilling"],
  drawTetrahedronCircumsphere: ["Point", "Polygon", "Segment", "Sphere", "Distance", "ShowLabel", "SetColor", "SetFilling"],
  drawTetrahedronInsphere: ["Point", "Polygon", "Segment", "Sphere", "Plane", "Distance", "ShowLabel", "SetColor", "SetFilling"],
  drawUnitCircleTrigProjection: ["Slider", "Circle", "Point", "Segment", "Angle", "Text", "StartAnimation", "ShowLabel"],
  drawParabolaFocusDirectrix: ["Function", "Point", "Line", "Segment", "Distance", "Text", "ShowLabel", "SetColor"],
  drawQuadraticVertexDiagram: ["Function", "Point", "Line", "Extremum", "Text", "ShowLabel", "SetColor"],
  drawClassicalProbabilityGrid: ["Point", "Polygon", "Text", "SetColor", "SetFilling", "ShowLabel"]
};

type KeywordIntentRule = {
  pattern: RegExp;
  scope: GeoGebraCommandSearchScope;
  commands: readonly string[];
  zhReason: string;
  enReason: string;
};

const KEYWORD_INTENT_RULES: readonly KeywordIntentRule[] = [
  {
    pattern: /后处理|构图|取景|摄像机|视角|视野|缩放|居中|留白|裁剪|camera|framing|viewport|zoom|center|cropping|composition|post-processing/i,
    scope: "global",
    commands: ["SetPerspective", "SetActiveView", "CenterView", "ZoomIn", "SetAxesRatio"],
    zhReason: "技能或题目包含 2D/3D 视角、取景或缩放后处理，需要视图命令参考。",
    enReason: "The prompt or selected skills include 2D/3D camera, framing, or viewport post-processing and need view command references."
  },
  {
    pattern: /四面体|三棱锥|棱锥|棱柱|外接球|内切球|球|立体|空间|solid|sphere|circumsphere|insphere|tetrahedron|pyramid|prism|3d/i,
    scope: "geometry-3d",
    commands: ["Point", "Segment", "Polygon", "Sphere", "Pyramid", "Prism", "Distance", "ShowLabel"],
    zhReason: "题目或技能指向立体几何，需要 3D 构造命令参考。",
    enReason: "The prompt or selected skills point to solid geometry and need 3D construction command references."
  },
  {
    pattern: /圆锥曲线|抛物线|椭圆|双曲线|焦点|准线|conic|parabola|ellipse|hyperbola|focus|directrix/i,
    scope: "conic",
    commands: ["Function", "Point", "Line", "Segment", "Distance", "Intersect", "ShowLabel"],
    zhReason: "题目或技能指向圆锥曲线，需要解析几何命令参考。",
    enReason: "The prompt or selected skills point to conics and need analytic-geometry command references."
  },
  {
    pattern: /二次函数|函数|顶点|极值|对称轴|导数|切线|function|quadratic|vertex|extremum|derivative|tangent|root/i,
    scope: "function-graph",
    commands: ["Function", "Point", "Line", "Extremum", "Root", "Tangent", "Intersect", "ShowLabel"],
    zhReason: "题目或技能指向函数图像，需要函数图像命令参考。",
    enReason: "The prompt or selected skills point to function graphs and need graphing command references."
  },
  {
    pattern: /三角函数|单位圆|正弦|余弦|角|动画|trig|unit.?circle|sine|cosine|angle|animation|slider/i,
    scope: "animation",
    commands: ["Slider", "Circle", "Point", "Segment", "Angle", "StartAnimation", "Text", "ShowLabel"],
    zhReason: "题目或技能指向单位圆、角或动画，需要参数和动画命令参考。",
    enReason: "The prompt or selected skills point to unit-circle, angle, or animation work and need parameter command references."
  },
  {
    pattern: /概率|统计|样本空间|古典概型|网格|probability|statistics|sample.?space|grid/i,
    scope: "geometry-2d",
    commands: ["Point", "Polygon", "Text", "SetColor", "SetFilling", "ShowLabel"],
    zhReason: "题目或技能指向概率统计图示，需要 2D 图形和标注命令参考。",
    enReason: "The prompt or selected skills point to probability/statistics diagrams and need 2D annotation command references."
  },
  {
    pattern: /平面几何|三角形|圆|变换|作图|geometry|triangle|circle|construction|transformation/i,
    scope: "geometry-2d",
    commands: ["Point", "Segment", "Line", "Circle", "Polygon", "Angle", "Intersect", "Midpoint", "ShowLabel"],
    zhReason: "题目或技能指向平面几何，需要 2D 构造命令参考。",
    enReason: "The prompt or selected skills point to plane geometry and need 2D construction command references."
  },
  {
    pattern: /配色|标注|隐藏|审美|style|label|color|palette|hide|auxiliary/i,
    scope: "style",
    commands: ["SetColor", "SetFilling", "ShowLabel", "SetCaption", "Text"],
    zhReason: "技能或表达策略包含视觉约束，需要样式命令参考。",
    enReason: "The skill packet includes visual constraints and needs style command references."
  }
];

export function buildCommandReferencePacketForRun(input: {
  prompt: string;
  locale?: FunctionCallLocale | null;
  skillSelection: CommandSearchSelectionInput;
}): AgentCommandReferencePacket {
  if (input.skillSelection.status === "disabled") {
    return {
      status: "not_needed",
      queryIntents: [],
      references: [],
      injectedContext: ""
    };
  }

  const intents = buildCommandSearchIntents(agentRoutingPrompt(input.prompt), input.skillSelection, input.locale);
  const references = collectCommandReferences(intents, input.locale);
  return {
    status: references.length ? "selected" : "not_needed",
    queryIntents: intents,
    references,
    injectedContext: formatInjectedContext(references, input.locale)
  };
}

export function formatCommandReferencePacketPrompt(packet: AgentCommandReferencePacket, locale?: FunctionCallLocale | null) {
  if (locale === "en-US") {
    return [
      "[Preflight GeoGebra Command Reference packet]",
      `Status: ${packet.status}.`,
      packet.queryIntents.length
        ? ["Command search intents:", ...packet.queryIntents.map((intent) => `- ${intent.scope}: ${intent.reason}`)].join("\n")
        : "Command search intents: none.",
      packet.references.length
        ? [
            "Command references:",
            ...packet.references.map((item) =>
              [
                `- ${item.command}: ${item.syntax}`,
                `  ${item.description}`,
                item.examples.length ? `  Example: ${item.examples[0]}` : ""
              ].filter(Boolean).join("\n")
            )
          ].join("\n")
        : "Command references: none.",
      packet.injectedContext ? `Compressed command guidance: ${packet.injectedContext}` : "",
      "Use this packet as GeoGebra 5 syntax guidance, not as a mathematical fact source. Normally do not call searchGeoGebraCommands again; if the later concrete command batch is still incompatible, the harness will run a precise fallback search."
    ].filter(Boolean).join("\n");
  }

  return [
    "【预检 GeoGebra 命令参考 Packet】",
    `状态：${packet.status}。`,
    packet.queryIntents.length
      ? ["命令检索意图：", ...packet.queryIntents.map((intent) => `- ${intent.scope}：${intent.reason}`)].join("\n")
      : "命令检索意图：无。",
    packet.references.length
      ? [
          "命令参考：",
          ...packet.references.map((item) =>
            [
              `- ${item.command}：${item.syntax}`,
              `  ${item.description}`,
              item.examples.length ? `  示例：${item.examples[0]}` : ""
            ].filter(Boolean).join("\n")
          )
        ].join("\n")
      : "命令参考：无。",
    packet.injectedContext ? `压缩命令指导：${packet.injectedContext}` : "",
    "该 packet 只作为 GeoGebra 5 语法提示，不是数学事实来源。常规情况下不要再次调用 searchGeoGebraCommands；如果后续具体命令仍被 harness 判定不兼容，harness 会自动补一次精确查询。"
  ].filter(Boolean).join("\n");
}

function buildCommandSearchIntents(
  prompt: string,
  skillSelection: CommandSearchSelectionInput,
  locale?: FunctionCallLocale | null
): AgentCommandSearchIntent[] {
  const text = [
    prompt,
    skillSelection.visualProfile ?? "",
    ...skillSelection.enabledAdvancedTools,
    ...skillSelection.selectedSkills.flatMap((skill) => [
      skill.name,
      skill.category ?? "",
      skill.parent ?? "",
      ...skill.recipes
    ]),
    ...skillSelection.curriculumNodes.flatMap((node) => [
      ...node.skillIds,
      ...node.recipeIds,
      ...node.visualProfiles
    ])
  ].filter(Boolean).join(" ");

  const intents: AgentCommandSearchIntent[] = [];
  for (const toolName of skillSelection.enabledAdvancedTools) {
    const commands = ADVANCED_TOOL_COMMANDS[toolName];
    if (!commands?.length) continue;
    intents.push({
      scope: toolName.includes("UnitCircle") ? "animation" : toolName.includes("Parabola") ? "conic" : toolName.includes("Quadratic") ? "function-graph" : toolName.includes("Probability") ? "geometry-2d" : "geometry-3d",
      query: [toolName, ...commands].join(" "),
      reason: locale === "en-US"
        ? `Advanced drawing command ${toolName} is unlocked, so expose its underlying GeoGebra command family.`
        : `已解锁高级绘图命令 ${toolName}，需要提前暴露它依赖的 GeoGebra 命令族。`,
      commands: [...commands]
    });
  }

  for (const rule of KEYWORD_INTENT_RULES) {
    if (!rule.pattern.test(text)) continue;
    intents.push({
      scope: rule.scope,
      query: [rule.zhReason, rule.enReason, ...rule.commands].join(" "),
      reason: locale === "en-US" ? rule.enReason : rule.zhReason,
      commands: [...rule.commands]
    });
  }

  return dedupeIntents(intents);
}

function dedupeIntents(intents: readonly AgentCommandSearchIntent[]) {
  const seen = new Set<string>();
  const deduped: AgentCommandSearchIntent[] = [];
  for (const intent of intents) {
    const key = `${intent.scope}:${intent.commands.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(intent);
  }
  return deduped.slice(0, 8);
}

function collectCommandReferences(
  intents: readonly AgentCommandSearchIntent[],
  locale?: FunctionCallLocale | null
): AgentCommandReferenceSummary[] {
  const byCommand = new Map<string, AgentCommandReferenceSummary>();

  for (const intent of intents) {
    for (const command of intent.commands) {
      const entry = findGeoGebraCommandReferenceEntry(command, locale);
      if (entry) addCommandReference(byCommand, entry);
      if (byCommand.size >= MAX_COMMAND_REFERENCE_COUNT) return [...byCommand.values()];
    }
    for (const entry of searchGeoGebraCommandReference(intent.query, 4, locale, intent.scope)) {
      addCommandReference(byCommand, entry);
      if (byCommand.size >= MAX_COMMAND_REFERENCE_COUNT) return [...byCommand.values()];
    }
  }

  return [...byCommand.values()];
}

function addCommandReference(target: Map<string, AgentCommandReferenceSummary>, entry: GeoGebraCommandReferenceEntry) {
  if (target.has(entry.command)) return;
  target.set(entry.command, {
    command: entry.command,
    syntax: entry.syntax,
    description: entry.description,
    examples: [...(entry.examples ?? [])].slice(0, 1),
    scopes: [...entry.scopes]
  });
}

function formatInjectedContext(references: readonly AgentCommandReferenceSummary[], locale?: FunctionCallLocale | null) {
  if (!references.length) return "";
  const commandList = references.map((item) => item.command).join(", ");
  return locale === "en-US"
    ? `Preloaded GeoGebra command references: ${commandList}. Prefer these verified command names and syntax before writing raw GeoGebra commands.`
    : `已预载 GeoGebra 命令参考：${commandList}。编写原始 GeoGebra 命令前优先使用这些已校验命令名和语法。`;
}
