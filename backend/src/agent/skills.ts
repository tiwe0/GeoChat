import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, delimiter, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_FILE_NAME = "SKILL.md";
const MAX_SKILL_MARKDOWN_BYTES = 96_000;
const MAX_REMOTE_MANIFEST_BYTES = 256_000;
const MAX_SKILL_RESOURCE_COUNT = 40;
const REMOTE_SKILLS_CACHE_DIR_NAME = "geochat-pro/agent-skills";
const BUNDLED_SKILL_CACHE_RELATIVE_DIRS = ["vendor/agent-skills", "agent-skills", "skills"];
const AGENT_SKILL_MATURITY_VALUES = ["draft", "validated", "default"] as const;
const BUILTIN_SKILL_RECIPES: Record<string, string[]> = {
  "number-expression": ["domain-constraints-first", "number-line-interval-explain", "structure-preserving-simplification"],
  "factorization-formulas": ["common-factor-scan", "formula-pattern-match", "complete-square-rewrite"],
  "equations-inequalities": ["equivalent-transform-with-guards", "critical-point-sign-chart", "parameter-case-split"],
  "quadratic-equation": ["discriminant-root-count", "vieta-root-relation", "parabola-zero-check"],
  "inequality-interval": ["number-line-endpoint-check", "rational-sign-table", "parameter-critical-collision"],
  "function-graph": ["expression-table-graph-link", "parameter-slider-transform", "option-feature-check"],
  "quadratic-function": ["vertex-axis-zero-layout", "discriminant-intersection-count", "interval-extremum-visual-check"],
  "plane-geometry": ["base-diagram-then-auxiliary", "similarity-congruence-highlight", "option-by-option-geometric-check"],
  "triangle-circle-geometry": ["inscribed-angle-same-arc", "tangent-radius-perpendicular", "circumcircle-auxiliary-line"],
  "geometric-transformations": ["source-image-correspondence", "rotation-center-angle-mark", "symmetry-axis-pairing"],
  "geometric-construction": ["ruler-compass-step-replay", "bisector-locus-explain", "tangent-construction-verify"],
  "solid-geometry": ["3d-skeleton-first", "projection-auxiliary-triangle", "angle-distance-measurement-check"],
  "solid-section": ["section-plane-through-points", "intersection-edge-ordering", "section-polygon-highlight"],
  prism: ["coordinate-prism-skeleton", "section-face-intersection", "volume-base-height-mark"],
  sphere: ["center-radius-constraint", "section-circle-right-triangle", "equidistant-center-locus"],
  "pyramid-circumsphere": ["base-circumcenter-axis", "equal-distance-center-solve", "radius-right-triangle"],
  "polynomial-function": ["roots-extrema-monotonicity", "derivative-sign-interval", "parameter-critical-value-slider"],
  "exponential-logarithmic-function": ["domain-asymptote-first", "base-monotonicity-compare", "growth-decay-model-graph"],
  "exponential-log-transform": ["log-domain-guard", "asymptote-shift-mark", "graph-intersection-comparison"],
  "linear-programming": ["half-plane-feasible-region", "objective-level-line-slide", "optimal-vertex-check"],
  "linear-programming-feasible-region": ["boundary-line-orientation", "feasible-vertex-enumeration", "objective-translation-verify"],
  "trigonometric-function": ["unit-circle-to-graph", "period-amplitude-phase", "identity-visual-verification"],
  "trigonometric-unit-circle": ["quadrant-sign-check", "reference-angle-reduction", "special-angle-coordinate"],
  sequence: ["term-table-discrete-plot", "recurrence-step-unroll", "sum-area-or-stack-model"],
  vector: ["coordinate-vector-decompose", "dot-product-projection", "collinearity-perpendicular-check"],
  "analytic-geometry-conic": ["coordinate-object-extract", "chord-tangent-locus-visualize", "parameter-line-intersection-count"],
  "conic-focus-directrix": ["focus-directrix-locus", "eccentricity-parameter-check", "tangent-chord-relation"],
  "derivative-application": ["derivative-sign-monotonicity", "extremum-critical-point", "parameter-inequality-visual-check"],
  "derivative-tangent": ["tangent-point-slope", "fixed-point-tangent-family", "common-tangent-compare"],
  "probability-statistics": ["sample-space-structure", "frequency-distribution-chart", "expected-value-step-table"],
  "classical-probability": ["tree-or-grid-sample-space", "favorable-over-total-count", "complement-event-check"],
  "statistical-distribution": ["histogram-boxplot-summary", "mean-variance-compare", "normal-curve-interval-mark"],
  "visual-post-processing": ["verify-before-adjust", "compose-visible-frame", "preserve-axis-scale"],
  "camera-framing": ["3d-camera-after-skeleton", "show-three-faces", "avoid-occlusion-and-cropping"],
  "viewport-scale-composition": ["uniform-zoom-bounds", "center-important-objects", "preserve-one-to-one-axis-ratio"]
};

