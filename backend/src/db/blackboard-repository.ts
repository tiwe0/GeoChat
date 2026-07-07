import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  isBlackboardCategory,
  type BlackboardEntry,
  type BlackboardPatchResult,
  type PatchBlackboardArgs,
  type ReadBlackboardArgs
} from "@geochat-ai/app";
import type { GeoChatDatabaseRuntimeConfig } from "./runtime";
import type { createDatabase } from "./client";
import { conversationBlackboardEntries as sqliteConversationBlackboardEntries } from "./schema";

type SqliteDatabase = ReturnType<typeof createDatabase>;
type BlackboardEntryRow = typeof sqliteConversationBlackboardEntries.$inferSelect;

export type BlackboardRepository = {
  listEntries(conversationId: string, args?: ReadBlackboardArgs): Promise<BlackboardEntry[]>;
  patchEntries(
    conversationId: string,
    args: PatchBlackboardArgs,
    context: { runId: string; toolCallId: string }
  ): Promise<BlackboardPatchResult>;
};

export function createBlackboardRepository(config: GeoChatDatabaseRuntimeConfig, sqliteDb: SqliteDatabase): BlackboardRepository {
  void config;
  return createSqliteBlackboardRepository(sqliteDb);
}

function createSqliteBlackboardRepository(db: SqliteDatabase): BlackboardRepository {
  return {
    async listEntries(conversationId, args = {}) {
      const categories = (args.categories ?? []).filter(isBlackboardCategory);
      const limit = blackboardLimit(args.limit);
      const includeArchived = args.includeArchived === true;
      const whereClause = categories.length && !includeArchived
        ? and(
            eq(sqliteConversationBlackboardEntries.conversationId, conversationId),
            eq(sqliteConversationBlackboardEntries.status, "active"),
            inArray(sqliteConversationBlackboardEntries.category, categories)
          )
        : categories.length
          ? and(
              eq(sqliteConversationBlackboardEntries.conversationId, conversationId),
              inArray(sqliteConversationBlackboardEntries.category, categories)
            )
          : includeArchived
            ? eq(sqliteConversationBlackboardEntries.conversationId, conversationId)
            : and(
                eq(sqliteConversationBlackboardEntries.conversationId, conversationId),
                eq(sqliteConversationBlackboardEntries.status, "active")
              );

      return db
        .select()
        .from(sqliteConversationBlackboardEntries)
        .where(whereClause)
        .orderBy(asc(sqliteConversationBlackboardEntries.category), desc(sqliteConversationBlackboardEntries.updatedAt))
        .limit(limit)
        .all()
        .map(blackboardEntryFromRow);
    },
    async patchEntries(conversationId, args, context) {
      validateBlackboardPatchArgs(args);
      let changed = 0;
      let archived = 0;
      db.transaction((tx) => {
        for (const op of args.ops) {
          const key = normalizeBlackboardKey(op.key);
          const reason = normalizeBlackboardText(op.reason ?? args.reason ?? "Agent marked this memory as important.", 360);
          const now = new Date();
          if (op.op === "archive") {
            tx.update(sqliteConversationBlackboardEntries)
              .set({
                status: "archived",
                reason,
                updatedAt: now,
                archivedAt: now,
                sourceRunId: op.sourceRunId?.trim() || context.runId,
                sourceToolCallId: op.sourceToolCallId?.trim() || context.toolCallId,
                sourceMessageId: op.sourceMessageId?.trim() || null
              })
              .where(and(eq(sqliteConversationBlackboardEntries.conversationId, conversationId), eq(sqliteConversationBlackboardEntries.key, key)))
              .run();
            changed += 1;
            archived += 1;
            continue;
          }

          const upsert = normalizedBlackboardUpsert(op, args.reason, context);
          tx.insert(sqliteConversationBlackboardEntries)
            .values({
              id: crypto.randomUUID(),
              conversationId,
              key,
              ...upsert,
              createdAt: now,
              updatedAt: now,
              archivedAt: null
            })
            .onConflictDoUpdate({
              target: [sqliteConversationBlackboardEntries.conversationId, sqliteConversationBlackboardEntries.key],
              set: {
                ...upsert,
                updatedAt: now,
                archivedAt: null
              }
            })
            .run();
          changed += 1;
        }
      });
      return {
        entries: await listSqliteBlackboardEntries(db, conversationId, { includeArchived: false, limit: 30 }),
        changed,
        archived
      };
    }
  };
}

