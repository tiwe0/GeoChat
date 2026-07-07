import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

type ProblemCase = {
  id: string;
  title?: string;
  input?: {
    type?: string;
    text?: string;
    imageRefs?: unknown[];
  };
  expected?: {
    answer?: unknown;
  };
  oracle?: {
    knownAnswer?: unknown;
  };
  tags?: string[];
  difficulty?: string;
  split?: string;
  taskType?: string;
  metadata?: {
    sourceItemId?: string;
    sourceDataset?: string;
    sourcePaper?: string;
    sourceYear?: string;
    sourceQuestionType?: string;
    sourceCategory?: string;
    sourceQuestionNumber?: number;
    sourceScore?: number;
    sourceTopics?: string[];
    visualPotential?: boolean;
    conversionStatus?: string;
    sourcePath?: string;
    sourceIndex?: number;
    sourceAnalysis?: string;
  };
};
type UnifiedGaokaoRecord = {
  id: string;
  source: {
    datasetId: string;
    requestedId: string;
    group: string;
    commit: string;
    license: string;
    sourceFile: string;
    sourceIndex: number;
    sourceSplit: string;
    sourceItemId: string;
  };
  modality: "text";
  construction: "open_ended" | "multiple_choice" | "fill_blank";
  prompt: string;
  answer: Record<string, unknown>;
  media: [];
  taxonomy: Record<string, unknown>;
  raw: ProblemCase;
};
type SqliteBinding = string | number | bigint | boolean | null | Uint8Array;

const dbPath = resolve(Bun.env.GEOCHAT_UNIFIED_PROBLEM_DB_PATH ?? "data/huggingface-unified-problems.sqlite");
const sourceRef = Bun.env.GEOCHAT_GAOKAO_PROBLEM_CASES_GIT_REF ?? "HEAD";
const sourceGlob = Bun.env.GEOCHAT_GAOKAO_PROBLEM_CASES_GLOB ?? "data/problem-cases/gaokao-*.json";
const datasetId = Bun.env.GEOCHAT_GAOKAO_DATASET_ID ?? "OpenLMLab/GAOKAO-Bench";
const requestedId = Bun.env.GEOCHAT_GAOKAO_REQUESTED_ID ?? "OpenLMLab/GAOKAO-Bench";
const groupName = Bun.env.GEOCHAT_GAOKAO_GROUP_NAME ?? "production";
const license = Bun.env.GEOCHAT_GAOKAO_LICENSE ?? "apache-2.0";
const sourceId = sourceSlug(datasetId);
const importedAt = Date.now();

const db = new Database(dbPath);
configureSqlite(db);
createSchema(db);

const paths = gitLsFiles(sourceGlob).filter((path) => /\/gaokao-.*\.json$/.test(path));
if (paths.length === 0) {
  throw new Error(`No GAOKAO problem cases found for ${sourceGlob} in ${sourceRef}.`);
}

db.run(
  `
  INSERT INTO unified_problem_sources (
    id, requested_id, repo_id, group_name, commit_sha, license, local_dir, source_hash, imported_at, raw_metadata
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    requested_id = excluded.requested_id,
    repo_id = excluded.repo_id,
    group_name = excluded.group_name,
    commit_sha = excluded.commit_sha,
    license = excluded.license,
    local_dir = excluded.local_dir,
    source_hash = excluded.source_hash,
    imported_at = excluded.imported_at,
    raw_metadata = excluded.raw_metadata
  `,
  [
    sourceId,
    requestedId,
    datasetId,
    groupName,
    gitRevision(sourceRef),
    license,
    "git:data/problem-cases",
    hashJson({ sourceRef, paths }),
    importedAt,
    JSON.stringify({
      requestedId,
      repoId: datasetId,
      group: groupName,
      license,
      sourceRef,
      sourceGlob,
      url: "https://github.com/OpenLMLab/GAOKAO-Bench"
    })
  ]
);
db.run("DELETE FROM unified_problem_records WHERE source_id = ?", [sourceId]);

const insertRecord = db.prepare(`
  INSERT INTO unified_problem_records (
    id, source_id, source_item_id, source_file, source_index, source_split,
    dataset_id, group_name, modality, construction, prompt, answer_final,
    answer_type, subject, grade, difficulty, language, license, media_count,
    choice_count, record_payload, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_id, source_file, source_index) DO UPDATE SET
    id = excluded.id,
    source_item_id = excluded.source_item_id,
    source_split = excluded.source_split,
    dataset_id = excluded.dataset_id,
    group_name = excluded.group_name,
    modality = excluded.modality,
    construction = excluded.construction,
    prompt = excluded.prompt,
    answer_final = excluded.answer_final,
    answer_type = excluded.answer_type,
    subject = excluded.subject,
    grade = excluded.grade,
    difficulty = excluded.difficulty,
    language = excluded.language,
    license = excluded.license,
    media_count = excluded.media_count,
    choice_count = excluded.choice_count,
    record_payload = excluded.record_payload,
    updated_at = excluded.updated_at
`);

let imported = 0;
let skipped = 0;
const byConstruction = new Map<string, number>();
const byYear = new Map<string, number>();