export type AgentSkillMaturity = (typeof AGENT_SKILL_MATURITY_VALUES)[number];

export type AgentSkillSummary = {
  name: string;
  description: string;
  path: string;
  source: "built-in" | "local" | "remote";
  maturity: AgentSkillMaturity;
  category?: string;
  parent?: string;
  level?: number;
  recipes: string[];
  tags: string[];
  tools: string[];
  advancedTools: string[];
};

export type ActivatedAgentSkill = AgentSkillSummary & {
  markdown: string;
  toolInstructions: string[];
  resources: Array<{
    path: string;
    kind: "file" | "directory";
  }>;
};

export type AgentSkillBrief = {
  name: string;
  title: string;
  oneLine: string;
  useWhen: string[];
  avoidWhen?: string[];
  keywords: string[];
  category?: string;
  parent?: string;
  level?: number;
  recipeIds: string[];
  visualProfiles: string[];
  curriculumIds: string[];
  advancedTools: string[];
  constraintsBrief: string[];
};

type SkillFrontmatter = {
  name?: string;
  description?: string;
  category?: string;
  parent?: string;
  level?: number;
  recipes?: string[];
  tags?: string[];
  tools?: string[];
  advancedTools?: string[];
  maturity?: AgentSkillMaturity;
};

type RemoteSkillManifestEntry = {
  name: string;
  description?: string;
  url: string;
  sha256?: string;
  category?: string;
  parent?: string;
  level?: number;
  recipes?: string[];
  tags?: string[];
  tools?: string[];
  advancedTools?: string[];
  maturity?: AgentSkillMaturity;
};

export function isBusinessReadyAgentSkill(skill: Pick<AgentSkillSummary, "maturity">) {
  return skill.maturity === "validated" || skill.maturity === "default";
}

export function shouldIncludeDraftAgentSkills(env: NodeJS.ProcessEnv = process.env) {
  return env.GEOCHAT_SKILLS_INCLUDE_DRAFT === "1" || env.GEOCHAT_SKILLS_INCLUDE_DRAFT === "true";
}

export function filterBusinessReadyAgentSkills<T extends AgentSkillSummary>(skills: readonly T[], env: NodeJS.ProcessEnv = process.env): T[] {
  if (shouldIncludeDraftAgentSkills(env)) return [...skills];
  return skills.filter(isBusinessReadyAgentSkill);
}

