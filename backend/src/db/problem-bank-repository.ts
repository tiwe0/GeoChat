import { existsSync } from "node:fs";
import { asc, desc, eq, isNull } from "drizzle-orm";
import type {
  MigrationProblemAttempt,
  ProblemDetail,
  ProblemImportResponse,
  ProblemListResponse,
  ProblemSetSummary,
  ProblemSummary
} from "@geochat-ai/app";
import type { GeoChatDatabaseRuntimeConfig } from "./runtime";
import type { createDatabase } from "./client";
import { buildLocalProblemBankImportPlan } from "../problem-bank/import-plan";
import { createProblemCaseSets } from "../problem-bank/set-builder";
import { normalizeProblemPrompt, normalizeProblemTitle } from "../problem-bank/transform";
import { problemBankSourceId, type ImportedProblem, type ProblemBankSourceSnapshot, type ProblemCaseSet } from "../problem-bank/types";
import {
  problemAttempts as sqliteProblemAttempts,
  problemSetItems as sqliteProblemSetItems,
  problemSets as sqliteProblemSets,
  problemSources as sqliteProblemSources,
  problemTags as sqliteProblemTags,
  problemTopics as sqliteProblemTopics,
  problems as sqliteProblems
} from "./schema";

type SqliteDatabase = ReturnType<typeof createDatabase>;
type ProblemRow = typeof sqliteProblems.$inferSelect;
type ProblemSetRow = typeof sqliteProblemSets.$inferSelect;
type ProblemSetItemRow = typeof sqliteProblemSetItems.$inferSelect;
type ProblemAttemptRow = typeof sqliteProblemAttempts.$inferSelect;

