import {
  isBlackboardCategory,
  isBlackboardEntryStatus,
  type MigrationConversationBundle,
  type MigrationExportPackage,
  type MigrationExportResponse,
  type MigrationImportResult,
  type MigrationProblemAttempt
} from "@geochat-ai/app";
import type { BlackboardRepository } from "../db/blackboard-repository";
import type { ConversationDataScope, ConversationRepository } from "../db/conversation-repository";
import type { MigrationRepository } from "../db/migration-repository";
import type { ProblemBankRepository } from "../db/problem-bank-repository";
import type { GeoChatDatabaseRuntimeConfig } from "../db/runtime";

export type MigrationServiceContext = {
  databaseRuntime: Pick<GeoChatDatabaseRuntimeConfig, "requestedDriver" | "migrationsSchema">;
  repositories: {
    conversations: ConversationRepository;
    blackboard: BlackboardRepository;
    problemBank: ProblemBankRepository;
    migration: MigrationRepository;
  };
};

export async function createMigrationExportPackage(
  context: MigrationServiceContext,
  scope: ConversationDataScope
): Promise<MigrationExportResponse["migrationPackage"]> {
  const summaries = await context.repositories.conversations.listConversations(scope);
  const details = (await Promise.all(
    summaries.map((summary) => context.repositories.conversations.getConversationDetail(summary.id, scope))
  )).filter((conversation): conversation is NonNullable<typeof conversation> => Boolean(conversation));
  const attempts = await context.repositories.problemBank.listProblemAttempts(scope);
  const attemptsByConversation = new Map<string, MigrationProblemAttempt[]>();
  for (const attempt of attempts) {
    attemptsByConversation.set(attempt.conversationId, [...(attemptsByConversation.get(attempt.conversationId) ?? []), attempt]);
  }

  const conversations: MigrationConversationBundle[] = await Promise.all(
    details.map(async (conversation) => ({
      conversation,
      blackboardEntries: await context.repositories.blackboard.listEntries(conversation.id, { includeArchived: true, limit: 200 }),
      problemAttempts: attemptsByConversation.get(conversation.id) ?? []
    }))
  );
  const totals = conversations.reduce(
    (current, bundle) => ({
      conversations: current.conversations + 1,
      messages: current.messages + bundle.conversation.messages.length,
      blackboardEntries: current.blackboardEntries + bundle.blackboardEntries.length,
      problemAttempts: current.problemAttempts + bundle.problemAttempts.length
    }),
    { conversations: 0, messages: 0, blackboardEntries: 0, problemAttempts: 0 }
  );

  return {
    schemaVersion: 1,
    product: "geochat",
    exportedAt: new Date().toISOString(),
    source: {
      databaseDriver: context.databaseRuntime.requestedDriver,
      migrationsSchema: context.databaseRuntime.migrationsSchema
    },
    scope: {
      ownerUserId: scope.ownerUserId ?? null,
      mode: "anonymous_offline"
    },
    totals,
    conversations
  };
}

export async function importMigrationPackage(
  context: MigrationServiceContext,
  payload: unknown,
  scope: ConversationDataScope
): Promise<
  | { imported: true; importResult: MigrationImportResult }
  | { imported: false }
> {
  const migrationPackage = migrationPackageFromPayload(payload);
  if (!migrationPackage) return { imported: false };
  const importResult = await context.repositories.migration.importPackage(migrationPackage, scope);
  return { imported: true, importResult };
}

const migrationImportLimits = {
  conversations: 200,
  messages: 5_000,
  blackboardEntries: 10_000,
  problemAttempts: 2_000,
  textLength: 200_000
};

export function migrationPackageFromPayload(payload: unknown): MigrationExportPackage | undefined {
  const candidate = isRecord(payload) && isRecord(payload.migrationPackage) ? payload.migrationPackage : payload;
  if (!isRecord(candidate)) return undefined;
  if (candidate.schemaVersion !== 1 || candidate.product !== "geochat") return undefined;
  if (!isMigrationDate(candidate.exportedAt)) return undefined;
  if (!isMigrationSource(candidate.source) || !isMigrationScope(candidate.scope) || !isMigrationTotals(candidate.totals)) return undefined;
  if (!Array.isArray(candidate.conversations) || candidate.conversations.length > migrationImportLimits.conversations) return undefined;
  let messages = 0;
  let blackboardEntries = 0;
  let problemAttempts = 0;
  for (const bundle of candidate.conversations) {
    if (!isMigrationBundle(bundle)) return undefined;
    messages += bundle.conversation.messages.length;
    blackboardEntries += bundle.blackboardEntries.length;
    problemAttempts += bundle.problemAttempts.length;
  }
  if (
    messages > migrationImportLimits.messages ||
    blackboardEntries > migrationImportLimits.blackboardEntries ||
    problemAttempts > migrationImportLimits.problemAttempts
  ) {
    return undefined;
  }
  return candidate as MigrationExportPackage;
}