export async function listAvailableAgentSkills(env: NodeJS.ProcessEnv = process.env): Promise<AgentSkillSummary[]> {
  const candidates = await discoverSkillCandidates(await skillRootsFromConfig(env));
  const summaries = await Promise.all(candidates.map(readSkillSummary));
  return dedupeSkills(summaries.filter((summary): summary is AgentSkillSummary => Boolean(summary))).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

export type AgentSkillSearchOptions = {
  query: string;
  category?: string | null;
  tags?: readonly string[] | null;
  limit?: number | null;
};

export type AgentSkillSearchResult = AgentSkillSummary & {
  score: number;
  matchedFields: string[];
};

export async function searchAvailableAgentSkills(
  options: AgentSkillSearchOptions,
  env: NodeJS.ProcessEnv = process.env
): Promise<AgentSkillSearchResult[]> {
  const queryTerms = tokenizeSkillQuery(options.query);
  const category = options.category?.trim().toLowerCase() || "";
  const requestedTags = (options.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const limit = clampSkillLimit(options.limit, 8, 20);
  const skills = await listAvailableAgentSkills(env);

  return skills
    .map((skill) => scoreSkillMatch(skill, queryTerms, category, requestedTags))
    .filter((match): match is AgentSkillSearchResult => Boolean(match))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, limit);
}

export async function activateAgentSkill(name: string, env: NodeJS.ProcessEnv = process.env): Promise<ActivatedAgentSkill> {
  const normalizedName = normalizeSkillName(name);
  if (!normalizedName) throw new Error("Skill name is required.");
  const candidates = await discoverSkillCandidates(await skillRootsFromConfig(env));
  for (const candidate of candidates) {
    const summary = await readSkillSummary(candidate);
    if (!summary || normalizeSkillName(summary.name) !== normalizedName) continue;
    const markdown = await readSkillMarkdown(candidate);
    return {
      ...summary,
      toolInstructions: summary.tools.map((toolName) => `${toolName} is declared by this skill; use it only when the host tool registry exposes it.`),
      markdown,
      resources: await listSkillResources(candidate.directory)
    };
  }
  throw new Error(`Skill was not found: ${name}`);
}

export function formatSkillCatalogPrompt(skills: readonly AgentSkillSummary[], locale?: "zh-CN" | "en-US" | null) {
  if (!skills.length) return "";
  const skillLines = skills.map((skill) => {
    const details = [
      skill.source,
      `maturity=${skill.maturity}`,
      skill.category ? `category=${skill.category}` : "",
      skill.parent ? `parent=${skill.parent}` : "",
      skill.level ? `level=${skill.level}` : "",
      skill.recipes.length ? `recipes=${skill.recipes.join(", ")}` : "",
      skill.tags.length ? `tags=${skill.tags.join(", ")}` : "",
      skill.tools.length ? `tools=${skill.tools.join(", ")}` : "",
      skill.advancedTools.length ? `advancedTools=${skill.advancedTools.join(", ")}` : ""
    ].filter(Boolean);
    return `- ${skill.name}: ${skill.description}${details.length ? ` (${details.join("; ")})` : ""}`;
  });
  if (locale === "en-US") {
    return [
      "Available Agent Skills:",
      ...skillLines,
      "",
      "If the prompt contains an Agent Skill policy for this run, that policy is authoritative. Do not load disabled or disallowed skills.",
      "Maturity: draft skills and their advanced drawing commands are experimental; use only validated/default skills in normal runs unless the host explicitly includes draft skills.",
      "Layering: skills describe math capability, recipes describe task-type strategy, and visual profiles describe presentation. Do not mix presentation choices into mathematical verification.",
      "Skill workflow: call listSkills or searchSkills to evaluate available skills, then call loadSkill only when a returned skill is relevant. It is acceptable to decide that no skill is needed after listing/searching.",
      "Use activateSkill only as a compatibility alias when older tool names are required; prefer listSkills, searchSkills, then loadSkill.",
      "Remote and built-in skills may declare recommended tools, but only host-provided tools from the current tool schema are executable."
    ].join("\n");
  }
  return [
    "可用 Agent Skills：",
    ...skillLines,
    "",
    "如果本轮 prompt 中包含 Agent Skill 策略，该策略优先于这里的默认目录说明；不要加载已关闭或未允许的技能。",
    "成熟度约定：draft 技能及其高级绘图命令仍是实验内容；常规运行只使用 validated/default 技能，除非宿主显式允许 draft。",
    "分层约定：Skill 表示数学能力，Recipe 表示题型策略，Visual Profile 表示呈现策略；不要把呈现风格当成数学验证依据。",
    "技能工作流：先调用 listSkills 或 searchSkills 评估可用技能，再只在返回结果确实相关时调用 loadSkill。列出/检索后判断不需要技能也是允许的。",
    "activateSkill 仅作为旧工具名兼容；新调用优先使用 listSkills、searchSkills、loadSkill。",
    "远程和内置技能可以声明推荐工具，但只有当前工具 schema 中实际提供的宿主工具可以执行。"
  ].join("\n");
}

export function createAgentSkillBrief(
  skill: AgentSkillSummary,
  context: {
    curriculumIds?: readonly string[];
    visualProfiles?: readonly string[];
    constraintsBrief?: readonly string[];
  } = {}
): AgentSkillBrief {
  const title = skill.name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
  const keywords = Array.from(new Set([
    ...skill.tags,
    ...(skill.category ? [skill.category] : []),
    ...(skill.parent ? [skill.parent] : []),
    ...skill.recipes,
    ...skill.advancedTools
  ])).slice(0, 16);
  const useWhen = [
    skill.description,
    skill.category ? `category=${skill.category}` : "",
    skill.recipes.length ? `recipes=${skill.recipes.slice(0, 4).join(", ")}` : ""
  ].filter(Boolean);
  return {
    name: skill.name,
    title,
    oneLine: skill.description,
    useWhen,
    ...(skill.category ? { category: skill.category } : {}),
    ...(skill.parent ? { parent: skill.parent } : {}),
    ...(skill.level ? { level: skill.level } : {}),
    recipeIds: skill.recipes,
    visualProfiles: Array.from(new Set(context.visualProfiles ?? [])),
    curriculumIds: Array.from(new Set(context.curriculumIds ?? [])),
    advancedTools: skill.advancedTools,
    keywords,
    constraintsBrief: [...(context.constraintsBrief ?? [])].slice(0, 6)
  };
}

export function extractAgentSkillConstraintBrief(markdown: string, limit = 6) {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("---") && !/^[a-zA-Z]+:/.test(line))
    .map((line) => line.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "").trim())
    .filter((line) =>
      /必须|不要|优先|最低视觉标准|推荐语义配色|Angle|GeoGebra|禁忌|must|do not|prefer|priority|visual|palette/i.test(line)
    );
  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped.some((existing) => existing === line)) continue;
    deduped.push(line.length > 180 ? `${line.slice(0, 177)}...` : line);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

