import {
  agentRoutingPrompt,
  findGeoGebraCommandReferenceEntry,
  searchGeoGebraCommandReference,
  type FunctionCallLocale,
  type GeoGebraCommandReferenceEntry
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
  tags: string[];
  tagMatch: "any" | "all";
  query: string;
  reason: string;
  commands: string[];
};

export type AgentCommandReferenceSummary = {
  command: string;
  syntax: string;
  description: string;
  examples: string[];
  tags: string[];
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
  tags: readonly string[];
  tagMatch: "any" | "all";
  commands: readonly string[];
  zhReason: string;
  enReason: string;
};

const KEYWORD_INTENT_RULES: readonly KeywordIntentRule[] = [
  {
    pattern: /后处理|构图|取景|摄像机|视角|视野|缩放|居中|留白|裁剪|camera|framing|viewport|zoom|center|cropping|composition|post-processing/i,
    tags: ["category:scripting", "capability:view", "capability:position"],
    tagMatch: "any",
    commands: ["SetPerspective", "SetActiveView", "CenterView", "ZoomIn", "SetAxesRatio"],
    zhReason: "技能或题目包含 2D/3D 视角、取景或缩放后处理，需要视图命令参考。",
    enReason: "The prompt or selected skills include 2D/3D camera, framing, or viewport post-processing and need view command references."
  },
  {
    pattern: /四面体|三棱锥|棱锥|棱柱|外接球|内切球|球|立体|空间|solid|sphere|circumsphere|insphere|tetrahedron|pyramid|prism|3d/i,
    tags: ["category:3d"],
    tagMatch: "any",
    commands: ["Point", "Segment", "Polygon", "Sphere", "Pyramid", "Prism", "Distance", "ShowLabel"],
    zhReason: "题目或技能指向立体几何，需要 3D 构造命令参考。",
    enReason: "The prompt or selected skills point to solid geometry and need 3D construction command references."
  },
  {
    pattern: /圆锥曲线|抛物线|椭圆|双曲线|焦点|准线|conic|parabola|ellipse|hyperbola|focus|directrix/i,
    tags: ["category:conic"],
    tagMatch: "any",
    commands: ["Parabola", "Ellipse", "Hyperbola", "Point", "Line", "Segment", "Distance", "Intersect", "ShowLabel"],
    zhReason: "题目或技能指向圆锥曲线，需要解析几何命令参考。",
    enReason: "The prompt or selected skills point to conics and need analytic-geometry command references."
  },
  {
    pattern: /二次函数|函数|顶点|极值|对称轴|导数|切线|function|quadratic|vertex|extremum|derivative|tangent|root/i,
    tags: ["category:functions-and-calculus"],
    tagMatch: "any",
    commands: ["Function", "Point", "Line", "Extremum", "Root", "Tangent", "Intersect", "ShowLabel"],
    zhReason: "题目或技能指向函数图像，需要函数图像命令参考。",
    enReason: "The prompt or selected skills point to function graphs and need graphing command references."
  },
  {
    pattern: /三角函数|单位圆|正弦|余弦|动画|滑块|trig(?:onometric)?|unit.?circle|sine|cosine|animation|slider/i,
    tags: ["category:scripting", "capability:animation"],
    tagMatch: "all",
    commands: ["Slider", "Circle", "Point", "Segment", "Angle", "StartAnimation", "Text", "ShowLabel"],
    zhReason: "题目或技能指向单位圆、角或动画，需要参数和动画命令参考。",
    enReason: "The prompt or selected skills point to unit-circle, angle, or animation work and need parameter command references."
  },
  {
    pattern: /概率|统计|样本空间|古典概型|网格|probability|statistics|sample.?space|grid/i,
    tags: ["category:probability", "category:statistics"],
    tagMatch: "any",
    commands: ["Point", "Polygon", "Text", "SetColor", "SetFilling", "ShowLabel"],
    zhReason: "题目或技能指向概率统计图示，需要 2D 图形和标注命令参考。",
    enReason: "The prompt or selected skills point to probability/statistics diagrams and need 2D annotation command references."
  },
  {
    pattern: /创建|构造(?!步骤)|绘制|作图|画(?:出|一个|一条|一幅)?|create|construct(?!ion step)|draw|plot/i,
    tags: ["capability:create"],
    tagMatch: "all",
    commands: ["Point", "Line", "Circle", "Segment", "Polygon", "Text"],
    zhReason: "题目要求创建画板对象，需要按构造功能检索基础命令。",
    enReason: "The task asks to create canvas objects and needs command references filtered by creation capability."
  },
  {
    pattern: /查询|读取|获取.{0,6}(?:构造步骤|当前步骤|选中对象|对象名称|坐标轴步长)|构造步骤|当前步骤|选中对象|\b(?:query|read|get)\b.{0,24}(?:construction step|selected object|object name|axis step)/i,
    tags: ["capability:query"],
    tagMatch: "all",
    commands: ["ConstructionStep", "SelectedElement", "SelectedIndex", "Object", "Name", "AxisStepX", "AxisStepY", "Corner"],
    zhReason: "题目需要读取构造或选择状态，需要按查询功能检索命令。",
    enReason: "The task needs construction or selection state and requires query-capability command references."
  },
  {
    pattern: /测量|度量|面积|周长|距离|长度|半径|体积|斜率|曲率|measure|area|perimeter|distance|length|radius|volume|slope|curvature/i,
    tags: ["capability:measure"],
    tagMatch: "all",
    commands: ["Area", "Perimeter", "Distance", "Length", "Radius", "Volume", "Slope"],
    zhReason: "题目要求测量几何量，需要按测量功能检索命令。",
    enReason: "The task asks for geometric measurements and needs command references filtered by measurement capability."
  },
  {
    pattern: /垂直线|垂线|平行线|角平分线|中垂线|中垂面|作.{0,4}(?:垂线|平行线|角平分线|中垂线|中垂面)|construct.{0,24}(?:perpendicular|parallel|bisector)|(?:perpendicular|parallel)\s+(?:line|plane)|angle\s+bisector|perpendicular\s+bisector/i,
    tags: ["capability:create"],
    tagMatch: "all",
    commands: ["PerpendicularLine", "Line", "AngleBisector", "PerpendicularBisector", "PerpendicularPlane", "PlaneBisector"],
    zhReason: "题目要求构造垂线、平行线或平分对象，需要按构造功能检索命令。",
    enReason: "The task asks to construct perpendicular, parallel, or bisector objects and needs creation-capability command references."
  },
  {
    pattern: /(?:判断|验证|检验|证明|是否|关系).{0,12}(?:垂直|平行)|(?:垂直|平行).{0,12}(?:关系|判断|验证|检验|证明|是否|吗)|\b(?:prove|verify|check|whether)\b.{0,24}\b(?:parallel|perpendicular)\b|\b(?:parallel|perpendicular)\b.{0,24}\b(?:prove|verify|check|whether)\b/i,
    tags: ["capability:relation"],
    tagMatch: "all",
    commands: ["ArePerpendicular", "AreParallel", "Relation", "Prove"],
    zhReason: "题目要求判断或证明平行、垂直关系，需要优先预载对应关系检查命令。",
    enReason: "The task asks to test or prove parallel/perpendicular relationships and needs the matching relation commands first."
  },
  {
    pattern: /(?:判断|验证|检验|证明|是否|关系).{0,12}(?:共线|共点|共圆|全等|平行|垂直|相切)|(?:共线|共点|共圆|全等|平行|垂直|相切).{0,12}(?:关系|判断|验证|检验|证明|是否|吗)|\b(?:relation|prove|verify|check|whether)\b.{0,24}\b(?:collinear|concurrent|concyclic|congruent|parallel|perpendicular|tangent)\b|\b(?:collinear|concurrent|concyclic|congruent|parallel|perpendicular|tangent)\b.{0,24}\b(?:relation|prove|verify|check|whether)\b/i,
    tags: ["capability:relation"],
    tagMatch: "all",
    commands: ["AreCollinear", "AreConcurrent", "AreConcyclic", "AreCongruent", "AreParallel", "ArePerpendicular", "IsTangent", "Relation", "Prove"],
    zhReason: "题目要求判断或证明对象关系，需要按关系验证功能检索命令。",
    enReason: "The task asks to test or prove object relationships and needs relation-capability command references."
  },
  {
    pattern: /变换|平移|旋转|反射|镜像|伸缩|剪切|矩阵变换|transform|translate|rotate|reflect|mirror|dilate|stretch|shear|matrix/i,
    tags: ["capability:transform"],
    tagMatch: "all",
    commands: ["Translate", "Rotate", "Reflect", "Dilate", "Stretch", "Shear", "ApplyMatrix"],
    zhReason: "题目要求几何变换，需要按变换功能检索命令。",
    enReason: "The task asks for geometric transformations and needs transform-capability command references."
  },
  {
    pattern: /平面几何|三角形|圆|变换|作图|geometry|triangle|circle|construction|transformation/i,
    tags: ["category:geometry"],
    tagMatch: "any",
    commands: ["Point", "Segment", "Line", "Circle", "Polygon", "Angle", "Intersect", "Midpoint", "ShowLabel"],
    zhReason: "题目或技能指向平面几何，需要 2D 构造命令参考。",
    enReason: "The prompt or selected skills point to plane geometry and need 2D construction command references."
  },
  {
    pattern: /标签位置|标注位置|label.?position|position.*label/i,
    tags: ["capability:label", "capability:position", "capability:text-position"],
    tagMatch: "any",
    commands: ["SetCaption", "SetLabelMode", "ShowLabel", "Text"],
    zhReason: "题目要求调整标签位置；需区分标签内容、显示模式与可定位文本，不能把对象坐标误当成原生标签偏移。",
    enReason: "The task asks for label positioning; distinguish label content and display mode from positioned text instead of treating object coordinates as native label offsets."
  },
  {
    pattern: /配色|标注|标签位置|隐藏|审美|style|label|label.?position|color|palette|hide|auxiliary/i,
    tags: ["capability:style", "capability:label", "capability:color", "capability:fill", "capability:visibility", "capability:position"],
    tagMatch: "any",
    commands: ["SetColor", "SetFilling", "ShowLabel", "SetCaption", "SetLabelMode", "Text"],
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
        ? [
            "Command search intents:",
            ...packet.queryIntents.map((intent) => `- tags(${intent.tagMatch})=[${intent.tags.join(", ")}]: ${intent.reason}`)
          ].join("\n")
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
      "Use this packet as GeoGebra 5 syntax guidance, not as a mathematical fact source. Use searchGeoGebraCommands for a precise follow-up lookup only when a later concrete command is not covered by this packet."
    ].filter(Boolean).join("\n");
  }

  return [
    "【预检 GeoGebra 命令参考 Packet】",
    `状态：${packet.status}。`,
    packet.queryIntents.length
      ? [
          "命令检索意图：",
          ...packet.queryIntents.map((intent) => `- 标签(${intent.tagMatch})=[${intent.tags.join("，")}]：${intent.reason}`)
        ].join("\n")
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
    "该 packet 只作为 GeoGebra 5 语法提示，不是数学事实来源。仅当后续所需的具体命令未被该 packet 覆盖时，再调用 searchGeoGebraCommands 精确补查。"
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
    const tagSelection = getAdvancedToolTagSelection(toolName);
    intents.push({
      ...tagSelection,
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
      tags: [...rule.tags],
      tagMatch: rule.tagMatch,
      query: [rule.zhReason, rule.enReason, ...rule.commands].join(" "),
      reason: locale === "en-US" ? rule.enReason : rule.zhReason,
      commands: [...rule.commands]
    });
  }

  return dedupeIntents(intents);
}

