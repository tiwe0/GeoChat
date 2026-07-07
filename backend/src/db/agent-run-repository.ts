import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  AgentRunLedgerRecord,
  AgentRunModelStepRecord,
  AgentRunPolicyDecisionRecord,
  AgentRunRemoteToolRequest
} from "@geochat-ai/app";
import {
  agentRunRemoteToolRequestInvalidReasons,
  cancelAgentRunRemoteToolRequest,
  isAgentRunLedgerRecord,
  isAgentRunModelStepRecord,
  isAgentRunPolicyDecisionRecord,
  isAgentRunRemoteToolRequest,
  isTerminalAgentRunStatus
} from "@geochat-ai/app";
import type { GeoChatDatabaseRuntimeConfig } from "./runtime";
import type { createDatabase } from "./client";
import {
  agentErrorEvents as sqliteAgentErrorEvents,
  agentRunLedgers as sqliteAgentRunLedgers,
  agentRunModelSteps as sqliteAgentRunModelSteps,
  agentRunPolicyDecisions as sqliteAgentRunPolicyDecisions,
  agentRunRemoteToolRequests as sqliteAgentRunRemoteToolRequests,
  conversationMessages as sqliteConversationMessages,
  conversations as sqliteConversations
} from "./schema";

type SqliteDatabase = ReturnType<typeof createDatabase>;
type SqliteTransaction = Parameters<Parameters<SqliteDatabase["transaction"]>[0]>[0];
type SqliteStore = SqliteDatabase | SqliteTransaction;

export type AgentErrorEventSource = "run" | "tool" | "remote_tool_request" | "policy" | "model_step";
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
  agentRunRemoteToolRequests: number;
  agentRunPolicyDecisions: number;
  agentRunModelSteps: number;
  agentErrorEvents: number;
};

export type RemoteToolRequestSaveResult =
  | { saved: true; request: AgentRunRemoteToolRequest }
  | { saved: false; request?: AgentRunRemoteToolRequest };

export type RunnerContinuationCommitResult =
  | {
    committed: true;
    run: AgentRunLedgerRecord;
    request?: AgentRunRemoteToolRequest;
    nextRequest?: AgentRunRemoteToolRequest;
    policyDecisions: AgentRunPolicyDecisionRecord[];
    modelStep?: AgentRunModelStepRecord;
    cancelledRequests: AgentRunRemoteToolRequest[];
  }
  | { committed: false; runId: string; currentRequest?: AgentRunRemoteToolRequest };

type RunnerContinuationCommitInput = {
  run: AgentRunLedgerRecord;
  completedRequest?: AgentRunRemoteToolRequest;
  expectedCompletedRequest?: AgentRunRemoteToolRequest;
  nextRequest?: AgentRunRemoteToolRequest;
  policyDecision?: AgentRunPolicyDecisionRecord;
  policyDecisions?: AgentRunPolicyDecisionRecord[];
  modelStep?: AgentRunModelStepRecord;
};