export function filterListedAgentSkills(
  skills: readonly AgentSkillSummary[],
  options: { category?: string | null; source?: AgentSkillSummary["source"] | null; limit?: number | null }
) {
  const category = options.category?.trim().toLowerCase() || "";
  const source = options.source ?? null;
  const limit = clampSkillLimit(options.limit, 40, 80);
  return skills
    .filter((skill) => (!category || skill.category?.toLowerCase() === category))
    .filter((skill) => (!source || skill.source === source))
    .slice(0, limit);
}

type SkillCandidate = {
  directory: string;
  skillFilePath?: string;
  markdown?: string;
  source: AgentSkillSummary["source"];
};

async function skillRootsFromConfig(env: NodeJS.ProcessEnv) {
  const builtInRoots = builtinSkillRootsFromConfig(env).map((root) => ({ root, source: "built-in" as const }));
  const localRoots = skillRootsFromEnv(env).map((root) => ({ root, source: "local" as const }));
  const remoteRoots = await remoteSkillRootsFromEnv(env);
  return [
    ...builtInRoots,
    ...localRoots,
    ...remoteRoots.map((root) => ({ root, source: "remote" as const }))
  ];
}

function builtinSkillRootsFromConfig(env: NodeJS.ProcessEnv) {
  return dedupePaths([
    ...parseAgentSkillPathList(env.GEOCHAT_BUILTIN_SKILLS_DIRS ?? env.GEOCHAT_BUILTIN_SKILLS_DIR ?? ""),
    sourceBuiltinSkillRoot(),
    ...(env.GEOCHAT_DESKTOP_RESOURCE_ROOT ? [join(env.GEOCHAT_DESKTOP_RESOURCE_ROOT, "agent-skills")] : [])
  ].filter(Boolean));
}

