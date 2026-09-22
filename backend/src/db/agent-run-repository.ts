import { and, desc, eq, inArray } from "drizzle-orm";
import type { AgentRunLedgerRecord } from "@geochat-ai/app";
import { compactAgentRunLedgerForStorage, isAgentRunLedgerRecord } from "@geochat-ai/app";
import type { GeoChatDatabaseRuntimeConfig } from "./runtime";
import type { createDatabase } from "./client";
import {
  agentErrorEvents as sqliteAgentErrorEvents,
  agentRunLedgers as sqliteAgentRunLedgers,
  conversationMessages as sqliteConversationMessages,
  conversations as sqliteConversations,
} from "./schema";

type SqliteDatabase = ReturnType<typeof createDatabase>;
type SqliteTransaction = Parameters<Parameters<SqliteDatabase["transaction"]>[0]>[0];
type SqliteStore = SqliteDatabase | SqliteTransaction;

export type AgentErrorEventSource = "run" | "tool";
export type AgentErrorEventSeverity = "warning" | "error";
export type AgentErrorEventInput = {
  eventId: string;
  runId: string;
  conversationId?: string | null;
  source: AgentErrorEventSource;
  code: string;
  severity: AgentErrorEventSeverity;
  message: string;
  modelProvider?: string | null;
  modelId?: string | null;
  toolCallId?: string | null;
  toolName?: string | null;
  createdAt?: string | null;
  payload: unknown;
};

export type AgentErrorEventOutput = Omit<Required<AgentErrorEventInput>, "createdAt" | "payload"> & {
  createdAt: string;
  payload: unknown;
};

export type AgentRunPersistenceDiagnostics = {
  conversations: number;
  conversationMessages: number;
  agentRunLedgers: number;
  agentErrorEvents: number;
};

export type AgentRunRepository = {
  listLedgers(limit: number): Promise<AgentRunLedgerRecord[]>;
  listAllLedgers(): Promise<AgentRunLedgerRecord[]>;
  getLedger(runId: string): Promise<AgentRunLedgerRecord | undefined>;
  createLedger(record: AgentRunLedgerRecord): Promise<AgentRunLedgerRecord>;
  compareAndSwapLedger(record: AgentRunLedgerRecord, expectedRevision: number): Promise<AgentRunLedgerRecord>;
  saveLedger(record: AgentRunLedgerRecord): Promise<AgentRunLedgerRecord>;
  listErrorEvents(input: { runId?: string | null; conversationId?: string | null; limit: number }): Promise<AgentErrorEventOutput[]>;
  saveErrorEvent(event: AgentErrorEventInput): Promise<void>;
  diagnostics(conversationId: string, expectedRunIds?: string[]): Promise<AgentRunPersistenceDiagnostics>;
};

export function createAgentRunRepository(config: GeoChatDatabaseRuntimeConfig, sqliteDb: SqliteDatabase): AgentRunRepository {
  void config;
  return createSqliteAgentRunRepository(sqliteDb);
}

function createSqliteAgentRunRepository(store: SqliteStore): AgentRunRepository {
  return {
    async listLedgers(limit) {
      return store.select().from(sqliteAgentRunLedgers).orderBy(desc(sqliteAgentRunLedgers.startedAt)).limit(limit).all()
        .map(ledgerFromRow)
        .filter(isAgentRunLedgerRecord);
    },
    async listAllLedgers() {
      return store.select().from(sqliteAgentRunLedgers).all()
        .map(ledgerFromRow)
        .filter(isAgentRunLedgerRecord);
    },
    async getLedger(runId) {
      const row = store.select().from(sqliteAgentRunLedgers).where(eq(sqliteAgentRunLedgers.runId, runId)).get();
      const payload = row ? ledgerFromRow(row) : undefined;
      return isAgentRunLedgerRecord(payload) ? payload : undefined;
    },
    async createLedger(record) {
      assertPersistableLedger(record);
      const created = { ...record, revision: 0 };
      try {
        store.insert(sqliteAgentRunLedgers).values(ledgerRowValues(created)).run();
      } catch (error) {
        throw new AgentRunLedgerConflictError(record.runId, "already exists", error);
      }
      return created;
    },
    async compareAndSwapLedger(record, expectedRevision) {
      assertPersistableLedger(record);
      const next = { ...record, revision: expectedRevision + 1 };
      const updated = store.update(sqliteAgentRunLedgers)
        .set(ledgerRowUpdateValues(next))
        .where(and(
          eq(sqliteAgentRunLedgers.runId, record.runId),
          eq(sqliteAgentRunLedgers.revision, expectedRevision),
        ))
        .returning({ revision: sqliteAgentRunLedgers.revision })
        .get();
      if (updated?.revision !== next.revision) throw new AgentRunLedgerConflictError(record.runId, `expected revision ${expectedRevision}`);
      return next;
    },
    async saveLedger(record) {
      assertPersistableLedger(record);
      const current = store.select().from(sqliteAgentRunLedgers).where(eq(sqliteAgentRunLedgers.runId, record.runId)).get();
      if (!current) {
        const created = { ...record, revision: 0 };
        store.insert(sqliteAgentRunLedgers).values(ledgerRowValues(created)).run();
        return created;
      }
      const currentLedger = ledgerFromRow(current);
      if (currentLedger && currentLedger.status !== "running" && record.status === "running") {
        throw new AgentRunLedgerConflictError(record.runId, `terminal status ${currentLedger.status}`);
      }
      const next = { ...record, revision: current.revision + 1 };
      store.update(sqliteAgentRunLedgers).set(ledgerRowUpdateValues(next)).where(eq(sqliteAgentRunLedgers.runId, record.runId)).run();
      return next;
    },
    async listErrorEvents(input) {
      const whereClause = input.runId
        ? eq(sqliteAgentErrorEvents.runId, input.runId)
        : input.conversationId
          ? eq(sqliteAgentErrorEvents.conversationId, input.conversationId)
          : undefined;
      const rows = whereClause
        ? store.select().from(sqliteAgentErrorEvents).where(whereClause).orderBy(desc(sqliteAgentErrorEvents.createdAt)).limit(input.limit).all()
        : store.select().from(sqliteAgentErrorEvents).orderBy(desc(sqliteAgentErrorEvents.createdAt)).limit(input.limit).all();
      return rows.map(errorEventFromRow);
    },
    async saveErrorEvent(event) {
      store.insert(sqliteAgentErrorEvents)
        .values(errorEventRowValues(event))
        .onConflictDoUpdate({
          target: sqliteAgentErrorEvents.eventId,
          set: errorEventRowUpdateValues(event),
        })
        .run();
    },
    async diagnostics(conversationId, expectedRunIds = []) {
      const storedRunIds = store
        .select({ runId: sqliteAgentRunLedgers.runId })
        .from(sqliteAgentRunLedgers)
        .where(eq(sqliteAgentRunLedgers.conversationId, conversationId))
        .all()
        .map((row) => row.runId);
      const runIds = [...new Set([...storedRunIds, ...expectedRunIds])];
      return {
        conversations: store.select().from(sqliteConversations).where(eq(sqliteConversations.id, conversationId)).all().length,
        conversationMessages: store.select().from(sqliteConversationMessages).where(eq(sqliteConversationMessages.conversationId, conversationId)).all().length,
        agentRunLedgers: storedRunIds.length,
        agentErrorEvents: countRowsForRuns(store, sqliteAgentErrorEvents, runIds),
      };
    },
  };
}