function isMigrationSource(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    value.databaseDriver === "sqlite" &&
    value.migrationsSchema === "sqlite"
  );
}

function isMigrationScope(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    (value.ownerUserId === null || isMigrationOptionalString(value.ownerUserId, 160)) &&
    value.mode === "anonymous_offline"
  );
}

function isMigrationTotals(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeInteger(value.conversations) &&
    isNonNegativeInteger(value.messages) &&
    isNonNegativeInteger(value.blackboardEntries) &&
    isNonNegativeInteger(value.problemAttempts)
  );
}

function isMigrationBundle(value: unknown) {
  if (!isRecord(value)) return false;
  const conversation = value.conversation;
  if (!isMigrationConversation(conversation)) return false;
  if (!Array.isArray(value.blackboardEntries) || !value.blackboardEntries.every(isMigrationBlackboardEntry)) return false;
  if (!Array.isArray(value.problemAttempts) || !value.problemAttempts.every(isMigrationProblemAttempt)) return false;
  const conversationId = (conversation as { id: string }).id;
  return value.blackboardEntries.every((entry) => entry.conversationId === conversationId) &&
    value.problemAttempts.every((attempt) => attempt.conversationId === conversationId);
}

function isMigrationConversation(value: unknown) {
  if (!isRecord(value)) return false;
  if (!isMigrationString(value.id, 160) || !isMigrationString(value.title, 500) || !isMigrationString(value.summary, 1_000)) return false;
  if (!isNonNegativeInteger(value.messageCount) || !isMigrationDate(value.createdAt) || !isMigrationDate(value.updatedAt)) return false;
  if (!Array.isArray(value.messages) || !value.messages.every(isMigrationMessage)) return false;
  return value.messages.every((message) => message.conversationId === value.id);
}

function isMigrationMessage(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    isMigrationString(value.id, 160) &&
    isMigrationString(value.conversationId, 160) &&
    (value.role === "user" || value.role === "assistant") &&
    isMigrationString(value.content, migrationImportLimits.textLength) &&
    isMigrationDate(value.createdAt) &&
    isMigrationMessagePayload(value.payload)
  );
}

function isMigrationMessagePayload(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    isMigrationString(value.id, 160) &&
    (value.role === "user" || value.role === "assistant") &&
    isMigrationString(value.content, migrationImportLimits.textLength) &&
    isMigrationString(value.createdAt, 160) &&
    (value.attachments === undefined || Array.isArray(value.attachments)) &&
    (value.toolCalls === undefined || Array.isArray(value.toolCalls)) &&
    (value.cards === undefined || Array.isArray(value.cards)) &&
    (value.usage === undefined || isMigrationUsage(value.usage))
  );
}

function isMigrationUsage(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    (value.inputTokens === undefined || isNonNegativeInteger(value.inputTokens)) &&
    (value.outputTokens === undefined || isNonNegativeInteger(value.outputTokens)) &&
    (value.totalTokens === undefined || isNonNegativeInteger(value.totalTokens))
  );
}

function isMigrationBlackboardEntry(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    isMigrationString(value.id, 160) &&
    isMigrationString(value.conversationId, 160) &&
    isMigrationString(value.key, 160) &&
    isBlackboardCategory(value.category) &&
    isMigrationString(value.value, 20_000) &&
    isBlackboardEntryStatus(value.status) &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    isMigrationString(value.reason, 2_000) &&
    isMigrationOptionalString(value.sourceMessageId, 160) &&
    isMigrationOptionalString(value.sourceToolCallId, 200) &&
    isMigrationOptionalString(value.sourceRunId, 160) &&
    isMigrationDate(value.createdAt) &&
    isMigrationDate(value.updatedAt) &&
    (value.archivedAt === null || value.archivedAt === undefined || isMigrationDate(value.archivedAt))
  );
}

function isMigrationProblemAttempt(value: unknown) {
  if (!isRecord(value)) return false;
  if (
    !isMigrationString(value.id, 160) ||
    !isMigrationString(value.problemId, 260) ||
    !isMigrationString(value.conversationId, 160) ||
    !isMigrationOptionalString(value.ownerUserId, 160) ||
    !isMigrationOptionalString(value.runId, 160) ||
    !(value.status === "started" || value.status === "completed" || value.status === "failed") ||
    !isMigrationOptionalString(value.modelProvider, 100) ||
    !isMigrationOptionalString(value.modelId, 200) ||
    !isMigrationDate(value.startedAt) ||
    !(value.completedAt === null || isMigrationDate(value.completedAt)) ||
    !(value.userRating === null || isNonNegativeInteger(value.userRating)) ||
    !isMigrationOptionalString(value.notes, 4_000)
  ) {
    return false;
  }
  return value.status === "started" ? value.completedAt === null : typeof value.completedAt === "string";
}

function isMigrationDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isMigrationString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isMigrationOptionalString(value: unknown, maxLength: number) {
  return value === null || value === undefined || (typeof value === "string" && value.length <= maxLength);
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