function sourceBuiltinSkillRoot() {
  return fileURLToPath(new URL("./builtin-skills", import.meta.url));
}

function skillRootsFromEnv(env: NodeJS.ProcessEnv) {
  const value = env.GEOCHAT_SKILLS_DIRS ?? env.GEOCHAT_SKILLS_DIR ?? "";
  return parseAgentSkillPathList(value).map((item) => resolve(item));
}

async function writableRemoteSkillCacheDir(env: NodeJS.ProcessEnv) {
  return resolve(env.GEOCHAT_REMOTE_SKILLS_CACHE_DIR?.trim() || join(homedir(), ".cache", REMOTE_SKILLS_CACHE_DIR_NAME));
}

async function remoteSkillRootsFromEnv(env: NodeJS.ProcessEnv) {
  const manifestUrls = splitEnvList(env.GEOCHAT_REMOTE_SKILLS_MANIFEST_URLS ?? env.GEOCHAT_REMOTE_SKILL_MANIFEST_URLS ?? "");
  const writableCacheDir = await writableRemoteSkillCacheDir(env);
  const cacheRoots = dedupePaths([
    ...bundledRemoteSkillCacheRoots(env),
    ...remoteSkillCacheRootsFromEnv(env),
    writableCacheDir
  ]);
  if (manifestUrls.length) {
    await mkdir(writableCacheDir, { recursive: true });
    await Promise.all(
      manifestUrls.map(async (url) => {
        try {
          const manifest = await fetchRemoteSkillManifest(url);
          await cacheRemoteManifestSkills(writableCacheDir, manifest);
        } catch (error) {
          console.warn(`Failed to refresh remote agent skills from ${url}: ${error instanceof Error ? error.message : String(error)}`);
        }
      })
    );
  }
  return cacheRoots;
}

function bundledRemoteSkillCacheRoots(env: NodeJS.ProcessEnv) {
  const configured = env.GEOCHAT_BUNDLED_SKILLS_DIRS ?? env.GEOCHAT_BUNDLE_SKILLS_DIRS ?? "";
  const configuredRoots = parseAgentSkillPathList(configured).map((item) => resolve(item));
  const resourceRoot = env.GEOCHAT_DESKTOP_RESOURCE_ROOT?.trim();
  const inferredRoots = resourceRoot ? BUNDLED_SKILL_CACHE_RELATIVE_DIRS.map((relativePath) => resolve(resourceRoot, relativePath)) : [];
  return [...configuredRoots, ...inferredRoots];
}

function remoteSkillCacheRootsFromEnv(env: NodeJS.ProcessEnv) {
  const value = env.GEOCHAT_REMOTE_SKILLS_CACHE_DIRS ?? "";
  return parseAgentSkillPathList(value).map((item) => resolve(item));
}

async function discoverSkillCandidates(
  roots: readonly { root: string; source: AgentSkillSummary["source"] }[]
): Promise<SkillCandidate[]> {
  const candidates: SkillCandidate[] = [];
  for (const { root, source } of roots) {
    if (!(await canRead(root))) continue;
    if (await canRead(resolve(root, SKILL_FILE_NAME))) {
      candidates.push({ directory: root, skillFilePath: resolve(root, SKILL_FILE_NAME), source });
      continue;
    }
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const directory = resolve(root, entry.name);
      const skillFilePath = resolve(directory, SKILL_FILE_NAME);
      if (isPathInside(root, skillFilePath) && (await canRead(skillFilePath))) {
        candidates.push({ directory, skillFilePath, source });
      }
    }
  }
  return candidates;
}

