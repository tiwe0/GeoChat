import {
  isBlackboardCategory,
  isBlackboardEntryStatus,
  type BlackboardEntry
} from "./blackboard";
import {
  isRuntimeNonNegativeInteger,
  isRuntimeRecord,
  runtimeDecodeFailure,
  runtimeDecodeSuccess,
  type RuntimeDecodeResult
} from "./runtime-decode";

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

export const MIGRATION_IMPORT_LIMITS = {
  conversations: 200,
  messages: 5_000,
  blackboardEntries: 10_000,
  problemAttempts: 2_000,
  textLength: 200_000
} as const;

export function decodeMigrationImportRequest(
  payload: unknown
): RuntimeDecodeResult<MigrationImportRequest, "migration_package_invalid"> {
  const candidate = isRuntimeRecord(payload) && isRuntimeRecord(payload.migrationPackage)
    ? payload.migrationPackage
    : payload;
  if (!isMigrationExportPackage(candidate)) return runtimeDecodeFailure("migration_package_invalid");
  return runtimeDecodeSuccess({ migrationPackage: candidate });
}

export function decodeMigrationExportResponse(
  value: unknown
): RuntimeDecodeResult<MigrationExportResponse, "migration_export_response_invalid"> {
  if (!isRuntimeRecord(value) || !isMigrationExportPackage(value.migrationPackage)) {
    return runtimeDecodeFailure("migration_export_response_invalid");
  }
  return runtimeDecodeSuccess(value as MigrationExportResponse);
}

function isMigrationExportPackage(value: unknown): value is MigrationExportPackage {
  if (!isRuntimeRecord(value)) return false;
  if (value.schemaVersion !== 1 || value.product !== "geochat" || !isMigrationDate(value.exportedAt)) return false;
  if (!isMigrationSource(value.source) || !isMigrationScope(value.scope) || !isMigrationTotals(value.totals)) return false;
  if (!Array.isArray(value.conversations) || value.conversations.length > MIGRATION_IMPORT_LIMITS.conversations) return false;
  let messages = 0;
  let blackboardEntries = 0;
  let problemAttempts = 0;
  for (const bundle of value.conversations) {
    if (!isMigrationBundle(bundle)) return false;
    messages += bundle.conversation.messages.length;
    blackboardEntries += bundle.blackboardEntries.length;
    problemAttempts += bundle.problemAttempts.length;
  }
  return (
    messages <= MIGRATION_IMPORT_LIMITS.messages
    && blackboardEntries <= MIGRATION_IMPORT_LIMITS.blackboardEntries
    && problemAttempts <= MIGRATION_IMPORT_LIMITS.problemAttempts
  );
}

function isMigrationSource(value: unknown) {
  return isRuntimeRecord(value) && value.databaseDriver === "sqlite" && value.migrationsSchema === "sqlite";
}

function isMigrationScope(value: unknown) {
  return isRuntimeRecord(value)
    && (value.ownerUserId === null || isMigrationOptionalString(value.ownerUserId, 160))
    && value.mode === "anonymous_offline";
}

function isMigrationTotals(value: unknown) {
  return isRuntimeRecord(value)
    && isRuntimeNonNegativeInteger(value.conversations)
    && isRuntimeNonNegativeInteger(value.messages)
    && isRuntimeNonNegativeInteger(value.blackboardEntries)
    && isRuntimeNonNegativeInteger(value.problemAttempts);
}

function isMigrationBundle(value: unknown): value is MigrationConversationBundle {
  if (!isRuntimeRecord(value)) return false;
  const conversation = value.conversation;
  if (!isMigrationConversation(conversation)) return false;
  if (!Array.isArray(value.blackboardEntries) || !value.blackboardEntries.every(isMigrationBlackboardEntry)) return false;
  if (!Array.isArray(value.problemAttempts) || !value.problemAttempts.every(isMigrationProblemAttempt)) return false;
  return value.blackboardEntries.every((entry) => entry.conversationId === conversation.id)
    && value.problemAttempts.every((attempt) => attempt.conversationId === conversation.id);
}

