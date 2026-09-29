import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type {
  LegacyConversationImportRequest,
  LegacyConversationImportResult,
} from "@geochat-ai/app/legacy-conversation-import";
import type { createDatabase } from "./client";
import type { ConversationDataScope } from "./conversation-repository";
import {
  conversationMessages as sqliteConversationMessages,
  conversations as sqliteConversations,
  legacyConversationImportReceipts as sqliteLegacyConversationImportReceipts,
} from "./schema";

type SqliteDatabase = ReturnType<typeof createDatabase>;
type NormalizedLegacyImport = ReturnType<typeof normalizeLegacyImport>;
type ImportReason = NonNullable<LegacyConversationImportResult["reason"]>;

export type LegacyConversationImportRepository = {
  importConversation(
    request: LegacyConversationImportRequest,
    scope?: ConversationDataScope,
  ): Promise<LegacyConversationImportResult>;
};

export function createLegacyConversationImportRepository(
  db: SqliteDatabase,
): LegacyConversationImportRepository {
  return {
    async importConversation(request, scope) {
      const normalized = normalizeLegacyImport(request);
      const contentFingerprint = fingerprintCanonical(normalized);
      const ownerUserId = scope?.ownerUserId ?? null;
      const ownerScopeKey = ownerUserId === null ? "anonymous:" : `user:${ownerUserId}`;

      return db.transaction((tx) => {
        const receipt = tx
          .select()
          .from(sqliteLegacyConversationImportReceipts)
          .where(eq(sqliteLegacyConversationImportReceipts.id, receiptId(ownerScopeKey, request.sourceFingerprint)))
          .get();
        if (receipt) {
          if (receipt.contentFingerprint !== contentFingerprint) {
            return result(request, "conflict", "source_fingerprint_mismatch");
          }
          return receipt.outcome === "conflict"
            ? result(request, "conflict", receipt.reason ?? "conversation_content_conflict")
            : result(request, "skipped");
        }

        const existingConversation = tx
          .select()
          .from(sqliteConversations)
          .where(eq(sqliteConversations.id, normalized.id))
          .get();

        if (existingConversation) {
          if (existingConversation.ownerUserId !== ownerUserId) {
            insertReceipt(tx, request, normalized, ownerScopeKey, ownerUserId, contentFingerprint, "conflict", "conversation_content_conflict");
            return result(request, "conflict", "conversation_content_conflict");
          }
          const existingFingerprint = fingerprintCanonical(normalizeStoredConversation(tx, existingConversation));
          const outcome = existingFingerprint === contentFingerprint ? "skipped" : "conflict";
          const reason = outcome === "conflict" ? "conversation_content_conflict" : undefined;
          insertReceipt(tx, request, normalized, ownerScopeKey, ownerUserId, contentFingerprint, outcome, reason);
          return result(request, outcome, reason);
        }

        for (const message of normalized.messages) {
          const existingMessage = tx
            .select({ conversationId: sqliteConversationMessages.conversationId })
            .from(sqliteConversationMessages)
            .where(eq(sqliteConversationMessages.id, message.id))
            .get();
          if (existingMessage) {
            insertReceipt(tx, request, normalized, ownerScopeKey, ownerUserId, contentFingerprint, "conflict", "message_id_conflict");
            return result(request, "conflict", "message_id_conflict");
          }
        }

        tx.insert(sqliteConversations).values({
          id: normalized.id,
          title: normalized.title ?? inferConversationTitle(normalized),
          sourceTitle: normalized.title,
          summary: inferConversationSummary(normalized),
          model: normalized.model,
          ownerUserId,
          messageCount: normalized.messages.length,
          createdAt: new Date(normalized.createdAt),
          updatedAt: new Date(normalized.updatedAt),
        }).run();
        for (const message of normalized.messages) {
          tx.insert(sqliteConversationMessages).values({
            id: message.id,
            conversationId: normalized.id,
            role: message.role,
            content: message.content,
            createdAt: new Date(message.createdAt),
            payload: message.payload,
          }).run();
        }
        insertReceipt(tx, request, normalized, ownerScopeKey, ownerUserId, contentFingerprint, "imported");
        return result(request, "imported");
      });
    },
  };
}

