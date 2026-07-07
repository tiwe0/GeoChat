import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  DEFAULT_AGENT_RUN_REMOTE_TOOL_MAX_ATTEMPTS,
  agentRunToolArgsMatch,
  agentModelPolicySnapshotFor,
  advanceAgentWorkflowState,
  agentModelSupportsImages,
  agentRunRunnerModelPolicyFor,
  deriveAgentWorkflowStateFromTools,
  evaluateAgentWorkflowToolCall,
  evaluateAgentWorkflowToolRecord,
  getAgentModelPolicy,
  getFunctionCallSpec,
  getFunctionCallInputJsonSchema,
  getFunctionCallBackendExecutableToolNames,
  getFunctionCallToolNames,
  getFunctionCallPlanningToolNames,
  getFunctionCallRemoteBridgeToolNames,
  compileGeometryPlanToExecuteArgs,
  compileGeometryPlanToGeoGebra,
  createGeometryPlanFromRecipe,
  normalizeGeoGebraFreeParameterCommands,
  normalizeGeoGebraPerspectiveMode,
  collectGeoGebraCommandUsageStats,
  extractGeoGebraCommandName,
  normalizeConstructionRecipeInputs,
  searchGeoGebraCommandReference,
  findConstructionRecipesForIntent,
  isGeometryPlan,
  isFunctionCallArgs,
  isFunctionCallBackendExecutable,
  isFunctionCallRendererExecutable,
  createInitialAgentWorkflowState,
  agentRunStartPayload,
  canTransitionAgentRunStatus,
  cancelAgentRunRemoteToolRequest,
  claimAgentRunRemoteToolRequest,
  completeAgentRunRemoteToolRequest,
  createAgentRunInitialCanvasReadRequest,
  createAgentRunCoordinator,
  createAgentRunLedger,
  createAgentRunLedgerFromStart,
  createAgentRunRemoteToolRequest,
  failAgentRunRemoteToolRequestForAttemptLimit,
  findAgentRunToolCallConflict,
  findAgentRunToolCallIdReuseConflict,
  finishAgentRunLedger,
  AgentRunCoordinatorError,
  agentRunRunnerBudgetFor,
  decideAgentRunRunnerStart,
  decideAgentRunRunnerContinuation,
  agentRunRunnerPhaseFor,
  agentRunRunnerStatusFor,
  isAgentRunFinishInput,
  isAgentRunLedgerRecord,
  isAgentRunModelStepRecord,
  isAgentRunPolicyDecisionRecord,
  isAgentRunRemoteToolRequest,
  isAgentRunRemoteToolRequestAttemptLimitReached,
  isAgentRunRemoteToolRequestClaimable,
  agentRunRemoteToolExecutionCacheKey,
  cachedRemoteToolExecutionMatchesRequest,
  isAgentRunRemoteToolRequestInput,
  isAgentRunRemoteToolRequestLeaseExpired,
  isAgentRunRemoteToolRequestTerminal,
  isAgentRunRemoteToolResultInput,
  isAgentRunToolCallId,
  createAgentRunRemoteToolExecutionCacheEntry,
  findAgentRunRemoteToolRequestConflict,
  isAgentRunRemoteToolExecutionCacheEntry,
  isAgentRunRunnerStartInput,
  isAgentRunRunnerSnapshot,
  isAgentRunRawGeoGebraCommandFallback,
  requiredGeometryPlanRecipeIdsBeforeRawCommands,
  isAgentModelPolicySnapshot,
  isAgentRunStartInput,
  isAgentRunToolRecord,
  isAgentRunUsage,
  isTerminalAgentRunStatus,
  upsertAgentRunTool,
  enrichCanvasReadToolWithGeometryVerification,
  verifyGeometryPlanAgainstCanvas,
  geometryVerificationReportFromToolResult,
  verifyGeometryPlanToolResultAgainstCanvas,
  geogebraCanvasVisualGuidance,
  findForbiddenTwoDimensionalStyleCommands,
  GEOCHAT_SYSTEM_PROMPT,
  GEOCHAT_SYSTEM_PROMPT_EN
} from "@geochat-ai/app";
import { createDatabase } from "../backend/src/db/client";
import { createAgentRunRepository } from "../backend/src/db/agent-run-repository";
import {
  agentRunLedgers,
  agentRunModelSteps,
  agentRunPolicyDecisions,
  agentRunRemoteToolRequests
} from "../backend/src/db/schema";
import { createDatabaseForPath, createHttpHarness } from "./agent-harness-http-utils";