function dedupeIntents(intents: readonly AgentCommandSearchIntent[]) {
  const mergedByTagSelection = new Map<string, AgentCommandSearchIntent>();
  for (const intent of intents) {
    const key = `${intent.tagMatch}:${[...intent.tags].sort().join(",")}`;
    const existing = mergedByTagSelection.get(key);
    if (!existing) {
      mergedByTagSelection.set(key, {
        ...intent,
        tags: [...intent.tags],
        commands: [...intent.commands]
      });
      continue;
    }
    existing.commands = [...new Set([...existing.commands, ...intent.commands])];
    existing.query = `${existing.query} ${intent.query}`;
  }
  return [...mergedByTagSelection.values()].slice(0, 8);
}

function collectCommandReferences(
  intents: readonly AgentCommandSearchIntent[],
  locale?: FunctionCallLocale | null
): AgentCommandReferenceSummary[] {
  const byCommand = new Map<string, AgentCommandReferenceSummary>();

  const maxDirectCommandCount = Math.max(0, ...intents.map((intent) => intent.commands.length));
  for (let commandIndex = 0; commandIndex < maxDirectCommandCount; commandIndex += 1) {
    for (const intent of intents) {
      const command = intent.commands[commandIndex];
      if (!command) continue;
      const entry = findGeoGebraCommandReferenceEntry(command, locale);
      if (entry) addCommandReference(byCommand, entry);
      if (byCommand.size >= MAX_COMMAND_REFERENCE_COUNT) return [...byCommand.values()];
    }
  }

  const searchedByIntent = intents.map((intent) => searchGeoGebraCommandReference(intent.query, 4, locale, {
      tags: intent.tags,
      tagMatch: intent.tagMatch
    }));
  const maxSearchResultCount = Math.max(0, ...searchedByIntent.map((entries) => entries.length));
  for (let resultIndex = 0; resultIndex < maxSearchResultCount; resultIndex += 1) {
    for (const entries of searchedByIntent) {
      const entry = entries[resultIndex];
      if (!entry) continue;
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
    tags: [...(entry.tags ?? [])]
  });
}