const transaction = db.transaction((items: string[]) => {
  for (const path of items) {
    const problemCase = JSON.parse(gitShow(`${sourceRef}:${path}`)) as ProblemCase;
    const record = toUnifiedRecord(problemCase, path);
    if (!record) {
      skipped += 1;
      continue;
    }
    const answer = record.answer as Record<string, unknown>;
    const taxonomy = record.taxonomy as Record<string, unknown>;
    const source = record.source as Record<string, unknown>;
    const choices = Array.isArray(answer.choices) ? answer.choices : [];
    const sourceIndex = Number(source.sourceIndex ?? 0);

    const bindings: SqliteBinding[] = [
      record.id,
      sourceId,
      nullableText(source.sourceItemId),
      nullableText(source.sourceFile),
      Number.isFinite(sourceIndex) ? sourceIndex : 0,
      nullableText(source.sourceSplit),
      datasetId,
      groupName,
      record.modality,
      record.construction,
      record.prompt,
      nullableText(answer.final),
      nullableText(answer.type),
      nullableText(taxonomy.subject),
      nullableText(taxonomy.grade),
      nullableText(taxonomy.difficulty),
      nullableText(taxonomy.language),
      license,
      Array.isArray(record.media) ? record.media.length : 0,
      choices.length,
      JSON.stringify(record),
      importedAt,
      importedAt
    ];
    insertRecord.run(...bindings);

    imported += 1;
    increment(byConstruction, record.construction);
    const year = scalarToText((record.raw as ProblemCase).metadata?.sourceYear);
    if (year) increment(byYear, year);
  }
});

transaction(paths);

console.log(JSON.stringify({
  db: dbPath,
  datasetId,
  sourceId,
  sourceRef,
  files: paths.length,
  imported,
  skipped,
  byConstruction: Object.fromEntries([...byConstruction.entries()].sort()),
  byYear: Object.fromEntries([...byYear.entries()].sort())
}, null, 2));

function configureSqlite(database: Database): void {
  database.run("PRAGMA busy_timeout = 30000");
  database.run("PRAGMA journal_mode = WAL");
  database.run("PRAGMA synchronous = NORMAL");
  database.run("PRAGMA temp_store = MEMORY");
}

function createSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS unified_problem_sources (
      id TEXT PRIMARY KEY,
      requested_id TEXT,
      repo_id TEXT NOT NULL,
      group_name TEXT NOT NULL CHECK (group_name IN ('production', 'external', 'reasoning', 'evaluation')),
      commit_sha TEXT,
      license TEXT,
      local_dir TEXT,
      source_hash TEXT NOT NULL,
      imported_at INTEGER NOT NULL,
      raw_metadata TEXT NOT NULL,
      UNIQUE (repo_id, group_name)
    );

    CREATE TABLE IF NOT EXISTS unified_problem_records (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_item_id TEXT,
      source_file TEXT NOT NULL,
      source_index INTEGER NOT NULL,
      source_split TEXT,
      dataset_id TEXT NOT NULL,
      group_name TEXT NOT NULL CHECK (group_name IN ('production', 'external', 'reasoning', 'evaluation')),
      modality TEXT NOT NULL CHECK (modality IN ('text', 'image', 'multimodal')),
      construction TEXT NOT NULL CHECK (construction IN ('open_ended', 'multiple_choice', 'fill_blank', 'worked_solution', 'reasoning_trace')),
      prompt TEXT NOT NULL,
      answer_final TEXT,
      answer_type TEXT CHECK (answer_type IN ('label', 'free_form', 'numeric', 'expression', 'multi_label', 'unknown')),
      subject TEXT,
      grade TEXT,
      difficulty TEXT,
      language TEXT,
      license TEXT,
      media_count INTEGER NOT NULL DEFAULT 0,
      choice_count INTEGER NOT NULL DEFAULT 0,
      record_payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (source_id, source_file, source_index)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS unified_problem_sources_repo_uidx ON unified_problem_sources (repo_id, group_name);
    CREATE INDEX IF NOT EXISTS unified_problem_sources_group_idx ON unified_problem_sources (group_name);
    CREATE UNIQUE INDEX IF NOT EXISTS unified_problem_records_source_item_uidx ON unified_problem_records (source_id, source_file, source_index);
    CREATE INDEX IF NOT EXISTS unified_problem_records_dataset_split_idx ON unified_problem_records (dataset_id, source_split);
    CREATE INDEX IF NOT EXISTS unified_problem_records_group_idx ON unified_problem_records (group_name, dataset_id);
    CREATE INDEX IF NOT EXISTS unified_problem_records_shape_idx ON unified_problem_records (construction, modality);
    CREATE INDEX IF NOT EXISTS unified_problem_records_taxonomy_idx ON unified_problem_records (subject, grade);
  `);
}

function toUnifiedRecord(problemCase: ProblemCase, sourceFile: string): UnifiedGaokaoRecord | null {
  const prompt = normalizePrompt(problemCase.input?.text);
  if (!prompt) return null;

  const metadata = problemCase.metadata ?? {};
  const sourceItemId = metadata.sourceItemId ?? problemCase.id;
  const construction = normalizeConstruction(metadata.sourceQuestionType, problemCase.id);
  const choices = construction === "multiple_choice" ? extractChoices(prompt, answerLabels(problemCase)) : [];
  const finalAnswer = normalizeFinalAnswer(problemCase.expected?.answer ?? problemCase.oracle?.knownAnswer);
  const sourceIndex = typeof metadata.sourceIndex === "number" && Number.isInteger(metadata.sourceIndex)
    ? metadata.sourceIndex
    : fallbackIndexFromId(problemCase.id);
  const tags = compact([
    ...(problemCase.tags ?? []),
    metadata.sourcePaper,
    metadata.sourceYear ? `year-${metadata.sourceYear}` : undefined,
    metadata.sourceQuestionType,
    metadata.sourceCategory,
    metadata.visualPotential ? "visual-candidate" : undefined,
    metadata.conversionStatus
  ]);

  return {
    id: problemCase.id,
    source: {
      datasetId,
      requestedId,
      group: groupName,
      commit: gitRevision(sourceRef),
      license,
      sourceFile: metadata.sourcePath ?? sourceFile.replace(/^data\/problem-cases\//, "converted-cases/"),
      sourceIndex,
      sourceSplit: problemCase.split ?? "all",
      sourceItemId
    },
    modality: "text",
    construction,
    prompt,
    answer: dropEmpty({
      final: finalAnswer,
      type: answerType(construction, finalAnswer),
      choices: choices.length > 0 ? choices : undefined,
      solution: scalarToText(problemCase.expected?.answer),
      analysis: metadata.sourceAnalysis
    }),
    media: [],
    taxonomy: dropEmpty({
      language: "zh",
      subject: "math",
      grade: "gaokao",
      gradeGroup: "high-school",
      difficulty: problemCase.difficulty,
      knowledge: (metadata.sourceTopics ?? []).map((topic) => topic.replaceAll("_", "-")),
      skills: compact([problemCase.taskType]),
      tags
    }),
    raw: problemCase
  };
}

function normalizePrompt(value: string | undefined): string | null {
  if (!value) return null;
  let text = value.trim();
  text = text.replace(/^【GAOKAO-Bench\s+源题\s+[^\]]+】\s*/i, "");
  text = text.replace(/\n\n请完成数学分析，必要时用表格、数轴、函数图像或简洁示意辅助讲解，并给出适合学生复盘的说明。$/u, "");
  text = text.replace(/\n\n请先完成数学分析，再生成适合教学复核的 GeoGebra 可视化，并说明图形如何支持结论。$/u, "");
  return text.trim() || null;
}

function normalizeConstruction(questionType: string | undefined, id: string): UnifiedGaokaoRecord["construction"] {
  const value = (questionType ?? id).toLowerCase();
  if (value.includes("mcq")) return "multiple_choice";
  if (value.includes("fill")) return "fill_blank";
  return "open_ended";
}

function normalizeFinalAnswer(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(",");
  return scalarToText(value);
}

function answerType(construction: string, finalAnswer: string | undefined): string {
  if (construction === "multiple_choice") {
    return finalAnswer?.includes(",") ? "multi_label" : "label";
  }
  if (construction === "fill_blank") return "free_form";
  return finalAnswer ? "free_form" : "unknown";
}

function answerLabels(problemCase: ProblemCase): Set<string> {
  const answer = problemCase.expected?.answer ?? problemCase.oracle?.knownAnswer;
  if (Array.isArray(answer)) return new Set(answer.map((item) => String(item).trim()).filter(Boolean));
  const text = scalarToText(answer);
  if (!text) return new Set();
  return new Set(text.split(/\s*,\s*/).filter(Boolean));
}

function extractChoices(prompt: string, correctLabels: Set<string>): Array<Record<string, unknown>> {
  const choices: Array<Record<string, unknown>> = [];
  const pattern = /(?:^|\n)\s*([A-D])[\.\uff0e]\s*([^\n]+)/g;
  for (const match of prompt.matchAll(pattern)) {
    choices.push({
      label: match[1],
      text: match[2].trim(),
      isCorrect: correctLabels.has(match[1])
    });
  }
  return choices;
}

function fallbackIndexFromId(id: string): number {
  const match = id.match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function gitLsFiles(glob: string): string[] {
  const result = spawnSync("git", ["ls-files", glob], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ls-files failed for ${glob}`);
  }
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function gitShow(spec: string): string {
  const result = spawnSync("git", ["show", spec], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git show failed for ${spec}`);
  }
  return result.stdout;
}

function gitRevision(ref: string): string {
  const result = spawnSync("git", ["rev-parse", ref], { encoding: "utf8" });
  if (result.status !== 0) return ref;
  return result.stdout.trim() || ref;
}

function sourceSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function scalarToText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(",");
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value).trim();
  return text || undefined;
}

function nullableText(value: unknown): string | null {
  return scalarToText(value) ?? null;
}

function dropEmpty(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (item === null || item === undefined || item === "") return false;
    if (Array.isArray(item) && item.length === 0) return false;
    return !(typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 0);
  }));
}

function compact(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function hashJson(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}
