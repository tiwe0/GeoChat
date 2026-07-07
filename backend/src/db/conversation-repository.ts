import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type {
  DesktopConversationDetail,
  DesktopConversationMessage,
  DesktopConversationMessagePayload,
  DesktopConversationSummary,
  UpsertDesktopConversationMessageInput
} from "@geochat-ai/app";
import type { GeoChatDatabaseRuntimeConfig } from "./runtime";
import type { createDatabase } from "./client";
import {
  agentErrorEvents as sqliteAgentErrorEvents,
  agentRunLedgers as sqliteAgentRunLedgers,
  agentRunModelSteps as sqliteAgentRunModelSteps,
  agentRunPolicyDecisions as sqliteAgentRunPolicyDecisions,
  agentRunRemoteToolRequests as sqliteAgentRunRemoteToolRequests,
  conversationBlackboardEntries as sqliteConversationBlackboardEntries,
  conversationMessages as sqliteConversationMessages,
  conversations as sqliteConversations,
  problemAttempts as sqliteProblemAttempts
} from "./schema";

type SqliteDatabase = ReturnType<typeof createDatabase>;
type ConversationRow = typeof sqliteConversations.$inferSelect;
type ConversationMessageRow = typeof sqliteConversationMessages.$inferSelect;

export type ConversationDataScope = {
  ownerUserId?: string | null;
};

export class ConversationOwnershipError extends Error {
  constructor() {
    super("Conversation belongs to another data scope.");
    this.name = "ConversationOwnershipError";
  }
}

export type ConversationRepository = {
  listConversations(scope?: ConversationDataScope): Promise<DesktopConversationSummary[]>;
  getConversationDetail(conversationId: string, scope?: ConversationDataScope): Promise<DesktopConversationDetail | undefined>;
  getConversationOwnerUserId(conversationId: string): Promise<string | null | undefined>;
  findMessageById(messageId: string, scope?: ConversationDataScope): Promise<DesktopConversationMessage | undefined>;
  upsertConversationMessage(input: UpsertDesktopConversationMessageInput, scope?: ConversationDataScope): Promise<DesktopConversationDetail>;
  deleteConversation(conversationId: string, scope?: ConversationDataScope): Promise<void>;
};

export function createConversationRepository(config: GeoChatDatabaseRuntimeConfig, sqliteDb: SqliteDatabase): ConversationRepository {
  void config;
  return createSqliteConversationRepository(sqliteDb);
}

function createSqliteConversationRepository(db: SqliteDatabase): ConversationRepository {
  return {
    async listConversations(scope) {
      return db
        .select()
        .from(sqliteConversations)
        .where(sqliteOwnerCondition(scope))
        .orderBy(desc(sqliteConversations.updatedAt))
        .limit(80)
        .all()
        .map(conversationSummaryFromRow);
    },
    async getConversationDetail(conversationId, scope) {
      return getSqliteConversationDetail(db, conversationId, scope);
    },
    async getConversationOwnerUserId(conversationId) {
      return db.select({ ownerUserId: sqliteConversations.ownerUserId }).from(sqliteConversations).where(eq(sqliteConversations.id, conversationId)).get()?.ownerUserId;
    },
    async findMessageById(messageId, scope) {
      const row = db.select().from(sqliteConversationMessages).where(eq(sqliteConversationMessages.id, messageId)).get();
      if (row && !sqliteConversationOwnedByScope(db, row.conversationId, scope)) return undefined;
      return row ? conversationMessageFromRow(row) : undefined;
    },
    async upsertConversationMessage(input, scope) {
      const createdAt = parseConversationDateOrNow(input.message.createdAt);
      const now = new Date();
      const ownerUserId = scopeOwnerUserId(scope);
      const existing = db.select().from(sqliteConversations).where(eq(sqliteConversations.id, input.conversationId)).get();
      if (existing && existing.ownerUserId !== ownerUserId) throw new ConversationOwnershipError();
      db.insert(sqliteConversations)
        .values({
          id: input.conversationId,
          title: existing?.title ?? conversationTitle(input.message.content),
          summary: existing?.summary ?? conversationSummary(input.message.content),
          ownerUserId,
          messageCount: existing?.messageCount ?? 0,
          createdAt: existing?.createdAt ?? createdAt,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: sqliteConversations.id,
          set: { updatedAt: now }
        })
        .run();

      db.insert(sqliteConversationMessages)
        .values({
          id: input.message.id,
          conversationId: input.conversationId,
          role: input.message.role,
          content: input.message.content,
          createdAt,
          payload: input.message.payload
        })
        .onConflictDoUpdate({
          target: sqliteConversationMessages.id,
          set: {
            role: input.message.role,
            content: input.message.content,
            createdAt,
            payload: input.message.payload
          }
        })
        .run();

      refreshSqliteConversationSummary(db, input.conversationId);
      const detail = getSqliteConversationDetail(db, input.conversationId, scope);
      if (!detail) throw new Error("Conversation was not persisted.");
      return detail;
    },
    async deleteConversation(conversationId, scope) {
      if (!sqliteConversationOwnedByScope(db, conversationId, scope)) return;
      const runIds = db
        .select({ runId: sqliteAgentRunLedgers.runId })
        .from(sqliteAgentRunLedgers)
        .where(eq(sqliteAgentRunLedgers.conversationId, conversationId))
        .all()
        .map((row) => row.runId);

      db.transaction((tx) => {
        if (runIds.length) {
          tx.delete(sqliteAgentErrorEvents).where(inArray(sqliteAgentErrorEvents.runId, runIds)).run();
          tx.delete(sqliteAgentRunModelSteps).where(inArray(sqliteAgentRunModelSteps.runId, runIds)).run();
          tx.delete(sqliteAgentRunPolicyDecisions).where(inArray(sqliteAgentRunPolicyDecisions.runId, runIds)).run();
          tx.delete(sqliteAgentRunRemoteToolRequests).where(inArray(sqliteAgentRunRemoteToolRequests.runId, runIds)).run();
          tx.delete(sqliteAgentRunLedgers).where(inArray(sqliteAgentRunLedgers.runId, runIds)).run();
        }
        tx.delete(sqliteProblemAttempts).where(eq(sqliteProblemAttempts.conversationId, conversationId)).run();
        tx.delete(sqliteConversationBlackboardEntries).where(eq(sqliteConversationBlackboardEntries.conversationId, conversationId)).run();
        tx.delete(sqliteConversationMessages).where(eq(sqliteConversationMessages.conversationId, conversationId)).run();
        tx.delete(sqliteConversations).where(eq(sqliteConversations.id, conversationId)).run();
      });
    }
  };
}