export type ProblemListFilters = {
  query?: string;
  difficulty?: string;
  questionType?: string;
  year?: string;
  paper?: string;
  topic?: string;
  taskType?: string;
  visualOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type ProblemAttemptInput = {
  conversationId: string;
  ownerUserId?: string | null;
  runId?: string | null;
  modelProvider?: string | null;
  modelId?: string | null;
};

export type ProblemAttemptResponse = {
  attempt: {
    id: string;
    problemId: string;
    conversationId: string;
    ownerUserId: string | null;
    runId: string | null;
    status: "started";
    modelProvider: string | null;
    modelId: string | null;
    startedAt: string;
    completedAt: null;
    userRating: null;
    notes: null;
  };
};

export type ProblemAttemptScope = {
  ownerUserId?: string | null;
};

export type ProblemBankRepository = {
  ensureSeeded(sourcePath: string): Promise<void>;
  importFromCases(sourcePath: string): Promise<ProblemImportResponse>;
  listProblemSets(): Promise<ProblemSetSummary[]>;
  listProblemsForSet(setIdOrSlug: string, filters?: ProblemListFilters): Promise<ProblemListResponse>;
  getProblemDetail(problemId: string): Promise<ProblemDetail | undefined>;
  listProblemAttempts(scope?: ProblemAttemptScope): Promise<MigrationProblemAttempt[]>;
  recordProblemAttempt(problemId: string, input: ProblemAttemptInput): Promise<ProblemAttemptResponse | undefined>;
};

export function createProblemBankRepository(config: GeoChatDatabaseRuntimeConfig, sqliteDb: SqliteDatabase): ProblemBankRepository {
  void config;
  return createSqliteProblemBankRepository(sqliteDb);
}

function createSqliteProblemBankRepository(db: SqliteDatabase): ProblemBankRepository {
  let seedAttempted = false;

  return {
    async ensureSeeded(sourcePath) {
      if (seedAttempted) return;
      seedAttempted = true;
      if (db.select().from(sqliteProblems).limit(1).all().length) {
        upsertSqliteDerivedSets(db);
        return;
      }
      await this.importFromCases(sourcePath);
    },
    async importFromCases(sourcePath) {
      if (!existsSync(sourcePath)) return missingCasesResponse(sourcePath);
      const plan = buildLocalProblemBankImportPlan(sourcePath);
      const existing = db.select().from(sqliteProblemSources).where(eq(sqliteProblemSources.id, problemBankSourceId)).get();
      const existingProblemCount = db.select().from(sqliteProblems).where(eq(sqliteProblems.sourceId, problemBankSourceId)).all().length;
      if (existing?.sourceHash === plan.source.sourceHash && existingProblemCount > 0) {
        upsertSqliteDerivedSets(db);
        return { imported: existingProblemCount, sets: (await this.listProblemSets()).length, skipped: true, sourcePath };
      }

      const now = new Date();
      db.transaction((tx) => {
        tx.insert(sqliteProblemSources)
          .values(problemSourceValues(plan.source, now))
          .onConflictDoUpdate({
            target: sqliteProblemSources.id,
            set: {
              sourcePath,
              sourceHash: plan.source.sourceHash,
              importedAt: now,
              rawMetadata: { fileCount: plan.source.fileCount, caseCount: plan.source.caseCount }
            }
          })
          .run();

        for (const problem of plan.problems) {
          tx.insert(sqliteProblems)
            .values(problemRowValues(problem, now))
            .onConflictDoUpdate({
              target: sqliteProblems.id,
              set: problemRowUpdateValues(problem, now)
            })
            .run();
          for (const tag of problem.tags) tx.insert(sqliteProblemTags).values({ problemId: problem.id, tag }).onConflictDoNothing().run();
          for (const topic of problem.topics) tx.insert(sqliteProblemTopics).values({ problemId: problem.id, topic }).onConflictDoNothing().run();
        }

        upsertSqliteProblemSets(tx, plan.sets, now);
      });

      return { imported: plan.problems.length, sets: plan.sets.length, skipped: false, sourcePath };
    },
    async listProblemSets() {
      return listProblemSetsFromRows(db.select().from(sqliteProblemSets).orderBy(asc(sqliteProblemSets.createdAt)).all(), db.select().from(sqliteProblemSetItems).all());
    },
    async listProblemsForSet(setIdOrSlug, filters = {}) {
      const set = db.select().from(sqliteProblemSets).where(eq(sqliteProblemSets.id, setIdOrSlug)).get()
        ?? db.select().from(sqliteProblemSets).where(eq(sqliteProblemSets.slug, setIdOrSlug)).get();
      if (!set) return emptyProblemList(filters);
      const setItems = db.select().from(sqliteProblemSetItems).where(eq(sqliteProblemSetItems.setId, set.id)).orderBy(asc(sqliteProblemSetItems.sortOrder)).all();
      return listProblemsFromRows(db.select().from(sqliteProblems).all(), setItems, sqliteProblemTagsById(db), sqliteProblemTopicsById(db), filters);
    },
    async getProblemDetail(problemId) {
      const row = db.select().from(sqliteProblems).where(eq(sqliteProblems.id, problemId)).get();
      return row ? problemDetailFromRow(row, sqliteProblemTagsById(db), sqliteProblemTopicsById(db)) : undefined;
    },
    async listProblemAttempts(scope) {
      return db
        .select()
        .from(sqliteProblemAttempts)
        .where(sqliteProblemAttemptOwnerCondition(scope))
        .orderBy(desc(sqliteProblemAttempts.startedAt))
        .limit(500)
        .all()
        .map(problemAttemptFromRow);
    },
    async recordProblemAttempt(problemId, input) {
      const problem = db.select().from(sqliteProblems).where(eq(sqliteProblems.id, problemId)).get();
      if (!problem) return undefined;
      const now = new Date();
      const attempt = problemAttemptValues(problemId, input, now);
      db.insert(sqliteProblemAttempts).values({ ...attempt, startedAt: now }).run();
      return { attempt: { ...attempt, startedAt: now.toISOString() } };
    }
  };
}

function missingCasesResponse(sourcePath: string): ProblemImportResponse {
  return {
    imported: 0,
    sets: 0,
    skipped: true,
    sourcePath,
    message: "GeoChat benchmark cases directory was not found."
  };
}

function problemSourceValues(source: ProblemBankSourceSnapshot, now: Date) {
  return {
    id: source.id,
    kind: source.kind,
    name: source.name,
    version: source.version,
    sourcePath: source.sourcePath,
    sourceHash: source.sourceHash,
    importedAt: now,
    rawMetadata: { fileCount: source.fileCount, caseCount: source.caseCount }
  };
}

function problemRowValues(problem: ImportedProblem, now: Date) {
  return {
    id: problem.id,
    sourceId: problem.sourceId,
    sourceItemId: problem.sourceItemId,
    title: problem.title,
    prompt: problem.prompt,
    answer: problem.answer,
    analysis: problem.analysis,
    kind: problem.kind,
    taskType: problem.taskType,
    questionType: problem.questionType,
    paper: problem.paper,
    year: problem.year,
    score: problem.score,
    category: problem.category,
    difficulty: problem.difficulty,
    visualPotential: problem.visualPotential,
    rawPayload: problem.rawPayload,
    createdAt: now,
    updatedAt: now
  };
}

function problemRowUpdateValues(problem: ImportedProblem, now: Date) {
  return {
    title: problem.title,
    prompt: problem.prompt,
    answer: problem.answer,
    analysis: problem.analysis,
    kind: problem.kind,
    taskType: problem.taskType,
    questionType: problem.questionType,
    paper: problem.paper,
    year: problem.year,
    score: problem.score,
    category: problem.category,
    difficulty: problem.difficulty,
    visualPotential: problem.visualPotential,
    rawPayload: problem.rawPayload,
    updatedAt: now
  };
}

function problemAttemptValues(problemId: string, input: ProblemAttemptInput, now: Date) {
  void now;
  return {
    id: crypto.randomUUID(),
    problemId,
    conversationId: input.conversationId,
    ownerUserId: input.ownerUserId ?? null,
    runId: input.runId ?? null,
    status: "started" as const,
    modelProvider: input.modelProvider ?? null,
    modelId: input.modelId ?? null,
    completedAt: null,
    userRating: null,
    notes: null
  };
}

function sqliteProblemAttemptOwnerCondition(scope?: ProblemAttemptScope) {
  const ownerUserId = scope?.ownerUserId ?? null;
  return ownerUserId ? eq(sqliteProblemAttempts.ownerUserId, ownerUserId) : isNull(sqliteProblemAttempts.ownerUserId);
}

function problemAttemptFromRow(row: ProblemAttemptRow): MigrationProblemAttempt {
  return {
    id: row.id,
    problemId: row.problemId,
    conversationId: row.conversationId,
    ownerUserId: row.ownerUserId,
    runId: row.runId,
    status: row.status,
    modelProvider: row.modelProvider,
    modelId: row.modelId,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    userRating: row.userRating,
    notes: row.notes
  };
}

function upsertSqliteDerivedSets(db: SqliteDatabase) {
  const rows = db.select().from(sqliteProblems).all();
  if (!rows.length) return;
  const tagMap = sqliteProblemTagsById(db);
  const topicMap = sqliteProblemTopicsById(db);
  const importedProblems = rows.map((row) => importedProblemFromRow(row, tagMap, topicMap));
  upsertSqliteProblemSets(db, createProblemCaseSets(importedProblems), new Date());
}

function upsertSqliteProblemSets(
  store: SqliteDatabase | Parameters<Parameters<SqliteDatabase["transaction"]>[0]>[0],
  sets: ProblemCaseSet[],
  now: Date
) {
  for (const set of sets) {
    store.insert(sqliteProblemSets)
      .values({ id: set.id, slug: set.slug, title: set.title, description: set.description, sourceId: problemBankSourceId, kind: set.kind, createdAt: now })
      .onConflictDoUpdate({ target: sqliteProblemSets.id, set: { title: set.title, description: set.description, kind: set.kind } })
      .run();

    set.problemIds.forEach((problemId, index) => {
      store.insert(sqliteProblemSetItems)
        .values({ setId: set.id, problemId, sortOrder: index })
        .onConflictDoUpdate({ target: [sqliteProblemSetItems.setId, sqliteProblemSetItems.problemId], set: { sortOrder: index } })
        .run();
    });
  }
}

function listProblemSetsFromRows(sets: ProblemSetRow[], items: ProblemSetItemRow[]): ProblemSetSummary[] {
  return sets.map((set) => ({
    id: set.id,
    slug: set.slug,
    title: set.title,
    description: set.description,
    kind: set.kind,
    problemCount: items.filter((item) => item.setId === set.id).length
  }));
}

function listProblemsFromRows(
  rows: ProblemRow[],
  setItems: ProblemSetItemRow[],
  tagMap: Map<string, string[]>,
  topicMap: Map<string, string[]>,
  filters: ProblemListFilters
): ProblemListResponse {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const limit = clampNumber(Number(filters.limit ?? 40), 1, 120);
  const offset = clampNumber(Number(filters.offset ?? 0), 0, 20_000);
  const order = new Map(setItems.map((item) => [item.problemId, item.sortOrder]));
  const setProblemIds = new Set(setItems.map((item) => item.problemId));
  const problems = rows
    .filter((problem) => setProblemIds.has(problem.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((problem) => problemSummaryFromRow(problem, tagMap, topicMap))
    .filter((problem) => {
      if (query && !`${problem.title} ${problem.prompt} ${problem.tags.join(" ")} ${problem.topics.join(" ")}`.toLowerCase().includes(query)) return false;
      if (filters.difficulty && problem.difficulty !== filters.difficulty) return false;
      if (filters.questionType && problem.questionType !== filters.questionType) return false;
      if (filters.year && problem.year !== filters.year) return false;
      if (filters.paper && problem.paper !== filters.paper) return false;
      if (filters.taskType && problem.taskType !== filters.taskType) return false;
      if (filters.topic && !problem.topics.includes(filters.topic) && !problem.tags.includes(filters.topic)) return false;
      if (filters.visualOnly && !problem.visualPotential) return false;
      return true;
    });
  return { problems: problems.slice(offset, offset + limit), total: problems.length, limit, offset };
}

function emptyProblemList(filters: ProblemListFilters): ProblemListResponse {
  return {
    problems: [],
    total: 0,
    limit: clampNumber(Number(filters.limit ?? 40), 1, 120),
    offset: clampNumber(Number(filters.offset ?? 0), 0, 20_000)
  };
}

function problemDetailFromRow(row: ProblemRow, tagMap: Map<string, string[]>, topicMap: Map<string, string[]>): ProblemDetail {
  return {
    ...problemSummaryFromRow(row, tagMap, topicMap),
    answer: row.answer,
    analysis: row.analysis,
    rawPayload: row.rawPayload
  };
}

function problemSummaryFromRow(row: ProblemRow, tagMap: Map<string, string[]>, topicMap: Map<string, string[]>): ProblemSummary {
  return {
    id: row.id,
    sourceItemId: row.sourceItemId,
    title: normalizeProblemTitle(row.title),
    prompt: normalizeProblemPrompt(row.prompt),
    kind: row.kind,
    taskType: row.taskType,
    questionType: row.questionType,
    paper: row.paper,
    year: row.year,
    score: row.score,
    category: row.category,
    difficulty: row.difficulty,
    visualPotential: row.visualPotential,
    media: problemMediaFromRawPayload(row.rawPayload),
    tags: tagMap.get(row.id) ?? [],
    topics: topicMap.get(row.id) ?? []
  };
}

function importedProblemFromRow(row: ProblemRow, tagMap: Map<string, string[]>, topicMap: Map<string, string[]>): ImportedProblem {
  const summary = problemSummaryFromRow(row, tagMap, topicMap);
  return {
    ...summary,
    sourceId: row.sourceId,
    answer: row.answer,
    analysis: row.analysis,
    tags: [...summary.tags],
    topics: [...summary.topics],
    rawPayload: row.rawPayload
  };
}

function sqliteProblemTagsById(db: SqliteDatabase) {
  const map = new Map<string, string[]>();
  for (const row of db.select().from(sqliteProblemTags).all()) map.set(row.problemId, [...(map.get(row.problemId) ?? []), row.tag]);
  return map;
}

function sqliteProblemTopicsById(db: SqliteDatabase) {
  const map = new Map<string, string[]>();
  for (const row of db.select().from(sqliteProblemTopics).all()) map.set(row.problemId, [...(map.get(row.problemId) ?? []), row.topic]);
  return map;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function problemMediaFromRawPayload(rawPayload: unknown): ProblemSummary["media"] {
  const candidates = [
    rawPayload && typeof rawPayload === "object" ? (rawPayload as Record<string, unknown>).media : undefined,
    rawPayload && typeof rawPayload === "object" ? (rawPayload as Record<string, unknown>).sourceMedia : undefined,
    rawPayload && typeof rawPayload === "object" && typeof (rawPayload as Record<string, unknown>).metadata === "object"
      ? ((rawPayload as Record<string, unknown>).metadata as Record<string, unknown>).sourceMedia
      : undefined
  ];

  for (const candidate of candidates) {
    const media = normalizeProblemMedia(candidate);
    if (media.length) return media;
  }

  return [];
}

function normalizeProblemMedia(value: unknown): ProblemSummary["media"] {
  const items = Array.isArray(value) ? value : [];
  return items.map(normalizeProblemMediaItem).filter((item): item is ProblemSummary["media"][number] => Boolean(item));
}

function normalizeProblemMediaItem(value: unknown): ProblemSummary["media"][number] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (item.kind !== "image") return undefined;
  const path = stringifyMediaText(item.path);
  const url = stringifyMediaText(item.url);
  if (!path && !url) return undefined;
  return {
    kind: "image",
    path,
    url,
    r2Key: stringifyMediaText(item.r2Key),
    r2Url: stringifyMediaText(item.r2Url),
    trackingUrl: stringifyMediaText(item.trackingUrl),
    sha256: stringifyMediaText(item.sha256),
    byteSize: normalizeMediaNumber(item.byteSize),
    contentType: stringifyMediaText(item.contentType),
    width: normalizeMediaNumber(item.width),
    height: normalizeMediaNumber(item.height),
    alt: stringifyMediaText(item.alt)
  };
}

function stringifyMediaText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeMediaNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