async function readSkillSummary(candidate: SkillCandidate): Promise<AgentSkillSummary | undefined> {
  const markdown = await readSkillMarkdown(candidate);
  const frontmatter = parseSkillFrontmatter(markdown);
  const name = frontmatter.name?.trim() || basename(candidate.directory);
  const description = frontmatter.description?.trim() || firstMarkdownParagraph(markdown) || "Agent skill instructions.";
  if (!name.trim() || !description.trim()) return undefined;
  return {
    name,
    description,
    path: candidate.directory,
    source: candidate.source,
    maturity: frontmatter.maturity ?? "draft",
    category: frontmatter.category?.trim() || undefined,
    parent: frontmatter.parent?.trim() || undefined,
    level: frontmatter.level,
    recipes: frontmatter.recipes ?? BUILTIN_SKILL_RECIPES[name] ?? [],
    tags: frontmatter.tags ?? [],
    tools: frontmatter.tools ?? [],
    advancedTools: frontmatter.advancedTools ?? []
  };
}

function parseSkillFrontmatter(markdown: string): SkillFrontmatter {
  if (!markdown.startsWith("---\n")) return {};
  const end = markdown.indexOf("\n---", 4);
  if (end < 0) return {};
  const block = markdown.slice(4, end);
  const result: SkillFrontmatter = {};
  for (const line of block.split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/u);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (key === "name") result.name = value;
    if (key === "description") result.description = value;
    if (key === "category") result.category = value;
    if (key === "parent") result.parent = value;
    if (key === "level") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) result.level = parsed;
    }
    if (key === "tags") result.tags = parseFrontmatterList(value);
    if (key === "recipes") result.recipes = parseFrontmatterList(value);
    if (key === "tools") result.tools = parseFrontmatterList(value);
    if (key === "advancedTools") result.advancedTools = parseFrontmatterList(value);
    if (key === "maturity") result.maturity = parseSkillMaturity(value);
  }
  return result;
}

function firstMarkdownParagraph(markdown: string) {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n?/u, "");
  return body
    .split(/\n\s*\n/u)
    .map((paragraph) =>
      paragraph
        .replace(/^#+\s*/u, "")
        .replace(/\s+/gu, " ")
        .trim()
    )
    .find(Boolean);
}

async function readBoundedText(path: string, maxBytes: number) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`Skill file is not a regular file: ${path}`);
  if (info.size > maxBytes) throw new Error(`Skill file exceeds ${maxBytes} bytes: ${path}`);
  return readFile(path, "utf8");
}

async function readSkillMarkdown(candidate: SkillCandidate) {
  if (candidate.markdown !== undefined) return candidate.markdown;
  if (!candidate.skillFilePath) throw new Error(`Skill file is missing: ${candidate.directory}`);
  return readBoundedText(candidate.skillFilePath, MAX_SKILL_MARKDOWN_BYTES);
}

async function listSkillResources(directory: string): Promise<ActivatedAgentSkill["resources"]> {
  if (directory.startsWith("builtin:")) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.name !== SKILL_FILE_NAME && !entry.name.startsWith("."))
    .slice(0, MAX_SKILL_RESOURCE_COUNT)
    .map((entry) => ({
      path: relative(directory, resolve(directory, entry.name)),
      kind: entry.isDirectory() ? ("directory" as const) : ("file" as const)
    }));
}

function dedupeSkills(skills: readonly AgentSkillSummary[]) {
  const seen = new Set<string>();
  const result: AgentSkillSummary[] = [];
  for (const skill of skills) {
    const normalized = normalizeSkillName(skill.name);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(skill);
  }
  return result;
}

function normalizeSkillName(value: string) {
  return value.trim().toLowerCase();
}

function tokenizeSkillQuery(value: string) {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter(Boolean);
}

