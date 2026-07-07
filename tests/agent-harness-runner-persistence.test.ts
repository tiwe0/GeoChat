import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
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
  isAgentProviderProxyHostAllowed,
  getAgentProviderOptions,
  getAgentProviderProxyPolicy,
  normalizeProviderProxyMethod,
  normalizeAgentModelConfig,
  parseProviderProxyUrl,
  providerProxyBase64ByteLength,
  sanitizeProviderProxyHeaders,
  sanitizeProviderProxyResponseHeaders,
  validateProviderProxyBodyBase64,
  validateProviderProxyHeaders,
  validateProviderProxyMethodBody,
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
  agentRunRemoteToolRequestInvalidReasons,
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
import { sanitizeRunnerModelError } from "../backend/src/agent/model-error";
import { createBackendModelNextAction, remoteToolRequestInputFromToolCall } from "../backend/src/agent/model-runner";
import { canExecuteBackendToolRequest, executeBackendToolRequest } from "../backend/src/agent/backend-tools";
import { createDatabase } from "../backend/src/db/client";
import { createAgentRunRepository } from "../backend/src/db/agent-run-repository";
import {
  agentRunLedgers,
  agentRunModelSteps,
  agentRunPolicyDecisions,
  agentRunRemoteToolRequests
} from "../backend/src/db/schema";

const sharedHttpDatabasePath = `/tmp/geochat-agent-harness-http-${crypto.randomUUID()}.sqlite`;