function getSqliteConversationDetail(db: SqliteDatabase, conversationId: string, scope?: ConversationDataScope): DesktopConversationDetail | undefined {
  const row = db.select().from(sqliteConversations).where(and(eq(sqliteConversations.id, conversationId), sqliteOwnerCondition(scope))).get();
  if (!row) return undefined;
  return {
    ...conversationSummaryFromRow(row),
    messages: db
      .select()
      .from(sqliteConversationMessages)
      .where(eq(sqliteConversationMessages.conversationId, conversationId))
      .orderBy(asc(sqliteConversationMessages.createdAt))
      .all()
      .map(conversationMessageFromRow)
  };
}

function scopeOwnerUserId(scope?: ConversationDataScope) {
  return scope?.ownerUserId ?? null;
}

function sqliteOwnerCondition(scope?: ConversationDataScope) {
  const ownerUserId = scopeOwnerUserId(scope);
  return ownerUserId ? eq(sqliteConversations.ownerUserId, ownerUserId) : isNull(sqliteConversations.ownerUserId);
}

function sqliteConversationOwnedByScope(db: SqliteDatabase, conversationId: string, scope?: ConversationDataScope) {
  return Boolean(db.select({ id: sqliteConversations.id })
    .from(sqliteConversations)
    .where(and(eq(sqliteConversations.id, conversationId), sqliteOwnerCondition(scope)))
    .get());
}

function refreshSqliteConversationSummary(db: SqliteDatabase, conversationId: string) {
  const rows = db
    .select()
    .from(sqliteConversationMessages)
    .where(eq(sqliteConversationMessages.conversationId, conversationId))
    .orderBy(asc(sqliteConversationMessages.createdAt))
    .all();
  if (!rows.length) return;
  const firstUser = rows.find((row) => row.role === "user") ?? rows[0];
  const latest = rows[rows.length - 1];
  db.update(sqliteConversations)
    .set({
      title: conversationTitle(firstUser.content),
      summary: conversationSummary(latest.content),
      messageCount: rows.length,
      updatedAt: latest.createdAt
    })
    .where(eq(sqliteConversations.id, conversationId))
    .run();
}

function conversationSummaryFromRow(row: ConversationRow): DesktopConversationSummary {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    messageCount: row.messageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function conversationMessageFromRow(row: ConversationMessageRow): DesktopConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    payload: parseConversationJsonPayload(row.payload)
  };
}

function parseConversationJsonPayload(value: unknown): DesktopConversationMessagePayload {
  if (typeof value !== "string") return value as DesktopConversationMessagePayload;
  try {
    return JSON.parse(value) as DesktopConversationMessagePayload;
  } catch {
    return {
      id: "",
      role: "assistant",
      content: value,
      createdAt: new Date(0).toISOString()
    };
  }
}

function parseConversationDateOrNow(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
}

function conversationTitle(content: string) {
  const normalized = normalizeConversationText(content);
  return normalized ? truncateConversationText(normalized, 34) : "新的数学探索";
}

function conversationSummary(content: string) {
  const normalized = normalizeConversationText(content);
  return normalized ? truncateConversationText(normalized, 64) : "暂无内容";
}

function normalizeConversationText(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function truncateConversationText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