function scoreSkillMatch(
  skill: AgentSkillSummary,
  queryTerms: readonly string[],
  category: string,
  requestedTags: readonly string[]
): AgentSkillSearchResult | undefined {
  const fields = {
    name: skill.name.toLowerCase(),
    description: skill.description.toLowerCase(),
    category: (skill.category ?? "").toLowerCase(),
    parent: (skill.parent ?? "").toLowerCase(),
    recipes: skill.recipes.join(" ").toLowerCase(),
    tags: skill.tags.join(" ").toLowerCase(),
    tools: skill.tools.join(" ").toLowerCase(),
    advancedTools: skill.advancedTools.join(" ").toLowerCase()
  };
  let score = 0;
  const matchedFields = new Set<string>();

  if (category && fields.category === category) {
    score += 8;
    matchedFields.add("category");
  }
  for (const tag of requestedTags) {
    if (skill.tags.some((skillTag) => skillTag.toLowerCase() === tag)) {
      score += 4;
      matchedFields.add("tags");
    }
  }
  for (const term of queryTerms) {
    if (fields.name.includes(term)) {
      score += 6;
      matchedFields.add("name");
    }
    if (fields.category.includes(term)) {
      score += 4;
      matchedFields.add("category");
    }
    if (fields.tags.includes(term)) {
      score += 3;
      matchedFields.add("tags");
    }
    if (fields.parent.includes(term)) {
      score += 3;
      matchedFields.add("parent");
    }
    if (fields.recipes.includes(term)) {
      score += 3;
      matchedFields.add("recipes");
    }
    if (fields.description.includes(term)) {
      score += 2;
      matchedFields.add("description");
    }
    if (fields.tools.includes(term)) {
      score += 1;
      matchedFields.add("tools");
    }
    if (fields.advancedTools.includes(term)) {
      score += 2;
      matchedFields.add("advancedTools");
    }
  }

  if (score <= 0) return undefined;
  return {
    ...skill,
    score,
    matchedFields: [...matchedFields].sort()
  };
}

