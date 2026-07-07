import { Schema } from "effect";

export const ProblemKind = Schema.Literal("math_problem", "exploration", "regression");
export const ProblemTaskType = Schema.Literal("draw", "solve", "explain", "construct", "diagnose", "revise", "mixed", "animation");
export const ProblemQuestionType = Schema.Literal("mcq", "fill_blank", "open_ended", "curated");
export const ProblemDifficulty = Schema.Literal("easy", "medium", "hard");

export const ProblemMedia = Schema.Struct({
  kind: Schema.Literal("image"),
  path: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String),
  r2Key: Schema.NullOr(Schema.String),
  r2Url: Schema.NullOr(Schema.String),
  trackingUrl: Schema.NullOr(Schema.String),
  sha256: Schema.NullOr(Schema.String),
  byteSize: Schema.NullOr(Schema.Number),
  contentType: Schema.NullOr(Schema.String),
  width: Schema.NullOr(Schema.Number),
  height: Schema.NullOr(Schema.Number),
  alt: Schema.NullOr(Schema.String)
});

export type ProblemMedia = Schema.Schema.Type<typeof ProblemMedia>;

export type ProblemBankSource = "local" | "cloud";

export type ProblemReusePolicy = "allowed" | "restricted" | "unknown";
export type ProblemBankAccessTier = "open" | "restricted";

export type CloudProblemAnswerChoice = {
  label?: string;
  text?: string;
  correct?: boolean;
};

export type CloudProblemAnswer = {
  final?: string;
  type?: string;
  choices?: CloudProblemAnswerChoice[];
  solution?: string;
  analysis?: string;
  reasoningTraceRef?: string;
};

export type CloudProblemSource = {
  datasetId: string;
  datasetSlug: string;
  sourceFile?: string;
  sourceIndex?: number;
  sourceItemId?: string;
  license?: string;
};

export type CloudProblemMedia = Partial<ProblemMedia> & {
  kind: "image";
};

export type CloudProblemTaxonomy = {
  language?: string;
  subject?: string;
  grade?: string;
  difficulty?: string;
  knowledge?: string[];
  skills?: string[];
  tags?: string[];
};

export type CloudProblemLicense = {
  name?: string;
  reusePolicy?: ProblemReusePolicy;
  sourceUrl?: string;
};

export type CloudProblemRecord = {
  id: string;
  releaseId: string;
  source: CloudProblemSource;
  construction?: string;
  modality?: string;
  prompt?: string;
  answer?: CloudProblemAnswer;
  media?: CloudProblemMedia[];
  taxonomy?: CloudProblemTaxonomy;
  license?: CloudProblemLicense;
};

export type CloudProblemSummaryRow = {
  id: string;
  releaseId: string;
  datasetId: string;
  datasetSlug: string;
  construction?: string;
  modality?: string;
  subject?: string;
  grade?: string;
  difficulty?: string;
  language?: string;
  license?: string;
  reusePolicy?: ProblemReusePolicy;
  hasMedia?: boolean;
  mediaCount?: number;
  choiceCount?: number;
  promptPreview?: string;
  answerPreview?: string;
  knowledge?: string[];
  tags?: string[];
  problemApiPath?: string;
};

export type CloudProblemBankSummary = {
  bankId: string;
  bankSlug: string;
  title: string;
  description?: string;
  kind: string;
  indexUrl: string;
  datasetId?: string;
  accessTier?: ProblemBankAccessTier;
  sortOrder?: number;
  regions?: string[];
  reusePolicy: ProblemReusePolicy;
  counts: {
    records?: number;
    media?: number;
    recordsWithMedia?: number;
    missingMedia?: number;
    [key: string]: unknown;
  };
};

export type CloudProblemBankIndexResponse = {
  schemaVersion: string;
  releaseId: string;
  channel: "production" | "evaluation" | "internal";
  banks: CloudProblemBankSummary[];
  links: {
    self: string;
    releaseManifest: string;
  };
};

export type CloudProblemBankDetailIndexResponse = {
  releaseId: string;
  bankId: string;
  bankSlug: string;
  title?: string;
  kind?: string;
  counts?: Record<string, unknown>;
  facets?: Record<string, Array<{ value: string; label: string; count: number }>>;
  pages: Array<{
    id: string;
    url: string;
    rows: number;
    firstProblemId?: string;
    lastProblemId?: string;
  }>;
  links?: {
    self: string;
    firstPage?: string;
  };
};

export type CloudProblemBankProblemPageResponse = {
  releaseId: string;
  bankId: string;
  bankSlug: string;
  items: CloudProblemSummaryRow[];
  nextCursor?: string;
};

export type CloudProblemCurrentReleaseResponse = {
  releaseId: string;
  channel: "production" | "evaluation" | "internal";
  manifestUrl: string;
};