function getAdvancedToolTagSelection(toolName: string): Pick<AgentCommandSearchIntent, "tags" | "tagMatch"> {
  if (toolName.includes("UnitCircle")) {
    return {
      tags: ["category:scripting", "capability:animation"],
      tagMatch: "all"
    };
  }
  if (toolName.includes("Parabola")) {
    return {
      tags: ["category:conic"],
      tagMatch: "any"
    };
  }
  if (toolName.includes("Quadratic")) {
    return {
      tags: ["category:functions-and-calculus"],
      tagMatch: "any"
    };
  }
  if (toolName.includes("Probability")) {
    return {
      tags: ["category:probability", "category:statistics"],
      tagMatch: "any"
    };
  }
  return {
    tags: ["category:3d"],
    tagMatch: "any"
  };
}

function formatInjectedContext(references: readonly AgentCommandReferenceSummary[], locale?: FunctionCallLocale | null) {
  if (!references.length) return "";
  const commandList = references.map((item) => item.command).join(", ");
  return locale === "en-US"
    ? `Preloaded GeoGebra command references: ${commandList}. Prefer these verified command names and syntax before writing raw GeoGebra commands.`
    : `已预载 GeoGebra 命令参考：${commandList}。编写原始 GeoGebra 命令前优先使用这些已校验命令名和语法。`;
}
