import { eq } from "drizzle-orm";
import {
  isBlackboardCategory,
  isBlackboardEntryStatus,
  type MigrationConversationBundle,
  type MigrationExportPackage,
  type MigrationImportResult
} from "@geochat-ai/app";
import type { GeoChatDatabaseRuntimeConfig } from "./runtime";
import type { createDatabase } from "./client";
import {
  conversationBlackboardEntries as sqliteConversationBlackboardEntries,
  conversationMessages as sqliteConversationMessages,
  conversations as sqliteConversations,
  problemAttempts as sqliteProblemAttempts
} from "./schema";
import type { ConversationDataScope } from "./conversation-repository";

type SqliteDatabase = ReturnType<typeof createDatabase>;

export type MigrationRepository = {
  importPackage(migrationPackage: MigrationExportPackage, scope?: ConversationDataScope): Promise<MigrationImportResult>;
};

export function createMigrationRepository(config: GeoChatDatabaseRuntimeConfig, sqliteDb: SqliteDatabase): MigrationRepository {
  void config;
  return createSqliteMigrationRepository(sqliteDb);
}

function createSqliteMigrationRepository(db: SqliteDatabase): MigrationRepository {
  return {
    async importPackage(migrationPackage, scope) {
      const ownerUserId = scope?.ownerUserId ?? null;
      const result = emptyImportResult();
      db.transaction((tx) => {
        for (const bundle of migrationPackage.conversations) {
          const existingConversation = tx.select({ ownerUserId: sqliteConversations.ownerUserId })
            .from(sqliteConversations)
            .where(eq(sqliteConversations.id, bundle.conversation.id))
            .get();
          const remapped = existingConversation !== undefined && existingConversation.ownerUserId !== ownerUserId;
          const conversationId = remapped ? crypto.randomUUID() : bundle.conversation.id;
          const messageIdBySource = new Map<string, string>();
          if (remapped) result.remappedConversations += 1;

          tx.insert(sqliteConversations)
            .values(conversationValues(bundle, conversationId, ownerUserId))
            .onConflictDoUpdate({
              target: sqliteConversations.id,
              set: conversationValues(bundle, conversationId, ownerUserId)
            })
            .run();
          result.importedConversations += 1;

          for (const message of bundle.conversation.messages) {
            const existingMessage = tx.select({ conversationId: sqliteConversationMessages.conversationId })
              .from(sqliteConversationMessages)
              .where(eq(sqliteConversationMessages.id, message.id))
              .get();
            const messageId = remapped || (existingMessage !== undefined && existingMessage.conversationId !== conversationId)
              ? crypto.randomUUID()
              : message.id;
            messageIdBySource.set(message.id, messageId);
            tx.insert(sqliteConversationMessages)
              .values(conversationMessageValues(message, conversationId, messageId))
              .onConflictDoUpdate({
                target: sqliteConversationMessages.id,
                set: conversationMessageValues(message, conversationId, messageId)
              })
              .run();
            result.importedMessages += 1;
          }

          for (const entry of bundle.blackboardEntries) {
            if (!isBlackboardCategory(entry.category) || !isBlackboardEntryStatus(entry.status)) continue;
            tx.insert(sqliteConversationBlackboardEntries)
              .values(blackboardEntryValues(entry, conversationId, messageIdBySource))
              .onConflictDoUpdate({
                target: [sqliteConversationBlackboardEntries.conversationId, sqliteConversationBlackboardEntries.key],
                set: blackboardEntryUpdateValues(entry, conversationId, messageIdBySource)
              })
              .run();
            result.importedBlackboardEntries += 1;
          }

          for (const attempt of bundle.problemAttempts) {
            const existingAttempt = tx.select({ conversationId: sqliteProblemAttempts.conversationId })
              .from(sqliteProblemAttempts)
              .where(eq(sqliteProblemAttempts.id, attempt.id))
              .get();
            const attemptId = remapped || (existingAttempt !== undefined && existingAttempt.conversationId !== conversationId)
              ? crypto.randomUUID()
              : attempt.id;
            tx.insert(sqliteProblemAttempts)
              .values(problemAttemptValues(attempt, conversationId, attemptId, ownerUserId))
              .onConflictDoUpdate({
                target: sqliteProblemAttempts.id,
                set: problemAttemptValues(attempt, conversationId, attemptId, ownerUserId)
              })
              .run();
            result.importedProblemAttempts += 1;
          }
        }
      });
      return result;
    }
  };
}

function emptyImportResult(): MigrationImportResult {
  return {
    importedConversations: 0,
    importedMessages: 0,
    importedBlackboardEntries: 0,
    importedProblemAttempts: 0,
    remappedConversations: 0
  };
}

function conversationValues(bundle: MigrationConversationBundle, conversationId: string, ownerUserId: string | null) {
  return {
    id: conversationId,
    title: bundle.conversation.title,
    summary: bundle.conversation.summary,
    ownerUserId,
    messageCount: bundle.conversation.messages.length,
    createdAt: parseMigrationDate(bundle.conversation.createdAt),
    updatedAt: parseMigrationDate(bundle.conversation.updatedAt)
  };
}

function conversationMessageValues(message: MigrationConversationBundle["conversation"]["messages"][number], conversationId: string, messageId: string) {
  return {
    id: messageId,
    conversationId,
    role: message.role,
    content: message.content,
    createdAt: parseMigrationDate(message.createdAt),
    payload: {
      ...message.payload,
      id: messageId,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt
    }
  };
}

function blackboardEntryValues(
  entry: MigrationConversationBundle["blackboardEntries"][number],
  conversationId: string,
  messageIdBySource: Map<string, string>
) {
  return {
    id: crypto.randomUUID(),
    ...blackboardEntryUpdateValues(entry, conversationId, messageIdBySource),
    createdAt: parseMigrationDate(entry.createdAt)
  };
}

function blackboardEntryUpdateValues(
  entry: MigrationConversationBundle["blackboardEntries"][number],
  conversationId: string,
  messageIdBySource: Map<string, string>
) {
  return {
    conversationId,
    key: entry.key,
    category: entry.category,
    value: entry.value,
    status: entry.status,
    confidence: normalizeMigrationConfidence(entry.confidence),
    reason: entry.reason,
    sourceMessageId: entry.sourceMessageId ? messageIdBySource.get(entry.sourceMessageId) ?? entry.sourceMessageId : null,
    sourceToolCallId: entry.sourceToolCallId ?? null,
    sourceRunId: entry.sourceRunId ?? null,
    updatedAt: parseMigrationDate(entry.updatedAt),
    archivedAt: entry.archivedAt ? parseMigrationDate(entry.archivedAt) : null
  };
}

function problemAttemptValues(
  attempt: MigrationConversationBundle["problemAttempts"][number],
  conversationId: string,
  attemptId: string,
  ownerUserId: string | null
) {
  return {
    id: attemptId,
    problemId: attempt.problemId,
    conversationId,
    ownerUserId,
    runId: attempt.runId,
    status: attempt.status,
    modelProvider: attempt.modelProvider,
    modelId: attempt.modelId,
    startedAt: parseMigrationDate(attempt.startedAt),
    completedAt: attempt.completedAt ? parseMigrationDate(attempt.completedAt) : null,
    userRating: attempt.userRating,
    notes: attempt.notes
  };
}

function parseMigrationDate(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function normalizeMigrationConfidence(value: number) {
  return Math.min(1000, Math.max(0, Math.round(value * 1000)));
}