function listSqliteBlackboardEntries(db: SqliteDatabase, conversationId: string, args: ReadBlackboardArgs = {}) {
  const categories = (args.categories ?? []).filter(isBlackboardCategory);
  const limit = blackboardLimit(args.limit);
  const includeArchived = args.includeArchived === true;
  const whereClause = categories.length && !includeArchived
    ? and(
        eq(sqliteConversationBlackboardEntries.conversationId, conversationId),
        eq(sqliteConversationBlackboardEntries.status, "active"),
        inArray(sqliteConversationBlackboardEntries.category, categories)
      )
    : categories.length
      ? and(
          eq(sqliteConversationBlackboardEntries.conversationId, conversationId),
          inArray(sqliteConversationBlackboardEntries.category, categories)
        )
      : includeArchived
        ? eq(sqliteConversationBlackboardEntries.conversationId, conversationId)
        : and(
            eq(sqliteConversationBlackboardEntries.conversationId, conversationId),
            eq(sqliteConversationBlackboardEntries.status, "active")
          );

  return db
    .select()
    .from(sqliteConversationBlackboardEntries)
    .where(whereClause)
    .orderBy(asc(sqliteConversationBlackboardEntries.category), desc(sqliteConversationBlackboardEntries.updatedAt))
    .limit(limit)
    .all()
    .map(blackboardEntryFromRow);
}

function blackboardLimit(value: unknown) {
  const limit = Number(value ?? 30);
  return Math.min(30, Math.max(1, Number.isFinite(limit) ? limit : 30));
}

function validateBlackboardPatchArgs(args: PatchBlackboardArgs) {
  if (!Array.isArray(args.ops) || args.ops.length === 0) throw new Error("patchBlackboard requires at least one operation.");
  if (args.ops.length > 8) throw new Error("patchBlackboard accepts at most 8 operations per call.");
}

function normalizedBlackboardUpsert(
  op: PatchBlackboardArgs["ops"][number],
  fallbackReason: string | null | undefined,
  context: { runId: string; toolCallId: string }
) {
  if (op.op !== "upsert") throw new Error(`Unsupported blackboard patch op: ${String(op.op)}`);
  const category = op.category;
  if (!isBlackboardCategory(category)) throw new Error(`Invalid blackboard category for key ${op.key}.`);
  if (category === "canvas_state") {
    throw new Error("canvas_state is system-maintained. Call getCanvasContext/getPNGBase64 instead of writing canvas_state manually.");
  }
  const value = normalizeBlackboardText(op.value ?? "", 2_000);
  if (!value) throw new Error(`patchBlackboard upsert value is required for key ${op.key}.`);
  return {
    category,
    value,
    status: "active" as const,
    confidence: normalizeBlackboardConfidence(op.confidence),
    reason: normalizeBlackboardText(op.reason ?? fallbackReason ?? "Agent marked this memory as important.", 360),
    sourceMessageId: op.sourceMessageId?.trim() || null,
    sourceToolCallId: op.sourceToolCallId?.trim() || context.toolCallId,
    sourceRunId: op.sourceRunId?.trim() || context.runId
  };
}

function normalizeBlackboardKey(value: string) {
  const key = value.trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96);
  if (!key) throw new Error("Blackboard key is required.");
  return key;
}

function normalizeBlackboardText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function normalizeBlackboardConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 700;
  return Math.min(1000, Math.max(0, Math.round(value * 1000)));
}

function blackboardEntryFromRow(row: BlackboardEntryRow): BlackboardEntry {
  return {
    id: row.id,
    conversationId: row.conversationId,
    key: row.key,
    category: row.category,
    value: row.value,
    status: row.status,
    confidence: row.confidence / 1000,
    reason: row.reason,
    sourceMessageId: row.sourceMessageId,
    sourceToolCallId: row.sourceToolCallId,
    sourceRunId: row.sourceRunId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null
  };
}
