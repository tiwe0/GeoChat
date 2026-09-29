import {
  decodeMigrationImportRequest,
  type MigrationConversationBundle,
  type MigrationExportPackage,
  type MigrationExportResponse,
  type MigrationImportResult,
  type MigrationProblemAttempt
} from "@geochat-ai/app/migration";
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
  | { imported: false; errorCode: "migration_package_invalid" }
> {
  const decoded = decodeMigrationImportRequest(payload);
  if (!decoded.ok) return { imported: false, errorCode: decoded.errorCode };
  const importResult = await context.repositories.migration.importPackage(decoded.value.migrationPackage, scope);
  return { imported: true, importResult };
}

export function migrationPackageFromPayload(payload: unknown): MigrationExportPackage | undefined {
  const decoded = decodeMigrationImportRequest(payload);
  return decoded.ok ? decoded.value.migrationPackage : undefined;
}
