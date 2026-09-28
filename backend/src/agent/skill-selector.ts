import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import {
  agentThinkingProviderOptions,
  agentRoutingPrompt,
  getAdvancedDrawingToolDefinitions,
  type AgentRunLedgerRecord,
  type AgentRunUsage,
  type FunctionCallToolName
} from "@geochat-ai/app";
import {
  activateAgentSkill,
  createAgentSkillBrief,
  extractAgentSkillConstraintBrief,
  filterBusinessReadyAgentSkills,
  listAvailableAgentSkills,
  searchAvailableAgentSkills,
  type ActivatedAgentSkill,
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
const skillSelectorOutputSchema = z.object({
  status: z.enum(["selected", "not_needed"]),
  curriculumNodes: z.array(z.object({
    id: z.string().min(1),
    reason: z.string().min(1),
  })).max(2),
  selectedSkills: z.array(z.object({
    name: z.string().min(1),
    reason: z.string().min(1),
  })).max(2),
  selectorReason: z.string().min(1),
});

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
  /** Skills whose SKILL.md content was actually loaded for prompt injection. */
  loadedSkills?: AgentLoadedSkillItem[];
  /** Selected skills that could not be loaded and therefore were not injected. */
  failedSkillLoads?: AgentFailedSkillLoadItem[];
  enabledAdvancedTools: string[];
  selectorReason: string;
  injectedContext: string;
  error?: string;
  modelCallCount?: number;
  usage?: AgentRunUsage | null;
  cacheHit?: boolean;
};

export type AgentLoadedSkillItem = Pick<ActivatedAgentSkill, "name" | "source" | "maturity">;