export type ProblemCloudMetadata = {
  source?: ProblemBankSource;
  releaseId?: string | null;
  releaseChannel?: CloudProblemBankIndexResponse["channel"] | null;
  bankSlug?: string | null;
  datasetId?: string | null;
  datasetSlug?: string | null;
  problemApiPath?: string | null;
  reusePolicy?: ProblemReusePolicy | null;
  license?: string | null;
  language?: string | null;
};

export const ProblemSummary = Schema.Struct({
  id: Schema.String,
  sourceItemId: Schema.String,
  title: Schema.String,
  prompt: Schema.String,
  kind: ProblemKind,
  taskType: ProblemTaskType,
  questionType: ProblemQuestionType,
  paper: Schema.NullOr(Schema.String),
  year: Schema.NullOr(Schema.String),
  score: Schema.NullOr(Schema.Number),
  category: Schema.NullOr(Schema.String),
  difficulty: ProblemDifficulty,
  visualPotential: Schema.Boolean,
  media: Schema.Array(ProblemMedia),
  tags: Schema.Array(Schema.String),
  topics: Schema.Array(Schema.String)
});

export type ProblemSummary = Schema.Schema.Type<typeof ProblemSummary> & ProblemCloudMetadata;

export const ProblemDetail = Schema.extend(
  ProblemSummary,
  Schema.Struct({
    answer: Schema.NullOr(Schema.String),
    analysis: Schema.NullOr(Schema.String),
    rawPayload: Schema.Unknown
  })
);

export type ProblemDetail = Schema.Schema.Type<typeof ProblemDetail> & ProblemCloudMetadata;

export const ProblemSetSummary = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  title: Schema.String,
  description: Schema.String,
  kind: Schema.Literal("curated", "generated", "imported", "eval"),
  problemCount: Schema.Number
});

type ProblemSetSummaryBase = Schema.Schema.Type<typeof ProblemSetSummary>;

export type ProblemSetSummary = ProblemSetSummaryBase & {
  source?: ProblemBankSource;
  releaseId?: string | null;
  releaseChannel?: CloudProblemBankIndexResponse["channel"] | null;
  bankSlug?: string | null;
  cloudBaseUrl?: string | null;
  datasetId?: string | null;
  accessTier?: ProblemBankAccessTier | null;
  reusePolicy?: ProblemReusePolicy | null;
};

export type ProblemListResponse = {
  problems: ProblemSummary[];
  total: number;
  limit: number;
  offset: number;
  source?: ProblemBankSource;
  nextCursor?: string;
};

export type ProblemSetListResponse = {
  sets: ProblemSetSummary[];
};

export type ProblemImportResponse = {
  imported: number;
  sets: number;
  skipped: boolean;
  sourcePath?: string;
  message?: string;
};

export function cloudProblemBankSummaryToProblemSetSummary(
  bank: CloudProblemBankSummary,
  input: { releaseId: string; releaseChannel: CloudProblemBankIndexResponse["channel"]; cloudBaseUrl: string }
): ProblemSetSummary {
  const records = numberOrZero(bank.counts.records);
  return {
    id: cloudProblemSetId(input.releaseId, bank.bankSlug),
    slug: bank.bankSlug,
    title: bank.title || bank.datasetId || bank.bankSlug,
    description: bank.description || `${bank.datasetId || bank.title || bank.bankSlug} cloud problem bank`,
    kind: "imported",
    problemCount: records,
    source: "cloud",
    releaseId: input.releaseId,
    releaseChannel: input.releaseChannel,
    bankSlug: bank.bankSlug,
    cloudBaseUrl: input.cloudBaseUrl,
    datasetId: bank.datasetId ?? null,
    accessTier: bank.accessTier ?? "open",
    reusePolicy: bank.reusePolicy
  };
}

export function cloudProblemSummaryToProblemSummary(row: CloudProblemSummaryRow, bankSlug?: string | null): ProblemSummary {
  const knowledge = stringArray(row.knowledge);
  const tags = stringArray(row.tags);
  const paper = cloudPaper(tags);
  return {
    id: row.id,
    sourceItemId: row.id,
    title: row.promptPreview || row.id,
    prompt: row.promptPreview || "",
    kind: "math_problem",
    taskType: cloudTaskType(row),
    questionType: row.choiceCount && row.choiceCount > 0 ? "mcq" : "open_ended",
    paper,
    year: cloudYear(tags),
    score: null,
    category: row.subject || row.grade || row.datasetSlug || null,
    difficulty: cloudDifficulty(row.difficulty),
    visualPotential: Boolean(row.hasMedia) || cloudTaskType(row) !== "solve",
    media: [],
    tags: uniqueStrings([
      ...tags,
      row.datasetSlug,
      row.construction,
      row.modality,
      row.reusePolicy
    ]),
    topics: knowledge,
    source: "cloud",
    releaseId: row.releaseId,
    bankSlug: bankSlug ?? row.datasetSlug,
    datasetId: row.datasetId,
    datasetSlug: row.datasetSlug,
    problemApiPath: row.problemApiPath ?? `/problem-bank/v1/problems/${encodeURIComponent(row.id)}`,
    reusePolicy: row.reusePolicy ?? null,
    license: row.license ?? null,
    language: row.language ?? null
  };
}

