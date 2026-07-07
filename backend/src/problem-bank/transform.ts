import { problemBankSourceId, type ImportedProblem, type ProblemCase } from "./types";

export function transformProblemCase(input: ProblemCase): ImportedProblem | undefined {
  if (typeof input.id !== "string" || typeof input.input?.text !== "string") return undefined;
  const metadata = input.metadata ?? {};
  const tags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const topics = Array.isArray(metadata.sourceTopics)
    ? metadata.sourceTopics.filter((topic): topic is string => typeof topic === "string")
    : tags.filter((tag) => ["analytic-geometry", "plane-geometry", "solid-geometry", "function", "trigonometry", "ellipse", "circle"].includes(tag));
  return {
    id: input.id,
    sourceId: problemBankSourceId,
    sourceItemId: input.id,
    title: normalizeProblemTitle(typeof input.title === "string" ? input.title : input.id),
    prompt: normalizeProblemPrompt(input.input.text),
    answer: stringifyOptional(input.expected?.answer ?? input.oracle?.knownAnswer),
    analysis: stringifyOptional(metadata.sourceAnalysis),
    kind: normalizeProblemKind(input.kind),
    taskType: normalizeProblemTaskType(input.taskType),
    questionType: normalizeQuestionType(metadata.sourceQuestionType),
    paper: stringifyOptional(metadata.sourcePaper),
    year: stringifyOptional(metadata.sourceYear),
    score: typeof metadata.sourceScore === "number" ? metadata.sourceScore : null,
    category: stringifyOptional(metadata.sourceCategory),
    difficulty: normalizeDifficulty(input.difficulty),
    visualPotential: metadata.visualPotential === true || tags.includes("visual-candidate") || tags.includes("3d"),
    media: normalizeProblemMedia(input.media ?? metadata.sourceMedia),
    tags,
    topics,
    rawPayload: input
  };
}

export function normalizeProblemTitle(title: string) {
  return title.replace(/^GAOKAO\s+(?:Full|Dev)\s*[:：]\s*/i, "").trim();
}

export function normalizeProblemPrompt(prompt: string) {
  return prompt.replace(/^【GAOKAO-Bench\s+源题\s+[^\]]+】\s*/i, "").trim();
}

function normalizeProblemKind(value: unknown): ImportedProblem["kind"] {
  return value === "exploration" || value === "regression" || value === "math_problem" ? value : "math_problem";
}

function normalizeProblemTaskType(value: unknown): ImportedProblem["taskType"] {
  return ["draw", "solve", "explain", "construct", "diagnose", "revise", "mixed", "animation"].includes(String(value))
    ? value as ImportedProblem["taskType"]
    : "solve";
}

function normalizeQuestionType(value: unknown): ImportedProblem["questionType"] {
  if (value === "mcq" || value === "fill_blank" || value === "open_ended") return value;
  return "curated";
}

function normalizeDifficulty(value: unknown): ImportedProblem["difficulty"] {
  return value === "medium" || value === "hard" || value === "easy" ? value : "medium";
}

function stringifyOptional(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function normalizeProblemMedia(value: unknown): ImportedProblem["media"] {
  const media = Array.isArray(value) ? value : [];
  return media
    .map((item) => normalizeProblemMediaItem(item))
    .filter((item): item is NonNullable<ReturnType<typeof normalizeProblemMediaItem>> => Boolean(item));
}

function normalizeProblemMediaItem(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (item.kind !== "image") return undefined;
  const path = stringifyMediaText(item.path);
  const url = stringifyMediaText(item.url);
  if (!path && !url) return undefined;
  return {
    kind: "image" as const,
    path,
    url,
    r2Key: stringifyMediaText(item.r2Key),
    r2Url: stringifyMediaText(item.r2Url),
    trackingUrl: stringifyMediaText(item.trackingUrl),
    sha256: stringifyMediaText(item.sha256),
    byteSize: typeof item.byteSize === "number" && Number.isFinite(item.byteSize) ? item.byteSize : null,
    contentType: stringifyMediaText(item.contentType),
    width: typeof item.width === "number" && Number.isFinite(item.width) ? item.width : null,
    height: typeof item.height === "number" && Number.isFinite(item.height) ? item.height : null,
    alt: stringifyMediaText(item.alt)
  };
}

function stringifyMediaText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