export type AgentFailedSkillLoadItem = {
  name: string;
  error: string;
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
  const cacheKey = `${input.run.runId}:${input.run.prompt}`;
  const cached = skillSelectionCache.get(cacheKey);
  if (cached) {
    const packet = await cached;
    return { ...packet, modelCallCount: 0, usage: null, cacheHit: true };
  }

  const selection = !policy.enabled || !policy.autoActivate || skillSelectionToolsDisabled(input.disabledToolNames)
    ? Promise.resolve({
      status: "disabled",
      visualProfile: policy.visualProfile,
      curriculumNodes: [],
      selectedSkills: [],
      loadedSkills: [],
      failedSkillLoads: [],
      enabledAdvancedTools: [],
      selectorReason: !policy.enabled
        ? "Agent Skills are disabled for this run."
        : !policy.autoActivate
          ? "Automatic skill selection is disabled for this run."
          : "Skill selection tools are disabled for this run.",
      injectedContext: ""
    } satisfies AgentSkillSelectionPacket)
    : runSkillSelector({
        ...input,
        timeout: Math.min(input.timeout ?? 120_000, SKILL_SELECTOR_TIMEOUT_MS)
      }, policy);
  const loggedSelection = selection.then((packet) => {
    const completed = { ...packet, cacheHit: false };
    console.info("[INFO] Agent skill selection completed", JSON.stringify({
      runId: input.run.runId,
      conversationId: input.run.conversationId,
      status: completed.status,
      selectedSkills: completed.selectedSkills.map((skill) => skill.name),
      loadedSkills: completed.loadedSkills?.map((skill) => skill.name) ?? [],
      failedSkillLoads: completed.failedSkillLoads ?? [],
      curriculumNodes: completed.curriculumNodes.map((node) => node.id),
      enabledAdvancedTools: completed.enabledAdvancedTools,
    }));
    return completed;
  });
  skillSelectionCache.set(cacheKey, loggedSelection);
  return loggedSelection;
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
        loadedSkills: [],
        failedSkillLoads: [],
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
      // Skill selection has no side effects, so transient provider/network
      // failures are safe to retry using the AI SDK's native backoff.
      maxRetries: 3,
      temperature: input.temperature,
      timeout: input.timeout,
      providerOptions: agentThinkingProviderOptions({
        provider: input.run.modelProvider,
        enabled: false,
        effort: "standard",
      }),
      output: Output.object({
        name: "geochat_skill_selection",
        description: "A compact selection of curriculum nodes and GeoChat skills for the current run.",
        schema: skillSelectorOutputSchema,
      }),
    });
    const packet = normalizeSkillSelectionPacket(result.output, policy);
    return {
      ...await enrichSkillSelectionPacket(packet, policy, candidateContext, input.run.locale),
      modelCallCount: 1,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      },
    };
  } catch (error) {
    console.error("[ERROR] Caught exception at backend/src/agent/skill-selector.ts:155", error);
    if (candidateContext) {
      return {
        ...await enrichSkillSelectionPacket(
        failedSkillSelectionPacket(candidateContext, policy, error),
        policy,
        candidateContext,
        input.run.locale
        ),
        modelCallCount: 1,
      };
    }
    return {
      status: "failed",
      visualProfile: policy.visualProfile,
      curriculumNodes: [],
      selectedSkills: [],
      loadedSkills: [],
      failedSkillLoads: [],
      enabledAdvancedTools: [],
      selectorReason: "Temporary skill selector failed; continue without a preloaded skill packet.",
      injectedContext: "",
      error: error instanceof Error ? error.message : String(error),
      modelCallCount: candidateContext ? 1 : 0,
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
  const curriculumNodes = curriculumMatches.slice(0, 2).map((match): AgentCurriculumSelectionItem => ({
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
      } catch (caughtError) {
        console.error("[ERROR] Caught exception at backend/src/agent/skill-selector.ts:227", caughtError);
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
      "Default to one precise domain skill. Add one secondary skill only when it contributes a distinct orthogonal capability such as animation or verification. Never select a broad parent merely to accompany a precise child skill.",
      "The main agent must not receive the full catalog. The backend will load selected SKILL.md files and build the compressed guidance after your choice.",
      "Do not solve the problem. Do not plan concrete GeoGebra command batches. Do not include chain-of-thought.",
      "Fill the requested structured output fields with a compact selection.",
      "Select at most two curriculum nodes and at most two skills. If the base GeoGebra workflow is sufficient, use status not_needed; skills must supplement rather than replace the base drawing workflow."
    ].join("\n");
  }
  return [
    "你是 GeoChat 的临时 SkillSelector。",
    "你的任务是在主 agent 解题前，从压缩 Candidate Skill Context 中选择技能。",
    "后端已经用代码完成确定性的 list/search/load 流程：教材章节检索、技能库存过滤、技能检索，以及从 SKILL.md 提取短约束。不要请求工具，也不要选择 skillBriefs 之外的技能。",
    "默认只选择一个最精确的领域技能；仅当第二个技能提供动画、验证等独立正交能力时才追加。不要为了陪衬精确子技能而选择宽泛父技能。",
    "主 agent 不应收到完整技能目录；后端会在你选择后读取对应 SKILL.md 并生成压缩指导。",
    "不要解题，不要规划具体 GeoGebra 命令批次，不要输出思维链。",
    "按请求的结构化输出字段返回精简的选择结果。",
    "最多选择两个教材节点和两个技能；基础 GeoGebra 工作流已足够时返回 status=not_needed。技能只能补充领域约束，不能替代基础作图流程。"
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

function normalizeSkillSelectionPacket(value: unknown, policy: AgentSkillRuntimePolicy): AgentSkillSelectionPacket {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const curriculumNodes = Array.isArray(record.curriculumNodes)
    ? record.curriculumNodes
        .map(normalizeSelectedCurriculumNode)
        .filter((item): item is AgentCurriculumSelectionItem => Boolean(item))
        .slice(0, 2)
    : [];
  const selectedSkills = Array.isArray(record.selectedSkills)
    ? record.selectedSkills
        .map(normalizeSelectedSkill)
        .filter((skill): skill is AgentSkillSelectionItem => Boolean(skill))
        .slice(0, 2)
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

function failedSkillSelectionPacket(
  _context: SkillSelectorCandidateContext,
  policy: AgentSkillRuntimePolicy,
  error?: unknown
): AgentSkillSelectionPacket {
  return {
    status: "failed",
    visualProfile: policy.visualProfile,
    curriculumNodes: [],
    selectedSkills: [],
    loadedSkills: [],
    failedSkillLoads: [],
    enabledAdvancedTools: [],
    selectorReason: "Temporary skill selector failed; continue with the base GeoGebra workflow without injecting candidate skills.",
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
      } catch (caughtError) {
        console.error("[ERROR] Caught exception at backend/src/agent/skill-selector.ts:447", caughtError);
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
        const activated = await activateAgentSkill(skill.name);
        return activated
          ? { ok: true as const, skill: activated }
          : { ok: false as const, name: skill.name, error: "Skill definition was not found." };
      } catch (caughtError) {
        console.error("[ERROR] Caught exception at backend/src/agent/skill-selector.ts:474", caughtError);
        return {
          ok: false as const,
          name: skill.name,
          error: caughtError instanceof Error ? caughtError.message : String(caughtError)
        };
      }
    })
  );
  const loadedSkillDefinitions = activatedSkills.flatMap((result) => result.ok ? [result.skill] : []);
  const loadedSkills = loadedSkillDefinitions.map(({ name, source, maturity }) => ({ name, source, maturity }));
  const failedSkillLoads = activatedSkills.flatMap((result) => !result.ok
    ? [{ name: result.name, error: result.error }]
    : []);
  const enabledAdvancedTools = enabledAdvancedToolsFromActivatedSkills(
    loadedSkillDefinitions
  );
  if (!selectedSkills.length) {
    if (curriculumNodes.length) {
      return {
        ...packet,
        status: "selected",
        curriculumNodes,
        selectedSkills: [],
        loadedSkills: [],
        failedSkillLoads: [],
        enabledAdvancedTools: [],
        injectedContext: buildSkillSelectionInjectedContext({
          locale,
          activatedSkills: []
        })
      };
    }
    return {
      ...packet,
      status: "not_needed",
      curriculumNodes,
      selectedSkills: [],
      loadedSkills: [],
      failedSkillLoads: [],
      enabledAdvancedTools: [],
      selectorReason: "The selector did not return a valid allowed skill.",
      injectedContext: ""
    };
  }
  const status = loadedSkills.length || curriculumNodes.length ? "selected" : failedSkillLoads.length ? "failed" : "not_needed";
  return {
    ...packet,
    status,
    curriculumNodes,
    selectedSkills,
    loadedSkills,
    failedSkillLoads,
    enabledAdvancedTools,
    injectedContext: buildSkillSelectionInjectedContext({
      locale,
      activatedSkills: loadedSkillDefinitions
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
    if (selections.length >= 2) break;
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
  activatedSkills: readonly { name: string; markdown: string }[];
}) {
  const constraints = input.activatedSkills.flatMap((skill) =>
    extractAgentSkillConstraintBrief(skill.markdown, 2).map((line) => `${skill.name}: ${line}`)
  ).slice(0, 4);
  if (isEnglishLocale(input.locale)) {
    return [
      constraints.length ? `Skill constraints: ${constraints.join(" | ")}` : "",
      "These constraints supplement the base GeoGebra workflow; when they conflict, preserve a verifiable dependency-based construction."
    ].filter(Boolean).join("\n");
  }
  return [
    constraints.length ? `技能约束：${constraints.join(" | ")}` : "",
    "这些约束只补充基础 GeoGebra 工作流；发生冲突时，优先保持可验证、基于依赖关系的构造。"
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
  if (packet.status !== "selected" || (!packet.selectedSkills.length && !packet.enabledAdvancedTools.length && !packet.injectedContext)) {
    if (packet.status === "failed") {
      return isEnglishLocale(locale)
        ? "Skill preselection was unavailable. Continue with the base GeoGebra workflow and do not inject guessed skills."
        : "技能预选不可用。本轮直接使用基础 GeoGebra 工作流，不注入猜测的技能。";
    }
    return "";
  }
  if (isEnglishLocale(locale)) {
    return [
      "[Agent Skill supplement]",
      packet.selectedSkills.length
        ? [
            "Selected skills:",
            ...packet.selectedSkills.map((skill) =>
              `- ${skill.name}: ${skill.reason}`
            )
          ].join("\n")
        : "",
      packet.enabledAdvancedTools.length
        ? `Available advanced tools: ${packet.enabledAdvancedTools.join(", ")}.`
        : "",
      packet.injectedContext,
      "Use this supplement only for domain constraints. The base GeoGebra construction and verification workflow remains authoritative."
    ].filter(Boolean).join("\n");
  }
  return [
    "【Agent Skill 补充】",
    packet.selectedSkills.length
      ? [
          "已选技能：",
          ...packet.selectedSkills.map((skill) =>
            `- ${skill.name}：${skill.reason}`
          )
        ].join("\n")
      : "",
    packet.enabledAdvancedTools.length
      ? `可用高级工具：${packet.enabledAdvancedTools.join("、")}。`
      : "",
    packet.injectedContext,
    "技能只补充领域约束，基础 GeoGebra 构造与验证流程仍具有优先级。"
  ].filter(Boolean).join("\n");
}

function isEnglishLocale(locale: AgentRunLedgerRecord["locale"] | undefined) {
  return locale === "en-US";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