function cloudYear(tags: string[]): string | null {
  return tags.map((tag) => tag.match(/^year-(\d{4})$/)?.[1]).find((year): year is string => Boolean(year)) ?? null;
}

function cloudPaper(tags: string[]): string | null {
  return tags.find((tag) => tag === "math_i" || tag === "math_ii" || tag === "math_iii") ?? null;
}

export function cloudProblemRecordToProblemDetail(record: CloudProblemRecord, bankSlug?: string | null): ProblemDetail {
  const taxonomy = record.taxonomy ?? {};
  const answer = record.answer ?? {};
  const summary = cloudProblemSummaryToProblemSummary(
    {
      id: record.id,
      releaseId: record.releaseId,
      datasetId: record.source.datasetId,
      datasetSlug: record.source.datasetSlug,
      construction: record.construction,
      modality: record.modality,
      subject: taxonomy.subject,
      grade: taxonomy.grade,
      difficulty: taxonomy.difficulty,
      language: taxonomy.language,
      license: record.license?.name ?? record.source.license,
      reusePolicy: record.license?.reusePolicy,
      hasMedia: Boolean(record.media?.length),
      mediaCount: record.media?.length ?? 0,
      choiceCount: answer.choices?.length ?? 0,
      promptPreview: record.prompt,
      answerPreview: answerPreview(answer),
      knowledge: taxonomy.knowledge,
      tags: taxonomy.tags,
      problemApiPath: `/problem-bank/v1/problems/${encodeURIComponent(record.id)}`
    },
    bankSlug
  );
  return {
    ...summary,
    title: record.prompt || summary.title,
    prompt: record.prompt || summary.prompt,
    media: normalizeCloudMedia(record.media),
    topics: uniqueStrings([...(taxonomy.knowledge ?? []), ...(taxonomy.skills ?? [])]),
    tags: uniqueStrings([...(summary.tags ?? []), ...(taxonomy.tags ?? [])]),
    answer: answerText(answer),
    analysis: answer.analysis ?? answer.solution ?? null,
    rawPayload: record
  };
}

function normalizeCloudMedia(media: CloudProblemMedia[] | undefined): ProblemMedia[] {
  return (media ?? []).map((item) => ({
    kind: "image",
    path: item.path ?? null,
    url: item.url ?? null,
    r2Key: item.r2Key ?? null,
    r2Url: item.r2Url ?? null,
    trackingUrl: item.trackingUrl ?? null,
    sha256: item.sha256 ?? null,
    byteSize: item.byteSize ?? null,
    contentType: item.contentType ?? null,
    width: item.width ?? null,
    height: item.height ?? null,
    alt: item.alt ?? null
  }));
}

export function cloudProblemSetId(releaseId: string, bankSlug: string): string {
  return `cloud:${releaseId}:${bankSlug}`;
}

function cloudTaskType(row: Pick<CloudProblemSummaryRow, "construction" | "modality" | "hasMedia">): ProblemSummary["taskType"] {
  const construction = (row.construction ?? "").toLowerCase();
  const modality = (row.modality ?? "").toLowerCase();
  if (construction.includes("animation")) return "animation";
  if (construction.includes("construct") || construction.includes("geometry") || modality.includes("geometry")) return "construct";
  if (row.hasMedia) return "draw";
  return "solve";
}

function cloudDifficulty(value: string | undefined): ProblemSummary["difficulty"] {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "easy" || normalized === "medium" || normalized === "hard") return normalized;
  return "medium";
}

function answerText(answer: CloudProblemAnswer): string | null {
  if (answer.final) return answer.final;
  const choices = answer.choices ?? [];
  const correct = choices
    .filter((choice) => choice.correct)
    .map((choice) => choice.label || choice.text)
    .filter((value): value is string => Boolean(value));
  if (correct.length) return correct.join(", ");
  return null;
}

function answerPreview(answer: CloudProblemAnswer): string | undefined {
  return answer.final ?? (answer.choices?.map((choice) => choice.label).filter(Boolean).join(",") || undefined);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (text && !result.includes(text)) result.push(text);
  }
  return result;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniqueStrings(value.map((item) => (typeof item === "string" ? item : String(item)))) : [];
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