export type AgentRunRepository = {
  listLedgers(limit: number): Promise<AgentRunLedgerRecord[]>;
  listAllLedgers(): Promise<AgentRunLedgerRecord[]>;
  getLedger(runId: string): Promise<AgentRunLedgerRecord | undefined>;
  saveLedger(record: AgentRunLedgerRecord): Promise<AgentRunLedgerRecord>;
  saveRunnerStartCommit(input: {
    run: AgentRunLedgerRecord;
    request: AgentRunRemoteToolRequest;
    policyDecision: AgentRunPolicyDecisionRecord;
  }): Promise<{
    run: AgentRunLedgerRecord;
    request: AgentRunRemoteToolRequest;
    policyDecision: AgentRunPolicyDecisionRecord;
  }>;
  saveRunnerTerminalPolicyCommit(input: {
    run: AgentRunLedgerRecord;
    policyDecision: AgentRunPolicyDecisionRecord;
  }): Promise<{
    run: AgentRunLedgerRecord;
    policyDecision: AgentRunPolicyDecisionRecord;
    cancelledRequests: AgentRunRemoteToolRequest[];
  }>;
  saveRunnerContinuationCommit(input: RunnerContinuationCommitInput): Promise<RunnerContinuationCommitResult>;
  saveLedgerCloseCommit(input: {
    run: AgentRunLedgerRecord;
  }): Promise<{
    run: AgentRunLedgerRecord;
    cancelledRequests: AgentRunRemoteToolRequest[];
  }>;
  listRemoteToolRequests(runId: string): Promise<AgentRunRemoteToolRequest[]>;
  listAllRemoteToolRequests(): Promise<AgentRunRemoteToolRequest[]>;
  findRemoteToolRequest(runId: string, toolCallId: string): Promise<AgentRunRemoteToolRequest | undefined>;
  saveRemoteToolRequest(request: AgentRunRemoteToolRequest): Promise<AgentRunRemoteToolRequest>;
  saveRemoteToolRequestIfCurrent(
    request: AgentRunRemoteToolRequest,
    expected: AgentRunRemoteToolRequest
  ): Promise<RemoteToolRequestSaveResult>;
  listPolicyDecisions(runId: string): Promise<AgentRunPolicyDecisionRecord[]>;
  listAllPolicyDecisions(): Promise<AgentRunPolicyDecisionRecord[]>;
  savePolicyDecision(decision: AgentRunPolicyDecisionRecord): Promise<AgentRunPolicyDecisionRecord>;
  listModelSteps(runId: string): Promise<AgentRunModelStepRecord[]>;
  listAllModelSteps(): Promise<AgentRunModelStepRecord[]>;
  saveModelStep(step: AgentRunModelStepRecord): Promise<AgentRunModelStepRecord>;
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
        .map((row) => parseAgentRunLedgerPayload(row.payload))
        .filter(isAgentRunLedgerRecord);
    },
    async listAllLedgers() {
      return store.select().from(sqliteAgentRunLedgers).all()
        .map((row) => parseAgentRunLedgerPayload(row.payload))
        .filter(isAgentRunLedgerRecord);
    },
    async getLedger(runId) {
      const row = store.select().from(sqliteAgentRunLedgers).where(eq(sqliteAgentRunLedgers.runId, runId)).get();
      const payload = row ? parseAgentRunLedgerPayload(row.payload) : undefined;
      return isAgentRunLedgerRecord(payload) ? payload : undefined;
    },
    async saveLedger(record) {
      assertPersistableLedger(record);
      saveSqliteLedger(store, record);
      return record;
    },
    async saveRunnerStartCommit(input) {
      assertRunnerStartCommit(input);
      return sqliteTransaction(store, (tx) => {
        saveSqliteLedger(tx, input.run);
        saveSqliteRemoteToolRequest(tx, input.request);
        saveSqlitePolicyDecision(tx, input.policyDecision);
        return input;
      });
    },
    async saveRunnerTerminalPolicyCommit(input) {
      assertRunnerTerminalPolicyCommit(input);
      return sqliteTransaction(store, (tx) => {
        saveSqliteLedger(tx, input.run);
        saveSqlitePolicyDecision(tx, input.policyDecision);
        const cancelledRequests = cancelSqliteActiveRemoteToolRequests(tx, input.run);
        return { ...input, cancelledRequests };
      });
    },
    async saveRunnerContinuationCommit(input) {
      assertRunnerContinuationCommit(input);
      return sqliteTransaction(store, (tx) => {
        const savedRequest = saveSqliteRunnerCompletedRequest(tx, input);
        if (savedRequest && !savedRequest.saved) {
          return { committed: false, runId: input.run.runId, currentRequest: savedRequest.request };
        }
        saveSqliteLedger(tx, input.run);
        if (input.nextRequest) saveSqliteRemoteToolRequest(tx, input.nextRequest);
        for (const policyDecision of runnerContinuationPolicyDecisions(input)) {
          saveSqlitePolicyDecision(tx, policyDecision);
        }
        if (input.modelStep) saveSqliteModelStep(tx, input.modelStep);
        const cancelledRequests = cancelSqliteActiveRemoteToolRequests(tx, input.run);
        return {
          committed: true,
          run: input.run,
          request: savedRequest?.request,
          nextRequest: input.nextRequest,
          policyDecisions: runnerContinuationPolicyDecisions(input),
          modelStep: input.modelStep,
          cancelledRequests
        };
      });
    },
    async saveLedgerCloseCommit(input) {
      assertRunnerLedgerCloseCommit(input);
      return sqliteTransaction(store, (tx) => {
        saveSqliteLedger(tx, input.run);
        const cancelledRequests = cancelSqliteActiveRemoteToolRequests(tx, input.run);
        return { ...input, cancelledRequests };
      });
    },
    async listRemoteToolRequests(runId) {
      return store
        .select()
        .from(sqliteAgentRunRemoteToolRequests)
        .where(eq(sqliteAgentRunRemoteToolRequests.runId, runId))
        .orderBy(asc(sqliteAgentRunRemoteToolRequests.requestedAt))
        .all()
        .map((row) => parseRemoteToolRequestPayload(row.payload))
        .filter(isAgentRunRemoteToolRequest);
    },
    async listAllRemoteToolRequests() {
      return store.select().from(sqliteAgentRunRemoteToolRequests).all()
        .map((row) => parseRemoteToolRequestPayload(row.payload))
        .filter(isAgentRunRemoteToolRequest);
    },
    async findRemoteToolRequest(runId, toolCallId) {
      const row = store
        .select()
        .from(sqliteAgentRunRemoteToolRequests)
        .where(and(eq(sqliteAgentRunRemoteToolRequests.runId, runId), eq(sqliteAgentRunRemoteToolRequests.toolCallId, toolCallId)))
        .get();
      return row ? parseRemoteToolRequestPayload(row.payload) : undefined;
    },
    async saveRemoteToolRequest(request) {
      assertPersistableRemoteToolRequest(request);
      saveSqliteRemoteToolRequest(store, request);
      return request;
    },
    async saveRemoteToolRequestIfCurrent(request, expected) {
      assertPersistableRemoteToolRequest(request);
      assertPersistableRemoteToolRequest(expected);
      return saveSqliteRemoteToolRequestIfCurrent(store, request, expected);
    },
    async listPolicyDecisions(runId) {
      return store
        .select()
        .from(sqliteAgentRunPolicyDecisions)
        .where(eq(sqliteAgentRunPolicyDecisions.runId, runId))
        .orderBy(asc(sqliteAgentRunPolicyDecisions.createdAt))
        .all()
        .map((row) => parseAgentRunPolicyDecisionPayload(row.payload))
        .filter(isAgentRunPolicyDecisionRecord);
    },
    async listAllPolicyDecisions() {
      return store.select().from(sqliteAgentRunPolicyDecisions).all()
        .map((row) => parseAgentRunPolicyDecisionPayload(row.payload))
        .filter(isAgentRunPolicyDecisionRecord);
    },
    async savePolicyDecision(decision) {
      assertPersistablePolicyDecision(decision);
      saveSqlitePolicyDecision(store, decision);
      return decision;
    },
    async listModelSteps(runId) {
      return store
        .select()
        .from(sqliteAgentRunModelSteps)
        .where(eq(sqliteAgentRunModelSteps.runId, runId))
        .orderBy(asc(sqliteAgentRunModelSteps.startedAt))
        .all()
        .map((row) => parseAgentRunModelStepPayload(row.payload))
        .filter(isAgentRunModelStepRecord);
    },
    async listAllModelSteps() {
      return store.select().from(sqliteAgentRunModelSteps).all()
        .map((row) => parseAgentRunModelStepPayload(row.payload))
        .filter(isAgentRunModelStepRecord);
    },
    async saveModelStep(step) {
      assertPersistableModelStep(step);
      saveSqliteModelStep(store, step);
      return step;
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
      const values = errorEventRowValues(event);
      store.insert(sqliteAgentErrorEvents)
        .values(values)
        .onConflictDoUpdate({
          target: sqliteAgentErrorEvents.eventId,
          set: errorEventRowUpdateValues(event)
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
        agentRunRemoteToolRequests: runIds.length
          ? store.select().from(sqliteAgentRunRemoteToolRequests).where(inArray(sqliteAgentRunRemoteToolRequests.runId, runIds)).all().length
          : 0,
        agentRunPolicyDecisions: runIds.length
          ? store.select().from(sqliteAgentRunPolicyDecisions).where(inArray(sqliteAgentRunPolicyDecisions.runId, runIds)).all().length
          : 0,
        agentRunModelSteps: runIds.length
          ? store.select().from(sqliteAgentRunModelSteps).where(inArray(sqliteAgentRunModelSteps.runId, runIds)).all().length
          : 0,
        agentErrorEvents: runIds.length
          ? store.select().from(sqliteAgentErrorEvents).where(inArray(sqliteAgentErrorEvents.runId, runIds)).all().length
          : 0
      };
    }
  };
}