function countRowsForRuns(
  store: SqliteStore,
  table: typeof sqliteAgentErrorEvents,
  runIds: string[],
) {
  return runIds.length ? store.select().from(table).where(inArray(table.runId, runIds)).all().length : 0;
}

function ledgerRowValues(record: AgentRunLedgerRecord) {
  return {
    runId: record.runId,
    conversationId: record.conversationId,
    status: record.status,
    revision: record.revision,
    modelProvider: record.modelProvider,
    modelId: record.modelId,
    startedAt: new Date(record.startedAt),
    completedAt: record.completedAt ? new Date(record.completedAt) : null,
    payload: compactAgentRunLedgerForStorage(record),
  };
}

function ledgerFromRow(row: typeof sqliteAgentRunLedgers.$inferSelect) {
  const payload = parseStoredPayload(row.payload);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  return { ...payload, revision: row.revision } as AgentRunLedgerRecord;
}

function ledgerRowUpdateValues(record: AgentRunLedgerRecord) {
  const { runId: _runId, ...values } = ledgerRowValues(record);
  return values;
}

function errorEventRowValues(input: AgentErrorEventInput) {
  const createdAt = new Date(input.createdAt ?? new Date().toISOString());
  return {
    eventId: input.eventId,
    runId: input.runId,
    conversationId: input.conversationId ?? null,
    source: input.source,
    code: input.code,
    severity: input.severity,
    message: input.message,
    modelProvider: input.modelProvider ?? null,
    modelId: input.modelId ?? null,
    toolCallId: input.toolCallId ?? null,
    toolName: input.toolName ?? null,
    createdAt,
    payload: { event: input.payload, capturedAt: createdAt.toISOString() },
  };
}

function errorEventRowUpdateValues(input: AgentErrorEventInput) {
  const { eventId: _eventId, runId: _runId, ...values } = errorEventRowValues(input);
  return values;
}

function errorEventFromRow(row: {
  eventId: string;
  runId: string;
  conversationId: string | null;
  source: AgentErrorEventSource;
  code: string;
  severity: AgentErrorEventSeverity;
  message: string;
  modelProvider: string | null;
  modelId: string | null;
  toolCallId: string | null;
  toolName: string | null;
  createdAt: Date;
  payload: unknown;
}): AgentErrorEventOutput {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    payload: parseStoredPayload(row.payload),
  };
}

function parseStoredPayload(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error("[ERROR] Failed to parse stored agent-run payload", error);
    return undefined;
  }
}

function assertPersistableLedger(payload: AgentRunLedgerRecord) {
  if (!isAgentRunLedgerRecord(payload)) throw new Error("Refusing to persist invalid agent run ledger.");
}

export class AgentRunLedgerConflictError extends Error {
  constructor(runId: string, detail: string, options?: unknown) {
    super(`Agent run ledger revision conflict for ${runId}: ${detail}.`, options instanceof Error ? { cause: options } : undefined);
    this.name = "AgentRunLedgerConflictError";
  }
}