function isMigrationConversation(value: unknown): value is MigrationConversationDetail {
  if (!isRuntimeRecord(value)) return false;
  if (
    !isMigrationString(value.id, 160)
    || !isMigrationString(value.title, 500)
    || !isMigrationString(value.summary, 1_000)
    || !isRuntimeNonNegativeInteger(value.messageCount)
    || !isMigrationDate(value.createdAt)
    || !isMigrationDate(value.updatedAt)
    || !Array.isArray(value.messages)
    || !value.messages.every(isMigrationMessage)
  ) return false;
  return value.messages.every((message) => message.conversationId === value.id);
}

function isMigrationMessage(value: unknown): value is MigrationConversationMessage {
  return isRuntimeRecord(value)
    && isMigrationString(value.id, 160)
    && isMigrationString(value.conversationId, 160)
    && (value.role === "user" || value.role === "assistant")
    && isMigrationString(value.content, MIGRATION_IMPORT_LIMITS.textLength)
    && isMigrationDate(value.createdAt)
    && isMigrationMessagePayload(value.payload);
}

function isMigrationMessagePayload(value: unknown): value is MigrationConversationMessagePayload {
  return isRuntimeRecord(value)
    && isMigrationString(value.id, 160)
    && (value.role === "user" || value.role === "assistant")
    && isMigrationString(value.content, MIGRATION_IMPORT_LIMITS.textLength)
    && isMigrationString(value.createdAt, 160)
    && (value.attachments === undefined || Array.isArray(value.attachments))
    && (value.toolCalls === undefined || Array.isArray(value.toolCalls))
    && (value.cards === undefined || Array.isArray(value.cards))
    && (value.usage === undefined || isMigrationUsage(value.usage));
}

function isMigrationUsage(value: unknown) {
  return isRuntimeRecord(value)
    && (value.inputTokens === undefined || isRuntimeNonNegativeInteger(value.inputTokens))
    && (value.outputTokens === undefined || isRuntimeNonNegativeInteger(value.outputTokens))
    && (value.totalTokens === undefined || isRuntimeNonNegativeInteger(value.totalTokens));
}

function isMigrationBlackboardEntry(value: unknown): value is BlackboardEntry {
  return isRuntimeRecord(value)
    && isMigrationString(value.id, 160)
    && isMigrationString(value.conversationId, 160)
    && isMigrationString(value.key, 160)
    && isBlackboardCategory(value.category)
    && isMigrationString(value.value, 20_000)
    && isBlackboardEntryStatus(value.status)
    && typeof value.confidence === "number"
    && Number.isFinite(value.confidence)
    && value.confidence >= 0
    && value.confidence <= 1
    && isMigrationString(value.reason, 2_000)
    && isMigrationOptionalString(value.sourceMessageId, 160)
    && isMigrationOptionalString(value.sourceToolCallId, 200)
    && isMigrationOptionalString(value.sourceRunId, 160)
    && isMigrationDate(value.createdAt)
    && isMigrationDate(value.updatedAt)
    && (value.archivedAt === null || value.archivedAt === undefined || isMigrationDate(value.archivedAt));
}

function isMigrationProblemAttempt(value: unknown): value is MigrationProblemAttempt {
  if (!isRuntimeRecord(value)) return false;
  if (
    !isMigrationString(value.id, 160)
    || !isMigrationString(value.problemId, 260)
    || !isMigrationString(value.conversationId, 160)
    || !isMigrationOptionalString(value.ownerUserId, 160)
    || !isMigrationOptionalString(value.runId, 160)
    || !(value.status === "started" || value.status === "completed" || value.status === "failed")
    || !isMigrationOptionalString(value.modelProvider, 100)
    || !isMigrationOptionalString(value.modelId, 200)
    || !isMigrationDate(value.startedAt)
    || !(value.completedAt === null || isMigrationDate(value.completedAt))
    || !(value.userRating === null || isRuntimeNonNegativeInteger(value.userRating))
    || !isMigrationOptionalString(value.notes, 4_000)
  ) return false;
  return value.status === "started" ? value.completedAt === null : typeof value.completedAt === "string";
}

function isMigrationDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isMigrationString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isMigrationOptionalString(value: unknown, maxLength: number) {
  return value === null || value === undefined || (typeof value === "string" && value.length <= maxLength);
}