function normalizeLegacyImport(request: LegacyConversationImportRequest) {
  const createdAtMs = Date.parse(request.conversation.createdAt);
  let previousMessageAtMs = createdAtMs - 1;
  return {
    id: request.conversation.id,
    model: request.conversation.model,
    title: request.conversation.title,
    createdAt: new Date(createdAtMs).toISOString(),
    updatedAt: new Date(Date.parse(request.conversation.updatedAt)).toISOString(),
    messages: request.conversation.messages.map((message, index) => {
      const sourceCreatedAtMs = message.createdAt ? Date.parse(message.createdAt) : createdAtMs + index;
      const normalizedCreatedAtMs = Math.max(sourceCreatedAtMs, previousMessageAtMs + 1);
      previousMessageAtMs = normalizedCreatedAtMs;
      const createdAt = new Date(normalizedCreatedAtMs).toISOString();
      const content = message.parts
        .flatMap((part) => isTextPart(part) ? [part.text] : [])
        .join("");
      const payload = {
        id: message.id,
        role: message.role,
        content,
        createdAt,
        parts: message.parts,
        ...(message.metadata === undefined ? {} : { metadata: message.metadata }),
        ...(message.metadata?.tokenUsage === undefined ? {} : { usage: message.metadata.tokenUsage }),
      };
      return { id: message.id, role: message.role, content, createdAt, payload };
    }),
  };
}

function normalizeStoredConversation(
  tx: Parameters<Parameters<SqliteDatabase["transaction"]>[0]>[0],
  conversation: typeof sqliteConversations.$inferSelect,
): NormalizedLegacyImport {
  return {
    id: conversation.id,
    model: conversation.model ?? "",
    title: conversation.sourceTitle,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messages: tx
      .select()
      .from(sqliteConversationMessages)
      .where(eq(sqliteConversationMessages.conversationId, conversation.id))
      .orderBy(asc(sqliteConversationMessages.createdAt), asc(sqliteConversationMessages.id))
      .all()
      .map((message) => {
        const payload = parsePayload(message.payload);
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          payload,
        };
      }),
  };
}

function insertReceipt(
  tx: Parameters<Parameters<SqliteDatabase["transaction"]>[0]>[0],
  request: LegacyConversationImportRequest,
  normalized: NormalizedLegacyImport,
  ownerScopeKey: string,
  ownerUserId: string | null,
  contentFingerprint: string,
  outcome: LegacyConversationImportResult["outcome"],
  reason?: ImportReason,
) {
  tx.insert(sqliteLegacyConversationImportReceipts).values({
    id: receiptId(ownerScopeKey, request.sourceFingerprint),
    ownerScopeKey,
    ownerUserId,
    sourceFingerprint: request.sourceFingerprint,
    contentFingerprint,
    conversationId: normalized.id,
    outcome,
    reason: reason ?? null,
    createdAt: new Date(),
  }).run();
}

function result(
  request: LegacyConversationImportRequest,
  outcome: LegacyConversationImportResult["outcome"],
  reason?: ImportReason,
): LegacyConversationImportResult {
  return {
    outcome,
    conversationId: request.conversation.id,
    sourceFingerprint: request.sourceFingerprint,
    ...(reason ? { reason } : {}),
  };
}

function receiptId(ownerScopeKey: string, sourceFingerprint: string) {
  return createHash("sha256").update(`${ownerScopeKey}\0${sourceFingerprint}`).digest("hex");
}

function fingerprintCanonical(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parsePayload(value: unknown) {
  if (typeof value !== "string") return value as NormalizedLegacyImport["messages"][number]["payload"];
  return JSON.parse(value) as NormalizedLegacyImport["messages"][number]["payload"];
}

function isTextPart(value: unknown): value is { type: "text"; text: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).type === "text"
    && typeof (value as Record<string, unknown>).text === "string");
}

function inferConversationTitle(conversation: NormalizedLegacyImport) {
  const firstUser = conversation.messages.find((message) => message.role === "user");
  return truncate(normalizeText(firstUser?.content ?? ""), 34) || "新的数学探索";
}

function inferConversationSummary(conversation: NormalizedLegacyImport) {
  return truncate(normalizeText(conversation.messages.at(-1)?.content ?? ""), 64) || "暂无内容";
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