describe("run ledger", () => {
  test("creates a ledger from backend start input without storing API keys", () => {
    const input = {
      runId: "run-start",
      conversationId: "conversation-1",
      userMessageId: "user-1",
      assistantMessageId: "assistant-1",
      mode: "ai-sdk" as const,
      modelProvider: "openai",
      modelId: "gpt-5.5",
      modelStepTimeoutMs: 180_000,
      locale: "en-US" as const,
      prompt: "画一个圆",
      attachmentCount: 1,
      startedAt: "2026-06-06T00:00:00.000Z"
    };

    expect(isAgentRunStartInput(input)).toBe(true);
    expect(createAgentRunLedgerFromStart(input)).toMatchObject({
      runId: "run-start",
      status: "running",
      modelProvider: "openai",
      modelId: "gpt-5.5",
      modelStepTimeoutMs: 180_000,
      locale: "en-US",
      tools: []
    });
    expect(JSON.stringify(createAgentRunLedgerFromStart(input))).not.toContain("apiKey");
    expect(agentRunStartPayload(createAgentRunLedgerFromStart(input))).toMatchObject({
      modelStepTimeoutMs: 180_000,
      locale: "en-US"
    });
    expect(isAgentRunStartInput({ ...input, locale: "fr-FR" })).toBe(false);
  });

  test("rejects malformed durable numeric counters", () => {
    const startInput = {
      runId: "run-bad-count",
      conversationId: "conversation-1",
      mode: "ai-sdk" as const,
      modelProvider: "openai",
      modelId: "gpt-5.5",
      prompt: "画一个圆",
      attachmentCount: 0
    };

    expect(isAgentRunStartInput(startInput)).toBe(true);
    expect(isAgentRunStartInput({ ...startInput, attachmentCount: -1 })).toBe(false);
    expect(isAgentRunStartInput({ ...startInput, attachmentCount: 1.5 })).toBe(false);
    expect(isAgentRunStartInput({ ...startInput, attachmentCount: Number.NaN })).toBe(false);
    expect(isAgentRunUsage({ inputTokens: 0, outputTokens: 1, totalTokens: 1 })).toBe(true);
    expect(isAgentRunUsage({ inputTokens: 2, outputTokens: 3 })).toBe(true);
    expect(isAgentRunUsage({ totalTokens: 5 })).toBe(true);
    expect(isAgentRunUsage({ inputTokens: 2, outputTokens: 3, totalTokens: 4 })).toBe(false);
    expect(isAgentRunUsage({ totalTokens: -1 })).toBe(false);
    expect(isAgentRunUsage({ totalTokens: 1.5 })).toBe(false);
    const timedTool = {
      toolCallId: "tool-bad-count-1",
      toolName: "getCanvasContext" as const,
      status: "succeeded" as const,
      args: { includeXml: false },
      startedAt: "2026-06-06T00:00:00.000Z",
      completedAt: "2026-06-06T00:00:01.000Z",
      durationMs: 1000
    };
    expect(isAgentRunToolRecord(timedTool)).toBe(true);
    expect(isAgentRunToolRecord({ ...timedTool, durationMs: -1 })).toBe(false);
    expect(isAgentRunToolRecord({ ...timedTool, durationMs: 1.5 })).toBe(false);
    expect(isAgentRunToolRecord({ ...timedTool, durationMs: Number.NaN })).toBe(false);
    expect(isAgentRunLedgerRecord({ ...createAgentRunLedgerFromStart(startInput), durationMs: -1 })).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        stepId: "step-bad-count",
        runId: "run-bad-count",
        stage: "runner_continuation",
        source: "model",
        status: "succeeded",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        startedAt: "2026-06-06T00:00:00.000Z",
        inputToolCount: -1,
        attachmentCount: 0,
        outputType: "finish",
        outputTextLength: 2,
        usage: null,
        error: null
      })
    ).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        stepId: "step-bad-duration",
        runId: "run-bad-count",
        stage: "runner_continuation",
        source: "model",
        status: "succeeded",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        startedAt: "2026-06-06T00:00:00.000Z",
        durationMs: Number.NaN,
        inputToolCount: 0,
        attachmentCount: 0,
        outputType: "finish",
        outputTextLength: 2,
        usage: null,
        error: null
      })
    ).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        stepId: "step-bad-output-length",
        runId: "run-bad-count",
        stage: "runner_continuation",
        source: "model",
        status: "succeeded",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        startedAt: "2026-06-06T00:00:00.000Z",
        inputToolCount: 0,
        attachmentCount: 0,
        outputType: "finish",
        outputTextLength: 1.5,
        usage: null,
        error: null
      })
    ).toBe(false);

    const run = createAgentRunLedgerFromStart(startInput);
    const snapshot = {
      run,
      status: "running" as const,
      phase: "needs_canvas_read" as const,
      modelPolicy: agentModelPolicySnapshotFor({ provider: "openai", model: "gpt-5.5" }),
      budget: {
        maxToolSteps: 16,
        completedToolSteps: 0,
        activeToolRequests: 0,
        remainingToolRequests: 16,
        exhausted: false
      },
      pendingToolRequests: []
    };
    expect(isAgentRunRunnerSnapshot(snapshot)).toBe(true);
    expect(isAgentRunRunnerSnapshot({ ...snapshot, budget: { ...snapshot.budget, remainingToolRequests: -1 } })).toBe(false);
    expect(isAgentRunRunnerSnapshot({ ...snapshot, budget: { ...snapshot.budget, activeToolRequests: 0.5 } })).toBe(false);
  });

  test("rejects blank durable record identifiers", () => {
    const startInput = {
      runId: "run-bad-id",
      conversationId: "conversation-1",
      mode: "ai-sdk" as const,
      modelProvider: "openai",
      modelId: "gpt-5.5",
      prompt: "画一个圆",
      attachmentCount: 0
    };
    const run = createAgentRunLedgerFromStart(startInput);

    expect(isAgentRunStartInput(startInput)).toBe(true);
    expect(isAgentRunStartInput({ ...startInput, runId: " " })).toBe(false);
    expect(isAgentRunStartInput({ ...startInput, conversationId: "" })).toBe(false);
    expect(isAgentRunLedgerRecord(run)).toBe(true);
    expect(isAgentRunLedgerRecord({ ...run, runId: "" })).toBe(false);
    expect(isAgentRunLedgerRecord({ ...run, conversationId: " " })).toBe(false);
    expect(
      isAgentRunPolicyDecisionRecord({
        decisionId: " ",
        runId: "run-bad-id",
        stage: "runner_start",
        kind: "workflow_blocked",
        allowed: false,
        createdAt: "2026-06-06T00:00:00.000Z"
      })
    ).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        stepId: "step-1",
        runId: " ",
        stage: "runner_continuation",
        source: "model",
        status: "succeeded",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        startedAt: "2026-06-06T00:00:00.000Z",
        inputToolCount: 0,
        attachmentCount: 0,
        outputType: "tool",
        outputToolCallId: " ",
        outputToolName: "getCanvasContext",
        usage: null,
        error: null
      })
    ).toBe(false);
  });

  test("rejects policy decision allowed and kind drift", () => {
    const allowedDecision = {
      decisionId: "decision-policy-allowed",
      runId: "run-policy-state",
      stage: "runner_start" as const,
      kind: "runner_start_enqueued" as const,
      allowed: true,
      toolCallId: "policy-allowed-tool",
      toolName: "getCanvasContext" as const,
      createdAt: "2026-06-06T00:00:00.000Z"
    };
    const blockedDecision = {
      decisionId: "decision-policy-blocked",
      runId: "run-policy-state",
      stage: "runner_start" as const,
      kind: "workflow_blocked" as const,
      allowed: false,
      createdAt: "2026-06-06T00:00:00.000Z"
    };
    const rawFallbackDecision = {
      decisionId: "decision-policy-raw-fallback",
      runId: "run-policy-state",
      stage: "runner_continuation" as const,
      kind: "raw_command_fallback" as const,
      allowed: true,
      toolCallId: "raw-fallback-execute",
      toolName: "executeGeoGebraCommands" as const,
      createdAt: "2026-06-06T00:00:00.000Z",
      details: {
        request: {
          toolCallId: "raw-fallback-execute",
          toolName: "executeGeoGebraCommands" as const,
          args: { commands: ["A = (0, 0)"] }
        },
        preferredTool: "createGeometryPlan" as const,
        reason: "No successful createGeometryPlan exists."
      }
    };

    expect(isAgentRunPolicyDecisionRecord(allowedDecision)).toBe(true);
    expect(isAgentRunPolicyDecisionRecord({ ...allowedDecision, allowed: false })).toBe(false);
    expect(isAgentRunPolicyDecisionRecord(blockedDecision)).toBe(true);
    expect(isAgentRunPolicyDecisionRecord({ ...blockedDecision, allowed: true })).toBe(false);
    expect(isAgentRunPolicyDecisionRecord(rawFallbackDecision)).toBe(true);
    expect(isAgentRunPolicyDecisionRecord({ ...rawFallbackDecision, allowed: false })).toBe(false);
  });

  test("rejects policy decision stage and kind drift", () => {
    const createdAt = "2026-06-06T00:00:00.000Z";
    const baseDecision = {
      decisionId: "decision-policy-stage",
      runId: "run-policy-stage",
      createdAt
    };

    expect(
      isAgentRunPolicyDecisionRecord({
        ...baseDecision,
        stage: "runner_continuation",
        kind: "runner_continuation_enqueued",
        allowed: true,
        toolCallId: "policy-stage-tool",
        toolName: "executeGeoGebraCommands"
      })
    ).toBe(true);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...baseDecision,
        stage: "runner_start",
        kind: "runner_continuation_enqueued",
        allowed: true,
        toolCallId: "policy-stage-tool",
        toolName: "executeGeoGebraCommands"
      })
    ).toBe(false);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...baseDecision,
        stage: "remote_tool_request",
        kind: "tool_boundary_blocked",
        allowed: false,
        toolCallId: "policy-boundary-tool",
        toolName: "searchGeoGebraCommands"
      })
    ).toBe(true);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...baseDecision,
        stage: "runner_continuation",
        kind: "tool_boundary_blocked",
        allowed: false,
        toolCallId: "policy-boundary-tool",
        toolName: "searchGeoGebraCommands"
      })
    ).toBe(false);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...baseDecision,
        stage: "remote_tool_request",
        kind: "budget_exhausted",
        allowed: false
      })
    ).toBe(true);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...baseDecision,
        stage: "ledger_tool_event",
        kind: "budget_exhausted",
        allowed: false
      })
    ).toBe(false);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...baseDecision,
        stage: "ledger_tool_event",
        kind: "workflow_blocked",
        allowed: false,
        toolCallId: "policy-workflow-tool",
        toolName: "executeGeoGebraCommands"
      })
    ).toBe(true);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...baseDecision,
        stage: "runner_continuation",
        kind: "raw_command_fallback",
        allowed: true,
        toolCallId: "policy-raw-fallback",
        toolName: "executeGeoGebraCommands",
        details: {
          request: {
            toolCallId: "policy-raw-fallback",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["A = (0, 0)"] }
          },
          preferredTool: "createGeometryPlan",
          reason: "No successful createGeometryPlan exists."
        }
      })
    ).toBe(true);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...baseDecision,
        stage: "remote_tool_request",
        kind: "raw_command_fallback",
        allowed: true,
        toolCallId: "policy-raw-fallback",
        toolName: "executeGeoGebraCommands",
        details: {
          request: {
            toolCallId: "policy-raw-fallback",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["A = (0, 0)"] }
          },
          preferredTool: "createGeometryPlan",
          reason: "No successful createGeometryPlan exists."
        }
      })
    ).toBe(false);
  });

  test("rejects policy decision tool reference drift", () => {
    const createdAt = "2026-06-06T00:00:00.000Z";
    const baseDecision = {
      decisionId: "decision-policy-tool-ref",
      runId: "run-policy-tool-ref",
      createdAt
    };
    const enqueuedDecision = {
      ...baseDecision,
      stage: "runner_start" as const,
      kind: "runner_start_enqueued" as const,
      allowed: true,
      toolCallId: "policy-tool-ref-read",
      toolName: "getCanvasContext" as const
    };
    const modelErrorDecision = {
      ...baseDecision,
      stage: "runner_start" as const,
      kind: "model_error" as const,
      allowed: false
    };
    const manualWorkflowDecision = {
      ...baseDecision,
      stage: "remote_tool_request" as const,
      kind: "workflow_blocked" as const,
      allowed: false,
      toolCallId: "policy-tool-ref-write",
      toolName: "executeGeoGebraCommands" as const
    };
    const runnerWorkflowDecision = {
      ...baseDecision,
      stage: "runner_continuation" as const,
      kind: "workflow_blocked" as const,
      allowed: false
    };
    const rawFallbackDecision = {
      ...baseDecision,
      stage: "runner_continuation" as const,
      kind: "raw_command_fallback" as const,
      allowed: true,
      toolCallId: "policy-tool-ref-raw",
      toolName: "executeGeoGebraCommands" as const,
      details: {
        request: {
          toolCallId: "policy-tool-ref-raw",
          toolName: "executeGeoGebraCommands" as const,
          args: { commands: ["A = (0, 0)"] }
        },
        preferredTool: "createGeometryPlan" as const,
        reason: "No successful createGeometryPlan exists."
      }
    };

    expect(isAgentRunPolicyDecisionRecord(enqueuedDecision)).toBe(true);
    expect(isAgentRunPolicyDecisionRecord({ ...enqueuedDecision, toolName: null })).toBe(false);
    expect(isAgentRunPolicyDecisionRecord({ ...enqueuedDecision, toolCallId: null })).toBe(false);
    expect(isAgentRunPolicyDecisionRecord(modelErrorDecision)).toBe(true);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...modelErrorDecision,
        toolCallId: "policy-tool-ref-read",
        toolName: "getCanvasContext"
      })
    ).toBe(false);
    expect(isAgentRunPolicyDecisionRecord(manualWorkflowDecision)).toBe(true);
    expect(isAgentRunPolicyDecisionRecord({ ...manualWorkflowDecision, toolCallId: null, toolName: null })).toBe(false);
    expect(isAgentRunPolicyDecisionRecord(runnerWorkflowDecision)).toBe(true);
    expect(isAgentRunPolicyDecisionRecord(rawFallbackDecision)).toBe(true);
    expect(isAgentRunPolicyDecisionRecord({ ...rawFallbackDecision, toolCallId: null, toolName: null })).toBe(false);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...runnerWorkflowDecision,
        toolCallId: "policy-tool-ref-write",
        toolName: "executeGeoGebraCommands"
      })
    ).toBe(false);
  });

  test("rejects unstructured policy decision details", () => {
    const createdAt = "2026-06-06T00:00:00.000Z";
    const enqueuedDecision = {
      decisionId: "decision-policy-details-enqueued",
      runId: "run-policy-details",
      stage: "runner_start" as const,
      kind: "runner_start_enqueued" as const,
      allowed: true,
      toolCallId: "policy-details-read",
      toolName: "getCanvasContext" as const,
      createdAt,
      details: {
        request: {
          toolCallId: "policy-details-read",
          toolName: "getCanvasContext" as const,
          args: { includeXml: false },
          requestedAt: "2026-06-06T00:00:01.000Z"
        }
      }
    };
    const budgetDecision = {
      decisionId: "decision-policy-details-budget",
      runId: "run-policy-details",
      stage: "runner_continuation" as const,
      kind: "budget_exhausted" as const,
      allowed: false,
      createdAt,
      details: {
        budget: {
          maxToolSteps: 16,
          completedToolSteps: 16,
          activeToolRequests: 0,
          remainingToolRequests: 0,
          exhausted: true
        },
        status: "failed" as const,
        error: "budget exhausted"
      }
    };
    const mismatchDecision = {
      decisionId: "decision-policy-details-mismatch",
      runId: "run-policy-details",
      stage: "runner_start" as const,
      kind: "model_mismatch" as const,
      allowed: false,
      createdAt,
      details: {
        expected: { provider: "openai", model: "gpt-5.5" },
        received: { provider: "deepseek", model: "deepseek-v4-flash" }
      }
    };
    const rawFallbackDecision = {
      decisionId: "decision-policy-details-raw",
      runId: "run-policy-details",
      stage: "runner_continuation" as const,
      kind: "raw_command_fallback" as const,
      allowed: true,
      toolCallId: "policy-details-raw",
      toolName: "executeGeoGebraCommands" as const,
      createdAt,
      details: {
        request: {
          toolCallId: "policy-details-raw",
          toolName: "executeGeoGebraCommands" as const,
          args: { commands: ["A = (0, 0)"] }
        },
        preferredTool: "createGeometryPlan" as const,
        reason: "No successful createGeometryPlan exists."
      }
    };

    expect(isAgentRunPolicyDecisionRecord(enqueuedDecision)).toBe(true);
    expect(isAgentRunPolicyDecisionRecord(budgetDecision)).toBe(true);
    expect(isAgentRunPolicyDecisionRecord(mismatchDecision)).toBe(true);
    expect(isAgentRunPolicyDecisionRecord(rawFallbackDecision)).toBe(true);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...enqueuedDecision,
        details: { ...enqueuedDecision.details, apiKey: "sk-should-not-persist" }
      })
    ).toBe(false);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...rawFallbackDecision,
        details: { ...rawFallbackDecision.details, preferredTool: "executeGeoGebraCommands" }
      })
    ).toBe(false);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...enqueuedDecision,
        details: {
          request: {
            ...enqueuedDecision.details.request,
            args: { includeXml: "yes" }
          }
        }
      })
    ).toBe(false);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...budgetDecision,
        details: {
          ...budgetDecision.details,
          budget: { ...budgetDecision.details.budget, remainingToolRequests: -1 }
        }
      })
    ).toBe(false);
    expect(
      isAgentRunPolicyDecisionRecord({
        ...mismatchDecision,
        details: { ...mismatchDecision.details, rawProviderResponse: { choices: [] } }
      })
    ).toBe(false);
    expect(
      isAgentRunPolicyDecisionRecord({
        decisionId: "decision-policy-details-model-error",
        runId: "run-policy-details",
        stage: "runner_start",
        kind: "model_error",
        allowed: false,
        createdAt,
        details: { error: "details are intentionally not allowed here" }
      })
    ).toBe(false);
  });

  test("rejects malformed durable timestamps", () => {
    const startInput = {
      runId: "run-bad-time",
      conversationId: "conversation-1",
      mode: "ai-sdk" as const,
      modelProvider: "openai",
      modelId: "gpt-5.5",
      prompt: "画一个圆",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    };
    const run = createAgentRunLedgerFromStart(startInput);
    const tool = {
      toolCallId: "tool-bad-time-1",
      toolName: "getCanvasContext" as const,
      status: "succeeded" as const,
      args: { includeXml: false },
      result: { objects: [] },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z",
      durationMs: 1000
    };

    expect(isAgentRunStartInput(startInput)).toBe(true);
    expect(isAgentRunStartInput({ ...startInput, startedAt: "not-a-date" })).toBe(false);
    expect(isAgentRunLedgerRecord(run)).toBe(true);
    expect(isAgentRunLedgerRecord({ ...run, startedAt: "" })).toBe(false);
    expect(isAgentRunLedgerRecord({ ...run, completedAt: "not-a-date" })).toBe(false);
    expect(
      isAgentRunLedgerRecord({
        ...run,
        status: "failed",
        completedAt: "2026-06-05T23:59:59.000Z",
        durationMs: 0,
        error: "failed"
      })
    ).toBe(false);
    expect(
      isAgentRunLedgerRecord({
        ...run,
        status: "failed",
        completedAt: "2026-06-06T00:00:02.000Z",
        durationMs: 1,
        error: "failed"
      })
    ).toBe(false);
    expect(isAgentRunToolRecord(tool)).toBe(true);
    expect(isAgentRunToolRecord({ ...tool, startedAt: " " })).toBe(false);
    expect(isAgentRunToolRecord({ ...tool, completedAt: "not-a-date" })).toBe(false);
    expect(isAgentRunToolRecord({ ...tool, completedAt: "2026-06-06T00:00:00.500Z", durationMs: 0 })).toBe(false);
    expect(isAgentRunToolRecord({ ...tool, durationMs: 999 })).toBe(false);
    expect(isAgentRunFinishInput({ status: "succeeded", completedAt: "not-a-date" })).toBe(false);
    expect(
      isAgentRunPolicyDecisionRecord({
        decisionId: "decision-bad-time-1",
        runId: "run-bad-time",
        stage: "runner_start",
        kind: "runner_start_enqueued",
        allowed: true,
        toolCallId: "decision-bad-time-tool",
        toolName: "getCanvasContext",
        createdAt: "not-a-date"
      })
    ).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        stepId: "step-bad-time-1",
        runId: "run-bad-time",
        stage: "runner_continuation",
        source: "model",
        status: "succeeded",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        startedAt: "not-a-date",
        completedAt: "2026-06-06T00:00:03.000Z",
        inputToolCount: 1,
        attachmentCount: 0,
        outputType: "finish",
        outputTextLength: 12,
        usage: null,
        error: null
      })
    ).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        stepId: "step-bad-time-2",
        runId: "run-bad-time",
        stage: "runner_continuation",
        source: "model",
        status: "succeeded",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        startedAt: "2026-06-06T00:00:02.000Z",
        completedAt: "not-a-date",
        inputToolCount: 1,
        attachmentCount: 0,
        outputType: "finish",
        outputTextLength: 12,
        usage: null,
        error: null
      })
    ).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        stepId: "step-bad-time-3",
        runId: "run-bad-time",
        stage: "runner_continuation",
        source: "model",
        status: "succeeded",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        startedAt: "2026-06-06T00:00:02.000Z",
        completedAt: "2026-06-06T00:00:01.000Z",
        durationMs: 0,
        inputToolCount: 1,
        attachmentCount: 0,
        outputType: "finish",
        outputTextLength: 12,
        usage: null,
        error: null
      })
    ).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        stepId: "step-bad-time-4",
        runId: "run-bad-time",
        stage: "runner_continuation",
        source: "model",
        status: "succeeded",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        startedAt: "2026-06-06T00:00:02.000Z",
        completedAt: "2026-06-06T00:00:03.000Z",
        durationMs: 999,
        inputToolCount: 1,
        attachmentCount: 0,
        outputType: "finish",
        outputTextLength: 12,
        usage: null,
        error: null
      })
    ).toBe(false);
  });

  test("preserves tool canvas before and after snapshots", () => {
    const startedAt = "2026-06-06T00:00:00.000Z";
    const completedAt = "2026-06-06T00:00:02.000Z";
    const ledger = createAgentRunLedger({
      runId: "run-1",
      conversationId: "conversation-1",
      mode: "local-planner",
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "画一个圆",
      attachmentCount: 0,
      startedAt
    });

    const updated = upsertAgentRunTool(ledger, {
      toolCallId: "tool-1",
      toolName: "executeGeoGebraCommands",
      status: "succeeded",
      args: { commands: ["A = (0, 0)", "c = Circle(A, 1)"] },
      result: { ok: true },
      canvasBefore: { element_count: 0 },
      canvasAfter: { element_count: 2 },
      error: null,
      startedAt,
      completedAt
    });

    expect(updated.tools[0]).toMatchObject({
      canvasBefore: { element_count: 0 },
      canvasAfter: { element_count: 2 },
      durationMs: 2000
    });
    expect(isAgentRunLedgerRecord(updated)).toBe(true);
  });

  test("accepts blackboard tools in persisted run ledgers", () => {
    const startedAt = "2026-06-06T00:00:00.000Z";
    const readCompletedAt = "2026-06-06T00:00:01.000Z";
    const patchCompletedAt = "2026-06-06T00:00:02.000Z";
    const ledger = createAgentRunLedger({
      runId: "run-blackboard-tools",
      conversationId: "conversation-blackboard",
      mode: "ai-sdk",
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "继续解释当前构造",
      attachmentCount: 0,
      startedAt
    });

    const afterRead = upsertAgentRunTool(ledger, {
      toolCallId: "read-blackboard-1",
      toolName: "readBlackboard",
      status: "succeeded",
      args: { categories: ["original_problem"], includeArchived: false, limit: 8, reason: "恢复上下文" },
      result: { ok: true, entries: [] },
      error: null,
      startedAt,
      completedAt: readCompletedAt
    });
    const afterPatch = upsertAgentRunTool(afterRead, {
      toolCallId: "patch-blackboard-1",
      toolName: "patchBlackboard",
      status: "succeeded",
      args: {
        ops: [
          {
            op: "upsert",
            key: "original_problem",
            category: "original_problem",
            value: "画一个椭圆",
            confidence: 0.9,
            reason: "用户原始输入"
          }
        ],
        reason: "沉淀原题"
      },
      result: { ok: true, changed: 1, archived: 0 },
      error: null,
      startedAt: readCompletedAt,
      completedAt: patchCompletedAt
    });

    expect(isAgentRunToolRecord(afterRead.tools[0])).toBe(true);
    expect(isAgentRunToolRecord(afterPatch.tools[1])).toBe(true);
    expect(isAgentRunLedgerRecord(afterPatch)).toBe(true);
  });

  test("rejects blank ledger tool ids and detects conflicting tool id reuse", () => {
    const ledger = createAgentRunLedger({
      runId: "run-tool-id-conflict",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "读取画布",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    const afterRead = upsertAgentRunTool(ledger, {
      toolCallId: "read-1",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { reason: "读取画布", includeXml: false },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    });

    expect(
      isAgentRunLedgerRecord({
        ...afterRead,
        tools: [{ ...afterRead.tools[0], toolCallId: "   " }]
      })
    ).toBe(false);
    expect(
      findAgentRunToolCallConflict(afterRead.tools, {
        toolCallId: "read-1",
        toolName: "getCanvasContext",
        args: { includeXml: false, reason: "读取画布" }
      })
    ).toBeUndefined();
    expect(
      findAgentRunToolCallIdReuseConflict(afterRead.tools, {
        toolCallId: "read-1",
        toolName: "getCanvasContext",
        args: { includeXml: false, reason: "读取画布" }
      })
    ).toMatchObject({
      reason: "duplicate_tool_call_id",
      message: "Tool call id read-1 already exists in the run ledger."
    });
    expect(
      findAgentRunToolCallConflict(afterRead.tools, {
        toolCallId: "read-1",
        toolName: "executeGeoGebraCommands",
        args: { commands: ["A = (0, 0)"] }
      })
    ).toMatchObject({ reason: "tool_name_mismatch" });
    expect(
      findAgentRunToolCallConflict(afterRead.tools, {
        toolCallId: "read-1",
        toolName: "getCanvasContext",
        args: { includeXml: true }
      })
    ).toMatchObject({ reason: "args_mismatch" });
    expect(agentRunToolArgsMatch({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  test("allows only running runs to transition into terminal states", () => {
    expect(canTransitionAgentRunStatus("running", "succeeded")).toBe(true);
    expect(canTransitionAgentRunStatus("running", "failed")).toBe(true);
    expect(canTransitionAgentRunStatus("succeeded", "failed")).toBe(false);
    expect(isTerminalAgentRunStatus("cancelled")).toBe(true);
  });

  test("rejects durable lifecycle timestamp drift", () => {
    const run = createAgentRunLedger({
      runId: "run-lifecycle-drift",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "读取画布",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    const completedRun = {
      ...run,
      status: "succeeded" as const,
      completedAt: "2026-06-06T00:00:02.000Z",
      durationMs: 2000
    };
    const runningTool = {
      toolCallId: "tool-running-lifecycle",
      toolName: "getCanvasContext" as const,
      status: "running" as const,
      args: { includeXml: false },
      startedAt: "2026-06-06T00:00:01.000Z"
    };
    const completedTool = {
      ...runningTool,
      status: "succeeded" as const,
      completedAt: "2026-06-06T00:00:02.000Z",
      durationMs: 1000
    };
    const runningModelStep = {
      stepId: "step-running-lifecycle",
      runId: "run-lifecycle-drift",
      stage: "runner_continuation" as const,
      source: "model" as const,
      status: "running" as const,
      modelProvider: "openai",
      modelId: "gpt-5.5",
      startedAt: "2026-06-06T00:00:01.000Z",
      inputToolCount: 0,
      attachmentCount: 0,
      outputType: null,
      outputToolCallId: null,
      outputToolName: null,
      outputTextLength: null,
      usage: null,
      error: null
    };
    const completedModelStep = {
      ...runningModelStep,
      status: "succeeded" as const,
      completedAt: "2026-06-06T00:00:02.000Z",
      durationMs: 1000,
      outputType: "finish" as const,
      outputTextLength: 12
    };
    const completedToolModelStep = {
      ...runningModelStep,
      status: "succeeded" as const,
      completedAt: "2026-06-06T00:00:02.000Z",
      durationMs: 1000,
      outputType: "tool" as const,
      outputToolCallId: "model-step-tool-1",
      outputToolName: "getCanvasContext" as const
    };
    const failedModelStep = {
      ...runningModelStep,
      status: "failed" as const,
      completedAt: "2026-06-06T00:00:02.000Z",
      durationMs: 1000,
      error: "model failed"
    };

    expect(isAgentRunLedgerRecord(run)).toBe(true);
    expect(isAgentRunLedgerRecord({ ...run, completedAt: "2026-06-06T00:00:02.000Z" })).toBe(false);
    expect(isAgentRunLedgerRecord({ ...run, durationMs: 2000 })).toBe(false);
    expect(isAgentRunLedgerRecord({ ...run, error: "still running" })).toBe(false);
    expect(isAgentRunLedgerRecord(completedRun)).toBe(true);
    expect(isAgentRunLedgerRecord({ ...completedRun, completedAt: null })).toBe(false);
    expect(isAgentRunLedgerRecord({ ...completedRun, error: "success should not carry error" })).toBe(false);
    expect(isAgentRunLedgerRecord({ ...completedRun, status: "failed", error: "failed", usage: { totalTokens: 12 } })).toBe(false);
    expect(isAgentRunToolRecord(runningTool)).toBe(true);
    expect(isAgentRunToolRecord({ ...runningTool, completedAt: "2026-06-06T00:00:02.000Z" })).toBe(false);
    expect(isAgentRunToolRecord({ ...runningTool, durationMs: 1000 })).toBe(false);
    expect(isAgentRunToolRecord({ ...runningTool, error: "still running" })).toBe(false);
    expect(isAgentRunToolRecord(completedTool)).toBe(true);
    expect(isAgentRunToolRecord({ ...completedTool, completedAt: null })).toBe(false);
    expect(isAgentRunToolRecord({ ...completedTool, error: "success should not carry error" })).toBe(false);
    expect(isAgentRunModelStepRecord(runningModelStep)).toBe(true);
    expect(isAgentRunModelStepRecord({ ...runningModelStep, completedAt: "2026-06-06T00:00:02.000Z" })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...runningModelStep, durationMs: 1000 })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...runningModelStep, error: "still running" })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...runningModelStep, usage: { totalTokens: 12 } })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...runningModelStep, outputType: "finish", outputTextLength: 12 })).toBe(false);
    expect(isAgentRunModelStepRecord(failedModelStep)).toBe(true);
    expect(isAgentRunModelStepRecord(completedModelStep)).toBe(true);
    expect(isAgentRunModelStepRecord({ ...completedModelStep, completedAt: null })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...completedModelStep, error: "success should not carry error" })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...completedModelStep, status: "failed", error: "failed", usage: { totalTokens: 12 } })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...completedModelStep, status: "failed", error: "failed" })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...completedModelStep, outputType: null })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...completedModelStep, outputTextLength: null })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...completedModelStep, outputToolCallId: "unexpected-tool" })).toBe(false);
    expect(isAgentRunModelStepRecord(completedToolModelStep)).toBe(true);
    expect(isAgentRunModelStepRecord({ ...completedToolModelStep, outputToolCallId: null })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...completedToolModelStep, outputToolName: null })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...completedToolModelStep, outputTextLength: 12 })).toBe(false);
    expect(isAgentRunModelStepRecord({ ...completedToolModelStep, status: "cancelled", error: "cancelled" })).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        ...completedModelStep,
        details: {
          protocolRepairAttempts: 1,
          protocolRepairErrors: ["模型一次返回了多个工具调用。"]
        }
      })
    ).toBe(true);
    expect(
      isAgentRunModelStepRecord({
        ...completedModelStep,
        details: {
          protocolRepairAttempts: 0,
          protocolRepairErrors: []
        }
      })
    ).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        ...completedModelStep,
        details: {
          protocolRepairAttempts: 2,
          protocolRepairErrors: ["只记录了一次错误。"]
        }
      })
    ).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        ...completedModelStep,
        details: {
          protocolRepairAttempts: 1,
          protocolRepairErrors: [""]
        }
      })
    ).toBe(false);
    expect(
      isAgentRunModelStepRecord({
        ...completedModelStep,
        details: {
          protocolRepairAttempts: 1,
          protocolRepairErrors: ["合法错误。"],
          executor: "backend"
        }
      })
    ).toBe(false);
  });

  test("validates finish events separately from full ledger payloads", () => {
    expect(
      isAgentRunFinishInput({
        status: "succeeded",
        usage: { totalTokens: 12 },
        error: null
      })
    ).toBe(true);
    expect(
      isAgentRunFinishInput({
        status: "succeeded",
        usage: { totalTokens: 12 },
        error: "success should not carry error"
      })
    ).toBe(false);
    expect(
      isAgentRunFinishInput({
        status: "failed",
        usage: { totalTokens: 12 },
        error: "failed"
      })
    ).toBe(false);
    expect(isAgentRunFinishInput({ status: "running" })).toBe(false);
  });

  test("normalizes terminal run usage and error by final status", () => {
    const run = createAgentRunLedger({
      runId: "run-clear-terminal-usage",
      conversationId: "conversation-clear-terminal-usage",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "画一个圆",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    const runWithUsage = { ...run, usage: { totalTokens: 12 } };

    expect(
      finishAgentRunLedger(run, {
        status: "succeeded",
        usage: { totalTokens: 12 },
        error: "success should not carry error",
        completedAt: "2026-06-06T00:00:01.000Z"
      }).error
    ).toBeNull();
    expect(
      finishAgentRunLedger(runWithUsage, {
        status: "failed",
        usage: { totalTokens: 99 },
        error: "failed",
        completedAt: "2026-06-06T00:00:01.000Z"
      }).usage
    ).toBeNull();
    expect(
      finishAgentRunLedger(runWithUsage, {
        status: "cancelled",
        usage: { totalTokens: 99 },
        error: "cancelled",
        completedAt: "2026-06-06T00:00:01.000Z"
      }).usage
    ).toBeNull();
  });

  test("rejects unknown tool names in ledger tool payloads", () => {
    expect(
      isAgentRunLedgerRecord({
        runId: "run-unknown-tool",
        conversationId: "conversation-1",
        mode: "local-planner",
        status: "running",
        modelProvider: "deepseek",
        modelId: "deepseek-v4-flash",
        prompt: "画一个圆",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z",
        tools: [
          {
            toolCallId: "tool-1",
            toolName: "unknownTool",
            status: "succeeded",
            args: {},
            startedAt: "2026-06-06T00:00:00.000Z"
          }
        ]
      })
    ).toBe(false);
  });

  test("rejects known tools with invalid args in ledger payloads", () => {
    expect(
      isAgentRunLedgerRecord({
        runId: "run-invalid-tool-args",
        conversationId: "conversation-1",
        mode: "local-planner",
        status: "running",
        modelProvider: "deepseek",
        modelId: "deepseek-v4-flash",
        prompt: "画一个圆",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z",
        tools: [
          {
            toolCallId: "tool-1",
            toolName: "executeGeoGebraCommands",
            status: "succeeded",
            args: { commands: [] },
            startedAt: "2026-06-06T00:00:00.000Z"
          }
        ]
      })
    ).toBe(false);
  });
});

