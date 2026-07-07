import { desc, eq, isNull } from "drizzle-orm";
import type { GeoChatDatabaseRuntimeConfig } from "./runtime";
import type { createDatabase } from "./client";
import { messages as sqliteMessages } from "./schema";
import type { ConversationDataScope } from "./conversation-repository";

type SqliteDatabase = ReturnType<typeof createDatabase>;
type MessageRole = "user" | "assistant" | "system";

export type GeoChatMessageRow = {
  id: string;
  role: MessageRole;
  content: string;
  ownerUserId?: string | null;
  createdAt: Date;
};

export type MessageRepository = {
  listRecentMessages(limit: number, scope?: ConversationDataScope): Promise<GeoChatMessageRow[]>;
  createMessage(input: GeoChatMessageRow, scope?: ConversationDataScope): Promise<void>;
};

export function createMessageRepository(config: GeoChatDatabaseRuntimeConfig, sqliteDb: SqliteDatabase): MessageRepository {
  void config;
  return createSqliteMessageRepository(sqliteDb);
}

function createSqliteMessageRepository(db: SqliteDatabase): MessageRepository {
  return {
    async listRecentMessages(limit, scope) {
      return db
        .select()
        .from(sqliteMessages)
        .where(sqliteMessageOwnerCondition(scope))
        .orderBy(desc(sqliteMessages.createdAt))
        .limit(limit)
        .all();
    },
    async createMessage(input, scope) {
      db.insert(sqliteMessages)
        .values({ ...input, ownerUserId: scopeOwnerUserId(scope) })
        .run();
    }
  };
}

function scopeOwnerUserId(scope?: ConversationDataScope) {
  return scope?.ownerUserId ?? null;
}

function sqliteMessageOwnerCondition(scope?: ConversationDataScope) {
  const ownerUserId = scopeOwnerUserId(scope);
  return ownerUserId ? eq(sqliteMessages.ownerUserId, ownerUserId) : isNull(sqliteMessages.ownerUserId);
}
