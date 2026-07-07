import { generateText, type LanguageModel } from "ai";
import {
  agentRoutingPrompt,
  getAdvancedDrawingToolDefinitions,
  type AgentRunLedgerRecord,
  type FunctionCallToolName
} from "@geochat-ai/app";
import {
  activateAgentSkill,
  createAgentSkillBrief,
  extractAgentSkillConstraintBrief,
  filterBusinessReadyAgentSkills,
  listAvailableAgentSkills,
  searchAvailableAgentSkills,
  type AgentSkillBrief,
  type AgentSkillSummary
} from "./skills";
import {
  listCurriculumCatalogs,
  loadCurriculumNode,
  searchCurriculum,
  type CurriculumNode
} from "./curriculum";

const SKILL_SELECTOR_TIMEOUT_MS = 30_000;
const skillSelectionCache = new Map<string, Promise<AgentSkillSelectionPacket>>();

export type AgentSkillRuntimePolicy = {
  enabled: boolean;
  autoActivate: boolean;
  allowedSkillNames: string[] | null;
  visualProfile?: string;
};

export type AgentSkillSelectionStatus = "disabled" | "not_needed" | "selected" | "failed";

export type AgentSkillSelectionItem = {
  name: string;
  category?: string;
  parent?: string;
  level?: number;
  recipes: string[];
  reason: string;
};

export type AgentCurriculumSelectionItem = {
  id: string;
  source: CurriculumNode["source"];
  stage: CurriculumNode["stage"];
  edition: CurriculumNode["edition"];
  book: string;
  chapter: string;
  section?: string;
  skillIds: string[];
  recipeIds: string[];
  visualProfiles: string[];
  reason: string;
};

export type AgentSkillSelectionPacket = {
  status: AgentSkillSelectionStatus;
  visualProfile?: string;
  curriculumNodes: AgentCurriculumSelectionItem[];
  selectedSkills: AgentSkillSelectionItem[];
  enabledAdvancedTools: string[];
  selectorReason: string;
  injectedContext: string;
  error?: string;
};

type SkillSelectorCandidateContext = {
  catalogs: ReturnType<typeof listCurriculumCatalogs>;
  curriculumNodes: AgentCurriculumSelectionItem[];
  skillBriefs: AgentSkillBrief[];
  allowedSkillNames: string[] | null;
  visualProfile?: string;
};

export async function selectAgentSkillsForRun(input: {
  run: AgentRunLedgerRecord;
  model: LanguageModel;
  temperature: number | undefined;
  timeout?: number;
  disabledToolNames?: readonly FunctionCallToolName[];
}): Promise<AgentSkillSelectionPacket> {
  const policy = skillRuntimePolicyFromPrompt(input.run.prompt);
  if (!policy.enabled || !policy.autoActivate || skillSelectionToolsDisabled(input.disabledToolNames)) {
    return {
      status: "disabled",
      visualProfile: policy.visualProfile,
      curriculumNodes: [],
      selectedSkills: [],
      enabledAdvancedTools: [],
      selectorReason: !policy.enabled
        ? "Agent Skills are disabled for this run."
        : !policy.autoActivate
          ? "Automatic skill selection is disabled for this run."
          : "Skill selection tools are disabled for this run.",
      injectedContext: ""
    };
  }

  const cacheKey = `${input.run.runId}:${input.run.prompt}`;
  const cached = skillSelectionCache.get(cacheKey);
  if (cached) return cached;
  const selection = runSkillSelector({
    ...input,
    timeout: Math.min(input.timeout ?? 120_000, SKILL_SELECTOR_TIMEOUT_MS)
  }, policy);
  skillSelectionCache.set(cacheKey, selection);
  return selection;
}

