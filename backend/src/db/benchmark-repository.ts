import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { createDatabase } from "./client";
import {
  benchmarkCaseResults as sqliteBenchmarkCaseResults,
  benchmarkRuns as sqliteBenchmarkRuns
} from "./schema";

type SqliteDatabase = ReturnType<typeof createDatabase>;
type BenchmarkRunRow = typeof sqliteBenchmarkRuns.$inferSelect;
type BenchmarkCaseResultRow = typeof sqliteBenchmarkCaseResults.$inferSelect;

export type BenchmarkRunStatus = "running" | "completed" | "failed" | "interrupted" | "cancelled";
export type BenchmarkCaseResultStatus = "passed" | "failed" | "error" | "skipped";
export type BenchmarkJsonObject = Record<string, unknown>;
export type BenchmarkEvidenceRef = { type: string; uri: string; label?: string };

export type BenchmarkRun = {
  id: string;
  suiteId: string;
  suiteVersion: string;
  suiteHash: string;
  configHash: string;
  status: BenchmarkRunStatus;
  totalCases: number;
  completedCases: number;
  passedCases: number;
  failedCases: number;
  config: BenchmarkJsonObject;
  metrics: BenchmarkJsonObject;
  evidenceRefs: BenchmarkEvidenceRef[];
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type BenchmarkCaseResult = {
  id: string;
  runId: string;
  caseId: string;
  status: BenchmarkCaseResultStatus;
  score: number | null;
  metrics: BenchmarkJsonObject;
  evidenceRefs: BenchmarkEvidenceRef[];
  error: string | null;
  startedAt: string | null;
  completedAt: string;
};

export type CreateBenchmarkRunInput = {
  suiteId: string;
  suiteVersion: string;
  suiteHash: string;
  configHash: string;
  totalCases: number;
  config: BenchmarkJsonObject;
  ownerUserId?: string | null;
};

export type UpsertBenchmarkCaseResultInput = {
  caseId: string;
  status: BenchmarkCaseResultStatus;
  score?: number | null;
  metrics?: BenchmarkJsonObject;
  evidenceRefs?: BenchmarkEvidenceRef[];
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string;
};

export type FinishBenchmarkRunInput = {
  status: Exclude<BenchmarkRunStatus, "running">;
  metrics?: BenchmarkJsonObject;
  evidenceRefs?: BenchmarkEvidenceRef[];
  error?: string | null;
};

export type BenchmarkRepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "not_found" | "invalid_state" | "incomplete" | "case_limit_exceeded" };

export type BenchmarkRepository = {
  createRun(input: CreateBenchmarkRunInput): Promise<BenchmarkRun>;
  listRuns(scope?: { ownerUserId?: string | null; limit?: number }): Promise<BenchmarkRun[]>;
  getRun(id: string, scope?: { ownerUserId?: string | null }): Promise<{ run: BenchmarkRun; results: BenchmarkCaseResult[] } | undefined>;
  upsertCaseResult(
    runId: string,
    input: UpsertBenchmarkCaseResultInput,
    scope?: { ownerUserId?: string | null }
  ): Promise<BenchmarkRepositoryResult<{ run: BenchmarkRun; result: BenchmarkCaseResult }>>;
  finishRun(
    runId: string,
    input: FinishBenchmarkRunInput,
    scope?: { ownerUserId?: string | null }
  ): Promise<BenchmarkRepositoryResult<BenchmarkRun>>;
};

