import type { BlackboardEntry } from "./blackboard";

export type MigrationConversationMessagePayload = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments?: unknown[];
  toolCalls?: unknown[];
  cards?: unknown[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export type MigrationConversationMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  payload: MigrationConversationMessagePayload;
};

export type MigrationConversationDetail = {
  id: string;
  title: string;
  summary: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  messages: MigrationConversationMessage[];
};

export type MigrationProblemAttempt = {
  id: string;
  problemId: string;
  conversationId: string;
  ownerUserId: string | null;
  runId: string | null;
  status: "started" | "completed" | "failed";
  modelProvider: string | null;
  modelId: string | null;
  startedAt: string;
  completedAt: string | null;
  userRating: number | null;
  notes: string | null;
};

export type MigrationConversationBundle = {
  conversation: MigrationConversationDetail;
  blackboardEntries: BlackboardEntry[];
  problemAttempts: MigrationProblemAttempt[];
};

export type MigrationExportScope = {
  ownerUserId: string | null;
  mode: "anonymous_offline";
};

export type MigrationExportPackage = {
  schemaVersion: 1;
  product: "geochat";
  exportedAt: string;
  source: {
    databaseDriver: "sqlite";
    migrationsSchema: "sqlite";
  };
  scope: MigrationExportScope;
  totals: {
    conversations: number;
    messages: number;
    blackboardEntries: number;
    problemAttempts: number;
  };
  conversations: MigrationConversationBundle[];
};

export type MigrationExportResponse = {
  migrationPackage: MigrationExportPackage;
};

export type MigrationImportRequest = {
  migrationPackage: MigrationExportPackage;
};

export type MigrationImportResult = {
  importedConversations: number;
  importedMessages: number;
  importedBlackboardEntries: number;
  importedProblemAttempts: number;
  remappedConversations: number;
};

export type MigrationImportResponse = {
  importResult: MigrationImportResult;
};