function sqliteTransaction<T>(store: SqliteStore, callback: (tx: SqliteStore) => T): T {
  if ("transaction" in store && typeof store.transaction === "function") {
    return store.transaction((tx) => callback(tx));
  }
  return callback(store);
}

function saveSqliteLedger(store: SqliteStore, record: AgentRunLedgerRecord) {
  store.insert(sqliteAgentRunLedgers)
    .values(ledgerRowValues(record))
    .onConflictDoUpdate({
      target: sqliteAgentRunLedgers.runId,
      set: ledgerRowUpdateValues(record)
    })
    .run();
}

function saveSqliteRemoteToolRequest(store: SqliteStore, request: AgentRunRemoteToolRequest) {
  store.insert(sqliteAgentRunRemoteToolRequests)
    .values(remoteToolRequestRowValues(request))
    .onConflictDoUpdate({
      target: sqliteAgentRunRemoteToolRequests.requestId,
      set: remoteToolRequestRowUpdateValues(request)
    })
    .run();
}

function findSqliteRemoteToolRequest(store: SqliteStore, runId: string, toolCallId: string) {
  const row = store
    .select()
    .from(sqliteAgentRunRemoteToolRequests)
    .where(and(eq(sqliteAgentRunRemoteToolRequests.runId, runId), eq(sqliteAgentRunRemoteToolRequests.toolCallId, toolCallId)))
    .get();
  return row ? parseRemoteToolRequestPayload(row.payload) : undefined;
}