describe("agent run coordinator", () => {
  test("posts lifecycle events to the backend run API", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const coordinator = createAgentRunCoordinator({
      backendBaseUrl: "http://127.0.0.1:17365/",
      fetch: async (input, init) => {
        calls.push({
          url: String(input),
          body: init?.body ? JSON.parse(String(init.body)) : undefined
        });
        if (String(input).endsWith("/tool-requests/remote-1/result")) {
          return Response.json({
            run: {
              runId: "run-1",
              conversationId: "conversation-1",
              mode: "local-planner",
              status: "running",
              modelProvider: "deepseek",
              modelId: "deepseek-v4-flash",
              prompt: "画圆",
              attachmentCount: 0,
              startedAt: "2026-06-06T00:00:00.000Z",
              tools: []
            },
            request: {
              runId: "run-1",
              toolCallId: "remote-1",
              toolName: "getCanvasContext",
              args: { includeXml: false },
              status: "succeeded",
              requestedAt: "2026-06-06T00:00:02.000Z",
              completedAt: "2026-06-06T00:00:04.000Z",
              error: null
            },
            nextRequest: {
              runId: "run-1",
              toolCallId: "remote-2",
              toolName: "executeGeoGebraCommands",
              args: { commands: ["O = (0, 0)"] },
              status: "pending",
              requestedAt: "2026-06-06T00:00:05.000Z",
              error: null
            },
            runner: {
              run: {
                runId: "run-1",
                conversationId: "conversation-1",
                mode: "local-planner",
                status: "running",
                modelProvider: "deepseek",
                modelId: "deepseek-v4-flash",
                prompt: "画圆",
                attachmentCount: 0,
                startedAt: "2026-06-06T00:00:00.000Z",
                tools: []
              },
              status: "waiting_for_tool",
              phase: "writing",
              modelPolicy: agentModelPolicySnapshotFor({ provider: "deepseek", model: "deepseek-v4-flash" }),
              budget: {
                maxToolSteps: 12,
                completedToolSteps: 0,
                activeToolRequests: 1,
                remainingToolRequests: 11,
                exhausted: false
              },
              pendingToolRequests: [
                {
                  runId: "run-1",
                  toolCallId: "remote-2",
                  toolName: "executeGeoGebraCommands",
                  args: { commands: ["O = (0, 0)"] },
                  status: "pending",
                  requestedAt: "2026-06-06T00:00:05.000Z",
                  error: null
                }
              ]
            },
            text: "继续执行下一步。"
          });
        }
        return Response.json({
          run: {
            runId: "run-1",
            conversationId: "conversation-1",
            mode: "local-planner",
            status: "running",
            modelProvider: "deepseek",
            modelId: "deepseek-v4-flash",
            prompt: "画圆",
            attachmentCount: 0,
            startedAt: "2026-06-06T00:00:00.000Z",
            tools: []
          }
        });
      }
    });
    const record = createAgentRunLedger({
      runId: "run-1",
      conversationId: "conversation-1",
      mode: "local-planner",
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "secret",
        customBaseUrl: ""
      },
      prompt: "画圆",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });

    await coordinator.start(record);
    await coordinator.recordTool("run-1", {
      toolCallId: "tool-1",
      toolName: "getCanvasContext",
      status: "running",
      args: { includeXml: false },
      startedAt: "2026-06-06T00:00:01.000Z"
    });
    await coordinator.finish("run-1", { status: "succeeded", error: null });
    await coordinator.createToolRequest("run-1", {
      toolCallId: "remote-1",
      toolName: "getCanvasContext",
      args: { includeXml: false },
      requestedAt: "2026-06-06T00:00:02.000Z"
    });
    await coordinator.pendingToolRequests("run-1");
    const result = await coordinator.submitToolResult("run-1", "remote-1", {
      tool: {
        toolCallId: "remote-1",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    });
    expect(result).toMatchObject({
      text: "继续执行下一步。",
      request: {
        toolCallId: "remote-1",
        toolName: "getCanvasContext",
        status: "succeeded"
      },
      run: {
        runId: "run-1",
        status: "running"
      },
      nextRequest: {
        toolCallId: "remote-2",
        toolName: "executeGeoGebraCommands"
      }
    });
    await coordinator.startPausedRunner({
      run: {
        runId: "runner-run-1",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        prompt: "画圆",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      },
      firstTool: {
        toolCallId: "runner-tool-1",
        toolName: "getCanvasContext",
        args: { includeXml: false }
      }
    });
    await coordinator.runnerSnapshot("runner-run-1");

    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:17365/v1/agent-runs/start",
      "http://127.0.0.1:17365/v1/agent-runs/run-1/tools",
      "http://127.0.0.1:17365/v1/agent-runs/run-1/finish",
      "http://127.0.0.1:17365/v1/agent-runs/run-1/tool-requests",
      "http://127.0.0.1:17365/v1/agent-runs/run-1/tool-requests/pending",
      "http://127.0.0.1:17365/v1/agent-runs/run-1/tool-requests/remote-1/result",
      "http://127.0.0.1:17365/v1/agent-runs/runner/start",
      "http://127.0.0.1:17365/v1/agent-runs/runner-run-1/runner"
    ]);
    expect(JSON.stringify(calls[0].body)).not.toContain("secret");
  });

  test("retries transient SQLite busy responses from the backend", async () => {
    let calls = 0;
    const run = createAgentRunLedger({
      runId: "runner-run-1",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "secret",
        customBaseUrl: ""
      },
      prompt: "画圆",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    const pendingToolRequest = createAgentRunRemoteToolRequest(run.runId, {
      toolCallId: "runner-tool-1",
      toolName: "getCanvasContext",
      args: { includeXml: false },
      requestedAt: "2026-06-06T00:00:01.000Z"
    });
    const coordinator = createAgentRunCoordinator({
      backendBaseUrl: "http://127.0.0.1:17365",
      sqliteBusyRetryDelayMs: 0,
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          return Response.json(
            { error: "internal_error", message: "database is locked" },
            { status: 500 }
          );
        }
        return Response.json({
          runner: {
            run,
            status: "waiting_for_tool",
            phase: agentRunRunnerPhaseFor({ run, pendingToolRequests: [pendingToolRequest] }),
            modelPolicy: agentRunRunnerModelPolicyFor({ run }),
            budget: agentRunRunnerBudgetFor({ run, pendingToolRequests: [pendingToolRequest] }),
            pendingToolRequests: [pendingToolRequest]
          }
        });
      }
    });

    await expect(coordinator.startPausedRunner({
      run: {
        runId: "runner-run-1",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        prompt: "画圆",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      },
      firstTool: {
        toolCallId: "runner-tool-1",
        toolName: "getCanvasContext",
        args: { includeXml: false }
      }
    })).resolves.toMatchObject({
      run: { runId: "runner-run-1" },
      pendingToolRequests: [{ toolCallId: "runner-tool-1" }]
    });
    expect(calls).toBe(2);
  });

  test("loads active runner snapshots from running ledger records", async () => {
    const calls: string[] = [];
    const coordinator = createAgentRunCoordinator({
      backendBaseUrl: "http://127.0.0.1:17365",
      fetch: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/v1/agent-runs")) {
          return Response.json({
            runs: [
              {
                runId: "active-run-1",
                conversationId: "conversation-1",
                mode: "ai-sdk",
                status: "running",
                modelProvider: "openai",
                modelId: "gpt-5.5",
                prompt: "画圆",
                attachmentCount: 0,
                startedAt: "2026-06-06T00:00:00.000Z",
                tools: []
              },
              {
                runId: "done-run-1",
                conversationId: "conversation-1",
                mode: "ai-sdk",
                status: "succeeded",
                modelProvider: "openai",
                modelId: "gpt-5.5",
                prompt: "已完成",
                attachmentCount: 0,
                startedAt: "2026-06-06T00:00:00.000Z",
                completedAt: "2026-06-06T00:00:03.000Z",
                tools: []
              },
              {
                runId: "active-run-missing-snapshot",
                conversationId: "conversation-1",
                mode: "ai-sdk",
                status: "running",
                modelProvider: "openai",
                modelId: "gpt-5.5",
                prompt: "画椭圆",
                attachmentCount: 0,
                startedAt: "2026-06-06T00:00:01.000Z",
                tools: []
              }
            ]
          });
        }
        if (url.endsWith("/v1/agent-runs/active-run-1/runner")) {
          return Response.json({
            runner: {
              run: {
                runId: "active-run-1",
                conversationId: "conversation-1",
                mode: "ai-sdk",
                status: "running",
                modelProvider: "openai",
                modelId: "gpt-5.5",
                prompt: "画圆",
                attachmentCount: 0,
                startedAt: "2026-06-06T00:00:00.000Z",
                tools: []
              },
              status: "waiting_for_tool",
              phase: "needs_canvas_read",
              modelPolicy: agentModelPolicySnapshotFor({ provider: "openai", model: "gpt-5.5" }),
              budget: {
                maxToolSteps: 16,
                completedToolSteps: 0,
                activeToolRequests: 1,
                remainingToolRequests: 15,
                exhausted: false
              },
              pendingToolRequests: [
                {
                  runId: "active-run-1",
                  toolCallId: "read-1",
                  toolName: "getCanvasContext",
                  args: { includeXml: false },
                  status: "pending",
                  requestedAt: "2026-06-06T00:00:02.000Z",
                  error: null
                }
              ]
            }
          });
        }
        return Response.json({ error: "not_found", message: "missing snapshot" }, { status: 404 });
      }
    });

    await expect(coordinator.activeRunnerSnapshots()).resolves.toMatchObject([
      {
        run: { runId: "active-run-1" },
        status: "waiting_for_tool",
        pendingToolRequests: [{ toolCallId: "read-1" }]
      }
    ]);
    expect(calls).toEqual([
      "http://127.0.0.1:17365/v1/agent-runs",
      "http://127.0.0.1:17365/v1/agent-runs/active-run-1/runner",
      "http://127.0.0.1:17365/v1/agent-runs/active-run-missing-snapshot/runner"
    ]);
  });

  test("filters active runner snapshots with malformed pending remote tool requests", async () => {
    const coordinator = createAgentRunCoordinator({
      backendBaseUrl: "http://127.0.0.1:17365",
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith("/v1/agent-runs")) {
          return Response.json({
            runs: [
              {
                runId: "bad-snapshot-run-1",
                conversationId: "conversation-1",
                mode: "ai-sdk",
                status: "running",
                modelProvider: "openai",
                modelId: "gpt-5.5",
                prompt: "画圆",
                attachmentCount: 0,
                startedAt: "2026-06-06T00:00:00.000Z",
                tools: []
              }
            ]
          });
        }
        return Response.json({
          runner: {
            run: {
              runId: "bad-snapshot-run-1",
              conversationId: "conversation-1",
              mode: "ai-sdk",
              status: "running",
              modelProvider: "openai",
              modelId: "gpt-5.5",
              prompt: "画圆",
              attachmentCount: 0,
              startedAt: "2026-06-06T00:00:00.000Z",
              tools: []
            },
            status: "waiting_for_tool",
            phase: "needs_canvas_read",
            budget: {
              maxToolSteps: 16,
              completedToolSteps: 0,
              activeToolRequests: 1,
              remainingToolRequests: 15,
              exhausted: false
            },
            pendingToolRequests: [
              {
                toolCallId: "read-1",
                toolName: "getCanvasContext",
                status: "pending"
              }
            ]
          }
        });
      }
    });

    await expect(coordinator.activeRunnerSnapshots()).resolves.toEqual([]);
  });

  test("filters malformed coordinator response fields before returning them to callers", async () => {
    const coordinator = createAgentRunCoordinator({
      backendBaseUrl: "http://127.0.0.1:17365",
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith("/v1/agent-runs")) {
          return Response.json({
            runs: [
              {
                runId: "valid-run-1",
                conversationId: "conversation-1",
                mode: "ai-sdk",
                status: "running",
                modelProvider: "openai",
                modelId: "gpt-5.5",
                prompt: "画圆",
                attachmentCount: 0,
                startedAt: "2026-06-06T00:00:00.000Z",
                tools: []
              },
              {
                runId: "invalid-run-1",
                status: "running"
              }
            ]
          });
        }
        if (url.endsWith("/tool-requests/pending")) {
          return Response.json({
            requests: [
              {
                runId: "valid-run-1",
                toolCallId: "valid-request-1",
                toolName: "getCanvasContext",
                args: { includeXml: false },
                status: "running",
                requestedAt: "2026-06-06T00:00:01.000Z",
                claimedAt: "2026-06-06T00:00:02.000Z",
                claimedBy: "renderer-a",
                leaseExpiresAt: "2026-06-06T00:02:02.000Z",
                error: null
              },
              {
                toolCallId: "invalid-request-1",
                toolName: "getCanvasContext",
                status: "running"
              }
            ]
          });
        }
        if (url.endsWith("/tool-requests/valid-request-1/result")) {
          return Response.json({
            run: { runId: "invalid-run-1", status: "running" },
            request: { toolCallId: "invalid-request-1", status: "succeeded" },
            nextRequest: {
              runId: "valid-run-1",
              toolCallId: "valid-next-1",
              toolName: "executeGeoGebraCommands",
              args: { commands: ["A = (0, 0)"] },
              status: "pending",
              requestedAt: "2026-06-06T00:00:02.000Z",
              error: null
            },
            runner: {
              status: "waiting_for_tool",
              phase: "writing",
              pendingToolRequests: []
            },
            text: "继续。"
          });
        }
        if (url.endsWith("/runner")) {
          return Response.json({
            runner: {
              status: "waiting_for_tool",
              phase: "needs_canvas_read",
              pendingToolRequests: []
            }
          });
        }
        return Response.json({});
      }
    });

    await expect(coordinator.list()).resolves.toMatchObject([{ runId: "valid-run-1" }]);
    await expect(coordinator.pendingToolRequests("valid-run-1")).resolves.toMatchObject([{ toolCallId: "valid-request-1" }]);
    await expect(
      coordinator.submitToolResult("valid-run-1", "valid-request-1", {
        tool: {
          toolCallId: "valid-request-1",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          startedAt: "2026-06-06T00:00:03.000Z",
          completedAt: "2026-06-06T00:00:04.000Z"
        }
      })
    ).resolves.toEqual({
      nextRequest: {
        runId: "valid-run-1",
        toolCallId: "valid-next-1",
        toolName: "executeGeoGebraCommands",
        args: { commands: ["A = (0, 0)"] },
        status: "pending",
        requestedAt: "2026-06-06T00:00:02.000Z",
        error: null
      },
      text: "继续。"
    });
    await expect(coordinator.runnerSnapshot("valid-run-1")).resolves.toBeUndefined();
  });

  test("streams remote tool result text deltas before returning the final runner payload", async () => {
    const deltas: string[] = [];
    const calls: string[] = [];
    const coordinator = createAgentRunCoordinator({
      backendBaseUrl: "http://127.0.0.1:17365",
      fetch: async (input) => {
        calls.push(String(input));
        return new Response(
          [
            JSON.stringify({ type: "text-delta", text: "答" }),
            JSON.stringify({ type: "text-delta", text: "案" }),
            JSON.stringify({ type: "done", status: 200, payload: { text: "答案", runner: { status: "succeeded" } } })
          ].join("\n"),
          { headers: { "content-type": "application/x-ndjson; charset=utf-8" } }
        );
      }
    });

    await expect(
      coordinator.submitToolResultStream(
        "valid-run-1",
        "valid-request-1",
        {
          tool: {
            toolCallId: "valid-request-1",
            toolName: "getCanvasContext",
            status: "succeeded",
            args: { includeXml: false },
            startedAt: "2026-06-06T00:00:03.000Z",
            completedAt: "2026-06-06T00:00:04.000Z"
          }
        },
        { onTextDelta: (text) => deltas.push(text) }
      )
    ).resolves.toEqual({ text: "答案" });
    expect(deltas).toEqual(["答", "案"]);
    expect(calls).toEqual(["http://127.0.0.1:17365/v1/agent-runs/valid-run-1/tool-requests/valid-request-1/result?stream=1"]);
  });

  test("throws structured errors for backend rejections", async () => {
    const coordinator = createAgentRunCoordinator({
      backendBaseUrl: "http://127.0.0.1:17365",
      fetch: async () =>
        Response.json(
          {
            error: "workflow_blocked",
            message: "工作流要求先读取画布。"
          },
          { status: 409 }
        )
    });

    await expect(
      coordinator.recordTool("run-1", {
        toolCallId: "tool-1",
        toolName: "executeGeoGebraCommands",
        status: "running",
        args: { commands: ["A=(0,0)"] },
        startedAt: "2026-06-06T00:00:01.000Z"
      })
    ).rejects.toBeInstanceOf(AgentRunCoordinatorError);
  });
});