function clampSkillLimit(value: number | null | undefined, fallback: number, max: number) {
  if (value === undefined || value === null) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function parseFrontmatterList(value: string) {
  const trimmed = value.trim();
  const body = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  return body
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function splitEnvList(value: string) {
  return value
    .split(/[,\n]/u)
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseAgentSkillPathList(value: string) {
  const parts: string[] = [];
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const isLineBreak = char === "\n" || char === "\r";
    const isSemicolon = char === ";";
    const isPlatformDelimiter = char === delimiter;
    const isPosixDelimiter = delimiter === ":" && char === ":" && !isWindowsDriveColon(value, index);
    if (isLineBreak || isSemicolon || (isPlatformDelimiter && delimiter !== ":") || isPosixDelimiter) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function isWindowsDriveColon(value: string, index: number) {
  if (index < 1) return false;
  const drive = value[index - 1];
  const next = value[index + 1];
  const boundary = index === 1 || value[index - 2] === ";" || value[index - 2] === "\n" || value[index - 2] === "\r";
  return boundary && /[A-Za-z]/u.test(drive) && (next === "\\" || next === "/");
}

function dedupePaths(paths: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = resolve(path);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

async function fetchRemoteSkillManifest(url: string): Promise<RemoteSkillManifestEntry[]> {
  ensureAllowedRemoteSkillUrl(url);
  const body = await fetchBoundedText(url, MAX_REMOTE_MANIFEST_BYTES);
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Remote skill manifest must be a JSON object.");
  }
  const skills = (parsed as { skills?: unknown }).skills;
  if (!Array.isArray(skills)) throw new Error("Remote skill manifest must contain a skills array.");
  return skills.map(parseRemoteSkillManifestEntry);
}

function parseRemoteSkillManifestEntry(entry: unknown): RemoteSkillManifestEntry {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Remote skill entry must be an object.");
  const record = entry as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (!name || !url) throw new Error("Remote skill entry must include name and url.");
  ensureAllowedRemoteSkillUrl(url);
  return {
    name,
    url,
    description: typeof record.description === "string" ? record.description : undefined,
    sha256: typeof record.sha256 === "string" ? record.sha256.trim().toLowerCase() : undefined,
    category: typeof record.category === "string" ? record.category : undefined,
    parent: typeof record.parent === "string" ? record.parent : undefined,
    level: typeof record.level === "number" && Number.isFinite(record.level) ? Math.floor(record.level) : undefined,
    recipes: Array.isArray(record.recipes) ? record.recipes.filter((item): item is string => typeof item === "string") : undefined,
    tags: Array.isArray(record.tags) ? record.tags.filter((item): item is string => typeof item === "string") : undefined,
    tools: Array.isArray(record.tools) ? record.tools.filter((item): item is string => typeof item === "string") : undefined,
    advancedTools: Array.isArray(record.advancedTools) ? record.advancedTools.filter((item): item is string => typeof item === "string") : undefined,
    maturity: typeof record.maturity === "string" ? parseSkillMaturity(record.maturity) : undefined
  };
}

async function cacheRemoteManifestSkills(cacheDir: string, entries: readonly RemoteSkillManifestEntry[]) {
  await Promise.all(
    entries.map(async (entry) => {
      const markdown = await fetchBoundedText(entry.url, MAX_SKILL_MARKDOWN_BYTES);
      if (entry.sha256 && sha256Hex(markdown) !== entry.sha256) {
        throw new Error(`Remote skill checksum mismatch for ${entry.name}.`);
      }
      const directory = resolve(cacheDir, `${safePathSegment(entry.name)}-${sha256Hex(entry.url).slice(0, 10)}`);
      if (!isPathInside(cacheDir, directory)) throw new Error(`Remote skill cache path escaped cache dir: ${entry.name}`);
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, SKILL_FILE_NAME), ensureSkillFrontmatter(markdown, entry), "utf8");
    })
  );
}

async function fetchBoundedText(url: string, maxBytes: number) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error(`Remote skill payload exceeds ${maxBytes} bytes: ${url}`);
  return new TextDecoder().decode(bytes);
}

function ensureAllowedRemoteSkillUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol === "https:") return;
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (localHttp) return;
  throw new Error(`Remote skill URL must use https, or localhost http for development: ${url}`);
}

function ensureSkillFrontmatter(markdown: string, entry: RemoteSkillManifestEntry) {
  if (markdown.startsWith("---\n")) return markdown;
  return [
    "---",
    `name: ${entry.name}`,
    ...(entry.description ? [`description: ${entry.description}`] : []),
    ...(entry.category ? [`category: ${entry.category}`] : []),
    ...(entry.parent ? [`parent: ${entry.parent}`] : []),
    ...(entry.level ? [`level: ${entry.level}`] : []),
    ...(entry.recipes?.length ? [`recipes: [${entry.recipes.join(", ")}]`] : []),
    ...(entry.tags?.length ? [`tags: [${entry.tags.join(", ")}]`] : []),
    ...(entry.tools?.length ? [`tools: [${entry.tools.join(", ")}]`] : []),
    ...(entry.advancedTools?.length ? [`advancedTools: [${entry.advancedTools.join(", ")}]`] : []),
    ...(entry.maturity ? [`maturity: ${entry.maturity}`] : []),
    "---",
    "",
    markdown
  ].join("\n");
}

function parseSkillMaturity(value: string): AgentSkillMaturity | undefined {
  const normalized = value.trim().toLowerCase();
  return (AGENT_SKILL_MATURITY_VALUES as readonly string[]).includes(normalized)
    ? (normalized as AgentSkillMaturity)
    : undefined;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safePathSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "skill";
}

async function canRead(path: string) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isPathInside(root: string, path: string) {
  const relativePath = relative(root, path);
  return !relativePath.startsWith("..") && !relativePath.startsWith(sep) && !relativePath.includes(`..${sep}`);
}