function saveSqliteRemoteToolRequestIfCurrent(
  store: SqliteStore,
  request: AgentRunRemoteToolRequest,
  expected: AgentRunRemoteToolRequest
): RemoteToolRequestSaveResult {
  const result = store.run(sql`
    UPDATE agent_run_remote_tool_requests
    SET
      tool_name = ${request.toolName},
      status = ${request.status},
      requested_at = ${timestampMs(request.requestedAt)},
      claimed_at = ${timestampMs(request.claimedAt)},
      claimed_by = ${request.claimedBy ?? null},
      lease_expires_at = ${timestampMs(request.leaseExpiresAt)},
      attempt_count = ${request.attemptCount ?? 0},
      completed_at = ${timestampMs(request.completedAt)},
      payload = ${JSON.stringify(request)}
    WHERE
      request_id = ${remoteToolRequestId(request.runId, request.toolCallId)}
      AND run_id = ${expected.runId}
      AND tool_call_id = ${expected.toolCallId}
      AND tool_name = ${expected.toolName}
      AND status = ${expected.status}
      AND requested_at IS ${timestampMs(expected.requestedAt)}
      AND claimed_at IS ${timestampMs(expected.claimedAt)}
      AND claimed_by IS ${expected.claimedBy ?? null}
      AND lease_expires_at IS ${timestampMs(expected.leaseExpiresAt)}
      AND attempt_count = ${expected.attemptCount ?? 0}
      AND completed_at IS ${timestampMs(expected.completedAt)}
  `) as unknown as { changes?: number };
  if (result.changes === 1) return { saved: true, request };
  const currentRequest = findSqliteRemoteToolRequest(store, request.runId, request.toolCallId);
  return { saved: false, request: isAgentRunRemoteToolRequest(currentRequest) ? currentRequest : undefined };
}