describe("runner HTTP lifecycle", () => {
  test("persists runner start model failures as failed ledgers", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-model-error-${crypto.randomUUID()}`;

    const response = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "unknown-provider",
            modelId: "missing-model",
            prompt: "画一个圆",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:00:00.000Z"
          },
          model: {
            provider: "unknown-provider",
            model: "missing-model",
            apiKey: "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
            customBaseUrl: ""
          }
        })
      })
    );
    const payload = await response.json() as {
      error?: string;
      runner?: {
        run?: { status?: string; error?: string };
        policyDecisions?: unknown[];
      };
    };

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      error: "runner_model_error",
      runner: {
        run: {
          status: "failed"
        },
        policyDecisions: [{ stage: "runner_start", kind: "model_error", allowed: false }]
      }
    });
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");

    const listResponse = await handleRequest(new Request("http://127.0.0.1:17365/v1/agent-runs"));
    const listPayload = await listResponse.json() as { runs?: Array<{ runId: string; status: string; error?: string | null }> };
    expect(listPayload.runs?.find((run) => run.runId === runId)).toMatchObject({
      status: "failed"
    });
  });

  test("rejects runner start payloads whose transient model does not match the run ledger model", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-start-model-mismatch-${crypto.randomUUID()}`;

    const response = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "deepseek",
            modelId: "deepseek-v4-flash",
            prompt: "画一个圆",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:00:30.000Z"
          },
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
            customBaseUrl: ""
          }
        })
      })
    );
    const payload = await response.json() as {
      error?: string;
      runner?: {
        run?: { runId?: string; status?: string; tools?: unknown[]; error?: string | null };
        policyDecisions?: unknown[];
      };
    };

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      error: "runner_model_mismatch",
      runner: {
        run: {
          runId,
          status: "failed",
          tools: []
        },
        policyDecisions: [{ stage: "runner_start", kind: "model_mismatch", allowed: false }]
      }
    });
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");

    const listResponse = await handleRequest(new Request("http://127.0.0.1:17365/v1/agent-runs"));
    const listPayload = await listResponse.json() as { runs?: Array<{ runId: string; status: string; error?: string | null }> };
    expect(listPayload.runs?.find((run) => run.runId === runId)).toMatchObject({
      status: "failed",
      error: "Agent runner model must match the model recorded on the run ledger: deepseek/deepseek-v4-flash."
    });
  });

  test("rejects malformed supplied first tools even when runner start includes a valid model", async () => {
    const { handleRequest } = await createHttpHarness();
    const response = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId: `runner-invalid-first-tool-${crypto.randomUUID()}`,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "画圆",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:00:12.000Z"
          },
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "sk-test-valid-model",
            customBaseUrl: ""
          },
          firstTool: {
            toolCallId: " ",
            toolName: "getCanvasContext",
            args: { includeXml: false }
          }
        })
      })
    );
    const payload = await response.json() as { error?: string; message?: string };

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: "invalid_request",
      message: "Invalid agent runner start payload."
    });
  });

  test("persists runner start ledgers and first remote tool requests together", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-start-commit-${crypto.randomUUID()}`;
    const claimOwner = "runner-start-commit-renderer";

    const response = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "先读取画布",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:00:40.000Z"
          },
          firstTool: {
            toolCallId: "runner-start-read",
            toolName: "getCanvasContext",
            args: { includeXml: false },
            requestedAt: "2026-06-06T00:00:41.000Z"
          }
        })
      })
    );
    const payload = await response.json() as {
      runner?: {
        run?: { runId?: string; status?: string };
        pendingToolRequests?: Array<{ toolCallId?: string; status?: string }>;
        policyDecisions?: unknown[];
      };
    };

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      runner: {
        run: { runId, status: "running" },
        pendingToolRequests: [{ toolCallId: "runner-start-read", status: "pending" }],
        policyDecisions: [
          { stage: "runner_start", kind: "runner_start_enqueued", allowed: true, toolCallId: "runner-start-read" }
        ]
      }
    });
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);

    const pendingResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
    );
    const pendingPayload = await pendingResponse.json() as { requests?: Array<{ toolCallId?: string; status?: string; claimedBy?: string | null }> };
    expect(pendingPayload.requests).toMatchObject([{ toolCallId: "runner-start-read", status: "running", claimedBy: claimOwner }]);

    const listResponse = await handleRequest(new Request("http://127.0.0.1:17365/v1/agent-runs"));
    const listPayload = await listResponse.json() as { runs?: Array<{ runId: string; status: string }> };
    expect(listPayload.runs?.find((run) => run.runId === runId)).toMatchObject({ runId, status: "running" });
  });

  test("rejects inconsistent runner start commits without partial writes", async () => {
    const databasePath = `/tmp/geochat-runner-start-invalid-${crypto.randomUUID()}.sqlite`;
    const previousDatabasePath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    try {
      const db = createDatabase();
      const repository = createAgentRunRepository({
        requestedDriver: "sqlite",
        sqlitePath: databasePath,
        migrationsSchema: "sqlite"
      }, db);
      const runId = `runner-start-invalid-${crypto.randomUUID()}`;
      const run = createAgentRunLedger({
        runId,
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
        prompt: "先读取画布",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:40.000Z"
      });
      const request = createAgentRunRemoteToolRequest(runId, {
        toolCallId: "runner-start-invalid-read",
        toolName: "getCanvasContext",
        args: { includeXml: false },
        requestedAt: "2026-06-06T00:00:41.000Z"
      });
      const decisionId = `runner-start-invalid-policy-${crypto.randomUUID()}`;
      const policyDecision = {
        decisionId,
        runId: `${runId}-other`,
        stage: "runner_start",
        kind: "runner_start_enqueued",
        allowed: true,
        toolCallId: "runner-start-invalid-read",
        toolName: "getCanvasContext",
        message: "Runner start enqueued the first remote tool request.",
        createdAt: "2026-06-06T00:00:42.000Z",
        details: { request: { toolCallId: "runner-start-invalid-read", toolName: "getCanvasContext", args: { includeXml: false } } }
      } as never;

      await expect(repository.saveRunnerStartCommit({ run, request, policyDecision })).rejects.toThrow(/same run/);
      expect(db.select().from(agentRunLedgers).where(eq(agentRunLedgers.runId, runId)).all()).toHaveLength(0);
      expect(db.select().from(agentRunRemoteToolRequests).where(eq(agentRunRemoteToolRequests.runId, runId)).all()).toHaveLength(0);
      expect(db.select().from(agentRunPolicyDecisions).where(eq(agentRunPolicyDecisions.decisionId, decisionId)).all()).toHaveLength(0);
    } finally {
      if (previousDatabasePath === undefined) {
        delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      } else {
        Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousDatabasePath;
      }
    }
  });

  test("commits terminal runner policy decisions and cancels active remote requests together", async () => {
    const databasePath = `/tmp/geochat-runner-terminal-policy-${crypto.randomUUID()}.sqlite`;
    const previousDatabasePath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    try {
      const db = createDatabase();
      const repository = createAgentRunRepository({
        requestedDriver: "sqlite",
        sqlitePath: databasePath,
        migrationsSchema: "sqlite"
      }, db);
      const runId = `runner-terminal-policy-${crypto.randomUUID()}`;
      const run = createAgentRunLedger({
        runId,
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
        prompt: "先读取画布",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:40.000Z"
      });
      const request = createAgentRunRemoteToolRequest(runId, {
        toolCallId: "runner-terminal-policy-read",
        toolName: "getCanvasContext",
        args: { includeXml: false },
        requestedAt: "2026-06-06T00:00:41.000Z"
      });
      await repository.saveRemoteToolRequest(request);
      const completedAt = "2026-06-06T00:00:42.000Z";
      const failedRun = finishAgentRunLedger(run, {
        status: "failed",
        completedAt,
        error: "Remote tool request exceeded 3 claim attempts."
      });
      const policyDecision = {
        decisionId: `runner-terminal-policy-decision-${crypto.randomUUID()}`,
        runId,
        stage: "runner_continuation",
        kind: "tool_request_dead_letter",
        allowed: false,
        toolCallId: "runner-terminal-policy-read",
        toolName: "getCanvasContext",
        message: "Remote tool request exceeded 3 claim attempts.",
        createdAt: completedAt,
        details: {
          attemptCount: request.attemptCount,
          status: request.status,
          claimedBy: request.claimedBy ?? null
        }
      } as const;

      const committed = await repository.saveRunnerTerminalPolicyCommit({ run: failedRun, policyDecision });

      expect(committed.cancelledRequests).toMatchObject([
        {
          toolCallId: "runner-terminal-policy-read",
          status: "cancelled",
          completedAt,
          error: "Agent run closed before remote tool completion."
        }
      ]);
      expect(db.select().from(agentRunLedgers).where(eq(agentRunLedgers.runId, runId)).get()?.status).toBe("failed");
      expect(db.select().from(agentRunPolicyDecisions).where(eq(agentRunPolicyDecisions.runId, runId)).all()).toHaveLength(1);
      const storedRequest = db.select().from(agentRunRemoteToolRequests).where(eq(agentRunRemoteToolRequests.runId, runId)).get();
      expect(storedRequest).toMatchObject({
        toolCallId: "runner-terminal-policy-read",
        status: "cancelled"
      });
      expect(storedRequest?.completedAt?.toISOString()).toBe(completedAt);
    } finally {
      if (previousDatabasePath === undefined) {
        delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      } else {
        Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousDatabasePath;
      }
    }
  });

  test("commits runner continuations through one repository boundary", async () => {
    const databasePath = `/tmp/geochat-runner-continuation-${crypto.randomUUID()}.sqlite`;
    const previousDatabasePath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    try {
      const db = createDatabase();
      const repository = createAgentRunRepository({
        requestedDriver: "sqlite",
        sqlitePath: databasePath,
        migrationsSchema: "sqlite"
      }, db);
      const runId = `runner-continuation-${crypto.randomUUID()}`;
      const run = createAgentRunLedger({
        runId,
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
        prompt: "先读取画布",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:40.000Z"
      });
      const pendingRequest = createAgentRunRemoteToolRequest(runId, {
        toolCallId: "runner-continuation-read",
        toolName: "getCanvasContext",
        args: { includeXml: false },
        requestedAt: "2026-06-06T00:00:41.000Z"
      });
      const runningRequest = claimAgentRunRemoteToolRequest(pendingRequest, {
        claimedAt: "2026-06-06T00:00:42.000Z",
        claimedBy: "repository-test-renderer",
        leaseMs: 10_000,
        maxAttempts: DEFAULT_AGENT_RUN_REMOTE_TOOL_MAX_ATTEMPTS
      });
      await repository.saveRemoteToolRequest(runningRequest);
      const completedTool = {
        toolCallId: "runner-continuation-read",
        toolName: "getCanvasContext" as const,
        status: "succeeded" as const,
        args: { includeXml: false },
        result: { canvasContext: { objects: [] }, ok: true },
        startedAt: "2026-06-06T00:00:42.000Z",
        completedAt: "2026-06-06T00:00:43.000Z",
        durationMs: 1000
      };
      const completedRequest = completeAgentRunRemoteToolRequest(runningRequest, completedTool);
      const nextRequest = createAgentRunRemoteToolRequest(runId, {
        toolCallId: "runner-continuation-search",
        toolName: "searchGeoGebraCommands",
        args: { query: "Circle", scope: "conic", topN: 3 },
        requestedAt: "2026-06-06T00:00:44.000Z"
      });
      const nextRun = upsertAgentRunTool(run, completedTool);
      const policyDecision = {
        decisionId: `runner-continuation-policy-${crypto.randomUUID()}`,
        runId,
        stage: "runner_continuation",
        kind: "runner_continuation_enqueued",
        allowed: true,
        toolCallId: "runner-continuation-search",
        toolName: "searchGeoGebraCommands",
        message: "Runner continuation enqueued the next remote tool request.",
        createdAt: "2026-06-06T00:00:44.000Z",
        details: {
          request: {
            toolCallId: "runner-continuation-search",
            toolName: "searchGeoGebraCommands",
            args: { query: "Circle", scope: "conic", topN: 3 },
            requestedAt: "2026-06-06T00:00:44.000Z"
          },
          executor: "remote_bridge"
        }
      } as const;
      const modelStep = {
        stepId: `runner-continuation-step-${crypto.randomUUID()}`,
        runId,
        stage: "runner_continuation",
        source: "model",
        status: "succeeded",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        startedAt: "2026-06-06T00:00:43.000Z",
        completedAt: "2026-06-06T00:00:44.000Z",
        durationMs: 1000,
        inputToolCount: 1,
        attachmentCount: 0,
        outputType: "tool",
        outputToolCallId: "runner-continuation-search",
        outputToolName: "searchGeoGebraCommands",
        outputTextLength: null,
        usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
        error: null
      } as const;

      const committed = await repository.saveRunnerContinuationCommit({
        run: nextRun,
        completedRequest,
        expectedCompletedRequest: runningRequest,
        nextRequest,
        policyDecision,
        modelStep
      });

      expect(committed).toMatchObject({
        committed: true,
        request: { toolCallId: "runner-continuation-read", status: "succeeded" },
        nextRequest: { toolCallId: "runner-continuation-search", status: "pending" }
      });
      expect(db.select().from(agentRunLedgers).where(eq(agentRunLedgers.runId, runId)).get()?.status).toBe("running");
      expect(db.select().from(agentRunRemoteToolRequests).where(eq(agentRunRemoteToolRequests.runId, runId)).all().map((item) => ({
        toolCallId: item.toolCallId,
        status: item.status
      }))).toEqual(expect.arrayContaining([
        { toolCallId: "runner-continuation-read", status: "succeeded" },
        { toolCallId: "runner-continuation-search", status: "pending" }
      ]));
      expect(db.select().from(agentRunPolicyDecisions).where(eq(agentRunPolicyDecisions.runId, runId)).all()).toHaveLength(1);
      expect(db.select().from(agentRunModelSteps).where(eq(agentRunModelSteps.runId, runId)).all()).toHaveLength(1);
    } finally {
      if (previousDatabasePath === undefined) {
        delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      } else {
        Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousDatabasePath;
      }
    }
  });

  test("does not persist runner continuation ledgers when request compare-and-set fails", async () => {
    const databasePath = `/tmp/geochat-runner-continuation-stale-${crypto.randomUUID()}.sqlite`;
    const previousDatabasePath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    try {
      const db = createDatabase();
      const repository = createAgentRunRepository({
        requestedDriver: "sqlite",
        sqlitePath: databasePath,
        migrationsSchema: "sqlite"
      }, db);
      const runId = `runner-continuation-stale-${crypto.randomUUID()}`;
      const run = createAgentRunLedger({
        runId,
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
        prompt: "先读取画布",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:40.000Z"
      });
      const pendingRequest = createAgentRunRemoteToolRequest(runId, {
        toolCallId: "runner-continuation-stale-read",
        toolName: "getCanvasContext",
        args: { includeXml: false },
        requestedAt: "2026-06-06T00:00:41.000Z"
      });
      const runningRequest = claimAgentRunRemoteToolRequest(pendingRequest, {
        claimedAt: "2026-06-06T00:00:42.000Z",
        claimedBy: "repository-test-renderer",
        leaseMs: 10_000,
        maxAttempts: DEFAULT_AGENT_RUN_REMOTE_TOOL_MAX_ATTEMPTS
      });
      await repository.saveRemoteToolRequest(runningRequest);
      const completedTool = {
        toolCallId: "runner-continuation-stale-read",
        toolName: "getCanvasContext" as const,
        status: "succeeded" as const,
        args: { includeXml: false },
        result: { canvasContext: { objects: [] }, ok: true },
        startedAt: "2026-06-06T00:00:42.000Z",
        completedAt: "2026-06-06T00:00:43.000Z",
        durationMs: 1000
      };
      const completedRequest = completeAgentRunRemoteToolRequest(runningRequest, completedTool);

      const committed = await repository.saveRunnerContinuationCommit({
        run: upsertAgentRunTool(run, completedTool),
        completedRequest,
        expectedCompletedRequest: { ...runningRequest, claimedBy: "stale-owner" }
      });

      expect(committed).toMatchObject({
        committed: false,
        runId,
        currentRequest: { toolCallId: "runner-continuation-stale-read", status: "running", claimedBy: "repository-test-renderer" }
      });
      expect(db.select().from(agentRunLedgers).where(eq(agentRunLedgers.runId, runId)).all()).toHaveLength(0);
      expect(db.select().from(agentRunRemoteToolRequests).where(eq(agentRunRemoteToolRequests.runId, runId)).all()).toHaveLength(1);
      expect(db.select().from(agentRunRemoteToolRequests).where(eq(agentRunRemoteToolRequests.runId, runId)).get()?.status).toBe("running");
    } finally {
      if (previousDatabasePath === undefined) {
        delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      } else {
        Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousDatabasePath;
      }
    }
  });

  test("commits legacy ledger close saves and active request cancellation together", async () => {
    const databasePath = `/tmp/geochat-ledger-close-${crypto.randomUUID()}.sqlite`;
    const previousDatabasePath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    try {
      const db = createDatabase();
      const repository = createAgentRunRepository({
        requestedDriver: "sqlite",
        sqlitePath: databasePath,
        migrationsSchema: "sqlite"
      }, db);
      const runId = `ledger-close-${crypto.randomUUID()}`;
      const run = createAgentRunLedger({
        runId,
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
        prompt: "先读取画布",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:40.000Z"
      });
      const pendingRequest = createAgentRunRemoteToolRequest(runId, {
        toolCallId: "ledger-close-read",
        toolName: "getCanvasContext",
        args: { includeXml: false },
        requestedAt: "2026-06-06T00:00:41.000Z"
      });
      await repository.saveRemoteToolRequest(pendingRequest);
      const completedAt = "2026-06-06T00:00:42.000Z";
      const closedRun = finishAgentRunLedger(run, {
        status: "cancelled",
        completedAt,
        error: "Closed through legacy ledger save."
      });

      const committed = await repository.saveLedgerCloseCommit({ run: closedRun });

      expect(committed.cancelledRequests).toMatchObject([
        {
          toolCallId: "ledger-close-read",
          status: "cancelled",
          completedAt,
          error: "Agent run closed before remote tool completion."
        }
      ]);
      expect(db.select().from(agentRunLedgers).where(eq(agentRunLedgers.runId, runId)).get()?.status).toBe("cancelled");
      const storedRequest = db.select().from(agentRunRemoteToolRequests).where(eq(agentRunRemoteToolRequests.runId, runId)).get();
      expect(storedRequest).toMatchObject({ toolCallId: "ledger-close-read", status: "cancelled" });
      expect(storedRequest?.completedAt?.toISOString()).toBe(completedAt);
    } finally {
      if (previousDatabasePath === undefined) {
        delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      } else {
        Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousDatabasePath;
      }
    }
  });

  test("keeps active remote requests when legacy ledger close saves a running run", async () => {
    const databasePath = `/tmp/geochat-ledger-close-running-${crypto.randomUUID()}.sqlite`;
    const previousDatabasePath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    try {
      const db = createDatabase();
      const repository = createAgentRunRepository({
        requestedDriver: "sqlite",
        sqlitePath: databasePath,
        migrationsSchema: "sqlite"
      }, db);
      const runId = `ledger-close-running-${crypto.randomUUID()}`;
      const run = createAgentRunLedger({
        runId,
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
        prompt: "先读取画布",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:40.000Z"
      });
      const pendingRequest = createAgentRunRemoteToolRequest(runId, {
        toolCallId: "ledger-close-running-read",
        toolName: "getCanvasContext",
        args: { includeXml: false },
        requestedAt: "2026-06-06T00:00:41.000Z"
      });
      await repository.saveRemoteToolRequest(pendingRequest);

      const committed = await repository.saveLedgerCloseCommit({ run });

      expect(committed.cancelledRequests).toEqual([]);
      expect(db.select().from(agentRunLedgers).where(eq(agentRunLedgers.runId, runId)).get()?.status).toBe("running");
      expect(db.select().from(agentRunRemoteToolRequests).where(eq(agentRunRemoteToolRequests.runId, runId)).get()?.status).toBe("pending");
    } finally {
      if (previousDatabasePath === undefined) {
        delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
      } else {
        Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousDatabasePath;
      }
    }
  });

  test("does not claim pending remote tools after the run is closed", async () => {
    const { databasePath, handleRequest } = await createHttpHarness();
    const runId = `runner-closed-pending-${crypto.randomUUID()}`;

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "读取画布",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:00:40.000Z"
          },
          firstTool: {
            toolCallId: "closed-run-read",
            toolName: "getCanvasContext",
            args: { includeXml: false },
            requestedAt: "2026-06-06T00:00:41.000Z"
          }
        })
      })
    );
    expect(startResponse.status).toBe(201);

    const finishResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/finish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "failed",
          error: "manual stop",
          completedAt: "2026-06-06T00:00:42.000Z"
        })
      })
    );
    expect(finishResponse.status).toBe(200);
    const finishPayload = await finishResponse.json() as {
      cancelledRequests?: Array<{ toolCallId?: string; status?: string; completedAt?: string | null; error?: string | null }>;
    };
    expect(finishPayload.cancelledRequests).toMatchObject([
      {
        toolCallId: "closed-run-read",
        status: "cancelled",
        completedAt: "2026-06-06T00:00:42.000Z",
        error: "Agent run closed before remote tool completion."
      }
    ]);

    const pendingResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=closed-run-renderer`)
    );
    const pendingPayload = await pendingResponse.json() as { error?: string; message?: string };
    expect(pendingResponse.status).toBe(409);
    expect(pendingPayload).toEqual({
      error: "run_closed",
      message: "Agent run is already failed."
    });

    const runnerResponse = await handleRequest(new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/runner`));
    const runnerPayload = await runnerResponse.json() as { runner?: { status?: string; pendingToolRequests?: unknown[] } };
    expect(runnerPayload.runner).toMatchObject({
      status: "failed",
      pendingToolRequests: []
    });

    const storedRequest = createDatabaseForPath(databasePath)
      .select()
      .from(agentRunRemoteToolRequests)
      .where(eq(agentRunRemoteToolRequests.runId, runId))
      .get();
    expect(storedRequest?.status).toBe("cancelled");
    expect(storedRequest?.payload).toMatchObject({
      toolCallId: "closed-run-read",
      status: "cancelled",
      completedAt: "2026-06-06T00:00:42.000Z"
    });
  });

  test("cancels active remote tool requests when compatibility ledger saves close a run", async () => {
    const { databasePath, handleRequest } = await createHttpHarness();
    const runId = `compat-close-cancels-${crypto.randomUUID()}`;
    const claimOwner = `compat-close-renderer-${crypto.randomUUID()}`;
    const runStart = {
      runId,
      conversationId: "conversation-1",
      mode: "ai-sdk" as const,
      modelProvider: "openai",
      modelId: "gpt-5.5",
      prompt: "兼容路径关闭运行时也应该取消画布请求",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:43.000Z"
    };

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: runStart,
          firstTool: {
            toolCallId: "compat-close-read",
            toolName: "getCanvasContext",
            args: { includeXml: false },
            requestedAt: "2026-06-06T00:00:44.000Z"
          }
        })
      })
    );
    expect(startResponse.status).toBe(201);

    const claimResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
    );
    expect(claimResponse.status).toBe(200);

    const closedAt = new Date(Date.now() + 1000).toISOString();
    const terminalRun = finishAgentRunLedger(createAgentRunLedgerFromStart(runStart), {
      status: "cancelled",
      completedAt: closedAt,
      error: "Closed through compatibility ledger save."
    });
    const saveResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(terminalRun)
      })
    );
    const savePayload = await saveResponse.json() as {
      run?: { status?: string };
      cancelledRequests?: Array<{ toolCallId?: string; status?: string; completedAt?: string | null; error?: string | null }>;
    };
    expect(saveResponse.status).toBe(201);
    expect(savePayload).toMatchObject({
      run: { status: "cancelled" },
      cancelledRequests: [
        {
          toolCallId: "compat-close-read",
          status: "cancelled",
          completedAt: closedAt,
          error: "Agent run closed before remote tool completion."
        }
      ]
    });

    const snapshotResponse = await handleRequest(new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/runner`));
    const snapshotPayload = await snapshotResponse.json() as { runner?: { pendingToolRequests?: unknown[] } };
    expect(snapshotPayload.runner?.pendingToolRequests).toEqual([]);

    const storedRequest = createDatabaseForPath(databasePath)
      .select()
      .from(agentRunRemoteToolRequests)
      .where(eq(agentRunRemoteToolRequests.runId, runId))
      .get();
    expect(storedRequest?.status).toBe("cancelled");
    expect(storedRequest?.completedAt?.toISOString()).toBe(closedAt);
  });

  test("dead-letters expired remote tool requests after the claim attempt limit", async () => {
    Bun.env.NODE_ENV = "test";
    const { databasePath, handleRequest } = await createHttpHarness();
    const runId = `runner-dead-letter-${crypto.randomUUID()}`;
    const claimOwner = `renderer-${crypto.randomUUID()}`;

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "先读取画布",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:00:40.000Z"
          },
          firstTool: {
            toolCallId: "dead-letter-read",
            toolName: "getCanvasContext",
            args: { includeXml: false },
            requestedAt: "2026-06-06T00:00:41.000Z"
          }
        })
      })
    );
    expect(startResponse.status).toBe(201);

    let payload: {
      requests?: Array<{ toolCallId?: string; status?: string; attemptCount?: number }>;
      runner?: {
        run?: { status?: string; error?: string | null; tools?: Array<{ toolCallId?: string; status?: string; error?: string | null }> };
        pendingToolRequests?: Array<{ toolCallId?: string; status?: string; attemptCount?: number }>;
        policyDecisions?: Array<{ kind?: string; toolCallId?: string; allowed?: boolean }>;
      };
    } | undefined;

    for (let index = 1; index <= DEFAULT_AGENT_RUN_REMOTE_TOOL_MAX_ATTEMPTS; index += 1) {
      const response = await handleRequest(
        new Request(
          `http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}&testLeaseMs=0`
        )
      );
      payload = await response.json();
      expect(response.status).toBe(200);
      expect(payload.requests).toEqual([]);
      expect(payload.runner?.pendingToolRequests).toMatchObject([{ toolCallId: "dead-letter-read", status: "running", attemptCount: index }]);
    }

    const siblingRequest = createAgentRunRemoteToolRequest(runId, {
      toolCallId: "dead-letter-sibling-read",
      toolName: "getCanvasContext",
      args: { includeXml: true },
      requestedAt: "2026-06-06T00:00:42.000Z"
    });
    createDatabaseForPath(databasePath).insert(agentRunRemoteToolRequests).values({
      requestId: `${runId}:dead-letter-sibling-read`,
      runId,
      toolCallId: "dead-letter-sibling-read",
      toolName: "getCanvasContext",
      status: siblingRequest.status,
      requestedAt: new Date(siblingRequest.requestedAt),
      claimedAt: null,
      claimedBy: null,
      leaseExpiresAt: null,
      attemptCount: siblingRequest.attemptCount,
      completedAt: null,
      payload: siblingRequest
    }).run();

    const deadLetterResponse = await handleRequest(
      new Request(
        `http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}&testLeaseMs=0`
      )
    );
    payload = await deadLetterResponse.json();
    expect(deadLetterResponse.status).toBe(200);
    expect(payload).toMatchObject({
      requests: [],
      runner: {
        run: {
          status: "failed",
          tools: [
            {
              toolCallId: "dead-letter-read",
              status: "failed",
              error: "Remote tool request exceeded 3 claim attempts."
            }
          ],
          error: "Remote tool request exceeded 3 claim attempts."
        },
        pendingToolRequests: [],
        policyDecisions: [
          { kind: "runner_start_enqueued", toolCallId: "dead-letter-read", allowed: true },
          { kind: "tool_request_dead_letter", toolCallId: "dead-letter-read", allowed: false }
        ]
      }
    });
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);

    const storedRequests = createDatabaseForPath(databasePath)
      .select()
      .from(agentRunRemoteToolRequests)
      .where(eq(agentRunRemoteToolRequests.runId, runId))
      .all();
    expect(storedRequests.map((item) => ({
      toolCallId: item.toolCallId,
      status: item.status,
      completed: item.completedAt !== null
    }))).toEqual(
      expect.arrayContaining([
        { toolCallId: "dead-letter-read", status: "failed", completed: true },
        { toolCallId: "dead-letter-sibling-read", status: "cancelled", completed: true }
      ])
    );
  });

  test("quarantines legacy backend-owned pending remote tool requests during claim", async () => {
    const { databasePath, handleRequest } = await createHttpHarness();
    const runId = `legacy-backend-owned-remote-${crypto.randomUUID()}`;
    const claimOwner = `renderer-${crypto.randomUUID()}`;

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId,
          conversationId: "conversation-1",
          mode: "ai-sdk",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          prompt: "历史遗留 backend-owned remote request",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:44.000Z"
        })
      })
    );
    expect(startResponse.status).toBe(201);

    const toolResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tools`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "read-before-legacy-backend-owned",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          result: { ok: true, canvasContext: { objects: [] } },
          startedAt: "2026-06-06T00:00:45.000Z",
          completedAt: "2026-06-06T00:00:46.000Z"
        })
      })
    );
    expect(toolResponse.status).toBe(200);

    const legacyRequest = createAgentRunRemoteToolRequest(runId, {
      toolCallId: "legacy-backend-card",
      toolName: "showSolutionSteps",
      args: {
        title: "历史遗留卡片",
        answer: "这条请求不应交给 renderer。",
        steps: [{ label: "隔离", body: "backend-owned remote request 应在 claim 时失败。" }]
      },
      requestedAt: "2026-06-06T00:00:47.000Z"
    });
    createDatabaseForPath(databasePath).insert(agentRunRemoteToolRequests).values({
      requestId: `${runId}:legacy-backend-card`,
      runId,
      toolCallId: "legacy-backend-card",
      toolName: "showSolutionSteps",
      status: "pending",
      requestedAt: new Date("2026-06-06T00:00:47.000Z"),
      claimedAt: null,
      claimedBy: null,
      leaseExpiresAt: null,
      attemptCount: 0,
      completedAt: null,
      payload: legacyRequest
    }).run();

    const pendingResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
    );
    const payload = await pendingResponse.json() as {
      requests?: unknown[];
      runner?: {
        run?: { status?: string; error?: string | null; tools?: Array<{ toolCallId?: string; status?: string; error?: string | null }> };
        pendingToolRequests?: unknown[];
        policyDecisions?: Array<{ kind?: string; toolCallId?: string; allowed?: boolean; message?: string | null }>;
      };
    };

    expect(pendingResponse.status).toBe(200);
    expect(payload).toMatchObject({
      requests: [],
      runner: {
        run: {
          status: "failed",
          error: "showSolutionSteps is not executable through the renderer remote bridge.",
          tools: [
            { toolCallId: "read-before-legacy-backend-owned", status: "succeeded" },
            {
              toolCallId: "legacy-backend-card",
              status: "failed",
              error: "showSolutionSteps is not executable through the renderer remote bridge."
            }
          ]
        },
        pendingToolRequests: [],
        policyDecisions: [
          { kind: "tool_request_dead_letter", toolCallId: "legacy-backend-card", allowed: false }
        ]
      }
    });
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
  });

  test("starts a model-backed runner with a deterministic canvas read before model IO", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-start-deterministic-${crypto.randomUUID()}`;

    const response = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "画一个圆",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:00:50.000Z"
          },
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
            customBaseUrl: "http://127.0.0.1:9/v1"
          }
        })
      })
    );
    const payload = await response.json() as {
      runner?: {
        run?: { runId?: string; status?: string };
        pendingToolRequests?: Array<{ toolCallId?: string; toolName?: string; status?: string }>;
        policyDecisions?: unknown[];
      };
    };

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      runner: {
        run: { runId, status: "running" },
        pendingToolRequests: [
          { toolCallId: "initial-canvas-read", toolName: "getCanvasContext", status: "pending" }
        ],
        policyDecisions: [
          { stage: "runner_start", kind: "runner_start_enqueued", allowed: true, toolCallId: "initial-canvas-read" }
        ]
      }
    });
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
  });

  test("rejects backend-owned supplied runner first tools before remote bridge enqueue", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-start-backend-owned-first-tool-${crypto.randomUUID()}`;

    const response = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "直接展示步骤",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:00:54.000Z"
          },
          firstTool: {
            toolCallId: "backend-card-first-tool",
            toolName: "showSolutionSteps",
            args: {
              title: "不应进入 remote bridge",
              answer: "backend-owned firstTool 应被边界拒绝。",
              steps: [{ label: "边界", body: "runner/start 不应把 backend-owned 工具排进 renderer remote request。" }]
            }
          }
        })
      })
    );
    const payload = await response.json() as {
      error?: string;
      message?: string;
      runner?: {
        run?: { runId?: string; status?: string; error?: string | null };
        policyDecisions?: unknown[];
      };
    };

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      error: "tool_not_remote_bridge_executable",
      runner: {
        run: { runId, status: "failed" },
        policyDecisions: [
          { stage: "runner_start", kind: "tool_boundary_blocked", allowed: false, toolCallId: "backend-card-first-tool" }
        ]
      }
    });
    expect(payload.message).toContain("backend executor");
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);

    const listResponse = await handleRequest(new Request("http://127.0.0.1:17365/v1/agent-runs"));
    const listPayload = await listResponse.json() as { runs?: Array<{ runId: string; status: string; error?: string | null }> };
    expect(listPayload.runs?.find((run) => run.runId === runId)).toMatchObject({
      status: "failed",
      error: "showSolutionSteps is owned by the backend executor and cannot be enqueued as a renderer remote tool request."
    });
  });

  test("persists failed runner start ledgers when supplied first tools violate workflow policy", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-start-workflow-blocked-${crypto.randomUUID()}`;

    const response = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "直接画点",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:00:54.000Z"
          },
          firstTool: {
            toolCallId: "write-as-first-tool",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["A = (0, 0)"] }
          }
        })
      })
    );
    const payload = await response.json() as {
      error?: string;
      message?: string;
      runner?: {
        run?: { runId?: string; status?: string; error?: string | null; tools?: unknown[] };
        policyDecisions?: unknown[];
      };
    };

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      error: "workflow_blocked",
      runner: {
        run: {
          runId,
          status: "failed",
          tools: []
        },
        policyDecisions: [
          { stage: "runner_start", kind: "workflow_blocked", allowed: false }
        ]
      }
    });
    expect(payload.message).toContain("第一步必须读取");
    expect(payload.runner?.run?.error).toContain("第一步必须读取");
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);

    const listResponse = await handleRequest(new Request("http://127.0.0.1:17365/v1/agent-runs"));
    const listPayload = await listResponse.json() as { runs?: Array<{ runId: string; status: string; error?: string | null }> };
    expect(listPayload.runs?.find((run) => run.runId === runId)).toMatchObject({
      status: "failed"
    });
    expect(listPayload.runs?.find((run) => run.runId === runId)?.error).toContain("第一步必须读取");
  });

  test("rejects manual remote tool requests before the initial canvas read", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `manual-tool-before-read-${crypto.randomUUID()}`;

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId,
          conversationId: "conversation-1",
          mode: "ai-sdk",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          prompt: "先搜索命令",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:55.000Z"
        })
      })
    );
    expect(startResponse.status).toBe(201);

    const requestResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "execute-before-read",
          toolName: "executeGeoGebraCommands",
          args: { commands: ["A = (0, 0)"] }
        })
      })
    );
    const payload = await requestResponse.json() as {
      error?: string;
      message?: string;
      runner?: { policyDecisions?: unknown[] };
    };

    expect(requestResponse.status).toBe(409);
    expect(payload).toMatchObject({
      error: "workflow_blocked",
      runner: {
        policyDecisions: [
          { stage: "remote_tool_request", kind: "workflow_blocked", allowed: false, toolCallId: "execute-before-read" }
        ]
      }
    });
    expect(payload.message).toContain("第一步必须读取");
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
  });

  test("rejects manual remote tool requests that reuse a pending request id with different args", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `manual-tool-request-conflict-${crypto.randomUUID()}`;

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "读取画布",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:00:56.000Z"
          },
          firstTool: {
            toolCallId: "duplicate-pending-read",
            toolName: "getCanvasContext",
            args: { includeXml: false },
            requestedAt: "2026-06-06T00:00:57.000Z"
          }
        })
      })
    );
    expect(startResponse.status).toBe(201);

    const requestResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "duplicate-pending-read",
          toolName: "getCanvasContext",
          args: { includeXml: true }
        })
      })
    );
    const payload = await requestResponse.json() as {
      error?: string;
      message?: string;
      runner?: { policyDecisions?: unknown[] };
    };

    expect(requestResponse.status).toBe(409);
    expect(payload).toMatchObject({
      error: "workflow_blocked",
      runner: {
        policyDecisions: [
          { stage: "runner_start", kind: "runner_start_enqueued", allowed: true, toolCallId: "duplicate-pending-read" },
          { stage: "remote_tool_request", kind: "workflow_blocked", allowed: false, toolCallId: "duplicate-pending-read" }
        ]
      }
    });
    expect(payload.message).toBe("Remote tool request id duplicate-pending-read is already pending with a different getCanvasContext argument payload.");
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
  });

  test("rejects manual remote tool requests that reuse completed ledger tool ids", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `manual-tool-request-ledger-reuse-${crypto.randomUUID()}`;

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId,
          conversationId: "conversation-1",
          mode: "ai-sdk",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          prompt: "读取画布后继续请求",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:56.000Z"
        })
      })
    );
    expect(startResponse.status).toBe(201);

    const toolResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tools`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "completed-read",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          result: { objects: [] },
          startedAt: "2026-06-06T00:00:57.000Z",
          completedAt: "2026-06-06T00:00:58.000Z"
        })
      })
    );
    expect(toolResponse.status).toBe(200);

    const requestResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "completed-read",
          toolName: "getCanvasContext",
          args: { includeXml: false }
        })
      })
    );
    const payload = await requestResponse.json() as {
      error?: string;
      message?: string;
      runner?: { policyDecisions?: unknown[] };
    };

    expect(requestResponse.status).toBe(409);
    expect(payload).toMatchObject({
      error: "workflow_blocked",
      message: "Tool call id completed-read already exists in the run ledger.",
      runner: {
        policyDecisions: [
          { stage: "remote_tool_request", kind: "workflow_blocked", allowed: false, toolCallId: "completed-read" }
        ]
      }
    });
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
  });

  test("records workflow blocks from manual ledger tool events", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `manual-ledger-tool-before-read-${crypto.randomUUID()}`;

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId,
          conversationId: "conversation-1",
          mode: "local-planner",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          prompt: "本地 planner 直接写画板",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:56.000Z"
        })
      })
    );
    expect(startResponse.status).toBe(201);

    const toolResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tools`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "ledger-write-before-read",
          toolName: "executeGeoGebraCommands",
          status: "succeeded",
          args: { commands: ["A = (0, 0)"] },
          startedAt: "2026-06-06T00:00:57.000Z",
          completedAt: "2026-06-06T00:00:58.000Z"
        })
      })
    );
    const payload = await toolResponse.json() as {
      error?: string;
      message?: string;
      runner?: {
        run?: { runId?: string; status?: string; tools?: unknown[] };
        policyDecisions?: unknown[];
      };
    };

    expect(toolResponse.status).toBe(409);
    expect(payload).toMatchObject({
      error: "workflow_blocked",
      runner: {
        run: { runId, status: "running", tools: [] },
        policyDecisions: [
          { stage: "ledger_tool_event", kind: "workflow_blocked", allowed: false, toolCallId: "ledger-write-before-read" }
        ]
      }
    });
    expect(payload.message).toContain("第一步必须读取");
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
  });

  test("rejects backend-owned tools at the renderer remote bridge boundary", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `backend-owned-remote-bridge-${crypto.randomUUID()}`;

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId,
          conversationId: "conversation-1",
          mode: "ai-sdk",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          prompt: "先读画布再查询命令",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:56.000Z"
        })
      })
    );
    expect(startResponse.status).toBe(201);

    const toolResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tools`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "read-before-backend-owned-request",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          result: { ok: true, canvasContext: { objects: [] } },
          startedAt: "2026-06-06T00:00:57.000Z",
          completedAt: "2026-06-06T00:00:58.000Z"
        })
      })
    );
    expect(toolResponse.status).toBe(200);

    const requestResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "search-through-remote-bridge",
          toolName: "searchGeoGebraCommands",
          args: { query: "Circle", scope: "conic", topN: 1 }
        })
      })
    );
    const payload = await requestResponse.json() as {
      error?: string;
      message?: string;
      runner?: {
        run?: { runId?: string; status?: string };
        policyDecisions?: unknown[];
      };
    };

    expect(requestResponse.status).toBe(409);
    expect(payload).toMatchObject({
      error: "tool_not_remote_bridge_executable",
      runner: {
        run: { runId, status: "running" },
        policyDecisions: [
          { stage: "remote_tool_request", kind: "tool_boundary_blocked", allowed: false, toolCallId: "search-through-remote-bridge" }
        ]
      }
    });
    expect(payload.message).toContain("backend executor");
    expect(payload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
  });

  test("persists geometry verification reports when submitting post-construction canvas reads", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-geometry-verification-${crypto.randomUUID()}`;
    const claimOwner = "geometry-verifier-test-renderer";
    const plan = createGeometryPlanFromRecipe("conic.ellipse.foci-point", {
      focusA: [-2, 0],
      focusB: [2, 0],
      point: [0, 3]
    });
    const executeArgs = compileGeometryPlanToExecuteArgs(plan);

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId,
          conversationId: "conversation-1",
          mode: "ai-sdk",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          prompt: "构造一个椭圆并验证",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:01:10.000Z"
        })
      })
    );
    expect(startResponse.status).toBe(201);

    const initialReadResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tools`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "read-before-plan",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          result: { ok: true, canvasContext: { objects: [] } },
          startedAt: "2026-06-06T00:01:11.000Z",
          completedAt: "2026-06-06T00:01:12.000Z"
        })
      })
    );
    expect(initialReadResponse.status).toBe(200);

    const planResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tools`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "plan-ellipse",
          toolName: "createGeometryPlan",
          status: "succeeded",
          args: {
            recipeId: "conic.ellipse.foci-point",
            inputs: {
              focusA: [-2, 0],
              focusB: [2, 0],
              point: [0, 3]
            }
          },
          result: {
            ok: true,
            result: {
              plan,
              executeArgs
            },
            clientMeta: { source: "test-geometry-plan" }
          },
          startedAt: "2026-06-06T00:01:13.000Z",
          completedAt: "2026-06-06T00:01:14.000Z"
        })
      })
    );
    expect(planResponse.status).toBe(200);

    const executeResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tools`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "execute-ellipse",
          toolName: "executeGeoGebraCommands",
          status: "succeeded",
          args: executeArgs,
          result: { ok: true, commands: executeArgs.commands },
          startedAt: "2026-06-06T00:01:15.000Z",
          completedAt: "2026-06-06T00:01:16.000Z"
        })
      })
    );
    expect(executeResponse.status).toBe(200);

    const requestResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "verify-ellipse",
          toolName: "getCanvasContext",
          args: { includeXml: false },
          requestedAt: "2026-06-06T00:01:17.000Z"
        })
      })
    );
    expect(requestResponse.status).toBe(201);

    const pendingResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
    );
    expect(pendingResponse.status).toBe(200);

    const resultResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/verify-ellipse/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimOwner,
          tool: {
            toolCallId: "verify-ellipse",
            toolName: "getCanvasContext",
            status: "succeeded",
            args: { includeXml: false },
            result: {
              ok: true,
              canvasContext: {
                objects: [
                  { name: "F", kind: "point" },
                  { name: "G", kind: "point" },
                  { name: "A", kind: "point" },
                  { name: "c", kind: "conic", subtype: "ellipse", dependsOn: ["F", "G", "A"] }
                ]
              }
            },
            startedAt: "2026-06-06T00:01:18.000Z",
            completedAt: "2026-06-06T00:01:19.000Z"
          }
        })
      })
    );
    const resultPayload = await resultResponse.json() as {
      run?: { tools?: Array<{ toolCallId: string; result?: unknown }> };
    };
    const verificationTool = resultPayload.run?.tools?.find((tool) => tool.toolCallId === "verify-ellipse");
    expect(resultResponse.status).toBe(200);
    expect(geometryVerificationReportFromToolResult(verificationTool?.result)).toMatchObject({
      passed: true
    });
  });

  test("rejects runner continuation model mismatches before completing the current remote tool", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-continuation-error-${crypto.randomUUID()}`;
    const claimOwner = "test-renderer";

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "画一个圆",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:01:00.000Z"
          },
          firstTool: {
            toolCallId: "read-1",
            toolName: "getCanvasContext",
            args: { includeXml: false },
            requestedAt: "2026-06-06T00:01:01.000Z"
          }
        })
      })
    );
    expect(startResponse.status).toBe(201);

    const pendingResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
    );
    const pendingPayload = await pendingResponse.json() as { requests?: Array<{ toolCallId: string; status: string; claimedBy?: string | null }> };
    expect(pendingPayload.requests).toMatchObject([{ toolCallId: "read-1", status: "running", claimedBy: claimOwner }]);

    const resultResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/read-1/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimOwner,
          tool: {
            toolCallId: "read-1",
            toolName: "getCanvasContext",
            status: "succeeded",
            args: { includeXml: false },
            result: { ok: true, canvasContext: { objects: [] } },
            startedAt: "2026-06-06T00:01:02.000Z",
            completedAt: "2026-06-06T00:01:03.000Z"
          },
          model: {
            provider: "unknown-provider",
            model: "missing-model",
            apiKey: "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
            customBaseUrl: ""
          }
        })
      })
    );
    const resultPayload = await resultResponse.json() as {
      error?: string;
      runner?: {
        run?: { status?: string; tools?: Array<{ toolCallId: string; status: string }> };
        pendingToolRequests?: Array<{ toolCallId: string; status: string; claimedBy?: string | null }>;
        policyDecisions?: unknown[];
      };
    };

    expect(resultResponse.status).toBe(409);
    expect(resultPayload).toMatchObject({
      error: "runner_model_mismatch",
      runner: {
        run: {
          status: "running",
          tools: []
        },
        pendingToolRequests: [{ toolCallId: "read-1", status: "running", claimedBy: claimOwner }],
        policyDecisions: [
          { kind: "runner_start_enqueued", allowed: true },
          { kind: "model_mismatch", allowed: false }
        ]
      }
    });
    expect(resultPayload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
    expect(JSON.stringify(resultPayload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
  });

  test("requires the matching claim owner before accepting a remote tool result", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-claim-owner-required-${crypto.randomUUID()}`;
    const claimOwner = "owner-required-renderer";

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "读取画布",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:01:10.000Z"
          },
          firstTool: {
            toolCallId: "read-claim-owner",
            toolName: "getCanvasContext",
            args: { includeXml: false },
            requestedAt: "2026-06-06T00:01:11.000Z"
          }
        })
      })
    );
    expect(startResponse.status).toBe(201);

    const pendingResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
    );
    const pendingPayload = await pendingResponse.json() as { requests?: Array<{ toolCallId: string; status: string; claimedBy?: string | null }> };
    expect(pendingPayload.requests).toMatchObject([{ toolCallId: "read-claim-owner", status: "running", claimedBy: claimOwner }]);

    const resultResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/read-claim-owner/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: {
            toolCallId: "read-claim-owner",
            toolName: "getCanvasContext",
            status: "succeeded",
            args: { includeXml: false },
            result: { ok: true, canvasContext: { objects: [] } },
            startedAt: "2026-06-06T00:01:12.000Z",
            completedAt: "2026-06-06T00:01:13.000Z"
          }
        })
      })
    );
    const resultPayload = await resultResponse.json() as { error?: string; message?: string };

    expect(resultResponse.status).toBe(409);
    expect(resultPayload).toMatchObject({
      error: "tool_request_claim_owner_required"
    });
  });

  test("rejects stale remote tool result commits when a lease is reclaimed during model continuation", async () => {
    Bun.env.NODE_ENV = "test";
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-stale-result-commit-${crypto.randomUUID()}`;
    const firstOwner = "stale-result-renderer-a";
    const secondOwner = "stale-result-renderer-b";
    const testLeaseMs = 1000;
    let resolveProviderStarted!: () => void;
    let releaseProvider!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      resolveProviderStarted = resolve;
    });
    const providerRelease = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: async () => {
        resolveProviderStarted();
        await providerRelease;
        return Response.json({
          id: "fake-stale-result-commit",
          model: "deepseek-v4-flash",
          choices: [
            {
              message: {
                role: "assistant",
                content: "画布读取完成。"
              },
              finish_reason: "stop"
            }
          ],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
        });
      }
    });

    try {
      const startResponse = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            run: {
              runId,
              conversationId: "conversation-1",
              mode: "ai-sdk",
              modelProvider: "deepseek",
              modelId: "deepseek-v4-flash",
              prompt: "读取画布",
              attachmentCount: 0,
              startedAt: "2026-06-06T00:01:30.000Z"
            },
            firstTool: {
              toolCallId: "read-before-stale-commit",
              toolName: "getCanvasContext",
              args: { includeXml: false },
              requestedAt: "2026-06-06T00:01:31.000Z"
            }
          })
        })
      );
      expect(startResponse.status).toBe(201);

      const firstClaimResponse = await handleRequest(
        new Request(
          `http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${firstOwner}&testLeaseMs=${testLeaseMs}`
        )
      );
      const firstClaimPayload = await firstClaimResponse.json() as {
        requests?: Array<{ toolCallId?: string; status?: string; claimedBy?: string | null }>;
      };
      expect(firstClaimPayload.requests).toMatchObject([
        { toolCallId: "read-before-stale-commit", status: "running", claimedBy: firstOwner }
      ]);

      const toolStartedAt = new Date().toISOString();
      const toolCompletedAt = new Date(Date.now() + 1).toISOString();
      const resultPromise = handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/read-before-stale-commit/result`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimOwner: firstOwner,
            tool: {
              toolCallId: "read-before-stale-commit",
              toolName: "getCanvasContext",
              status: "succeeded",
              args: { includeXml: false },
              result: { ok: true, canvasContext: { objects: [{ name: "A" }] } },
              startedAt: toolStartedAt,
              completedAt: toolCompletedAt
            },
            model: {
              provider: "deepseek",
              model: "deepseek-v4-flash",
              apiKey: "sk-test-stale-result",
              customBaseUrl: `http://127.0.0.1:${fakeProvider.port}`
            }
          })
        })
      );

      await providerStarted;
      await new Promise((resolve) => setTimeout(resolve, testLeaseMs + 30));

      const secondClaimResponse = await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${secondOwner}`)
      );
      const secondClaimPayload = await secondClaimResponse.json() as {
        requests?: Array<{ toolCallId?: string; status?: string; claimedBy?: string | null }>;
      };
      expect(secondClaimPayload.requests).toMatchObject([
        { toolCallId: "read-before-stale-commit", status: "running", claimedBy: secondOwner }
      ]);

      releaseProvider();
      const resultResponse = await resultPromise;
      const resultPayload = await resultResponse.json() as {
        error?: string;
        request?: { toolCallId?: string; status?: string; claimedBy?: string | null };
        runner?: {
          run?: { tools?: Array<{ toolCallId?: string }> };
          pendingToolRequests?: Array<{ toolCallId?: string; status?: string; claimedBy?: string | null }>;
        };
      };

      expect(resultResponse.status).toBe(409);
      expect(resultPayload).toMatchObject({
        error: "tool_request_state_changed",
        request: { toolCallId: "read-before-stale-commit", status: "running", claimedBy: secondOwner },
        runner: {
          run: { tools: [] },
          pendingToolRequests: [{ toolCallId: "read-before-stale-commit", status: "running", claimedBy: secondOwner }]
        }
      });
    } finally {
      releaseProvider();
      fakeProvider.stop(true);
    }
  });

  test("persists completed tool results and terminal remote requests together without model continuation", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-complete-tool-result-${crypto.randomUUID()}`;
    const claimOwner = "complete-tool-renderer";

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "读取画布",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:01:20.000Z"
          },
          firstTool: {
            toolCallId: "read-complete",
            toolName: "getCanvasContext",
            args: { includeXml: false },
            requestedAt: "2026-06-06T00:01:21.000Z"
          }
        })
      })
    );
    expect(startResponse.status).toBe(201);

    await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
    );

    const resultResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/read-complete/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimOwner,
          tool: {
            toolCallId: "read-complete",
            toolName: "getCanvasContext",
            status: "succeeded",
            args: { includeXml: false },
            result: { ok: true, canvasContext: { objects: [{ name: "A" }] } },
            startedAt: "2026-06-06T00:01:22.000Z",
            completedAt: "2026-06-06T00:01:23.000Z"
          }
        })
      })
    );
    const resultPayload = await resultResponse.json() as {
      run?: { tools?: Array<{ toolCallId: string; status: string }> };
      request?: { toolCallId?: string; status?: string };
      runner?: { pendingToolRequests?: unknown[] };
    };

    expect(resultResponse.status).toBe(200);
    expect(resultPayload).toMatchObject({
      run: {
        tools: [{ toolCallId: "read-complete", status: "succeeded" }]
      },
      request: {
        toolCallId: "read-complete",
        status: "succeeded"
      },
      runner: {
        pendingToolRequests: []
      }
    });

    const pendingResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
    );
    const pendingPayload = await pendingResponse.json() as { requests?: unknown[] };
    expect(pendingPayload.requests).toEqual([]);
  });

  test("rejects remote tool results whose args do not match the claimed request", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `run-result-args-mismatch-${crypto.randomUUID()}`;
    const claimOwner = "args-mismatch-renderer";

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "读取画布",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:01:24.000Z"
          },
          firstTool: {
            toolCallId: "read-args-mismatch",
            toolName: "getCanvasContext",
            args: { includeXml: false },
            requestedAt: "2026-06-06T00:01:25.000Z"
          }
        })
      })
    );
    expect(startResponse.status).toBe(201);

    await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
    );

    const resultResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/read-args-mismatch/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimOwner,
          tool: {
            toolCallId: "read-args-mismatch",
            toolName: "getCanvasContext",
            status: "succeeded",
            args: { includeXml: true },
            result: { ok: true, canvasContext: { objects: [] } },
            startedAt: "2026-06-06T00:01:26.000Z",
            completedAt: "2026-06-06T00:01:27.000Z"
          }
        })
      })
    );
    const resultPayload = await resultResponse.json() as { error?: string; message?: string };

    expect(resultResponse.status).toBe(400);
    expect(resultPayload).toMatchObject({
      error: "invalid_request",
      message: "Remote tool result args do not match request."
    });
  });

  test("records policy decisions when model continuation enqueues the next tool", async () => {
    const { handleRequest } = await createHttpHarness();
    let providerCalls = 0;
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: async () => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return Response.json({
            id: "fake-deepseek-continuation-multi-tool",
            model: "deepseek-v4-flash",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "search-and-write-1",
                      function: {
                        name: "searchGeoGebraCommands",
                        arguments: JSON.stringify({
                          query: "line",
                          scope: "geometry-2d",
                          topN: 1,
                          reason: "第一个工具调用。",
                          intendedOutcome: "查询直线命令。",
                          nextExpectedAction: "executeGeoGebraCommands"
                        })
                      }
                    },
                    {
                      id: "search-and-write-2",
                      function: {
                        name: "executeGeoGebraCommands",
                        arguments: JSON.stringify({
                          commands: ["A = (0, 0)", "B = (1, 0)", "l = Line(A, B)"],
                          reason: "第二个工具调用，应该由协议修复压成单步。",
                          intendedOutcome: "在画布上画出一条直线。",
                          nextExpectedAction: "getCanvasContext"
                        })
                      }
                    }
                  ]
                },
                finish_reason: "tool_calls"
              }
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
          });
        }
        return Response.json({
          id: "fake-deepseek-continuation-enqueue",
          model: "deepseek-v4-flash",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "execute-after-read",
                    function: {
                      name: "executeGeoGebraCommands",
                      arguments: JSON.stringify({
                        commands: ["A = (0, 0)", "B = (1, 0)", "l = Line(A, B)"],
                        reason: "读取画布后继续构造。",
                        intendedOutcome: "在画布上画出一条直线。",
                        nextExpectedAction: "getCanvasContext"
                      })
                    }
                  }
                ]
              },
              finish_reason: "tool_calls"
            }
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        });
      }
    });
    const runId = `runner-continuation-policy-${crypto.randomUUID()}`;
    const claimOwner = "continuation-policy-renderer";

    try {
      const startResponse = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            run: {
              runId,
              conversationId: "conversation-1",
              mode: "ai-sdk",
              modelProvider: "deepseek",
              modelId: "deepseek-v4-flash",
              prompt: "画一条直线\nAgent Skills are disabled for this run.",
              attachmentCount: 0,
              startedAt: "2026-06-06T00:01:26.000Z"
            },
            firstTool: {
              toolCallId: "read-before-execute",
              toolName: "getCanvasContext",
              args: { includeXml: false },
              requestedAt: "2026-06-06T00:01:27.000Z"
            }
          })
        })
      );
      expect(startResponse.status).toBe(201);

      await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
      );

      const resultResponse = await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/read-before-execute/result`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimOwner,
            tool: {
              toolCallId: "read-before-execute",
              toolName: "getCanvasContext",
              status: "succeeded",
              args: { includeXml: false },
              result: { ok: true, canvasContext: { objects: [] } },
              startedAt: "2026-06-06T00:01:28.000Z",
              completedAt: "2026-06-06T00:01:29.000Z"
            },
            model: {
              provider: "deepseek",
              model: "deepseek-v4-flash",
              apiKey: "sk-test-continuation-policy",
              customBaseUrl: `http://127.0.0.1:${fakeProvider.port}`
            }
          })
        })
      );
      const resultPayload = await resultResponse.json() as {
        nextRequest?: { toolCallId?: string; toolName?: string; status?: string };
        runner?: {
          policyDecisions?: unknown[];
          modelSteps?: unknown[];
          pendingToolRequests?: Array<{ toolCallId?: string; status?: string }>;
        };
      };

      expect(resultResponse.status).toBe(200);
      expect(providerCalls).toBe(2);
      expect(resultPayload).toMatchObject({
        nextRequest: { toolCallId: "execute-after-read", toolName: "executeGeoGebraCommands", status: "pending" },
        runner: {
          pendingToolRequests: [{ toolCallId: "execute-after-read", status: "pending" }]
        }
      });
      expect(resultPayload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
      expect(resultPayload.runner?.modelSteps?.every(isAgentRunModelStepRecord)).toBe(true);
      expect(resultPayload.runner?.modelSteps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: "runner_continuation",
            source: "model",
            status: "succeeded",
            modelProvider: "deepseek",
            modelId: "deepseek-v4-flash",
            inputToolCount: 1,
            attachmentCount: 0,
            outputType: "tool",
            outputToolCallId: "search-and-write-1",
            outputToolName: "searchGeoGebraCommands",
            details: {
              protocolRepairAttempts: 1,
              protocolRepairErrors: [expect.stringContaining("2 个工具调用")]
            },
            error: null
          }),
          expect.objectContaining({
            stage: "runner_continuation",
            source: "model",
            status: "succeeded",
            modelProvider: "deepseek",
            modelId: "deepseek-v4-flash",
            inputToolCount: 2,
            attachmentCount: 0,
            outputType: "tool",
            outputToolCallId: "execute-after-read",
            outputToolName: "executeGeoGebraCommands",
            error: null
          })
        ])
      );
      expect(resultPayload.runner?.policyDecisions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: "runner_start", kind: "runner_start_enqueued", allowed: true }),
          expect.objectContaining({
            stage: "runner_continuation",
            kind: "runner_continuation_enqueued",
            allowed: true,
            toolCallId: "execute-after-read"
          }),
          expect.objectContaining({
            stage: "runner_continuation",
            kind: "raw_command_fallback",
            allowed: true,
            toolCallId: "execute-after-read",
            toolName: "executeGeoGebraCommands",
            details: expect.objectContaining({
              preferredTool: "createGeometryPlan",
              reason: expect.stringContaining("No successful createGeometryPlan")
            })
          })
        ])
      );
      expect(JSON.stringify(resultPayload)).not.toContain("sk-test-continuation-policy");
    } finally {
      fakeProvider.stop(true);
    }
  });

  test("auto-executes read-only backend tools during runner continuation", async () => {
    const { handleRequest } = await createHttpHarness();
    let providerCalls = 0;
    let secondRequestBody = "";
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: async (request) => {
        providerCalls += 1;
        const body = await request.text();
        if (providerCalls === 2) secondRequestBody = body;
        if (providerCalls === 1) {
          return Response.json({
            id: "fake-backend-search-tool",
            model: "deepseek-v4-flash",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "search-after-read",
                      function: {
                        name: "searchGeoGebraCommands",
                        arguments: JSON.stringify({
                          query: "circle",
                          scope: "conic",
                          topN: 1,
                          reason: "先查询圆相关命令。",
                          intendedOutcome: "确认圆命令的参数顺序。",
                          nextExpectedAction: "executeGeoGebraCommands"
                        })
                      }
                    }
                  ]
                },
                finish_reason: "tool_calls"
              }
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
          });
        }
        return Response.json({
          id: "fake-backend-search-finish",
          model: "deepseek-v4-flash",
          choices: [
            {
              message: {
                role: "assistant",
                content: "已查询圆命令，可以继续构造。"
              },
              finish_reason: "stop"
            }
          ],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
        });
      }
    });
    const runId = `runner-backend-search-${crypto.randomUUID()}`;
    const claimOwner = "backend-search-renderer";

    try {
      const startResponse = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            run: {
              runId,
              conversationId: "conversation-1",
              mode: "ai-sdk",
              modelProvider: "deepseek",
              modelId: "deepseek-v4-flash",
              prompt: "查询圆命令后继续\nAgent Skills are disabled for this run.",
              attachmentCount: 0,
              startedAt: "2026-06-06T00:01:34.000Z"
            },
            firstTool: {
              toolCallId: "read-before-backend-search",
              toolName: "getCanvasContext",
              args: { includeXml: false },
              requestedAt: "2026-06-06T00:01:35.000Z"
            }
          })
        })
      );
      expect(startResponse.status).toBe(201);

      await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
      );

      const resultResponse = await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/read-before-backend-search/result`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimOwner,
            tool: {
              toolCallId: "read-before-backend-search",
              toolName: "getCanvasContext",
              status: "succeeded",
              args: { includeXml: false },
              result: { ok: true, canvasContext: { objects: [] } },
              startedAt: "2026-06-06T00:01:36.000Z",
              completedAt: "2026-06-06T00:01:37.000Z"
            },
            model: {
              provider: "deepseek",
              model: "deepseek-v4-flash",
              apiKey: "sk-test-backend-search",
              customBaseUrl: `http://127.0.0.1:${fakeProvider.port}`
            }
          })
        })
      );
      const resultPayload = await resultResponse.json() as {
        text?: string;
        nextRequest?: unknown;
        run?: { status?: string; tools?: Array<{ toolCallId?: string; toolName?: string; status?: string; result?: unknown }> };
        runner?: {
          status?: string;
          pendingToolRequests?: unknown[];
          policyDecisions?: unknown[];
          modelSteps?: unknown[];
        };
      };

      expect(resultResponse.status).toBe(200);
      expect(providerCalls).toBe(2);
      expect(secondRequestBody).toContain("search-after-read");
      expect(secondRequestBody).toContain("Circle");
      expect(resultPayload.nextRequest).toBeUndefined();
      expect(resultPayload).toMatchObject({
        text: "已查询圆命令，可以继续构造。",
        run: {
          status: "succeeded",
          tools: [
            { toolCallId: "read-before-backend-search", toolName: "getCanvasContext", status: "succeeded" },
            { toolCallId: "search-after-read", toolName: "searchGeoGebraCommands", status: "succeeded" }
          ]
        },
        runner: {
          status: "succeeded",
          pendingToolRequests: []
        }
      });
      expect(resultPayload.runner?.policyDecisions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: "runner_continuation",
            kind: "runner_continuation_enqueued",
            toolCallId: "search-after-read",
            details: expect.objectContaining({ executor: "backend" })
          }),
          expect.objectContaining({ stage: "runner_continuation", kind: "runner_finished", allowed: true })
        ])
      );
      expect(resultPayload.runner?.modelSteps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ outputType: "tool", outputToolCallId: "search-after-read", outputToolName: "searchGeoGebraCommands" }),
          expect.objectContaining({ outputType: "finish", outputTextLength: "已查询圆命令，可以继续构造。".length })
        ])
      );
      expect(JSON.stringify(resultPayload)).not.toContain("sk-test-backend-search");
    } finally {
      fakeProvider.stop(true);
    }
  });

  test("auto-executes choice analysis display cards during runner continuation", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-backend-choice-card-${crypto.randomUUID()}`;
    const claimOwner = "backend-choice-card-renderer";
    let providerCalls = 0;
    let secondRequestBody = "";
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: async (request) => {
        providerCalls += 1;
        const body = await request.text();
        if (providerCalls === 2) secondRequestBody = body;
        if (providerCalls === 1) {
          return Response.json({
            id: "fake-backend-choice-card-tool",
            model: "deepseek-v4-flash",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "choice-card-after-read",
                      function: {
                        name: "showChoiceAnalysis",
                        arguments: JSON.stringify({
                          title: "选项判断",
                          summary: "题干公共条件已经建立在画板中。",
                          answer: "A",
                          baseConditions: ["公共底图包含三角形 ABC。"],
                          displayMode: "single_active_choice",
                          auxiliaryElementReview: "当前画布只有公共底图和中点 M；M 是判断选项的关键对象，暂不隐藏辅助对象。",
                          options: [
                            {
                              option: "a.",
                              text: "结论 A 成立。",
                              judgment: "正确",
                              reason: "由公共条件可推出。",
                              focus: "A_aux1 标出等距关系。",
                              evidence: ["M 是 AB 的中点。"],
                              commands: ["A_aux1 = Segment(A, M)"]
                            },
                            {
                              option: "B",
                              text: "结论 B 成立。",
                              judgment: "错误",
                              reason: "与公共条件矛盾。",
                              commands: ["B_mark1 = Line(B, C)"]
                            }
                          ],
                          reason: "初始读取后直接展示选择题结构化说明。",
                          intendedOutcome: "生成可切换 A/B 选项场景的卡片。",
                          nextExpectedAction: "final_answer"
                        })
                      }
                    }
                  ]
                },
                finish_reason: "tool_calls"
              }
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
          });
        }
        return Response.json({
          id: "fake-backend-choice-card-finish",
          model: "deepseek-v4-flash",
          choices: [
            {
              message: {
                role: "assistant",
                content: "选项卡片已生成。"
              },
              finish_reason: "stop"
            }
          ],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
        });
      }
    });

    try {
      let run = createAgentRunLedger({
        runId,
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "deepseek",
          model: "deepseek-v4-flash",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "判断选择题选项",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:01:38.000Z"
      });
      run = upsertAgentRunTool(run, {
        toolCallId: "read-before-backend-choice-card",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        result: { ok: true, canvasContext: { objects: [] } },
        startedAt: "2026-06-06T00:01:39.000Z",
        completedAt: "2026-06-06T00:01:40.000Z"
      });
      run = upsertAgentRunTool(run, {
        toolCallId: "search-before-backend-choice-card",
        toolName: "searchGeoGebraCommands",
        status: "succeeded",
        args: { query: "triangle midpoint option analysis", scope: "geometry-2d" },
        result: { ok: true, result: [{ command: "Segment" }, { command: "Line" }] },
        startedAt: "2026-06-06T00:01:40.100Z",
        completedAt: "2026-06-06T00:01:40.200Z"
      });
      run = upsertAgentRunTool(run, {
        toolCallId: "write-before-backend-choice-card",
        toolName: "executeGeoGebraCommands",
        status: "succeeded",
        args: { commands: ["A = (0, 0)", "B = (4, 0)", "C = (1, 3)", "M = Midpoint(A, B)"] },
        result: { ok: true },
        startedAt: "2026-06-06T00:01:40.300Z",
        completedAt: "2026-06-06T00:01:40.400Z"
      });
      const saveResponse = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/agent-runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(run)
        })
      );
      expect(saveResponse.status).toBe(201);

      const verificationRequestResponse = await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            toolCallId: "verify-before-backend-choice-card",
            toolName: "getCanvasContext",
            args: { includeXml: false }
          })
        })
      );
      expect(verificationRequestResponse.status).toBe(201);

      await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
      );

      const resultResponse = await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/verify-before-backend-choice-card/result`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimOwner,
            tool: {
              toolCallId: "verify-before-backend-choice-card",
              toolName: "getCanvasContext",
              status: "succeeded",
              args: { includeXml: false },
              result: { ok: true, canvasContext: { objects: [{ name: "M", type: "point" }] } },
              startedAt: "2026-06-06T00:01:41.000Z",
              completedAt: "2026-06-06T00:01:42.000Z"
            },
            model: {
              provider: "deepseek",
              model: "deepseek-v4-flash",
              apiKey: "sk-test-backend-card",
              customBaseUrl: `http://127.0.0.1:${fakeProvider.port}`
            }
          })
        })
      );
      const resultPayload = await resultResponse.json() as {
        text?: string;
        nextRequest?: unknown;
        run?: { status?: string; tools?: Array<{ toolCallId?: string; toolName?: string; status?: string; result?: { result?: unknown; clientMeta?: unknown } }> };
        runner?: {
          status?: string;
          pendingToolRequests?: unknown[];
          policyDecisions?: unknown[];
          modelSteps?: unknown[];
        };
      };

      expect(resultResponse.status).toBe(200);
      expect(providerCalls).toBe(2);
      expect(secondRequestBody).toContain("choice-card-after-read");
      expect(secondRequestBody).toContain("选项判断");
      expect(resultPayload.nextRequest).toBeUndefined();
      expect(resultPayload).toMatchObject({
        text: "选项卡片已生成。",
        run: {
          status: "succeeded",
          tools: [
            { toolCallId: "read-before-backend-choice-card", toolName: "getCanvasContext", status: "succeeded" },
            { toolCallId: "search-before-backend-choice-card", toolName: "searchGeoGebraCommands", status: "succeeded" },
            { toolCallId: "write-before-backend-choice-card", toolName: "executeGeoGebraCommands", status: "succeeded" },
            { toolCallId: "verify-before-backend-choice-card", toolName: "getCanvasContext", status: "succeeded" },
            {
              toolCallId: "choice-card-after-read",
              toolName: "showChoiceAnalysis",
              status: "succeeded",
              result: {
                result: {
                  title: "选项判断",
                  answer: "A",
                  auxiliaryElementReview: "当前画布只有公共底图和中点 M；M 是判断选项的关键对象，暂不隐藏辅助对象。",
                  choices: [
                    {
                      label: "A",
                      statement: "结论 A 成立。",
                      verdict: "true",
                      explanation: "由公共条件可推出。",
                      constructionFocus: "A_aux1 标出等距关系。",
                      evidence: ["M 是 AB 的中点。"],
                      commands: ["A_aux1 = Segment(A, M)"]
                    },
                    {
                      label: "B",
                      statement: "结论 B 成立。",
                      verdict: "false",
                      explanation: "与公共条件矛盾。",
                      commands: ["B_mark1 = Line(B, C)"]
                    }
                  ]
                },
                clientMeta: { source: "backend-display-card" }
              }
            }
          ]
        },
        runner: {
          status: "succeeded",
          pendingToolRequests: []
        }
      });
      expect(resultPayload.runner?.policyDecisions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: "runner_continuation",
            kind: "runner_continuation_enqueued",
            toolCallId: "choice-card-after-read",
            details: expect.objectContaining({ executor: "backend" })
          }),
          expect.objectContaining({ stage: "runner_continuation", kind: "runner_finished", allowed: true })
        ])
      );
      expect(resultPayload.runner?.modelSteps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ outputType: "tool", outputToolCallId: "choice-card-after-read", outputToolName: "showChoiceAnalysis" }),
          expect.objectContaining({ outputType: "finish", inputToolCount: 5, outputTextLength: "选项卡片已生成。".length })
        ])
      );
      expect(JSON.stringify(resultPayload)).not.toContain("sk-test-backend-card");
    } finally {
      fakeProvider.stop(true);
    }
  });

  test("records a policy decision when backend tool auto-execution reaches the harness limit", async () => {
    const { handleRequest } = await createHttpHarness();
    const previousBackendToolAutoStepLimit = Bun.env.GEOCHAT_BACKEND_TOOL_AUTO_STEP_LIMIT;
    Bun.env.GEOCHAT_BACKEND_TOOL_AUTO_STEP_LIMIT = "4";
    let providerCalls = 0;
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: async () => {
        providerCalls += 1;
        return Response.json({
          id: `fake-backend-auto-limit-${providerCalls}`,
          model: "deepseek-v4-flash",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `auto-search-${providerCalls}`,
                    function: {
                      name: "searchGeoGebraCommands",
                      arguments: JSON.stringify({
                        query: `circle ${providerCalls}`,
                        scope: "conic",
                        topN: 1,
                        reason: "连续触发 backend-owned 工具以验证 harness 自动执行上限。",
                        intendedOutcome: "确认后端工具循环不会无限推进。",
                        nextExpectedAction: "searchGeoGebraCommands"
                      })
                    }
                  }
                ]
              },
              finish_reason: "tool_calls"
            }
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        });
      }
    });
    const runId = `runner-backend-auto-limit-${crypto.randomUUID()}`;
    const claimOwner = "backend-auto-limit-renderer";

    try {
      const startResponse = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            run: {
              runId,
              conversationId: "conversation-1",
              mode: "ai-sdk",
              modelProvider: "deepseek",
              modelId: "deepseek-v4-flash",
              prompt: "连续查询命令",
              attachmentCount: 0,
              startedAt: "2026-06-06T00:01:38.000Z"
            },
            firstTool: {
              toolCallId: "read-before-auto-limit",
              toolName: "getCanvasContext",
              args: { includeXml: false },
              requestedAt: "2026-06-06T00:01:39.000Z"
            }
          })
        })
      );
      expect(startResponse.status).toBe(201);

      await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
      );

      const resultResponse = await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/read-before-auto-limit/result`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimOwner,
            tool: {
              toolCallId: "read-before-auto-limit",
              toolName: "getCanvasContext",
              status: "succeeded",
              args: { includeXml: false },
              result: { ok: true, canvasContext: { objects: [] } },
              startedAt: "2026-06-06T00:01:40.000Z",
              completedAt: "2026-06-06T00:01:41.000Z"
            },
            model: {
              provider: "deepseek",
              model: "deepseek-v4-flash",
              apiKey: "sk-test-backend-auto-limit",
              customBaseUrl: `http://127.0.0.1:${fakeProvider.port}`
            }
          })
        })
      );
      const resultPayload = await resultResponse.json() as {
        error?: string;
        run?: { status?: string; tools?: Array<{ toolCallId?: string; toolName?: string; status?: string }> };
        runner?: { policyDecisions?: unknown[]; modelSteps?: unknown[] };
      };

      expect(resultResponse.status).toBe(409);
      expect(providerCalls).toBe(5);
      expect(resultPayload).toMatchObject({
        error: "backend_tool_auto_step_limit",
        run: {
          status: "failed",
          tools: [
            { toolCallId: "read-before-auto-limit", toolName: "getCanvasContext", status: "succeeded" },
            { toolCallId: "auto-search-1", toolName: "searchGeoGebraCommands", status: "succeeded" },
            { toolCallId: "auto-search-2", toolName: "searchGeoGebraCommands", status: "succeeded" },
            { toolCallId: "auto-search-3", toolName: "searchGeoGebraCommands", status: "succeeded" },
            { toolCallId: "auto-search-4", toolName: "searchGeoGebraCommands", status: "succeeded" }
          ]
        }
      });
      expect(resultPayload.runner?.policyDecisions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "runner_continuation_enqueued", toolCallId: "auto-search-5", allowed: true }),
          expect.objectContaining({
            stage: "runner_continuation",
            kind: "backend_tool_auto_step_limit",
            allowed: false,
            toolCallId: "auto-search-5",
            details: expect.objectContaining({ limit: 4, attemptedStep: 4 })
          })
        ])
      );
      expect(resultPayload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
      expect(resultPayload.runner?.modelSteps?.every(isAgentRunModelStepRecord)).toBe(true);
      expect(JSON.stringify(resultPayload)).not.toContain("sk-test-backend-auto-limit");
    } finally {
      if (previousBackendToolAutoStepLimit === undefined) {
        delete Bun.env.GEOCHAT_BACKEND_TOOL_AUTO_STEP_LIMIT;
      } else {
        Bun.env.GEOCHAT_BACKEND_TOOL_AUTO_STEP_LIMIT = previousBackendToolAutoStepLimit;
      }
      fakeProvider.stop(true);
    }
  });

  test("persists completed tool results and failed ledgers together when model continuation fails", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-continuation-model-failure-${crypto.randomUUID()}`;
    const claimOwner = "continuation-failure-renderer";

    const startResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run: {
            runId,
            conversationId: "conversation-1",
            mode: "ai-sdk",
            modelProvider: "openai",
            modelId: "gpt-5.5",
            prompt: "读取画布后继续",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:01:30.000Z"
          },
          firstTool: {
            toolCallId: "read-before-model-failure",
            toolName: "getCanvasContext",
            args: { includeXml: false },
            requestedAt: "2026-06-06T00:01:31.000Z"
          }
        })
      })
    );
    expect(startResponse.status).toBe(201);

    await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
    );

    const resultResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/read-before-model-failure/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimOwner,
          tool: {
            toolCallId: "read-before-model-failure",
            toolName: "getCanvasContext",
            status: "succeeded",
            args: { includeXml: false },
            result: { ok: true, canvasContext: { objects: [] } },
            startedAt: "2026-06-06T00:01:32.000Z",
            completedAt: "2026-06-06T00:01:33.000Z"
          },
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
            customBaseUrl: "http://127.0.0.1:9/v1"
          }
        })
      })
    );
    const resultPayload = await resultResponse.json() as {
      error?: string;
      request?: { toolCallId?: string; status?: string };
      runner?: {
        run?: { status?: string; tools?: Array<{ toolCallId: string; status: string }> };
        pendingToolRequests?: unknown[];
        modelSteps?: unknown[];
      };
    };

    expect(resultResponse.status).toBe(502);
    expect(resultPayload).toMatchObject({
      error: "runner_model_error",
      request: {
        toolCallId: "read-before-model-failure",
        status: "succeeded"
      },
      runner: {
        run: {
          status: "failed",
          tools: [{ toolCallId: "read-before-model-failure", status: "succeeded" }]
        },
        pendingToolRequests: []
      }
    });
    expect(resultPayload.runner?.modelSteps?.every(isAgentRunModelStepRecord)).toBe(true);
    expect(resultPayload.runner?.modelSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "runner_continuation",
          source: "model",
          status: "failed",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          inputToolCount: 1,
          attachmentCount: 0,
          outputType: null
        })
      ])
    );
    expect(JSON.stringify(resultPayload.runner?.modelSteps)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
    expect(JSON.stringify(resultPayload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");

    const errorEventsResponse = await handleRequest(new Request(`http://127.0.0.1:17365/v1/agent-error-events?runId=${encodeURIComponent(runId)}`));
    const errorEventsPayload = await errorEventsResponse.json() as {
      events?: Array<{ source?: string; code?: string; message?: string; runId?: string; modelProvider?: string; modelId?: string; payload?: unknown }>;
    };
    expect(errorEventsResponse.status).toBe(200);
    expect(errorEventsPayload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId,
          source: "run",
          code: "run_failed",
          modelProvider: "openai",
          modelId: "gpt-5.5"
        }),
        expect.objectContaining({
          runId,
          source: "model_step",
          code: "model_step_failed",
          modelProvider: "openai",
          modelId: "gpt-5.5"
        }),
        expect.objectContaining({
          runId,
          source: "policy",
          code: "policy_model_error"
        })
      ])
    );
    expect(JSON.stringify(errorEventsPayload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
  });

  test("auto-enqueues canvas verification when the model skips post-write verification", async () => {
    const { handleRequest } = await createHttpHarness();
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: async () =>
        Response.json({
          id: "fake-deepseek-workflow-blocked",
          model: "deepseek-v4-flash",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "blocked-explain-1",
                    function: {
                      name: "showSolutionSteps",
                      arguments: JSON.stringify({
                        title: "跳过验证",
                        answer: "直接解释",
                        steps: [{ label: "说明", body: "模型在写入后跳过验证直接解释。" }],
                        reason: "测试 workflow violation",
                        intendedOutcome: "确认后端终止违规 run",
                        nextExpectedAction: "final_answer"
                      })
                    }
                  }
                ]
              },
              finish_reason: "tool_calls"
            }
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
    });
    const runId = `runner-workflow-blocked-${crypto.randomUUID()}`;
    const claimOwner = "workflow-blocked-renderer";

    try {
      const startResponse = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            run: {
              runId,
              conversationId: "conversation-1",
              mode: "ai-sdk",
              modelProvider: "deepseek",
              modelId: "deepseek-v4-flash",
              prompt: "画一条线",
              attachmentCount: 0,
              startedAt: "2026-06-06T00:01:40.000Z"
            },
            firstTool: {
              toolCallId: "read-before-blocked",
              toolName: "getCanvasContext",
              args: { includeXml: false },
              requestedAt: "2026-06-06T00:01:41.000Z"
            }
          })
        })
      );
      expect(startResponse.status).toBe(201);

      await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
      );
      const readResultResponse = await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/read-before-blocked/result`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimOwner,
            tool: {
              toolCallId: "read-before-blocked",
              toolName: "getCanvasContext",
              status: "succeeded",
              args: { includeXml: false },
              result: { ok: true, canvasContext: { objects: [] } },
              startedAt: "2026-06-06T00:01:42.000Z",
              completedAt: "2026-06-06T00:01:43.000Z"
            }
          })
        })
      );
      expect(readResultResponse.status).toBe(200);

      const searchToolResponse = await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tools`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            toolCallId: "search-before-write",
            toolName: "searchGeoGebraCommands",
            status: "succeeded",
            args: {
              query: "Line point point",
              scope: "geometry-2d",
              topN: 1,
              reason: "执行原始直线构造命令前查询语法。",
              intendedOutcome: "确认 Line 命令参数顺序。",
              nextExpectedAction: "executeGeoGebraCommands"
            },
            result: { ok: true, result: [{ command: "Line", syntax: "Line(<Point>, <Point>)" }] },
            startedAt: "2026-06-06T00:01:43.100Z",
            completedAt: "2026-06-06T00:01:43.200Z"
          })
        })
      );
      expect(searchToolResponse.status).toBe(200);

      const writeRequestResponse = await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            toolCallId: "write-before-blocked",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["A = (0, 0)", "B = (1, 0)", "l = Line(A, B)"] }
          })
        })
      );
      expect(writeRequestResponse.status).toBe(201);
      await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
      );

      const resultResponse = await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/write-before-blocked/result`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimOwner,
            tool: {
              toolCallId: "write-before-blocked",
              toolName: "executeGeoGebraCommands",
              status: "succeeded",
              args: { commands: ["A = (0, 0)", "B = (1, 0)", "l = Line(A, B)"] },
              result: { ok: true },
              startedAt: "2026-06-06T00:01:44.000Z",
              completedAt: "2026-06-06T00:01:45.000Z"
            },
            model: {
              provider: "deepseek",
              model: "deepseek-v4-flash",
              apiKey: "sk-test-workflow-blocked",
              customBaseUrl: `http://127.0.0.1:${fakeProvider.port}`
            }
          })
        })
      );
      const resultPayload = await resultResponse.json() as {
        error?: string;
        request?: { toolCallId?: string; status?: string };
        nextRequest?: { toolCallId?: string; toolName?: string; status?: string; args?: { nextExpectedAction?: string } };
        runner?: {
          run?: { status?: string; error?: string | null; tools?: Array<{ toolCallId: string; status: string }> };
          pendingToolRequests?: Array<{ toolCallId?: string; toolName?: string; status?: string }>;
          policyDecisions?: Array<{ stage?: string; kind?: string; allowed?: boolean; toolCallId?: string; toolName?: string }>;
          modelSteps?: unknown[];
        };
      };

      expect(resultResponse.status).toBe(200);
      expect(resultPayload.error).toBeUndefined();
      expect(resultPayload).toMatchObject({
        request: { toolCallId: "write-before-blocked", status: "succeeded" },
        nextRequest: {
          toolCallId: "post-write-canvas-verify-1",
          toolName: "getCanvasContext",
          status: "pending",
          args: { nextExpectedAction: "continue_after_canvas_verification" }
        },
        runner: {
          run: {
            status: "running",
            error: null,
            tools: [
              { toolCallId: "read-before-blocked", status: "succeeded" },
              { toolCallId: "search-before-write", status: "succeeded" },
              { toolCallId: "write-before-blocked", status: "succeeded" }
            ]
          },
          pendingToolRequests: [
            { toolCallId: "post-write-canvas-verify-1", toolName: "getCanvasContext", status: "pending" }
          ],
          policyDecisions: [
            { stage: "runner_start", kind: "runner_start_enqueued", allowed: true },
            {
              stage: "runner_continuation",
              kind: "runner_continuation_enqueued",
              allowed: true,
              toolCallId: "post-write-canvas-verify-1",
              toolName: "getCanvasContext"
            }
          ]
        }
      });
      expect(resultPayload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
      expect(resultPayload.runner?.modelSteps?.every(isAgentRunModelStepRecord)).toBe(true);
      expect(resultPayload.runner?.modelSteps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: "runner_continuation",
            source: "model",
            status: "succeeded",
            modelProvider: "deepseek",
            modelId: "deepseek-v4-flash",
            inputToolCount: 3,
            outputType: "tool",
            outputToolCallId: "blocked-explain-1",
            outputToolName: "showSolutionSteps",
            error: null
          })
        ])
      );
      expect(JSON.stringify(resultPayload)).not.toContain("sk-test-workflow-blocked");
    } finally {
      fakeProvider.stop(true);
    }
  });

  test("blocks model raw GeoGebra commands when the prompt matches a construction recipe", async () => {
    const { handleRequest } = await createHttpHarness();
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: async () =>
        Response.json({
          id: "fake-deepseek-recipe-raw-command",
          model: "deepseek-v4-flash",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "raw-ellipse-command",
                    function: {
                      name: "executeGeoGebraCommands",
                      arguments: JSON.stringify({
                        commands: ["F = (-2, 0)", "G = (2, 0)", "A = (0, 3)", "c = Ellipse(F, G, A)"],
                        reason: "模型试图跳过结构化构造计划直接写命令。",
                        intendedOutcome: "构造椭圆。",
                        nextExpectedAction: "getCanvasContext"
                      })
                    }
                  }
                ]
              },
              finish_reason: "tool_calls"
            }
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
    });
    const runId = `runner-recipe-raw-command-${crypto.randomUUID()}`;
    const claimOwner = "recipe-raw-command-renderer";

    try {
      const startResponse = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/agent-runs/runner/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            run: {
              runId,
              conversationId: "conversation-1",
              mode: "ai-sdk",
              modelProvider: "deepseek",
              modelId: "deepseek-v4-flash",
              prompt: "帮我一步一步构造一个椭圆。",
              attachmentCount: 0,
              startedAt: "2026-06-06T00:01:50.000Z"
            },
            firstTool: {
              toolCallId: "read-before-raw-ellipse",
              toolName: "getCanvasContext",
              args: { includeXml: false },
              requestedAt: "2026-06-06T00:01:51.000Z"
            }
          })
        })
      );
      expect(startResponse.status).toBe(201);

      await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending?claimOwner=${claimOwner}`)
      );
      const resultResponse = await handleRequest(
        new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/read-before-raw-ellipse/result`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimOwner,
            tool: {
              toolCallId: "read-before-raw-ellipse",
              toolName: "getCanvasContext",
              status: "succeeded",
              args: { includeXml: false },
              result: { ok: true, canvasContext: { objects: [] } },
              startedAt: "2026-06-06T00:01:52.000Z",
              completedAt: "2026-06-06T00:01:53.000Z"
            },
            model: {
              provider: "deepseek",
              model: "deepseek-v4-flash",
              apiKey: "sk-test-recipe-raw-command",
              customBaseUrl: `http://127.0.0.1:${fakeProvider.port}`
            }
          })
        })
      );
      const resultPayload = await resultResponse.json() as {
        error?: string;
        runner?: {
          run?: { status?: string; error?: string | null; tools?: Array<{ toolCallId: string; status: string }> };
          pendingToolRequests?: unknown[];
          policyDecisions?: unknown[];
          modelSteps?: unknown[];
        };
      };

      expect(resultResponse.status).toBe(200);
      expect(resultPayload).toMatchObject({
        nextRequest: {
          toolCallId: "raw-ellipse-command",
          toolName: "executeGeoGebraCommands",
          status: "pending"
        },
        runner: {
          run: {
            status: "running",
            tools: [
              { toolCallId: "read-before-raw-ellipse", status: "succeeded" },
              { toolName: "createGeometryPlan", status: "succeeded" }
            ]
          },
          pendingToolRequests: [
            {
              toolCallId: "raw-ellipse-command",
              toolName: "executeGeoGebraCommands",
              status: "pending"
            }
          ],
          policyDecisions: [
            { stage: "runner_start", kind: "runner_start_enqueued", allowed: true },
            { stage: "runner_continuation", kind: "runner_continuation_enqueued", allowed: true, toolName: "createGeometryPlan" },
            { stage: "runner_continuation", kind: "runner_continuation_enqueued", allowed: true, toolName: "executeGeoGebraCommands" }
          ]
        }
      });
      expect(resultPayload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
      expect(resultPayload.runner?.modelSteps?.every(isAgentRunModelStepRecord)).toBe(true);
      expect(JSON.stringify(resultPayload)).not.toContain("sk-test-recipe-raw-command");
    } finally {
      fakeProvider.stop(true);
    }
  });

  test("rejects new remote tool requests when the backend runner budget is exhausted", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `runner-budget-exhausted-${crypto.randomUUID()}`;
    const baseRun = createAgentRunLedger({
      runId,
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "连续读取画布直到预算耗尽",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:02:00.000Z"
    });
    const exhaustedRun = Array.from({ length: 16 }).reduce(
      (run, _, index) =>
        upsertAgentRunTool(run, {
          toolCallId: `read-${index}`,
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          result: { ok: true, canvasContext: { objects: [] } },
          startedAt: new Date(Date.UTC(2026, 5, 6, 0, 2, index)).toISOString(),
          completedAt: new Date(Date.UTC(2026, 5, 6, 0, 2, index, 500)).toISOString()
        }),
      baseRun
    );

    const saveResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(exhaustedRun)
      })
    );
    expect(saveResponse.status).toBe(201);

    const requestResponse = await handleRequest(
      new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolCallId: "read-over-budget",
          toolName: "getCanvasContext",
          args: { includeXml: false }
        })
      })
    );
    const payload = await requestResponse.json() as {
      error?: string;
      budget?: { maxToolSteps?: number; completedToolSteps?: number; remainingToolRequests?: number; exhausted?: boolean };
    };

    expect(requestResponse.status).toBe(409);
    expect(payload).toMatchObject({
      error: "runner_budget_exceeded",
      budget: {
        maxToolSteps: 16,
        completedToolSteps: 16,
        remainingToolRequests: 0,
        exhausted: true
      }
    });

    const snapshotResponse = await handleRequest(new Request(`http://127.0.0.1:17365/v1/agent-runs/${encodeURIComponent(runId)}/runner`));
    const snapshotPayload = await snapshotResponse.json() as {
      runner?: { policyDecisions?: unknown[] };
    };
    expect(snapshotPayload.runner?.policyDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "remote_tool_request",
          kind: "budget_exhausted",
          allowed: false
        })
      ])
    );
    expect(snapshotPayload.runner?.policyDecisions?.every(isAgentRunPolicyDecisionRecord)).toBe(true);
  });

  test("rejects invalid compatibility run payloads before they can be persisted", async () => {
    const { handleRequest } = await createHttpHarness();
    const runId = `invalid-compat-ledger-${crypto.randomUUID()}`;
    const invalidRun = {
      ...createAgentRunLedger({
        runId,
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "坏 ledger 不应该写入数据库",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:02:20.000Z"
      }),
      tools: [
        {
          toolCallId: "invalid-duration-tool",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          result: { ok: true, canvasContext: { objects: [] } },
          startedAt: "2026-06-06T00:02:21.000Z",
          completedAt: "2026-06-06T00:02:22.000Z",
          durationMs: -1
        }
      ]
    };

    const saveResponse = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/agent-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(invalidRun)
      })
    );
    const savePayload = await saveResponse.json() as { error?: string; message?: string };
    expect(saveResponse.status).toBe(400);
    expect(savePayload).toEqual({
      error: "invalid_request",
      message: "Invalid agent run ledger payload."
    });

    const listResponse = await handleRequest(new Request("http://127.0.0.1:17365/v1/agent-runs"));
    const listPayload = await listResponse.json() as { runs?: Array<{ runId?: string }> };
    expect(listPayload.runs?.some((run) => run.runId === runId)).toBe(false);
  });
});