export function createBenchmarkRepository(db: SqliteDatabase): BenchmarkRepository {
  return {
    async createRun(input) {
      const now = new Date();
      const row = {
        id: crypto.randomUUID(),
        ownerUserId: input.ownerUserId ?? null,
        suiteId: input.suiteId,
        suiteVersion: input.suiteVersion,
        suiteHash: input.suiteHash,
        configHash: input.configHash,
        status: "running" as const,
        totalCases: input.totalCases,
        completedCases: 0,
        passedCases: 0,
        failedCases: 0,
        config: input.config,
        metrics: {},
        evidenceRefs: [],
        error: null,
        startedAt: now,
        completedAt: null
      };
      db.insert(sqliteBenchmarkRuns).values(row).run();
      return benchmarkRunFromRow(row);
    },

    async listRuns(scope) {
      return db
        .select()
        .from(sqliteBenchmarkRuns)
        .where(ownerCondition(scope))
        .orderBy(desc(sqliteBenchmarkRuns.startedAt))
        .limit(Math.min(Math.max(scope?.limit ?? 50, 1), 200))
        .all()
        .map(benchmarkRunFromRow);
    },

    async getRun(id, scope) {
      const row = findRun(db, id, scope);
      if (!row) return undefined;
      return {
        run: benchmarkRunFromRow(row),
        results: db
          .select()
          .from(sqliteBenchmarkCaseResults)
          .where(eq(sqliteBenchmarkCaseResults.runId, id))
          .orderBy(asc(sqliteBenchmarkCaseResults.completedAt))
          .all()
          .map(benchmarkCaseResultFromRow)
      };
    },

    async upsertCaseResult(runId, input, scope) {
      const run = findRun(db, runId, scope);
      if (!run) return { ok: false, reason: "not_found" };
      if (run.status !== "running") return { ok: false, reason: "invalid_state" };
      const existing = db
        .select()
        .from(sqliteBenchmarkCaseResults)
        .where(and(eq(sqliteBenchmarkCaseResults.runId, runId), eq(sqliteBenchmarkCaseResults.caseId, input.caseId)))
        .get();
      const currentCount = db.select().from(sqliteBenchmarkCaseResults).where(eq(sqliteBenchmarkCaseResults.runId, runId)).all().length;
      if (!existing && currentCount >= run.totalCases) return { ok: false, reason: "case_limit_exceeded" };

      const completedAt = parseDate(input.completedAt) ?? new Date();
      const startedAt = input.startedAt === null ? null : parseDate(input.startedAt) ?? existing?.startedAt ?? null;
      const resultRow = {
        id: existing?.id ?? crypto.randomUUID(),
        runId,
        caseId: input.caseId,
        status: input.status,
        score: input.score ?? null,
        metrics: input.metrics ?? {},
        evidenceRefs: input.evidenceRefs ?? [],
        error: input.error ?? null,
        startedAt,
        completedAt
      };

      db.transaction((tx) => {
        tx.insert(sqliteBenchmarkCaseResults)
          .values(resultRow)
          .onConflictDoUpdate({
            target: [sqliteBenchmarkCaseResults.runId, sqliteBenchmarkCaseResults.caseId],
            set: {
              status: resultRow.status,
              score: resultRow.score,
              metrics: resultRow.metrics,
              evidenceRefs: resultRow.evidenceRefs,
              error: resultRow.error,
              startedAt: resultRow.startedAt,
              completedAt: resultRow.completedAt
            }
          })
          .run();
        const results = tx
          .select()
          .from(sqliteBenchmarkCaseResults)
          .where(eq(sqliteBenchmarkCaseResults.runId, runId))
          .all();
        tx.update(sqliteBenchmarkRuns)
          .set({
            completedCases: results.length,
            passedCases: results.filter((result) => result.status === "passed").length,
            failedCases: results.filter((result) => result.status === "failed" || result.status === "error").length
          })
          .where(eq(sqliteBenchmarkRuns.id, runId))
          .run();
      });

      const updatedRun = findRun(db, runId, scope);
      const updatedResult = db
        .select()
        .from(sqliteBenchmarkCaseResults)
        .where(and(eq(sqliteBenchmarkCaseResults.runId, runId), eq(sqliteBenchmarkCaseResults.caseId, input.caseId)))
        .get();
      if (!updatedRun || !updatedResult) return { ok: false, reason: "not_found" };
      return { ok: true, value: { run: benchmarkRunFromRow(updatedRun), result: benchmarkCaseResultFromRow(updatedResult) } };
    },

    async finishRun(runId, input, scope) {
      const run = findRun(db, runId, scope);
      if (!run) return { ok: false, reason: "not_found" };
      if (run.status !== "running") return { ok: false, reason: "invalid_state" };
      if (input.status === "completed" && run.completedCases !== run.totalCases) {
        return { ok: false, reason: "incomplete" };
      }
      const completedAt = new Date();
      db.update(sqliteBenchmarkRuns)
        .set({
          status: input.status,
          metrics: input.metrics ?? run.metrics,
          evidenceRefs: input.evidenceRefs ?? run.evidenceRefs,
          error: input.error ?? null,
          completedAt
        })
        .where(eq(sqliteBenchmarkRuns.id, runId))
        .run();
      const updated = findRun(db, runId, scope);
      return updated
        ? { ok: true, value: benchmarkRunFromRow(updated) }
        : { ok: false, reason: "not_found" };
    }
  };
}

function ownerCondition(scope?: { ownerUserId?: string | null }) {
  const ownerUserId = scope?.ownerUserId ?? null;
  return ownerUserId ? eq(sqliteBenchmarkRuns.ownerUserId, ownerUserId) : isNull(sqliteBenchmarkRuns.ownerUserId);
}

function findRun(db: SqliteDatabase, id: string, scope?: { ownerUserId?: string | null }) {
  return db
    .select()
    .from(sqliteBenchmarkRuns)
    .where(and(eq(sqliteBenchmarkRuns.id, id), ownerCondition(scope)))
    .get();
}

function benchmarkRunFromRow(row: BenchmarkRunRow): BenchmarkRun {
  return {
    id: row.id,
    suiteId: row.suiteId,
    suiteVersion: row.suiteVersion,
    suiteHash: row.suiteHash,
    configHash: row.configHash,
    status: row.status,
    totalCases: row.totalCases,
    completedCases: row.completedCases,
    passedCases: row.passedCases,
    failedCases: row.failedCases,
    config: asJsonObject(row.config),
    metrics: asJsonObject(row.metrics),
    evidenceRefs: asEvidenceRefs(row.evidenceRefs),
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null
  };
}

function benchmarkCaseResultFromRow(row: BenchmarkCaseResultRow): BenchmarkCaseResult {
  return {
    id: row.id,
    runId: row.runId,
    caseId: row.caseId,
    status: row.status,
    score: row.score,
    metrics: asJsonObject(row.metrics),
    evidenceRefs: asEvidenceRefs(row.evidenceRefs),
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt.toISOString()
  };
}

function asJsonObject(value: unknown): BenchmarkJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as BenchmarkJsonObject
    : {};
}

function asEvidenceRefs(value: unknown): BenchmarkEvidenceRef[] {
  return Array.isArray(value) ? value.filter(isEvidenceRef) : [];
}

function isEvidenceRef(value: unknown): value is BenchmarkEvidenceRef {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.type === "string" && typeof candidate.uri === "string";
}

function parseDate(value: string | null | undefined) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}