function saveSqlitePolicyDecision(store: SqliteStore, decision: AgentRunPolicyDecisionRecord) {
  store.insert(sqliteAgentRunPolicyDecisions)
    .values(policyDecisionRowValues(decision))
    .onConflictDoUpdate({
      target: sqliteAgentRunPolicyDecisions.decisionId,
      set: policyDecisionRowUpdateValues(decision)
    })
    .run();
}

function saveSqliteModelStep(store: SqliteStore, step: AgentRunModelStepRecord) {
  store.insert(sqliteAgentRunModelSteps)
    .values(modelStepRowValues(step))
    .onConflictDoUpdate({
      target: sqliteAgentRunModelSteps.stepId,
      set: modelStepRowUpdateValues(step)
    })
    .run();
}

function saveSqliteRunnerCompletedRequest(
  store: SqliteStore,
  input: RunnerContinuationCommitInput
): RemoteToolRequestSaveResult | undefined {
  if (!input.completedRequest) return undefined;
  if (input.expectedCompletedRequest) {
    return saveSqliteRemoteToolRequestIfCurrent(store, input.completedRequest, input.expectedCompletedRequest);
  }
  saveSqliteRemoteToolRequest(store, input.completedRequest);
  return { saved: true, request: input.completedRequest };
}

function runnerContinuationPolicyDecisions(input: RunnerContinuationCommitInput) {
  return [
    ...(input.policyDecision ? [input.policyDecision] : []),
    ...(input.policyDecisions ?? [])
  ];
}

function listSqliteActiveRemoteToolRequests(store: SqliteStore, runId: string) {
  return store
    .select()
    .from(sqliteAgentRunRemoteToolRequests)
    .where(and(
      eq(sqliteAgentRunRemoteToolRequests.runId, runId),
      inArray(sqliteAgentRunRemoteToolRequests.status, ["pending", "running"])
    ))
    .orderBy(asc(sqliteAgentRunRemoteToolRequests.requestedAt))
    .all()
    .map((row) => parseRemoteToolRequestPayload(row.payload))
    .filter(isAgentRunRemoteToolRequest);
}

function cancelSqliteActiveRemoteToolRequests(store: SqliteStore, run: AgentRunLedgerRecord) {
  if (!isTerminalAgentRunStatus(run.status)) return [];
  const requests = listSqliteActiveRemoteToolRequests(store, run.runId);
  return requests.map((request) => {
    const cancelled = cancelAgentRunRemoteToolRequest(request, {
      completedAt: run.completedAt ?? undefined
    });
    saveSqliteRemoteToolRequest(store, cancelled);
    return cancelled;
  });
}

function ledgerRowValues(record: AgentRunLedgerRecord) {
  return {
    runId: record.runId,
    conversationId: record.conversationId,
    status: record.status,
    mode: record.mode,
    modelProvider: record.modelProvider,
    modelId: record.modelId,
    startedAt: new Date(record.startedAt),
    completedAt: record.completedAt ? new Date(record.completedAt) : null,
    payload: record
  };
}

function ledgerRowUpdateValues(record: AgentRunLedgerRecord) {
  return {
    conversationId: record.conversationId,
    status: record.status,
    mode: record.mode,
    modelProvider: record.modelProvider,
    modelId: record.modelId,
    startedAt: new Date(record.startedAt),
    completedAt: record.completedAt ? new Date(record.completedAt) : null,
    payload: record
  };
}

function remoteToolRequestRowValues(request: AgentRunRemoteToolRequest) {
  return {
    requestId: remoteToolRequestId(request.runId, request.toolCallId),
    runId: request.runId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    status: request.status,
    requestedAt: new Date(request.requestedAt),
    claimedAt: request.claimedAt ? new Date(request.claimedAt) : null,
    claimedBy: request.claimedBy ?? null,
    leaseExpiresAt: request.leaseExpiresAt ? new Date(request.leaseExpiresAt) : null,
    attemptCount: request.attemptCount ?? 0,
    completedAt: request.completedAt ? new Date(request.completedAt) : null,
    payload: request
  };
}