async function runSkillSelector(input: {
  run: AgentRunLedgerRecord;
  model: LanguageModel;
  temperature: number | undefined;
  timeout: number;
}, policy: AgentSkillRuntimePolicy): Promise<AgentSkillSelectionPacket> {
  let candidateContext: SkillSelectorCandidateContext | undefined;
  try {
    candidateContext = await buildSkillSelectorCandidateContext(input.run, policy);
    if (!candidateContext.curriculumNodes.length && !candidateContext.skillBriefs.length) {
      return {
        status: "not_needed",
        visualProfile: policy.visualProfile,
        curriculumNodes: [],
        selectedSkills: [],
        enabledAdvancedTools: [],
        selectorReason: "No curriculum node or skill candidate matched this run.",
        injectedContext: ""
      };
    }
    const result = await generateText({
      model: input.model,
      system: skillSelectorSystemPrompt(input.run.locale),
      messages: [
        {
          role: "user",
          content: skillSelectorUserPrompt({
            prompt: input.run.prompt,
            locale: input.run.locale,
            attachmentCount: input.run.attachmentCount,
            policy,
            candidateContext
          })
        }
      ],
      maxRetries: 0,
      temperature: input.temperature,
      timeout: input.timeout
    });
    const packet = normalizeSkillSelectionPacket(parseSkillSelectionJson(result.text), policy);
    return enrichSkillSelectionPacket(packet, policy, candidateContext, input.run.locale);
  } catch (error) {
    if (candidateContext) {
      return enrichSkillSelectionPacket(
        deterministicSkillSelectionPacket(candidateContext, policy, error),
        policy,
        candidateContext,
        input.run.locale
      );
    }
    return {
      status: "failed",
      visualProfile: policy.visualProfile,
      curriculumNodes: [],
      selectedSkills: [],
      enabledAdvancedTools: [],
      selectorReason: "Temporary skill selector failed; continue without a preloaded skill packet.",
      injectedContext: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function buildSkillSelectorCandidateContext(
  run: Pick<AgentRunLedgerRecord, "prompt">,
  policy: AgentSkillRuntimePolicy
): Promise<SkillSelectorCandidateContext> {
  const routingPrompt = agentRoutingPrompt(run.prompt);
  const catalogs = listCurriculumCatalogs();
  const curriculumMatches = searchCurriculum({ query: routingPrompt, limit: 5 });
  const curriculumNodes = curriculumMatches.slice(0, 3).map((match): AgentCurriculumSelectionItem => ({
    id: match.id,
    source: match.source,
    stage: match.stage,
    edition: match.edition,
    book: match.book,
    chapter: match.chapter,
    ...(match.section ? { section: match.section } : {}),
    skillIds: match.skillIds,
    recipeIds: match.recipeIds,
    visualProfiles: match.visualProfiles,
    reason: `Matched ${match.matchedFields.slice(0, 4).join(", ") || "curriculum index"} with score ${match.score}.`
  }));
  const allowed = policy.allowedSkillNames?.length ? new Set(policy.allowedSkillNames.map((name) => name.toLowerCase())) : null;
  const availableSkills = filterBusinessReadyAgentSkills(await listAvailableAgentSkills()).filter((skill) => !allowed || allowed.has(skill.name.toLowerCase()));
  const availableByName = new Map(availableSkills.map((skill) => [skill.name.toLowerCase(), skill]));
  const curriculumSkillNames = curriculumNodes.flatMap((node) => node.skillIds);
  const curriculumRecipeNames = curriculumNodes.flatMap((node) => node.recipeIds);
  const skillSearchQuery = [routingPrompt, ...curriculumSkillNames, ...curriculumRecipeNames].filter(Boolean).join("\n");
  const searchedSkills = filterBusinessReadyAgentSkills(await searchAvailableAgentSkills({ query: skillSearchQuery, limit: 12 }));
  const candidates = new Map<string, AgentSkillSummary>();
  for (const name of curriculumSkillNames) {
    const skill = availableByName.get(name.toLowerCase());
    if (skill) candidates.set(skill.name.toLowerCase(), skill);
  }
  for (const skill of searchedSkills) {
    if (!allowed || allowed.has(skill.name.toLowerCase())) candidates.set(skill.name.toLowerCase(), skill);
  }
  for (const skill of availableSkills) {
    if (candidates.size >= 12) break;
    if (skill.category && curriculumNodes.some((node) => node.skillIds.includes(skill.name))) candidates.set(skill.name.toLowerCase(), skill);
  }
  const skillBriefs = await Promise.all(
    [...candidates.values()].slice(0, 12).map(async (skill) => {
      const relatedNodes = curriculumNodes.filter((node) => node.skillIds.includes(skill.name));
      const visualProfiles = [
        ...(policy.visualProfile ? [policy.visualProfile] : []),
        ...relatedNodes.flatMap((node) => node.visualProfiles)
      ];
      let constraintsBrief: string[] = [];
      try {
        const activated = await activateAgentSkill(skill.name);
        constraintsBrief = extractAgentSkillConstraintBrief(activated.markdown);
      } catch {
        constraintsBrief = [];
      }
      return createAgentSkillBrief(skill, {
        curriculumIds: relatedNodes.map((node) => node.id),
        visualProfiles,
        constraintsBrief
      });
    })
  );
  return {
    catalogs,
    curriculumNodes,
    skillBriefs,
    allowedSkillNames: policy.allowedSkillNames,
    ...(policy.visualProfile ? { visualProfile: policy.visualProfile } : {})
  };
}

export function skillRuntimePolicyFromPrompt(prompt: string): AgentSkillRuntimePolicy {
  const disabled = /Agent Skills are disabled for this run|本轮已关闭 Agent Skills/.test(prompt);
  if (disabled) return { enabled: false, autoActivate: false, allowedSkillNames: [], visualProfile: parseLastPolicyValue(prompt, [/Visual profile:\s*([^.\n]+)/g, /可视化表达策略：([^。\n]+)/g]) };
  const autoActivateValue = parseLastPolicyValue(prompt, [/Automatic loading:\s*([^.\n]+)/g, /自动加载：([^。\n]+)/g]);
  const allowedSkillsValue = parseLastPolicyValue(prompt, [/Allowed skills:\s*([^.\n]+)/g, /允许使用的技能：([^。\n]+)/g]);
  return {
    enabled: true,
    autoActivate: !/disabled|关闭/i.test(autoActivateValue ?? "enabled"),
    allowedSkillNames: allowedSkillsValue ? parseAllowedSkillNames(allowedSkillsValue) : null,
    visualProfile: parseLastPolicyValue(prompt, [/Visual profile:\s*([^.\n]+)/g, /可视化表达策略：([^。\n]+)/g])
  };
}

function parseLastPolicyValue(prompt: string, patterns: RegExp[]) {
  let value: string | undefined;
  for (const pattern of patterns) {
    for (const match of prompt.matchAll(pattern)) {
      const candidate = match[1]?.trim();
      if (candidate) value = candidate;
    }
  }
  return value;
}

function parseAllowedSkillNames(value: string) {
  return value
    .split(/[,，、]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function skillSelectionToolsDisabled(disabledToolNames: readonly FunctionCallToolName[] | undefined) {
  const disabled = new Set(disabledToolNames ?? []);
  return ["listSkills", "searchSkills", "loadSkill"].some((toolName) => disabled.has(toolName as FunctionCallToolName));
}

export function skillSelectorSystemPrompt(locale?: AgentRunLedgerRecord["locale"]) {
  if (isEnglishLocale(locale)) {
    return [
      "You are GeoChat's temporary SkillSelector.",
      "Your job is to choose from a compact Candidate Skill Context before the main agent solves the problem.",
      "The backend has already run the deterministic list/search/load pipeline: curriculum search, skill inventory filtering, skill search, and short SKILL.md constraint extraction. Do not ask for tools and do not invent skills outside the provided skillBriefs.",
      "Choose skills as a complementary set: prefer one broad parent skill plus one or two precise second-layer skills/recipes when that improves drawing, explanation, or verification. If the broad parent adds no useful rule beyond the precise skill, select only the precise skill.",
      "The main agent must not receive the full catalog. The backend will load selected SKILL.md files and build the compressed guidance after your choice.",
      "Do not solve the problem. Do not plan concrete GeoGebra command batches. Do not include chain-of-thought.",
      "Return only compact JSON with this shape:",
      '{"status":"selected|not_needed","curriculumNodes":[{"id":"curriculum-node-id","reason":"why it matches"}],"selectedSkills":[{"name":"skill-name","reason":"why it helps and how it complements other selected skills"}],"selectorReason":"one sentence"}',
      "Select at most three curriculum nodes and at most three skills. If no skill is useful after listing/searching, use status not_needed and explain why no skill is needed."
    ].join("\n");
  }
  return [
    "你是 GeoChat 的临时 SkillSelector。",
    "你的任务是在主 agent 解题前，从压缩 Candidate Skill Context 中选择技能。",
    "后端已经用代码完成确定性的 list/search/load 流程：教材章节检索、技能库存过滤、技能检索，以及从 SKILL.md 提取短约束。不要请求工具，也不要选择 skillBriefs 之外的技能。",
    "技能选择要按互补关系装配：优先选择一个宽领域父技能加一到两个精确二级技能/recipe；如果父技能没有额外规则，只选择精确技能。",
    "主 agent 不应收到完整技能目录；后端会在你选择后读取对应 SKILL.md 并生成压缩指导。",
    "不要解题，不要规划具体 GeoGebra 命令批次，不要输出思维链。",
    "只返回紧凑 JSON，形如：",
    '{"status":"selected|not_needed","curriculumNodes":[{"id":"curriculum-node-id","reason":"为什么匹配"}],"selectedSkills":[{"name":"skill-name","reason":"为什么有帮助以及如何与其他技能互补"}],"selectorReason":"一句话理由"}',
    "最多选择三个教材节点和三个技能；列出/检索后仍无明显帮助时返回 status=not_needed，并说明为什么不需要技能。"
  ].join("\n");
}

function skillSelectorUserPrompt(input: {
  prompt: string;
  locale?: AgentRunLedgerRecord["locale"];
  attachmentCount: number;
  policy: AgentSkillRuntimePolicy;
  candidateContext: SkillSelectorCandidateContext;
}) {
  const allowedSkills = input.policy.allowedSkillNames?.length ? input.policy.allowedSkillNames.join(", ") : "all available skills";
  const contextJson = JSON.stringify(input.candidateContext, null, 2);
  if (isEnglishLocale(input.locale)) {
    return [
      `Locale: ${input.locale ?? "unknown"}`,
      `Attachment count: ${input.attachmentCount}`,
      `Allowed skills: ${allowedSkills}`,
      `Visual profile: ${input.policy.visualProfile ?? "unspecified"}`,
      "",
      "Candidate Skill Context:",
      contextJson,
      "",
      "Problem:",
      agentRoutingPrompt(input.prompt)
    ].join("\n");
  }
  return [
    `语言：${input.locale ?? "unknown"}`,
    `附件数量：${input.attachmentCount}`,
    `允许技能：${allowedSkills}`,
    `可视化表达策略：${input.policy.visualProfile ?? "未指定"}`,
    "",
    "Candidate Skill Context：",
    contextJson,
    "",
    "题目：",
    agentRoutingPrompt(input.prompt)
  ].join("\n");
}

function parseSkillSelectionJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch {
        // Fall through to object extraction.
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Skill selector did not return JSON.");
  }
}

function normalizeSkillSelectionPacket(value: unknown, policy: AgentSkillRuntimePolicy): AgentSkillSelectionPacket {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const curriculumNodes = Array.isArray(record.curriculumNodes)
    ? record.curriculumNodes
        .map(normalizeSelectedCurriculumNode)
        .filter((item): item is AgentCurriculumSelectionItem => Boolean(item))
        .slice(0, 3)
    : [];
  const selectedSkills = Array.isArray(record.selectedSkills)
    ? record.selectedSkills
        .map(normalizeSelectedSkill)
        .filter((skill): skill is AgentSkillSelectionItem => Boolean(skill))
        .slice(0, 3)
    : [];
  const status = selectedSkills.length || curriculumNodes.length ? "selected" : "not_needed";
  return {
    status,
    visualProfile: policy.visualProfile,
    curriculumNodes,
    selectedSkills,
    enabledAdvancedTools: [],
    selectorReason: stringValue(record.selectorReason) ?? (status === "selected" ? "A matching skill was selected." : "No skill was clearly needed."),
    injectedContext: stringValue(record.injectedContext) ?? "",
  };
}

function deterministicSkillSelectionPacket(
  context: SkillSelectorCandidateContext,
  policy: AgentSkillRuntimePolicy,
  error?: unknown
): AgentSkillSelectionPacket {
  const selectedSkills = context.skillBriefs.slice(0, 3).map((skill): AgentSkillSelectionItem => ({
    name: skill.name,
    ...(skill.category ? { category: skill.category } : {}),
    ...(skill.parent ? { parent: skill.parent } : {}),
    ...(skill.level ? { level: skill.level } : {}),
    recipes: skill.recipeIds,
    reason: "Selected by deterministic fallback from the prebuilt skill candidate context."
  }));
  const status = selectedSkills.length || context.curriculumNodes.length ? "selected" : "failed";
  return {
    status,
    visualProfile: policy.visualProfile,
    curriculumNodes: context.curriculumNodes.slice(0, 3),
    selectedSkills,
    enabledAdvancedTools: [],
    selectorReason: status === "selected"
      ? "Temporary skill selector failed; deterministic candidate context was used."
      : "Temporary skill selector failed and no candidate context was available.",
    injectedContext: "",
    error: error instanceof Error ? error.message : error ? String(error) : undefined
  };
}

async function enrichSkillSelectionPacket(
  packet: AgentSkillSelectionPacket,
  policy: AgentSkillRuntimePolicy,
  candidateContext?: SkillSelectorCandidateContext,
  locale?: AgentRunLedgerRecord["locale"]
): Promise<AgentSkillSelectionPacket> {
  if (!packet.selectedSkills.length && !packet.curriculumNodes.length) return packet;
  const allowed = policy.allowedSkillNames?.length ? new Set(policy.allowedSkillNames.map((name) => name.toLowerCase())) : null;
  const summaries = new Map((await listAvailableAgentSkills()).map((skill) => [skill.name.toLowerCase(), skill]));
  const curriculumNodes = packet.curriculumNodes
    .map((selected): AgentCurriculumSelectionItem | undefined => {
      try {
        const item = loadCurriculumNode(selected.id);
        return {
          id: item.id,
          source: item.source,
          stage: item.stage,
          edition: item.edition,
          book: item.book,
          chapter: item.chapter,
          ...(item.section ? { section: item.section } : {}),
          skillIds: item.skillIds,
          recipeIds: item.recipeIds,
          visualProfiles: item.visualProfiles,
          reason: selected.reason
        };
      } catch {
        return undefined;
      }
    })
    .filter((item): item is AgentCurriculumSelectionItem => Boolean(item));
  const selectedSkillInputs = packet.selectedSkills.length
    ? packet.selectedSkills
    : candidateSkillSelectionsFromCurriculum(curriculumNodes, summaries, allowed, candidateContext);
  const selectedSkills = selectedSkillInputs
    .map((selected): AgentSkillSelectionItem | undefined => {
      const summary = summaries.get(selected.name.toLowerCase());
      if (!summary || (allowed && !allowed.has(summary.name.toLowerCase()))) return undefined;
      const enriched: AgentSkillSelectionItem = {
        name: summary.name,
        recipes: summary.recipes,
        reason: selected.reason
      };
      if (summary.category) enriched.category = summary.category;
      if (summary.parent) enriched.parent = summary.parent;
      if (summary.level) enriched.level = summary.level;
      return enriched;
    })
    .filter((skill): skill is AgentSkillSelectionItem => Boolean(skill));
  const activatedSkills = await Promise.all(
    selectedSkills.map(async (skill) => {
      try {
        return await activateAgentSkill(skill.name);
      } catch {
        return undefined;
      }
    })
  );
  const enabledAdvancedTools = enabledAdvancedToolsFromActivatedSkills(
    activatedSkills.filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
  );
  if (!selectedSkills.length) {
    if (curriculumNodes.length) {
      return {
        ...packet,
        status: "selected",
        curriculumNodes,
        selectedSkills: [],
        enabledAdvancedTools: [],
        injectedContext: buildSkillSelectionInjectedContext({
          locale,
          curriculumNodes,
          selectedSkills: [],
          activatedSkills: [],
          visualProfile: policy.visualProfile,
          selectorContext: packet.injectedContext
        })
      };
    }
    return {
      ...packet,
      status: "not_needed",
      curriculumNodes,
      selectedSkills: [],
      enabledAdvancedTools: [],
      selectorReason: "The selector did not return a valid allowed skill.",
      injectedContext: ""
    };
  }
  return {
    ...packet,
    status: "selected",
    curriculumNodes,
    selectedSkills,
    enabledAdvancedTools,
    injectedContext: buildSkillSelectionInjectedContext({
      locale,
      curriculumNodes,
      selectedSkills,
      activatedSkills: activatedSkills.filter((skill): skill is NonNullable<typeof skill> => Boolean(skill)),
      visualProfile: policy.visualProfile,
      selectorContext: packet.injectedContext
    })
  };
}

function candidateSkillSelectionsFromCurriculum(
  curriculumNodes: readonly AgentCurriculumSelectionItem[],
  summaries: ReadonlyMap<string, AgentSkillSummary>,
  allowed: Set<string> | null,
  candidateContext?: SkillSelectorCandidateContext
) {
  const candidateNames = [
    ...curriculumNodes.flatMap((node) => node.skillIds),
    ...(candidateContext?.skillBriefs.map((skill) => skill.name) ?? [])
  ];
  const selections: AgentSkillSelectionItem[] = [];
  for (const name of candidateNames) {
    const summary = summaries.get(name.toLowerCase());
    if (!summary || (allowed && !allowed.has(summary.name.toLowerCase()))) continue;
    if (selections.some((selection) => selection.name.toLowerCase() === summary.name.toLowerCase())) continue;
    selections.push({
      name: summary.name,
      ...(summary.category ? { category: summary.category } : {}),
      ...(summary.parent ? { parent: summary.parent } : {}),
      ...(summary.level ? { level: summary.level } : {}),
      recipes: summary.recipes,
      reason: "Selected from matched curriculum node skillIds."
    });
    if (selections.length >= 3) break;
  }
  return selections;
}

function enabledAdvancedToolsFromActivatedSkills(skills: readonly { advancedTools: readonly string[] }[]) {
  const registered = new Set<string>(getAdvancedDrawingToolDefinitions().map((definition) => definition.name));
  return [...new Set(skills.flatMap((skill) => skill.advancedTools))]
    .filter((name) => registered.has(name))
    .sort();
}

function buildSkillSelectionInjectedContext(input: {
  locale?: AgentRunLedgerRecord["locale"];
  curriculumNodes: readonly AgentCurriculumSelectionItem[];
  selectedSkills: readonly AgentSkillSelectionItem[];
  activatedSkills: readonly { name: string; markdown: string }[];
  visualProfile?: string;
  selectorContext?: string;
}) {
  const visualProfiles = Array.from(new Set([
    ...(input.visualProfile ? [input.visualProfile] : []),
    ...input.curriculumNodes.flatMap((node) => node.visualProfiles)
  ]));
  const constraints = input.activatedSkills.flatMap((skill) =>
    extractAgentSkillConstraintBrief(skill.markdown, 4).map((line) => `${skill.name}: ${line}`)
  ).slice(0, 10);
  const recipeLines = input.selectedSkills
    .filter((skill) => skill.recipes.length)
    .map((skill) => `${skill.name}: ${skill.recipes.slice(0, 4).join(", ")}`);
  if (isEnglishLocale(input.locale)) {
    return [
      input.curriculumNodes.length
        ? `Curriculum localization: ${input.curriculumNodes.map((node) => `${node.edition} ${node.book} / ${node.chapter}${node.section ? ` / ${node.section}` : ""}`).join("; ")}.`
        : "",
      recipeLines.length ? `Recipe hints: ${recipeLines.join("; ")}.` : "",
      visualProfiles.length ? `Visual profile hints: ${visualProfiles.join(", ")}.` : "",
      constraints.length ? `Skill constraints: ${constraints.join(" | ")}` : "",
      input.selectorContext ? `Selector note: ${input.selectorContext}` : ""
    ].filter(Boolean).join("\n");
  }
  return [
    input.curriculumNodes.length
      ? `教材定位：${input.curriculumNodes.map((node) => `${node.edition}${node.book} / ${node.chapter}${node.section ? ` / ${node.section}` : ""}`).join("；")}。`
      : "",
    recipeLines.length ? `题型策略：${recipeLines.join("；")}。` : "",
    visualProfiles.length ? `可视化策略：${visualProfiles.join("、")}。` : "",
    constraints.length ? `技能约束：${constraints.join(" | ")}` : "",
    input.selectorContext ? `选择器补充：${input.selectorContext}` : ""
  ].filter(Boolean).join("\n");
}

function normalizeSelectedCurriculumNode(value: unknown): AgentCurriculumSelectionItem | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = stringValue(record.id);
  if (!id) return undefined;
  return {
    id,
    source: "pep",
    stage: "senior",
    edition: "人教A版",
    book: "",
    chapter: "",
    skillIds: [],
    recipeIds: [],
    visualProfiles: [],
    reason: stringValue(record.reason) ?? "Matched by the temporary skill selector."
  };
}

function normalizeSelectedSkill(value: unknown): AgentSkillSelectionItem | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const name = stringValue(record.name);
  if (!name) return undefined;
  return {
    name,
    ...(stringValue(record.category) ? { category: stringValue(record.category) } : {}),
    ...(stringValue(record.parent) ? { parent: stringValue(record.parent) } : {}),
    ...(typeof record.level === "number" && Number.isFinite(record.level) ? { level: Math.floor(record.level) } : {}),
    recipes: Array.isArray(record.recipes) ? record.recipes.filter((recipe): recipe is string => typeof recipe === "string") : [],
    reason: stringValue(record.reason) ?? "Selected by the temporary skill selector."
  };
}

export function formatSkillSelectionPacketPrompt(packet: AgentSkillSelectionPacket, locale?: AgentRunLedgerRecord["locale"]) {
  if (isEnglishLocale(locale)) {
    return [
      "[Preselected Agent Skill packet]",
      `Status: ${packet.status}.`,
      `Visual profile: ${packet.visualProfile ?? "unspecified"}.`,
      packet.selectedSkills.length
        ? [
            "Selected skills:",
            ...packet.selectedSkills.map((skill) =>
              `- ${skill.name}${skill.recipes.length ? ` (recipes: ${skill.recipes.join(", ")})` : ""}: ${skill.reason}`
            )
          ].join("\n")
        : "Selected skills: none.",
      packet.curriculumNodes.length
        ? [
            "Curriculum localization:",
            ...packet.curriculumNodes.map((item) =>
              `- ${item.edition} ${item.book} / ${item.chapter}${item.section ? ` / ${item.section}` : ""}: ${item.reason}`
            )
          ].join("\n")
        : "Curriculum localization: none.",
      packet.enabledAdvancedTools.length
        ? [
            "Unlocked advanced drawing commands:",
            ...packet.enabledAdvancedTools.map((name) => {
              const definition = getAdvancedDrawingToolDefinitions([name])[0];
              return formatAdvancedDrawingDefinitionForPacket(name, definition, "en-US");
            })
          ].join("\n")
        : "Unlocked advanced drawing commands: none.",
      packet.injectedContext ? `Compressed guidance: ${packet.injectedContext}` : "",
      `Selector reason: ${packet.selectorReason}`,
      packet.error ? `Selector error: ${packet.error}` : "",
      "Use this packet as guidance only. It is not a mathematical fact source. Do not call listSkills, searchSkills, loadSkill, or activateSkill again unless this packet is missing, failed, or clearly insufficient."
    ].filter(Boolean).join("\n");
  }
  return [
    "【预选 Agent Skill Packet】",
    `状态：${packet.status}。`,
    `可视化表达策略：${packet.visualProfile ?? "未指定"}。`,
    packet.selectedSkills.length
      ? [
          "已选技能：",
          ...packet.selectedSkills.map((skill) =>
            `- ${skill.name}${skill.recipes.length ? `（recipes：${skill.recipes.join("、")}）` : ""}：${skill.reason}`
          )
        ].join("\n")
      : "已选技能：无。",
    packet.curriculumNodes.length
      ? [
          "教材定位：",
          ...packet.curriculumNodes.map((item) =>
            `- ${item.edition}${item.book} / ${item.chapter}${item.section ? ` / ${item.section}` : ""}：${item.reason}`
          )
        ].join("\n")
      : "教材定位：无。",
    packet.enabledAdvancedTools.length
        ? [
            "已解锁高级绘图命令：",
            ...packet.enabledAdvancedTools.map((name) => {
              const definition = getAdvancedDrawingToolDefinitions([name])[0];
              return formatAdvancedDrawingDefinitionForPacket(name, definition, "zh-CN");
            })
          ].join("\n")
        : "已解锁高级绘图命令：无。",
    packet.injectedContext ? `压缩指导：${packet.injectedContext}` : "",
    `选择理由：${packet.selectorReason}`,
    packet.error ? `选择器错误：${packet.error}` : "",
    "该 packet 只作为策略提示，不是数学事实来源。除非 packet 缺失、失败或明显不足，否则主 agent 不要再次调用 listSkills、searchSkills、loadSkill 或 activateSkill。"
  ].filter(Boolean).join("\n");
}

function formatAdvancedDrawingDefinitionForPacket(
  name: string,
  definition: ReturnType<typeof getAdvancedDrawingToolDefinitions>[number] | undefined,
  locale: "zh-CN" | "en-US"
) {
  if (!definition) return locale === "en-US" ? `- ${name}: High-level drawing command.` : `- ${name}：高级绘图命令。`;
  const parameters = definition.parameters
    .map((parameter) => `${parameter.name}:${parameter.kind}${"required" in parameter && parameter.required ? "*" : ""}`)
    .join(", ");
  if (locale === "en-US") {
    return [
      `- ${name}: ${definition.description}`,
      `  Parameters: ${parameters || "none"}.`,
      `  Assumptions: ${definition.assumptions.join("; ")}`,
      `  Invariants: ${definition.invariants.join("; ")}`
    ].join("\n");
  }
  return [
    `- ${name}：${definition.description}`,
    `  参数：${parameters || "无"}。`,
    `  前提：${definition.assumptions.join("；")}`,
    `  不变量：${definition.invariants.join("；")}`
  ].join("\n");
}

function isEnglishLocale(locale: AgentRunLedgerRecord["locale"] | undefined) {
  return locale === "en-US";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