describe("remote tool bridge", () => {
	  test("creates, claims, and completes remote tool requests", () => {
    const requestInput = {
      toolCallId: "remote-1",
      toolName: "getCanvasContext" as const,
      args: { includeXml: false },
      requestedAt: "2026-06-06T00:00:00.000Z"
    };
    expect(isAgentRunRemoteToolRequestInput(requestInput)).toBe(true);
    expect(isAgentRunRemoteToolRequestInput({ ...requestInput, requestedAt: "not-a-date" })).toBe(false);

    const request = createAgentRunRemoteToolRequest("run-1", requestInput);
    expect(isAgentRunRemoteToolRequest(request)).toBe(true);
    expect(request).toMatchObject({ status: "pending", runId: "run-1" });
    expect(isAgentRunRemoteToolRequest({ ...request, runId: " " })).toBe(false);
    expect(agentRunRemoteToolRequestInvalidReasons({ ...request, runId: " " })).toContain("runId must be a valid agent run id");
    expect(isAgentRunRemoteToolRequest({ ...request, requestedAt: "not-a-date" })).toBe(false);
    expect(agentRunRemoteToolRequestInvalidReasons({ ...request, requestedAt: "not-a-date" })).toEqual(
      expect.arrayContaining([
        "requestedAt must be a valid timestamp",
        "timeline is invalid: claim, lease, or completion precedes the required prior timestamp"
      ])
    );
    expect(isAgentRunRemoteToolRequest({ ...request, claimedAt: "2026-06-06T00:00:01.000Z" })).toBe(false);
    expect(agentRunRemoteToolRequestInvalidReasons({ ...request, claimedAt: "2026-06-06T00:00:01.000Z" })).toContain(
      "lifecycle timestamps do not match request status"
    );
    expect(isAgentRunRemoteToolRequest({ ...request, leaseExpiresAt: "2026-06-06T00:00:02.000Z" })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...request, completedAt: "2026-06-06T00:00:03.000Z" })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...request, result: { ok: true } })).toBe(false);
    expect(agentRunRemoteToolRequestInvalidReasons({ ...request, result: { ok: true } })).toContain("result/error state does not match request status");
    expect(isAgentRunRemoteToolRequest({ ...request, error: "pending should not carry error" })).toBe(false);

    const claimed = claimAgentRunRemoteToolRequest(request, {
      claimedAt: "2026-06-06T00:00:01.000Z",
      claimedBy: "renderer-a",
      leaseMs: 1000
    });
    expect(claimed).toMatchObject({
      status: "running",
      claimedAt: "2026-06-06T00:00:01.000Z",
      claimedBy: "renderer-a",
      leaseExpiresAt: "2026-06-06T00:00:02.000Z",
      attemptCount: 1
    });
    expect(isAgentRunRemoteToolRequest(claimed)).toBe(true);
    expect(isAgentRunRemoteToolRequest({ ...claimed, claimedAt: "not-a-date" })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...claimed, leaseExpiresAt: "not-a-date" })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...claimed, completedAt: "not-a-date" })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...claimed, attemptCount: -1 })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...claimed, attemptCount: 1.5 })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...claimed, attemptCount: Number.NaN })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...claimed, claimedAt: null })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...claimed, leaseExpiresAt: null })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...claimed, completedAt: "2026-06-06T00:00:03.000Z" })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...claimed, result: { ok: true } })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...claimed, error: "running should not carry error" })).toBe(false);
    expect(
      isAgentRunRemoteToolRequest({
        ...claimed,
        claimedAt: "2026-06-05T23:59:59.000Z",
        leaseExpiresAt: "2026-06-06T00:00:02.000Z"
      })
    ).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...claimed, leaseExpiresAt: "2026-06-06T00:00:00.500Z" })).toBe(false);
    expect(isAgentRunRemoteToolRequestClaimable(claimed, "2026-06-06T00:00:01.500Z")).toBe(false);
    expect(
      claimAgentRunRemoteToolRequest(claimed, {
        claimedAt: "2026-06-06T00:00:01.500Z",
        claimedBy: "renderer-b",
        leaseMs: 1000
      })
    ).toBe(claimed);
    expect(isAgentRunRemoteToolRequestLeaseExpired(claimed, "2026-06-06T00:00:02.000Z")).toBe(true);
    expect(isAgentRunRemoteToolRequestLeaseExpired({ ...claimed, leaseExpiresAt: "not-a-date" })).toBe(true);
    expect(isAgentRunRemoteToolRequestClaimable({ ...claimed, leaseExpiresAt: "not-a-date" })).toBe(true);

    const reclaimed = claimAgentRunRemoteToolRequest(claimed, {
      claimedAt: "2026-06-06T00:00:03.000Z",
      claimedBy: "renderer-b",
      leaseMs: 1000
    });
    expect(reclaimed).toMatchObject({
      status: "running",
      claimedBy: "renderer-b",
      attemptCount: 2
    });

    const resultInput = {
      tool: {
        toolCallId: "remote-1",
        toolName: "getCanvasContext" as const,
        status: "succeeded" as const,
        args: { includeXml: false },
        result: { ok: true },
        startedAt: "2026-06-06T00:00:02.000Z",
        completedAt: "2026-06-06T00:00:03.000Z"
      }
    };
    expect(isAgentRunRemoteToolResultInput(resultInput)).toBe(true);
    expect(completeAgentRunRemoteToolRequest(claimed, resultInput.tool)).toMatchObject({
      status: "succeeded",
      result: { ok: true }
    });
    expect(completeAgentRunRemoteToolRequest(request, resultInput.tool)).toBe(request);
    expect(completeAgentRunRemoteToolRequest(claimed, { ...resultInput.tool, toolCallId: "remote-2" })).toBe(claimed);
    expect(completeAgentRunRemoteToolRequest(claimed, { ...resultInput.tool, args: { includeXml: true } })).toBe(claimed);
    const terminalRequest = completeAgentRunRemoteToolRequest(claimed, resultInput.tool);
    expect(
      completeAgentRunRemoteToolRequest(claimed, {
        ...resultInput.tool,
        startedAt: "2026-06-05T23:59:58.000Z",
        completedAt: "2026-06-05T23:59:59.000Z"
      })
    ).toMatchObject({
      completedAt: "2026-06-06T00:00:01.000Z"
    });
    expect(isAgentRunRemoteToolRequest(terminalRequest)).toBe(true);
    expect(isAgentRunRemoteToolRequest({ ...terminalRequest, completedAt: null })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...terminalRequest, claimedAt: null })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...terminalRequest, claimedAt: null, claimedBy: null, leaseExpiresAt: terminalRequest.leaseExpiresAt })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...terminalRequest, claimedAt: null, claimedBy: terminalRequest.claimedBy, leaseExpiresAt: null })).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...terminalRequest, completedAt: "2026-06-05T23:59:59.000Z" })).toBe(false);
    expect(
      isAgentRunRemoteToolRequest({
        ...terminalRequest,
        claimedAt: "2026-06-06T00:00:02.000Z",
        completedAt: "2026-06-06T00:00:01.000Z"
      })
    ).toBe(false);
    expect(isAgentRunRemoteToolRequest({ ...terminalRequest, error: "success should not carry error" })).toBe(false);
    expect(
      claimAgentRunRemoteToolRequest(terminalRequest, {
        claimedAt: "2026-06-06T00:00:04.000Z",
        claimedBy: "renderer-c",
        leaseMs: 1000
      })
    ).toBe(terminalRequest);
    expect(isAgentRunRemoteToolRequestTerminal(terminalRequest)).toBe(true);

    const unclaimedDeadLetter = failAgentRunRemoteToolRequestForAttemptLimit(
      { ...request, attemptCount: DEFAULT_AGENT_RUN_REMOTE_TOOL_MAX_ATTEMPTS },
      { completedAt: "2026-06-06T00:00:03.000Z" }
    );
    expect(unclaimedDeadLetter).toMatchObject({
      status: "failed",
      claimedAt: null,
      claimedBy: null,
      leaseExpiresAt: null,
      completedAt: "2026-06-06T00:00:03.000Z"
    });
    expect(isAgentRunRemoteToolRequest(unclaimedDeadLetter)).toBe(true);

    const cancelledPending = cancelAgentRunRemoteToolRequest(request, {
      completedAt: "2026-06-05T23:59:59.000Z"
    });
    expect(cancelledPending).toMatchObject({
      status: "cancelled",
      claimedAt: null,
      claimedBy: null,
      leaseExpiresAt: null,
      completedAt: "2026-06-06T00:00:00.000Z",
      error: "Agent run closed before remote tool completion."
    });
    expect(isAgentRunRemoteToolRequest(cancelledPending)).toBe(true);
    expect(cancelAgentRunRemoteToolRequest(terminalRequest)).toBe(terminalRequest);

    const cancelledRunning = cancelAgentRunRemoteToolRequest(claimed, {
      completedAt: "2026-06-05T23:59:59.000Z",
      error: "manual stop"
    });
    expect(cancelledRunning).toMatchObject({
      status: "cancelled",
      claimedAt: "2026-06-06T00:00:01.000Z",
      claimedBy: "renderer-a",
      leaseExpiresAt: null,
      completedAt: "2026-06-06T00:00:01.000Z",
      error: "manual stop"
    });
    expect(isAgentRunRemoteToolRequest(cancelledRunning)).toBe(true);
  });

  test("fails claimable remote tool requests instead of retrying forever after max attempts", () => {
    const request = createAgentRunRemoteToolRequest("run-dead-letter-1", {
      toolCallId: "remote-dead-letter-1",
      toolName: "getCanvasContext",
      args: { includeXml: false },
      requestedAt: "2026-06-06T00:00:00.000Z"
    });
    const firstClaim = claimAgentRunRemoteToolRequest(request, {
      claimedAt: "2026-06-06T00:00:01.000Z",
      claimedBy: "renderer-a",
      leaseMs: 1000,
      maxAttempts: 2
    });
    const secondClaim = claimAgentRunRemoteToolRequest(firstClaim, {
      claimedAt: "2026-06-06T00:00:02.000Z",
      claimedBy: "renderer-b",
      leaseMs: 1000,
      maxAttempts: 2
    });
    const deadLettered = claimAgentRunRemoteToolRequest(secondClaim, {
      claimedAt: "2026-06-06T00:00:03.000Z",
      claimedBy: "renderer-c",
      leaseMs: 1000,
      maxAttempts: 2
    });

    expect(isAgentRunRemoteToolRequestAttemptLimitReached(secondClaim, 2)).toBe(true);
    expect(deadLettered).toMatchObject({
      status: "failed",
      attemptCount: 2,
      completedAt: "2026-06-06T00:00:03.000Z",
      leaseExpiresAt: null,
      error: "Remote tool request exceeded 2 claim attempts."
    });
    expect(isAgentRunRemoteToolRequestClaimable(deadLettered, "2026-06-06T00:00:04.000Z")).toBe(false);
    expect(isAgentRunRemoteToolRequestTerminal(deadLettered)).toBe(true);
  });

  test("normalizes invalid remote claim inputs before writing lease state", () => {
    const request = createAgentRunRemoteToolRequest("run-claim-normalize-1", {
      toolCallId: "remote-claim-normalize-1",
      toolName: "getCanvasContext",
      args: { includeXml: false },
      requestedAt: "2026-06-06T00:00:00.000Z"
    });

    const claimed = claimAgentRunRemoteToolRequest(request, {
      claimedAt: "not-a-date",
      claimedBy: "renderer-a",
      leaseMs: -1,
      maxAttempts: -1
    });

    expect(isAgentRunRemoteToolRequestAttemptLimitReached({ attemptCount: 0 }, -1)).toBe(false);
    expect(claimed).toMatchObject({
      status: "running",
      claimedBy: "renderer-a",
      attemptCount: 1
    });
    expect(isAgentRunRemoteToolRequest(claimed)).toBe(true);
    expect(new Date(claimed.leaseExpiresAt ?? "").getTime() - new Date(claimed.claimedAt ?? "").getTime()).toBe(120_000);

    const failed = failAgentRunRemoteToolRequestForAttemptLimit(request, {
      completedAt: "not-a-date",
      maxAttempts: -1
    });
    expect(failed).toMatchObject({
      status: "failed",
      leaseExpiresAt: null,
      error: "Remote tool request exceeded 3 claim attempts."
    });
    expect(isAgentRunRemoteToolRequest(failed)).toBe(true);
  });

	  test("creates stable remote tool execution cache entries for renderer retry recovery", () => {
	    const request = createAgentRunRemoteToolRequest("run-cache-1", {
	      toolCallId: "remote-cache-1",
	      toolName: "getCanvasContext",
	      args: { reason: "读取画布", includeXml: false },
	      requestedAt: "2026-06-06T00:00:00.000Z"
	    });
	    const reorderedRequest = {
	      ...request,
	      args: { includeXml: false, reason: "读取画布" }
	    };
	    const tool = {
	      toolCallId: "remote-cache-1",
	      toolName: "getCanvasContext" as const,
	      status: "succeeded" as const,
	      args: { reason: "读取画布", includeXml: false },
	      result: { ok: true, canvasContext: { objects: [] } },
	      startedAt: "2026-06-06T00:00:01.000Z",
	      completedAt: "2026-06-06T00:00:02.000Z"
	    };
	    const entry = createAgentRunRemoteToolExecutionCacheEntry(request, tool, "2026-06-06T00:00:03.000Z");

	    expect(agentRunRemoteToolExecutionCacheKey(request)).toBe(agentRunRemoteToolExecutionCacheKey(reorderedRequest));
	    expect(isAgentRunRemoteToolExecutionCacheEntry(entry)).toBe(true);
	    expect(isAgentRunRemoteToolExecutionCacheEntry({ ...entry, cacheKey: "" })).toBe(false);
	    expect(isAgentRunRemoteToolExecutionCacheEntry({ ...entry, fingerprint: " " })).toBe(false);
	    expect(isAgentRunRemoteToolExecutionCacheEntry({ ...entry, runId: "" })).toBe(false);
	    expect(isAgentRunRemoteToolExecutionCacheEntry({ ...entry, storedAt: "not-a-date" })).toBe(false);
	    expect(cachedRemoteToolExecutionMatchesRequest(entry, request)).toBe(true);
	    expect(cachedRemoteToolExecutionMatchesRequest(entry, reorderedRequest)).toBe(true);
	    expect(cachedRemoteToolExecutionMatchesRequest(entry, { ...request, args: { includeXml: true } })).toBe(false);
	    expect(cachedRemoteToolExecutionMatchesRequest(entry, { ...request, toolCallId: "remote-cache-2" })).toBe(false);
	    expect(cachedRemoteToolExecutionMatchesRequest({ ...entry, args: { includeXml: true } }, request)).toBe(false);
	    expect(cachedRemoteToolExecutionMatchesRequest({ ...entry, tool: { ...entry.tool, args: { includeXml: true } } }, request)).toBe(false);
	  });

  test("detects active remote tool request id conflicts without blocking identical retries", () => {
    const request = createAgentRunRemoteToolRequest("run-request-conflict-1", {
      toolCallId: "remote-conflict-1",
      toolName: "getCanvasContext",
      args: { reason: "读取画布", includeXml: false },
      requestedAt: "2026-06-06T00:00:00.000Z"
    });

    expect(
      findAgentRunRemoteToolRequestConflict([request], {
        toolCallId: "remote-conflict-1",
        toolName: "getCanvasContext",
        args: { includeXml: false, reason: "读取画布" }
      })
    ).toBeUndefined();
    expect(
      findAgentRunRemoteToolRequestConflict([request], {
        toolCallId: "remote-conflict-1",
        toolName: "getCanvasContext",
        args: { includeXml: true }
      })
    ).toMatchObject({ reason: "args_mismatch" });
    expect(
      findAgentRunRemoteToolRequestConflict([request], {
        toolCallId: "remote-conflict-1",
        toolName: "executeGeoGebraCommands",
        args: { commands: ["A = (0, 0)"] }
      })
    ).toMatchObject({ reason: "tool_name_mismatch" });
    expect(
      findAgentRunRemoteToolRequestConflict([{ ...request, status: "succeeded" }], {
        toolCallId: "remote-conflict-1",
        toolName: "getCanvasContext",
        args: { includeXml: true }
      })
    ).toBeUndefined();
  });

	  test("rejects remote tool requests with unknown tool names", () => {
    expect(
      isAgentRunRemoteToolRequestInput({
        toolCallId: "remote-1",
        toolName: "unknownTool",
        args: {}
      })
    ).toBe(false);
    expect(
      isAgentRunRemoteToolRequestInput({
        toolCallId: " ",
        toolName: "getCanvasContext",
        args: { includeXml: false }
      })
    ).toBe(false);
  });

  test("rejects remote tool requests with invalid args", () => {
    expect(
      isAgentRunRemoteToolRequestInput({
        toolCallId: "remote-1",
        toolName: "executeGeoGebraCommands",
        args: { commands: [] }
      })
    ).toBe(false);
  });
});