function remoteToolRequestRowUpdateValues(request: AgentRunRemoteToolRequest) {
  return {
    toolName: request.toolName,
    status: request.status,
    requestedAt: new Date(request.requestedAt),
    claimedAt: request.claimedAt ? new Date(request.claimedAt) : null,
    claimedBy: request.claimedBy ?? null,
    leaseExpiresAt: request.leaseExpiresAt ? new Date(request.leaseExpiresAt) : null,
    attemptCount: request.attemptCount ?? 0,
    completedAt: request.completedAt ? new Date(request.completedAt) : null,
    payload: request
  };
}

function policyDecisionRowValues(decision: AgentRunPolicyDecisionRecord) {
  return {
    decisionId: decision.decisionId,
    runId: decision.runId,
    stage: decision.stage,
    kind: decision.kind,
    allowed: decision.allowed,
    toolCallId: decision.toolCallId ?? null,
    toolName: decision.toolName ?? null,
    createdAt: new Date(decision.createdAt),
    payload: decision
  };
}

function policyDecisionRowUpdateValues(decision: AgentRunPolicyDecisionRecord) {
  return {
    stage: decision.stage,
    kind: decision.kind,
    allowed: decision.allowed,
    toolCallId: decision.toolCallId ?? null,
    toolName: decision.toolName ?? null,
    createdAt: new Date(decision.createdAt),
    payload: decision
  };
}

function modelStepRowValues(step: AgentRunModelStepRecord) {
  return {
    stepId: step.stepId,
    runId: step.runId,
    stage: step.stage,
    source: step.source,
    status: step.status,
    modelProvider: step.modelProvider,
    modelId: step.modelId,
    startedAt: new Date(step.startedAt),
    completedAt: step.completedAt ? new Date(step.completedAt) : null,
    inputToolCount: step.inputToolCount,
    attachmentCount: step.attachmentCount,
    outputType: step.outputType ?? null,
    outputToolCallId: step.outputToolCallId ?? null,
    outputToolName: step.outputToolName ?? null,
    payload: step
  };
}

function modelStepRowUpdateValues(step: AgentRunModelStepRecord) {
  return {
    stage: step.stage,
    source: step.source,
    status: step.status,
    modelProvider: step.modelProvider,
    modelId: step.modelId,
    startedAt: new Date(step.startedAt),
    completedAt: step.completedAt ? new Date(step.completedAt) : null,
    inputToolCount: step.inputToolCount,
    attachmentCount: step.attachmentCount,
    outputType: step.outputType ?? null,
    outputToolCallId: step.outputToolCallId ?? null,
    outputToolName: step.outputToolName ?? null,
    payload: step
  };
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
    payload: {
      event: input.payload,
      capturedAt: createdAt.toISOString()
    }
  };
}

function errorEventRowUpdateValues(input: AgentErrorEventInput) {
  return {
    conversationId: input.conversationId ?? null,
    source: input.source,
    code: input.code,
    severity: input.severity,
    message: input.message,
    modelProvider: input.modelProvider ?? null,
    modelId: input.modelId ?? null,
    toolCallId: input.toolCallId ?? null,
    toolName: input.toolName ?? null,
    createdAt: new Date(input.createdAt ?? new Date().toISOString()),
    payload: errorEventRowValues(input).payload
  };
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
    eventId: row.eventId,
    runId: row.runId,
    conversationId: row.conversationId,
    source: row.source,
    code: row.code,
    severity: row.severity,
    message: row.message,
    modelProvider: row.modelProvider,
    modelId: row.modelId,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    createdAt: row.createdAt.toISOString(),
    payload: parseAgentRunLedgerPayload(row.payload)
  };
}

function parseAgentRunLedgerPayload(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

function parseRemoteToolRequestPayload(value: unknown) {
  const payload = parseAgentRunLedgerPayload(value);
  return isAgentRunRemoteToolRequest(payload) ? payload : undefined;
}

function parseAgentRunPolicyDecisionPayload(value: unknown) {
  const payload = parseAgentRunLedgerPayload(value);
  return isAgentRunPolicyDecisionRecord(payload) ? payload : undefined;
}

function parseAgentRunModelStepPayload(value: unknown) {
  const payload = parseAgentRunLedgerPayload(value);
  return isAgentRunModelStepRecord(payload) ? payload : undefined;
}

function assertPersistableLedger(payload: AgentRunLedgerRecord) {
  if (!isAgentRunLedgerRecord(payload)) {
    throw new Error("Refusing to persist invalid agent run ledger.");
  }
}

function assertPersistableRemoteToolRequest(payload: AgentRunRemoteToolRequest) {
  const reasons = agentRunRemoteToolRequestInvalidReasons(payload);
  if (reasons.length) {
    throw new Error(`Refusing to persist invalid remote tool request: ${reasons.join("; ")}.`);
  }
}

function assertPersistablePolicyDecision(payload: AgentRunPolicyDecisionRecord) {
  if (!isAgentRunPolicyDecisionRecord(payload)) {
    throw new Error("Refusing to persist invalid policy decision.");
  }
}

function assertPersistableModelStep(payload: AgentRunModelStepRecord) {
  if (!isAgentRunModelStepRecord(payload)) {
    throw new Error("Refusing to persist invalid model step.");
  }
}

function assertRunnerStartCommit(input: {
  run: AgentRunLedgerRecord;
  request: AgentRunRemoteToolRequest;
  policyDecision: AgentRunPolicyDecisionRecord;
}) {
  assertPersistableLedger(input.run);
  assertPersistableRemoteToolRequest(input.request);
  assertPersistablePolicyDecision(input.policyDecision);
  if (input.request.runId !== input.run.runId || input.policyDecision.runId !== input.run.runId) {
    throw new Error("Runner start commit records must belong to the same run.");
  }
  if (input.policyDecision.stage !== "runner_start") {
    throw new Error("Runner start commit policy decision must use runner_start stage.");
  }
}

function assertRunnerTerminalPolicyCommit(input: {
  run: AgentRunLedgerRecord;
  policyDecision: AgentRunPolicyDecisionRecord;
}) {
  assertPersistableLedger(input.run);
  assertPersistablePolicyDecision(input.policyDecision);
  if (!isTerminalAgentRunStatus(input.run.status)) {
    throw new Error("Runner terminal policy commit requires a terminal run.");
  }
  if (input.policyDecision.runId !== input.run.runId) {
    throw new Error("Runner terminal policy commit records must belong to the same run.");
  }
}

function assertRunnerContinuationCommit(input: RunnerContinuationCommitInput) {
  assertPersistableLedger(input.run);
  if (input.completedRequest) {
    assertPersistableRemoteToolRequest(input.completedRequest);
    if (input.completedRequest.runId !== input.run.runId) {
      throw new Error("Runner continuation completed request must belong to the run.");
    }
  }
  if (input.expectedCompletedRequest) {
    assertPersistableRemoteToolRequest(input.expectedCompletedRequest);
    if (!input.completedRequest) {
      throw new Error("Runner continuation expected request requires a completed request.");
    }
    if (
      input.expectedCompletedRequest.runId !== input.completedRequest.runId ||
      input.expectedCompletedRequest.toolCallId !== input.completedRequest.toolCallId
    ) {
      throw new Error("Runner continuation expected request must match the completed request.");
    }
  }
  if (input.nextRequest) {
    assertPersistableRemoteToolRequest(input.nextRequest);
    if (input.nextRequest.runId !== input.run.runId) {
      throw new Error("Runner continuation next request must belong to the run.");
    }
  }
  for (const policyDecision of runnerContinuationPolicyDecisions(input)) {
    assertPersistablePolicyDecision(policyDecision);
    if (policyDecision.runId !== input.run.runId) {
      throw new Error("Runner continuation policy decisions must belong to the run.");
    }
  }
  if (input.modelStep) {
    assertPersistableModelStep(input.modelStep);
    if (input.modelStep.runId !== input.run.runId) {
      throw new Error("Runner continuation model step must belong to the run.");
    }
  }
}

function assertRunnerLedgerCloseCommit(input: { run: AgentRunLedgerRecord }) {
  assertPersistableLedger(input.run);
}

function remoteToolRequestId(runId: string, toolCallId: string) {
  return `${runId}:${toolCallId}`;
}

function timestampMs(value: string | null | undefined) {
  return value ? new Date(value).getTime() : null;
}
