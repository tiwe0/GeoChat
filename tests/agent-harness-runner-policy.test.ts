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
  agentRunRequiresChoiceAnalysis,
  isChoiceAnalysisPrompt,
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

describe("paused backend runner", () => {
  test("validates runner start input and derives waiting status", () => {
    const firstTool = {
      toolCallId: "tool-1",
      toolName: "getCanvasContext" as const,
      args: { includeXml: false }
    };
    const startInput = {
      run: {
        runId: "runner-run-1",
        conversationId: "conversation-1",
        mode: "ai-sdk" as const,
        modelProvider: "openai",
        modelId: "gpt-5.5",
        prompt: "画圆",
        attachmentCount: 0
      },
      firstTool
    };

    expect(isAgentRunRunnerStartInput(startInput)).toBe(true);
    expect(
      agentRunRunnerStatusFor({
        run: { status: "running" },
        pendingToolRequests: [createAgentRunRemoteToolRequest("runner-run-1", firstTool)]
      })
    ).toBe("waiting_for_tool");
  });

  test("derives backend-owned runner budget from model policy and active remote tools", () => {
    const baseRun = createAgentRunLedger({
      runId: "budget-run-1",
      conversationId: "conversation-1",
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
    const activeRequest = createAgentRunRemoteToolRequest("budget-run-1", {
      toolCallId: "read-1",
      toolName: "getCanvasContext",
      args: { includeXml: false }
    });

    expect(agentRunRunnerBudgetFor({ run: baseRun, pendingToolRequests: [activeRequest] })).toEqual({
      maxToolSteps: 16,
      completedToolSteps: 0,
      activeToolRequests: 1,
      remainingToolRequests: 15,
      exhausted: false
    });
    expect(agentRunRunnerModelPolicyFor({ run: baseRun })).toMatchObject({
      provider: "openai",
      model: "gpt-5.5",
      label: "GPT-5.5",
      supportsImages: true,
      supportsTools: true,
      toolCallingMode: "native",
      maxToolSteps: 16,
      defaultTemperature: 0.2,
      isKnownModel: true,
      isCustomModel: false
    });

    const overriddenRun = createAgentRunLedger({
      runId: "budget-run-overridden",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: "",
        maxToolSteps: 5
      },
      prompt: "画一个圆",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    expect(agentRunRunnerBudgetFor({ run: overriddenRun })).toMatchObject({
      maxToolSteps: 5,
      remainingToolRequests: 5,
      exhausted: false
    });
    expect(agentRunRunnerModelPolicyFor({ run: overriddenRun })).toMatchObject({
      maxToolSteps: 5
    });

    const exhaustedRun = Array.from({ length: 16 }).reduce(
      (run, _, index) =>
        upsertAgentRunTool(run, {
          toolCallId: `tool-${index}`,
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          startedAt: new Date(Date.UTC(2026, 5, 6, 0, 0, index)).toISOString()
        }),
      baseRun
    );
    expect(agentRunRunnerBudgetFor({ run: exhaustedRun })).toMatchObject({
      remainingToolRequests: 0,
      exhausted: true
    });
  });

  test("detects option-labelled choice prompts without confusing point labels", () => {
    expect(
      isChoiceAnalysisPrompt(
        [
          "这是选择题，请判断下列选项。",
          "A. AM = MB",
          "B. M 在 AC 上",
          "C. CM 是中线",
          "D. CM 垂直 AB"
        ].join("\n")
      )
    ).toBe(true);
    expect(isChoiceAnalysisPrompt("已知 A(0,0), B(4,0), C(1,3)，画出三角形 ABC。")).toBe(false);
    expect(isChoiceAnalysisPrompt("A. AM = MB\nB. M 在 AC 上")).toBe(false);
  });

  test("requires showChoiceAnalysis once for choice prompts", () => {
    const choicePrompt = [
      "这是选择题，请判断下列选项。",
      "A. AM = MB",
      "B. M 在 AC 上"
    ].join("\n");
    expect(agentRunRequiresChoiceAnalysis({ prompt: choicePrompt, tools: [] })).toBe(true);
    expect(
      agentRunRequiresChoiceAnalysis({
        prompt: choicePrompt,
        tools: [
          {
            toolCallId: "choice-card-1",
            toolName: "showChoiceAnalysis",
            status: "succeeded",
            args: {
              title: "判断选项",
              summary: "公共题干",
              choices: [
                { label: "A", statement: "AM = MB", verdict: "true", explanation: "M 是中点。" },
                { label: "B", statement: "M 在 AC 上", verdict: "false", explanation: "M 在 AB 上。" }
              ]
            },
            startedAt: "2026-06-06T00:00:00.000Z",
            completedAt: "2026-06-06T00:00:01.000Z"
          }
        ]
      })
    ).toBe(false);
  });

  test("rejects runner snapshots whose derived orchestration fields drift", () => {
    const run = createAgentRunLedger({
      runId: "snapshot-drift-run-1",
      conversationId: "conversation-1",
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
    const pendingRequest = createAgentRunRemoteToolRequest("snapshot-drift-run-1", {
      toolCallId: "snapshot-read-1",
      toolName: "getCanvasContext",
      args: { includeXml: false },
      requestedAt: "2026-06-06T00:00:01.000Z"
    });
    const snapshot = {
      run,
      status: "waiting_for_tool" as const,
      phase: "needs_canvas_read" as const,
      modelPolicy: agentRunRunnerModelPolicyFor({ run }),
      budget: agentRunRunnerBudgetFor({ run, pendingToolRequests: [pendingRequest] }),
      pendingToolRequests: [pendingRequest]
    };

    expect(isAgentRunRunnerSnapshot(snapshot)).toBe(true);
    expect(isAgentRunRunnerSnapshot({ ...snapshot, status: "running" })).toBe(false);
    expect(isAgentRunRunnerSnapshot({ ...snapshot, phase: "planning" })).toBe(false);
    expect(
      isAgentRunRunnerSnapshot({
        ...snapshot,
        budget: { ...snapshot.budget, remainingToolRequests: snapshot.budget.remainingToolRequests + 1 }
      })
    ).toBe(false);
    expect(
      isAgentRunRunnerSnapshot({
        ...snapshot,
        budget: { ...snapshot.budget, exhausted: true }
      })
    ).toBe(false);
    expect(
      isAgentRunRunnerSnapshot({
        ...snapshot,
        modelPolicy: agentModelPolicySnapshotFor({ provider: "deepseek", model: "deepseek-v4-flash" })
      })
    ).toBe(false);
  });

  test("rejects runner snapshots with child records from another run", () => {
    const run = createAgentRunLedger({
      runId: "snapshot-owner-run-1",
      conversationId: "conversation-1",
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
    const baseSnapshot = {
      run,
      status: "running" as const,
      phase: "needs_canvas_read" as const,
      modelPolicy: agentRunRunnerModelPolicyFor({ run }),
      budget: agentRunRunnerBudgetFor({ run }),
      pendingToolRequests: []
    };
    const pendingRequest = createAgentRunRemoteToolRequest("snapshot-owner-run-1", {
      toolCallId: "snapshot-owner-read",
      toolName: "getCanvasContext",
      args: { includeXml: false },
      requestedAt: "2026-06-06T00:00:01.000Z"
    });
    const waitingSnapshot = {
      ...baseSnapshot,
      status: "waiting_for_tool" as const,
      budget: agentRunRunnerBudgetFor({ run, pendingToolRequests: [pendingRequest] }),
      pendingToolRequests: [pendingRequest]
    };
    const policyDecision = {
      decisionId: "snapshot-owner-decision",
      runId: "snapshot-owner-run-1",
      stage: "runner_start" as const,
      kind: "runner_start_enqueued" as const,
      allowed: true,
      toolCallId: "snapshot-owner-read",
      toolName: "getCanvasContext" as const,
      createdAt: "2026-06-06T00:00:01.000Z"
    };
    const modelStep = {
      stepId: "snapshot-owner-step",
      runId: "snapshot-owner-run-1",
      stage: "runner_continuation" as const,
      source: "model" as const,
      status: "succeeded" as const,
      modelProvider: "openai",
      modelId: "gpt-5.5",
      startedAt: "2026-06-06T00:00:02.000Z",
      completedAt: "2026-06-06T00:00:03.000Z",
      inputToolCount: 1,
      attachmentCount: 0,
      outputType: "finish" as const,
      outputTextLength: 12,
      usage: null,
      error: null
    };

    expect(isAgentRunRunnerSnapshot({ ...baseSnapshot, policyDecisions: [policyDecision], modelSteps: [modelStep] })).toBe(true);
    expect(
      isAgentRunRunnerSnapshot({
        ...waitingSnapshot,
        pendingToolRequests: [{ ...pendingRequest, runId: "snapshot-other-run" }]
      })
    ).toBe(false);
    expect(
      isAgentRunRunnerSnapshot({
        ...baseSnapshot,
        policyDecisions: [{ ...policyDecision, runId: "snapshot-other-run" }]
      })
    ).toBe(false);
    expect(
      isAgentRunRunnerSnapshot({
        ...baseSnapshot,
        modelSteps: [{ ...modelStep, runId: "snapshot-other-run" }]
      })
    ).toBe(false);
    expect(
      isAgentRunRunnerSnapshot({
        ...baseSnapshot,
        modelSteps: [{ ...modelStep, modelProvider: "deepseek", modelId: "deepseek-v4-flash" }]
      })
    ).toBe(false);
  });

  test("rejects runner snapshots with duplicate child record identifiers", () => {
    const run = createAgentRunLedger({
      runId: "snapshot-unique-run-1",
      conversationId: "conversation-1",
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
    const baseSnapshot = {
      run,
      status: "running" as const,
      phase: "needs_canvas_read" as const,
      modelPolicy: agentRunRunnerModelPolicyFor({ run }),
      budget: agentRunRunnerBudgetFor({ run }),
      pendingToolRequests: []
    };
    const pendingRequest = createAgentRunRemoteToolRequest("snapshot-unique-run-1", {
      toolCallId: "snapshot-duplicate-read",
      toolName: "getCanvasContext",
      args: { includeXml: false },
      requestedAt: "2026-06-06T00:00:01.000Z"
    });
    const duplicatePendingRequests = [
      pendingRequest,
      { ...pendingRequest, requestedAt: "2026-06-06T00:00:02.000Z" }
    ];
    const policyDecision = {
      decisionId: "snapshot-duplicate-decision",
      runId: "snapshot-unique-run-1",
      stage: "runner_start" as const,
      kind: "runner_start_enqueued" as const,
      allowed: true,
      toolCallId: "snapshot-duplicate-read",
      toolName: "getCanvasContext" as const,
      createdAt: "2026-06-06T00:00:01.000Z"
    };
    const modelStep = {
      stepId: "snapshot-duplicate-step",
      runId: "snapshot-unique-run-1",
      stage: "runner_continuation" as const,
      source: "model" as const,
      status: "succeeded" as const,
      modelProvider: "openai",
      modelId: "gpt-5.5",
      startedAt: "2026-06-06T00:00:02.000Z",
      completedAt: "2026-06-06T00:00:03.000Z",
      inputToolCount: 1,
      attachmentCount: 0,
      outputType: "finish" as const,
      outputTextLength: 12,
      usage: null,
      error: null
    };

    expect(
      isAgentRunRunnerSnapshot({
        ...baseSnapshot,
        status: "waiting_for_tool",
        budget: agentRunRunnerBudgetFor({ run, pendingToolRequests: duplicatePendingRequests }),
        pendingToolRequests: duplicatePendingRequests
      })
    ).toBe(false);
    expect(
      isAgentRunRunnerSnapshot({
        ...baseSnapshot,
        policyDecisions: [policyDecision, { ...policyDecision, createdAt: "2026-06-06T00:00:02.000Z" }]
      })
    ).toBe(false);
    expect(
      isAgentRunRunnerSnapshot({
        ...baseSnapshot,
        modelSteps: [modelStep, { ...modelStep, completedAt: "2026-06-06T00:00:04.000Z" }]
      })
    ).toBe(false);
  });

  test("rejects runner snapshots with out-of-order child records", () => {
    const run = createAgentRunLedger({
      runId: "snapshot-order-run-1",
      conversationId: "conversation-1",
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
    const baseSnapshot = {
      run,
      status: "running" as const,
      phase: "needs_canvas_read" as const,
      modelPolicy: agentRunRunnerModelPolicyFor({ run }),
      budget: agentRunRunnerBudgetFor({ run }),
      pendingToolRequests: []
    };
    const latePendingRequest = createAgentRunRemoteToolRequest("snapshot-order-run-1", {
      toolCallId: "snapshot-order-read-late",
      toolName: "getCanvasContext",
      args: { includeXml: false },
      requestedAt: "2026-06-06T00:00:03.000Z"
    });
    const earlyPendingRequest = createAgentRunRemoteToolRequest("snapshot-order-run-1", {
      toolCallId: "snapshot-order-read-early",
      toolName: "getCanvasContext",
      args: { includeXml: false },
      requestedAt: "2026-06-06T00:00:01.000Z"
    });
    const lateDecision = {
      decisionId: "snapshot-order-decision-late",
      runId: "snapshot-order-run-1",
      stage: "runner_start" as const,
      kind: "runner_start_enqueued" as const,
      allowed: true,
      toolCallId: "snapshot-order-read-late",
      toolName: "getCanvasContext" as const,
      createdAt: "2026-06-06T00:00:03.000Z"
    };
    const earlyDecision = {
      ...lateDecision,
      decisionId: "snapshot-order-decision-early",
      toolCallId: "snapshot-order-read-early",
      createdAt: "2026-06-06T00:00:01.000Z"
    };
    const lateStep = {
      stepId: "snapshot-order-step-late",
      runId: "snapshot-order-run-1",
      stage: "runner_continuation" as const,
      source: "model" as const,
      status: "succeeded" as const,
      modelProvider: "openai",
      modelId: "gpt-5.5",
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z",
      inputToolCount: 1,
      attachmentCount: 0,
      outputType: "finish" as const,
      outputTextLength: 12,
      usage: null,
      error: null
    };
    const earlyStep = {
      ...lateStep,
      stepId: "snapshot-order-step-early",
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    };
    const outOfOrderPendingRequests = [latePendingRequest, earlyPendingRequest];

    expect(
      isAgentRunRunnerSnapshot({
        ...baseSnapshot,
        status: "waiting_for_tool",
        budget: agentRunRunnerBudgetFor({ run, pendingToolRequests: outOfOrderPendingRequests }),
        pendingToolRequests: outOfOrderPendingRequests
      })
    ).toBe(false);
    expect(
      isAgentRunRunnerSnapshot({
        ...baseSnapshot,
        policyDecisions: [lateDecision, earlyDecision]
      })
    ).toBe(false);
    expect(
      isAgentRunRunnerSnapshot({
        ...baseSnapshot,
        modelSteps: [lateStep, earlyStep]
      })
    ).toBe(false);
  });

  test("rejects runner snapshots with terminal pending tool requests", () => {
    const run = createAgentRunLedger({
      runId: "snapshot-active-run-1",
      conversationId: "conversation-1",
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
    const terminalRequest = {
      ...createAgentRunRemoteToolRequest("snapshot-active-run-1", {
        toolCallId: "snapshot-terminal-read",
        toolName: "getCanvasContext",
        args: { includeXml: false },
        requestedAt: "2026-06-06T00:00:01.000Z"
      }),
      status: "succeeded" as const,
      completedAt: "2026-06-06T00:00:02.000Z",
      result: { objects: [] }
    };
    const requests = [terminalRequest];

    expect(
      isAgentRunRunnerSnapshot({
        run,
        status: agentRunRunnerStatusFor({ run, pendingToolRequests: requests }),
        phase: agentRunRunnerPhaseFor({ run, pendingToolRequests: requests }),
        modelPolicy: agentRunRunnerModelPolicyFor({ run }),
        budget: agentRunRunnerBudgetFor({ run, pendingToolRequests: requests }),
        pendingToolRequests: requests
      })
    ).toBe(false);
  });

  test("rejects runner snapshots with active requests after terminal runs", () => {
    const run = finishAgentRunLedger(
      createAgentRunLedger({
        runId: "snapshot-terminal-run-with-active-request",
        conversationId: "conversation-1",
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
      }),
      {
        status: "failed",
        error: "failed",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );
    const requests = [
      createAgentRunRemoteToolRequest("snapshot-terminal-run-with-active-request", {
        toolCallId: "active-after-terminal",
        toolName: "getCanvasContext",
        args: { includeXml: false },
        requestedAt: "2026-06-06T00:00:01.000Z"
      })
    ];

    expect(
      isAgentRunRunnerSnapshot({
        run,
        status: agentRunRunnerStatusFor({ run, pendingToolRequests: requests }),
        phase: agentRunRunnerPhaseFor({ run, pendingToolRequests: requests }),
        modelPolicy: agentRunRunnerModelPolicyFor({ run }),
        budget: agentRunRunnerBudgetFor({ run, pendingToolRequests: requests }),
        pendingToolRequests: requests
      })
    ).toBe(false);
  });

  test("rejects runner snapshots with active requests that reuse ledger tool ids", () => {
    const run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "snapshot-duplicate-request-run",
        conversationId: "conversation-1",
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
      }),
      {
        toolCallId: "read-1",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        result: { objects: [] },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );
    const requests = [
      createAgentRunRemoteToolRequest("snapshot-duplicate-request-run", {
        toolCallId: "read-1",
        toolName: "getCanvasContext",
        args: { includeXml: false },
        requestedAt: "2026-06-06T00:00:03.000Z"
      })
    ];

    expect(
      isAgentRunRunnerSnapshot({
        run,
        status: agentRunRunnerStatusFor({ run, pendingToolRequests: requests }),
        phase: agentRunRunnerPhaseFor({ run, pendingToolRequests: requests }),
        modelPolicy: agentRunRunnerModelPolicyFor({ run }),
        budget: agentRunRunnerBudgetFor({ run, pendingToolRequests: requests }),
        pendingToolRequests: requests
      })
    ).toBe(false);
  });

  test("decides runner start outcomes in a pure state transition", () => {
    const baseRun = createAgentRunLedger({
      runId: "start-decision-run",
      conversationId: "conversation-1",
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

    expect(
      decideAgentRunRunnerStart({
        run: baseRun,
        firstRequest: {
          toolCallId: "read-first",
          toolName: "getCanvasContext",
          args: { includeXml: false }
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      firstRequest: {
        toolCallId: "read-first"
      }
    });

    expect(
      decideAgentRunRunnerStart({
        run: baseRun,
        firstRequest: {
          toolCallId: "write-first",
          toolName: "executeGeoGebraCommands",
          args: { commands: ["A = (0, 0)"] }
        }
      })
    ).toMatchObject({
      type: "workflow_blocked",
      run: {
        status: "running"
      }
    });

    expect(
      decideAgentRunRunnerStart({
        run: baseRun,
        firstRequest: {
          toolCallId: "bad-first-tool",
          toolName: "notARealTool",
          args: {}
        } as never
      })
    ).toMatchObject({
      type: "workflow_blocked",
      message: "Agent runner first tool must be a valid remote tool request input.",
      run: {
        status: "running"
      }
    });

    expect(
      decideAgentRunRunnerStart({
        run: baseRun,
        firstRequest: {
          toolCallId: "bad-first-args",
          toolName: "getCanvasContext",
          args: { includeXml: "yes" }
        } as never
      })
    ).toMatchObject({
      type: "workflow_blocked",
      message: "Agent runner first tool must be a valid remote tool request input.",
      run: {
        status: "running"
      }
    });

    const unsupportedRun = createAgentRunLedger({
      runId: "start-decision-budget-run",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "unknown-provider",
        model: "missing-model",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "画一个圆",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    expect(
      decideAgentRunRunnerStart({
        run: unsupportedRun,
        firstRequest: {
          toolCallId: "read-without-budget",
          toolName: "getCanvasContext",
          args: { includeXml: false }
        }
      })
    ).toMatchObject({
      type: "budget_exhausted",
      run: {
        status: "running"
      },
      budget: {
        maxToolSteps: 0,
        exhausted: true
      }
    });
  });

  test("decides runner continuation outcomes in a pure state transition", () => {
    const baseRun = createAgentRunLedger({
      runId: "continuation-decision-run",
      conversationId: "conversation-1",
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
    const readRun = upsertAgentRunTool(baseRun, {
      toolCallId: "read-1",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    });
    const writeRun = upsertAgentRunTool(readRun, {
      toolCallId: "write-1",
      toolName: "executeGeoGebraCommands",
      status: "succeeded",
      args: { commands: ["A = (0, 0)"] },
      result: { ok: true },
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });
    const completionWriteRun = upsertAgentRunTool(readRun, {
      toolCallId: "write-complete",
      toolName: "executeGeoGebraCommands",
      status: "succeeded",
      args: {
        commands: ["A = (0, 0)", "B = (1, 0)", "Sphere(A, B)"],
        intendedOutcome: "已作出目标构型。",
        nextExpectedAction: "验证画布确认目标已成功构造。"
      },
      result: { ok: true },
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });
    const verifiedCompletionRun = upsertAgentRunTool(completionWriteRun, {
      toolCallId: "verify-complete",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, objects: [{ label: "A" }, { label: "B" }] },
      startedAt: "2026-06-06T00:00:05.000Z",
      completedAt: "2026-06-06T00:00:06.000Z"
    });
    const timedOutWriteRun = upsertAgentRunTool(readRun, {
      toolCallId: "write-timeout",
      toolName: "executeGeoGebraCommands",
      status: "failed",
      args: { commands: ["f(x) = sin(x)"] },
      result: {
        ok: false,
        error: "构造画布 timed out (30000ms).",
        clientMeta: { source: "tool-policy", reason: "timeout", timeoutMs: 30000 }
      },
      error: "构造画布 timed out (30000ms).",
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:34.000Z"
    });
    const unknownCommandWriteRun = upsertAgentRunTool(readRun, {
      toolCallId: "write-unknown-command",
      toolName: "executeGeoGebraCommands",
      status: "failed",
      args: { commands: ["pts = Sequence((i, i), i, 1, 3)"] },
      result: {
        ok: false,
        error: "未知的指令: pts",
        clientMeta: { source: "tool-policy", timeoutMs: 30000 }
      },
      error: "未知的指令: pts",
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:05.000Z"
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: readRun,
        action: {
          type: "tool",
          tool: {
            toolCallId: "read-1",
            toolName: "getCanvasContext",
            args: { includeXml: false }
          }
        }
      })
    ).toMatchObject({
      type: "workflow_blocked",
      run: {
        status: "failed",
        error: "Tool call id read-1 already exists in the run ledger."
      }
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: readRun,
        action: {
          type: "tool",
          tool: {
            toolCallId: "read-1",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["B = (1, 0)"] }
          }
        }
      })
    ).toMatchObject({
      type: "workflow_blocked",
      run: {
        status: "failed",
        error: "Tool call id read-1 already belongs to getCanvasContext, not executeGeoGebraCommands."
      }
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: readRun,
        pendingToolRequests: [
          createAgentRunRemoteToolRequest("continuation-decision-run", {
            toolCallId: "pending-verify",
            toolName: "getCanvasContext",
            args: { includeXml: false }
          })
        ],
        action: {
          type: "tool",
          tool: {
            toolCallId: "pending-verify",
            toolName: "getCanvasContext",
            args: { includeXml: true }
          }
        }
      })
    ).toMatchObject({
      type: "workflow_blocked",
      run: {
        status: "failed",
        error: "Remote tool request id pending-verify is already pending with a different getCanvasContext argument payload."
      }
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: readRun,
        action: {
          type: "tool",
          tool: {
            toolCallId: "bad-tool-action",
            toolName: "notARealTool",
            args: {}
          }
        } as never
      })
    ).toMatchObject({
      type: "workflow_blocked",
      message: "Agent runner tool action must be a valid remote tool request input.",
      run: {
        status: "failed",
        error: "Agent runner tool action must be a valid remote tool request input."
      }
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: readRun,
        action: {
          type: "tool",
          tool: {
            toolCallId: "bad-tool-args",
            toolName: "getCanvasContext",
            args: { includeXml: "yes" }
          }
        } as never
      })
    ).toMatchObject({
      type: "workflow_blocked",
      message: "Agent runner tool action must be a valid remote tool request input.",
      run: {
        status: "failed",
        error: "Agent runner tool action must be a valid remote tool request input."
      }
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: writeRun,
        action: {
          type: "tool",
          tool: {
            toolCallId: "explain-before-verify",
            toolName: "showSolutionSteps",
            args: { title: "步骤", answer: "完成", steps: [{ label: "构造", body: "作点 A" }] }
          }
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "post-write-canvas-verify-1",
        toolName: "getCanvasContext",
        args: {
          includeXml: false,
          nextExpectedAction: "continue_after_canvas_verification"
        }
      },
      run: {
        status: "running",
        error: null
      }
    });

    const verifyDecision = decideAgentRunRunnerContinuation({
      run: writeRun,
      action: {
        type: "tool",
        tool: {
          toolCallId: "verify-1",
          toolName: "getCanvasContext",
          args: { includeXml: false }
        }
      }
    });
    expect(verifyDecision).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "verify-1"
      }
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: verifiedCompletionRun,
        action: {
          type: "tool",
          tool: {
            toolCallId: "invalid-after-completion",
            toolName: "getCanvasContext",
            args: { includeXml: "yes" }
          }
        } as never
      })
    ).toMatchObject({
      type: "finish",
      text: "画布已验证，已作出目标构型。",
      run: {
        status: "succeeded",
        error: null
      }
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: timedOutWriteRun,
        action: {
          type: "tool",
          tool: {
            toolCallId: "retry-after-timeout",
            toolName: "getCanvasContext",
            args: { includeXml: false }
          }
        }
      })
    ).toMatchObject({
      type: "workflow_blocked",
      message: "画布构造遇到终止性的渲染超时或 GeoGebra 未就绪错误，runner 已停止本轮编排，避免无限重试。",
      run: {
        status: "failed",
        error: "画布构造遇到终止性的渲染超时或 GeoGebra 未就绪错误，runner 已停止本轮编排，避免无限重试。"
      }
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: unknownCommandWriteRun,
        action: {
          type: "tool",
          tool: {
            toolCallId: "retry-after-unknown-command",
            toolName: "getCanvasContext",
            args: { includeXml: false }
          }
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "retry-after-unknown-command",
        toolName: "getCanvasContext"
      },
      run: {
        status: "running",
        error: null
      }
    });

    const exhaustedRun = Array.from({ length: 16 }).reduce(
      (run, _, index) =>
        upsertAgentRunTool(run, {
          toolCallId: `budget-tool-${index}`,
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          startedAt: new Date(Date.UTC(2026, 5, 6, 0, 0, 10 + index)).toISOString()
        }),
      baseRun
    );
    expect(
      decideAgentRunRunnerContinuation({
        run: exhaustedRun,
        action: {
          type: "tool",
          tool: {
            toolCallId: "over-budget",
            toolName: "getCanvasContext",
            args: { includeXml: false }
          }
        }
      })
    ).toMatchObject({
      type: "budget_exhausted",
      run: {
        status: "failed"
      }
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: readRun,
        action: {
          type: "finish",
          text: "   "
        }
      })
    ).toMatchObject({
      type: "workflow_blocked",
      message: "Agent runner finish action must include non-empty text.",
      run: {
        status: "failed",
        usage: null,
        error: "Agent runner finish action must include non-empty text."
      }
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: readRun,
        action: {
          type: "finish",
          text: "已经完成。",
          usage: { inputTokens: 8, outputTokens: 8, totalTokens: 10 }
        }
      })
    ).toMatchObject({
      type: "workflow_blocked",
      message: "Agent runner finish action included invalid token usage.",
      run: {
        status: "failed",
        usage: null,
        error: "Agent runner finish action included invalid token usage."
      }
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: readRun,
        action: {
          type: "finish",
          text: "已经完成。",
          usage: { totalTokens: 12 }
        }
      })
    ).toMatchObject({
      type: "finish",
      text: "已经完成。",
      run: {
        status: "succeeded",
        usage: { totalTokens: 12 }
      }
    });
  });

  test("derives structured runner phases from pending tools and ledger history", () => {
    const baseRun = createAgentRunLedger({
      runId: "phase-run-1",
      conversationId: "conversation-1",
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
    expect(
      agentRunRunnerPhaseFor({
        run: baseRun,
        pendingToolRequests: [
          createAgentRunRemoteToolRequest("phase-run-1", {
            toolCallId: "read-1",
            toolName: "getCanvasContext",
            args: { includeXml: false }
          })
        ]
      })
    ).toBe("needs_canvas_read");

    const afterRead = upsertAgentRunTool(baseRun, {
      toolCallId: "read-1",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    });
    expect(
      agentRunRunnerPhaseFor({
        run: afterRead,
        pendingToolRequests: [
          createAgentRunRemoteToolRequest("phase-run-1", {
            toolCallId: "write-1",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["O = (0, 0)"] }
          })
        ]
      })
    ).toBe("writing");

    const afterWrite = upsertAgentRunTool(afterRead, {
      toolCallId: "write-1",
      toolName: "executeGeoGebraCommands",
      status: "succeeded",
      args: { commands: ["O = (0, 0)"] },
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });
    expect(agentRunRunnerPhaseFor({ run: afterWrite })).toBe("verifying");
    expect(
      agentRunRunnerPhaseFor({
        run: afterWrite,
        pendingToolRequests: [
          createAgentRunRemoteToolRequest("phase-run-1", {
            toolCallId: "explain-1",
            toolName: "showSolutionSteps",
            args: { title: "完成", answer: "已完成", steps: [{ label: "构造", body: "完成" }] }
          })
        ]
      })
    ).toBe("explaining");

    const failedWrite = upsertAgentRunTool(afterRead, {
      toolCallId: "bad-write-1",
      toolName: "executeGeoGebraCommands",
      status: "failed",
      args: { commands: ["BadCommand()"] },
      error: "Unknown command",
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });
    expect(agentRunRunnerPhaseFor({ run: failedWrite })).toBe("repairing");
  });

  test("classifies model-written execute commands before geometry planning as raw command fallback", () => {
    let run = createAgentRunLedger({
      runId: "runner-raw-fallback",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "画一条直线",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "read-1",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    });

    expect(
      isAgentRunRawGeoGebraCommandFallback({
        run,
        request: {
          toolCallId: "execute-raw",
          toolName: "executeGeoGebraCommands",
          args: { commands: ["A = (0, 0)"] }
        }
      })
    ).toBe(true);

    const plan = createGeometryPlanFromRecipe("function.parabola.vertex", {
      expression: "x^2"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "plan-1",
      toolName: "createGeometryPlan",
      status: "succeeded",
      args: { recipeId: "function.parabola.vertex", inputs: { expression: "x^2" } },
      result: { ok: true, result: { plan } },
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });
    expect(
      isAgentRunRawGeoGebraCommandFallback({
        run,
        request: {
          toolCallId: "execute-from-plan",
          toolName: "executeGeoGebraCommands",
          args: compileGeometryPlanToExecuteArgs(plan)
        }
      })
    ).toBe(false);

    const repairRun = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-repair-not-raw",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "修复构造",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      }),
      {
        toolCallId: "failed-execute",
        toolName: "executeGeoGebraCommands",
        status: "failed",
        args: { commands: ["BadCommand"] },
        error: "Unknown command",
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );
    expect(
      isAgentRunRawGeoGebraCommandFallback({
        run: repairRun,
        request: {
          toolCallId: "repair-execute",
          toolName: "executeGeoGebraCommands",
          args: { commands: ["A = (0, 0)"] }
        }
      })
    ).toBe(false);
  });

  test("auto-enqueues geometry plans for raw GeoGebra commands that match deterministic recipes", () => {
    const run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-recipe-requires-plan",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "帮我一步一步构造一个椭圆。",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      }),
      {
        toolCallId: "read-before-ellipse",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );
    const rawExecuteRequest = {
      toolCallId: "raw-ellipse",
      toolName: "executeGeoGebraCommands" as const,
      args: { commands: ["F = (-2, 0)", "G = (2, 0)", "A = (0, 3)", "c = Ellipse(F, G, A)"] }
    };

    expect(
      requiredGeometryPlanRecipeIdsBeforeRawCommands({
        run,
        request: rawExecuteRequest
      })
    ).toEqual(["conic.ellipse.foci-point"]);
    expect(isAgentRunRawGeoGebraCommandFallback({ run, request: rawExecuteRequest })).toBe(false);
    expect(
      decideAgentRunRunnerContinuation({
        run,
        action: {
          type: "tool",
          tool: rawExecuteRequest
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "auto-geometry-plan-2",
        toolName: "createGeometryPlan",
        args: {
          recipeId: "conic.ellipse.foci-point",
          sourceText: "帮我一步一步构造一个椭圆。"
        }
      }
    });
  });

  test("auto-enqueues resetCanvas instead of allowing Delete commands to clear stale canvases", () => {
    const run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-delete-clearing-requires-reset",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "画出函数 y = ln(x)，标出点 (1,0)，并说明定义域。",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      }),
      {
        toolCallId: "read-before-function",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );

    expect(
      decideAgentRunRunnerContinuation({
        run,
        action: {
          type: "tool",
          tool: {
            toolCallId: "delete-stale-objects",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["f(x)=ln(x)", "Delete(f)", "Delete(A)"], perspective: "G" }
          }
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "auto-reset-canvas-2",
        toolName: "resetCanvas",
        args: {
          perspective: "G",
          nextExpectedAction: "executeGeoGebraCommands"
        }
      }
    });
  });

  test("auto-searches GeoGebra 5 command references before executing unknown commands", () => {
    const run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-unknown-geogebra5-command",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "构造三角形 ABC，并标出一个不存在命令的外接球。",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      }),
      {
        toolCallId: "read-before-unknown-command",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );

    expect(
      decideAgentRunRunnerContinuation({
        run,
        action: {
          type: "tool",
          tool: {
            toolCallId: "execute-unknown-command",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["MagicCircumsphere(A, B, C, D)"] }
          }
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "auto-geogebra5-command-search-2",
        toolName: "searchGeoGebraCommands",
        args: {
          query: expect.stringContaining("MagicCircumsphere"),
          scope: "global",
          reason: expect.stringContaining("GeoGebra 5"),
          nextExpectedAction: "executeGeoGebraCommands"
        }
      }
    });
  });

  test("auto-searches same-name GeoGebra 5 docs for incompatible Sphere arity", () => {
    let run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-geogebra5-sphere-arity",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "作一个三棱锥，并作出这三棱锥的外界球。",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      }),
      {
        toolCallId: "read-before-sphere",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );
    run = upsertAgentRunTool(run, {
      toolCallId: "search-before-sphere",
      toolName: "searchGeoGebraCommands",
      status: "succeeded",
      args: { query: "Pyramid GeoGebra command syntax", scope: "geometry-3d" },
      result: { ok: true, result: { entries: [] } },
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });

    expect(
      decideAgentRunRunnerContinuation({
        run,
        action: {
          type: "tool",
          tool: {
            toolCallId: "execute-bad-sphere",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["A = (0,0,0)", "B = (1,0,0)", "C = (0,1,0)", "D = (0,0,1)", "Sphere(A, B, C, D)"] }
          }
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "auto-geogebra5-command-search-3",
        toolName: "searchGeoGebraCommands",
        args: {
          query: "Sphere GeoGebra 5 command syntax",
          scope: "geometry-3d",
          reason: expect.stringContaining("Sphere"),
          nextExpectedAction: "executeGeoGebraCommands"
        }
      }
    });
  });

  test("rewrites auxiliary Delete cleanup to hide commands by default", () => {
    const run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-hide-auxiliary-delete",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "移除辅助圆和辅助线，保留主要构造。",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      }),
      {
        toolCallId: "read-before-hide-auxiliary",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );

    expect(
      decideAgentRunRunnerContinuation({
        run,
        action: {
          type: "tool",
          tool: {
            toolCallId: "execute-delete-auxiliary",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["Delete(auxCircle)", "Delete(auxLine)"] }
          }
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "auto-hide-auxiliary-2",
        toolName: "executeGeoGebraCommands",
        args: {
          commands: [
            "SetConditionToShowObject(auxCircle, false)",
            "SetConditionToShowObject(auxLine, false)"
          ],
          reason: expect.stringContaining("辅助")
        }
      }
    });
  });

  test("auto-searches command references when a model skips syntax lookup after resetCanvas", () => {
    let run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-search-after-reset",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "构造正方形 ABCD，A(0,0)、B(2,0)，并画出两条对角线。",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      }),
      {
        toolCallId: "read-before-square",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );
    run = upsertAgentRunTool(run, {
      toolCallId: "reset-before-square",
      toolName: "resetCanvas",
      status: "succeeded",
      args: { perspective: "G" },
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });

    expect(
      decideAgentRunRunnerContinuation({
        run,
        action: {
          type: "tool",
          tool: {
            toolCallId: "square-without-search",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["A=(0,0)", "B=(2,0)", "C=(2,2)", "D=(0,2)", "Polygon(A,B,C,D)"] }
          }
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "auto-command-search-3",
        toolName: "searchGeoGebraCommands",
        args: {
          query: expect.stringContaining("Polygon"),
          scope: "geometry-2d",
          nextExpectedAction: "executeGeoGebraCommands"
        }
      }
    });
  });

  test("ignores repeated Delete cleanup attempts after resetCanvas", () => {
    let run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-delete-after-reset-blocked",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "画出函数 y = ln(x)，标出点 (1,0)，并说明定义域。",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      }),
      {
        toolCallId: "read-before-function",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );
    run = upsertAgentRunTool(run, {
      toolCallId: "reset-before-function",
      toolName: "resetCanvas",
      status: "succeeded",
      args: { perspective: "G" },
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });

    expect(
      decideAgentRunRunnerContinuation({
        run,
        action: {
          type: "tool",
          tool: {
            toolCallId: "delete-after-reset",
            toolName: "executeGeoGebraCommands",
            args: { commands: ["Delete(A)"] }
          }
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "auto-ignore-delete-cleanup-3",
        toolName: "getCanvasContext",
        args: {
          reason: expect.stringContaining("Delete"),
          nextExpectedAction: "executeGeoGebraCommands"
        }
      }
    });
  });

  test("matches deterministic recipe requirements only against the current prompt before blackboard context", () => {
    const run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-current-prompt-recipe",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: [
          "继续，在 x = 1 处画出这条抛物线的切线，并标出切点。",
          "",
          "GeoChat 工作记忆黑板（结构化上下文；用于解析“继续”“它”“上面”“这个”等指代；如果当前消息是新题，请以当前消息为准）：",
          "- 原始题目：画出抛物线 y = x^2，并标出顶点和对称轴。",
          "- 绘图/解题思路：绘制抛物线 f(x)=x^2、顶点和对称轴。"
        ].join("\n"),
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      }),
      {
        toolCallId: "read-before-continuation",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );
    const continuationExecuteRequest = {
      toolCallId: "execute-continuation",
      toolName: "executeGeoGebraCommands" as const,
      args: { commands: ["T = (1, 1)", "t = Tangent(T, f)"] }
    };

    expect(
      requiredGeometryPlanRecipeIdsBeforeRawCommands({
        run,
        request: continuationExecuteRequest
      })
    ).toEqual([]);
    expect(isAgentRunRawGeoGebraCommandFallback({ run, request: continuationExecuteRequest })).toBe(true);
  });

  test("accepts runner start with model config so the backend can choose the first tool", () => {
    expect(
      isAgentRunRunnerStartInput({
        run: {
          runId: "runner-run-1",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          prompt: "画圆",
          attachmentCount: 0
        },
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "secret",
          customBaseUrl: ""
        },
        attachments: [{ name: "problem.png", mediaType: "image/png", dataUrl: "data:image/png;base64,abc123" }]
      })
    ).toBe(true);

    expect(
      isAgentRunRunnerStartInput({
        run: {
          runId: "runner-run-invalid-first-tool-with-model",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          prompt: "画圆",
          attachmentCount: 0
        },
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "secret",
          customBaseUrl: ""
        },
        firstTool: {
          toolCallId: " ",
          toolName: "getCanvasContext",
          args: { includeXml: false }
        }
      })
    ).toBe(false);
  });

  test("rejects invalid transient runner attachments", () => {
    expect(
      isAgentRunRunnerStartInput({
        run: {
          runId: "runner-run-1",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          prompt: "画圆",
          attachmentCount: 1
        },
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "secret",
          customBaseUrl: ""
        },
        attachments: [{ name: "notes.txt", mediaType: "text/plain", dataUrl: "hello" }]
      })
    ).toBe(false);
  });

  test("rejects runner start without a valid first tool", () => {
    expect(
      isAgentRunRunnerStartInput({
        run: {
          runId: "runner-run-1",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          modelProvider: "openai",
          modelId: "gpt-5.5",
          prompt: "画圆",
          attachmentCount: 0
        },
        firstTool: {
          toolCallId: "tool-1",
          toolName: "missingTool",
          args: {}
        }
      })
    ).toBe(false);
  });

  test("maps AI SDK tool calls into validated remote tool requests", () => {
    expect(isAgentRunToolCallId("ai-tool-1")).toBe(true);
    expect(isAgentRunToolCallId("   ")).toBe(false);
    const request = remoteToolRequestInputFromToolCall({
      toolCallId: "ai-tool-1",
      toolName: "getCanvasContext",
      input: { includeXml: false }
    });
    expect(
      request
    ).toMatchObject({
      toolCallId: "ai-tool-1",
      toolName: "getCanvasContext",
      args: { includeXml: false }
    });
    expect(isAgentRunRemoteToolRequestInput(request)).toBe(true);

    const normalizedCard = remoteToolRequestInputFromToolCall({
      toolCallId: "ai-tool-card",
      toolName: "showSolutionSteps",
      input: {
        title: "结论",
        summary: "图形已经完成。",
        steps: ["绘制抛物线。", { title: "验证", content: "读取画板确认顶点 V。" }],
        content: "图形支持结论。"
      }
    });
    expect(normalizedCard.args).toMatchObject({
      title: "结论",
      answer: "图形已经完成。",
      steps: [
        { label: "步骤 1", body: "绘制抛物线。" },
        { label: "验证", body: "读取画板确认顶点 V。" }
      ]
    });
    expect(isAgentRunRemoteToolRequestInput(normalizedCard)).toBe(true);

    const normalizedChoiceAnalysis = remoteToolRequestInputFromToolCall({
      toolCallId: "ai-tool-choice-card",
      toolName: "showChoiceAnalysis",
      input: {
        title: "判断选项",
        summary: "共用题干条件。",
        options: [
          { option: "a.", text: "结论 A", judgment: "正确", reason: "由公共条件可推出。" },
          { option: "B", text: "结论 B", judgment: "错误", reason: "与公共条件矛盾。", evidence: ["对象 B_aux1 不满足条件。"] }
        ]
      }
    });
    expect(normalizedChoiceAnalysis.args).toMatchObject({
      title: "判断选项",
      summary: "共用题干条件。",
      choices: [
        { label: "A", statement: "结论 A", verdict: "true", explanation: "由公共条件可推出。" },
        { label: "B", statement: "结论 B", verdict: "false", explanation: "与公共条件矛盾。", evidence: ["对象 B_aux1 不满足条件。"] }
      ]
    });
    expect(isAgentRunRemoteToolRequestInput(normalizedChoiceAnalysis)).toBe(true);

    expect(() =>
      remoteToolRequestInputFromToolCall({
        toolCallId: "ai-tool-2",
        toolName: "executeGeoGebraCommands",
        input: { commands: [] }
      })
    ).toThrow("非法工具参数");
    expect(() =>
      remoteToolRequestInputFromToolCall({
        toolCallId: " ",
        toolName: "getCanvasContext",
        input: { includeXml: false }
      })
    ).toThrow("非法工具调用 ID");
  });

  test("maps setFinished tool calls into runner finish actions", async () => {
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-finish-model",
      supportedUrls: {},
      doGenerate: async () => ({
        content: [
          {
            type: "tool-call",
            toolCallId: "finish-run-1",
            toolName: "setFinished",
            input: JSON.stringify({
              summary: "画布已验证，解题步骤已整理完成。",
              reason: "最终卡片已经完成，不需要继续调用工具。",
              intendedOutcome: "结束本轮 Agent 编排。"
            })
          }
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage: {
          inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 8, text: 0, reasoning: 0 }
        }
      }),
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = createAgentRunLedger({
      runId: "set-finished-run",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "画一个圆并说明。",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "deepseek",
          model: "deepseek-v4-flash",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: fakeModel
      })
    ).resolves.toMatchObject({
      type: "finish",
      source: "model",
      text: "画布已验证，解题步骤已整理完成。"
    });
  });

  test("redirects first-pass explanation cards back to visualization commands", () => {
    const run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-run-premature-choice-card",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "已知三个圆和直线 l，判断 A/B/C/D 并作图说明。",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      }),
      {
        toolCallId: "initial-canvas-read",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        result: { ok: true, canvasContext: { objects: [] } },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );

    const decision = decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "choice-before-canvas",
          toolName: "showChoiceAnalysis",
          args: {
            title: "选项分析",
            summary: "先判断选项。",
            answer: "B",
            choices: [
              {
                label: "A",
                statement: "k 可以取任意实数",
                verdict: "false",
                explanation: "不满足相交约束。"
              },
              {
                label: "B",
                statement: "满足条件的直线共有 3 条",
                verdict: "unknown",
                explanation: "需要先构造公共底图再判断。"
              }
            ],
            nextExpectedAction: "final_answer"
          }
        }
      }
    });

    expect(decision).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolName: "searchGeoGebraCommands",
        args: {
          scope: "conic",
          nextExpectedAction: "executeGeoGebraCommands"
        }
      }
    });
    expect(decision.type === "enqueue_tool" && isAgentRunRemoteToolRequestInput(decision.nextRequest)).toBe(true);
  });

  test("requires auxiliary element review before final explanation cards after construction", () => {
    let run = createAgentRunLedger({
      runId: "runner-run-auxiliary-review",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "作一个三棱锥，并作出它的外界球。",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "read-1",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { objects: [] } },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "search-1",
      toolName: "searchGeoGebraCommands",
      status: "succeeded",
      args: { query: "Sphere command syntax", scope: "geometry-3d" },
      result: { ok: true, entries: [] },
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "write-1",
      toolName: "executeGeoGebraCommands",
      status: "succeeded",
      args: { commands: ["A = (0, 0, 0)", "auxLine = Line(A, (1, 0, 0))"] },
      result: { ok: true },
      startedAt: "2026-06-06T00:00:05.000Z",
      completedAt: "2026-06-06T00:00:06.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "verify-1",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { objects: [{ label: "A" }, { label: "auxLine" }] } },
      startedAt: "2026-06-06T00:00:07.000Z",
      completedAt: "2026-06-06T00:00:08.000Z"
    });

    expect(
      decideAgentRunRunnerContinuation({
        run,
        action: {
          type: "tool",
          tool: {
            toolCallId: "explain-before-auxiliary-review",
            toolName: "showSolutionSteps",
            args: { title: "完成", answer: "已完成", steps: [{ label: "构造", body: "已构造三棱锥和外接球。" }] }
          }
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "auto-auxiliary-review-1",
        toolName: "getCanvasContext",
        args: {
          includeXml: false,
          nextExpectedAction: "hide_auxiliary_elements_or_explain_none"
        }
      }
    });

    const reviewedRun = upsertAgentRunTool(run, {
      toolCallId: "auto-auxiliary-review-1",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { objects: [{ label: "A" }, { label: "auxLine" }] } },
      startedAt: "2026-06-06T00:00:09.000Z",
      completedAt: "2026-06-06T00:00:10.000Z"
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: reviewedRun,
        action: {
          type: "tool",
          tool: {
            toolCallId: "explain-without-auxiliary-review",
            toolName: "showSolutionSteps",
            args: { title: "完成", answer: "已完成", steps: [{ label: "构造", body: "已构造三棱锥和外接球。" }] }
          }
        }
      })
    ).toMatchObject({
      type: "workflow_blocked",
      message: expect.stringContaining("auxiliaryElementReview")
    });

    expect(
      decideAgentRunRunnerContinuation({
        run: reviewedRun,
        action: {
          type: "tool",
          tool: {
            toolCallId: "explain-with-auxiliary-review",
            toolName: "showSolutionSteps",
            args: {
              title: "完成",
              answer: "已完成",
              steps: [{ label: "构造", body: "已构造三棱锥和外接球。" }],
              auxiliaryElementReview: "auxLine 是定位球心的辅助线，已判断应隐藏；A 和外接球为关键对象保留。"
            }
          }
        }
      })
    ).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "explain-with-auxiliary-review",
        toolName: "showSolutionSteps"
      }
    });
  });

  test("injects run prompt as createGeometryPlan source text when model omits it", async () => {
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-geometry-plan-model",
      supportedUrls: {},
      doGenerate: async () => ({
        content: [
          {
            type: "tool-call",
            toolCallId: "plan-from-model",
            toolName: "createGeometryPlan",
            input: JSON.stringify({
              recipeId: "function.parabola.vertex",
              reason: "用户要求画抛物线并标顶点。",
              intendedOutcome: "生成抛物线构造计划。",
              nextExpectedAction: "executeGeoGebraCommands"
            })
          }
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage: {
          inputTokens: { total: 18, noCache: 18, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 4, text: 0, reasoning: 0 }
        }
      }),
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = createAgentRunLedger({
      runId: "geometry-source-text-run",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "画出抛物线 y = x^2，并标出顶点。",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "deepseek",
          model: "deepseek-v4-flash",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: fakeModel
      })
    ).resolves.toMatchObject({
      type: "tool",
      tool: {
        toolCallId: "plan-from-model",
        toolName: "createGeometryPlan",
        args: {
          recipeId: "function.parabola.vertex",
          sourceText: "画出抛物线 y = x^2，并标出顶点。"
        }
      }
    });
  });

  test("adds an English response requirement for English UI runs", async () => {
    let capturedOptions = "";
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-locale-model",
      supportedUrls: {},
      doGenerate: async (options: unknown) => {
        capturedOptions = JSON.stringify(options);
        return {
          content: [{ type: "text", text: "The construction is complete." }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 5, text: 5, reasoning: 0 }
          }
        };
      },
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = createAgentRunLedger({
      runId: "english-locale-run",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      locale: "en-US",
      prompt: "Draw a circle.",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: fakeModel
      })
    ).resolves.toMatchObject({
      type: "finish",
      text: "The construction is complete."
    });
    expect(capturedOptions).toContain("Respond in English.");
    expect(capturedOptions).toContain("executeGeoGebraCommands");
    expect(capturedOptions).toContain("Run a list of drawing commands in the frontend GeoGebra applet under GeoGebra 5 compatibility.");
    expect(capturedOptions).toContain("Original problem statement");
  });

  test("queues the first model tool call when a provider emits multiple calls in one step", async () => {
    let providerCalls = 0;
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-multi-tool-model",
      supportedUrls: {},
      doGenerate: async () => {
        providerCalls += 1;
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "multi-tool-1",
              toolName: "searchGeoGebraCommands",
              input: JSON.stringify({
                query: "circle",
                scope: "conic",
                topN: 1,
                reason: "第一个工具调用。",
                intendedOutcome: "查询圆命令。",
                nextExpectedAction: "searchGeoGebraCommands"
              })
            },
            {
              type: "tool-call",
              toolCallId: "multi-tool-2",
              toolName: "showTeachingHint",
              input: JSON.stringify({
                hint: "第二个工具调用应留到后续 step。",
                reason: "验证多工具输出收敛。",
                intendedOutcome: "确认 harness 不会因为多工具输出失败。",
                nextExpectedAction: "final_answer"
              })
            }
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage: {
            inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 4, text: 0, reasoning: 0 }
          }
        };
      },
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = createAgentRunLedger({
      runId: "multi-tool-run",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "查询圆命令\nAgent Skills are disabled for this run.",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "deepseek",
          model: "deepseek-v4-flash",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: fakeModel
      })
    ).resolves.toMatchObject({
      type: "tool",
      tool: {
        toolCallId: "multi-tool-1",
        toolName: "searchGeoGebraCommands"
      },
      diagnostics: {
        protocolRepairAttempts: 1,
        protocolRepairErrors: [expect.stringContaining("2 个工具调用")]
      }
    });
    expect(providerCalls).toBe(1);
  });

  test("repairs empty model finishes once before accepting final text", async () => {
    let providerCalls = 0;
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-empty-finish-model",
      supportedUrls: {},
      doGenerate: async () => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return {
            content: [{ type: "text", text: "   " }],
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 0, text: 0, reasoning: 0 }
            }
          };
        }
        return {
          content: [{ type: "text", text: "已修复为空输出，给出最终说明。" }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 16, noCache: 16, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 7, text: 7, reasoning: 0 }
          }
        };
      },
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = createAgentRunLedger({
      runId: "empty-finish-run",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "查询圆命令\nAgent Skills are disabled for this run.",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "deepseek",
          model: "deepseek-v4-flash",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: fakeModel
      })
    ).resolves.toMatchObject({
      type: "finish",
      text: "已修复为空输出，给出最终说明。",
      diagnostics: {
        protocolRepairAttempts: 1,
        protocolRepairErrors: [expect.stringContaining("没有返回工具调用")]
      }
    });
    expect(providerCalls).toBe(2);
  });

  test("repairs choice prompts that finish without showChoiceAnalysis", async () => {
    let providerCalls = 0;
    let repairPrompt = "";
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-choice-finish-model",
      supportedUrls: {},
      doGenerate: async (options: { prompt: unknown }) => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return {
            content: [{ type: "text", text: "答案是 AC。" }],
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 4, text: 4, reasoning: 0 }
            }
          };
        }
        repairPrompt = JSON.stringify(options.prompt);
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "choice-analysis-1",
              toolName: "showChoiceAnalysis",
              input: JSON.stringify({
                title: "判断选项",
                summary: "公共底图为三角形 ABC 和 AB 中点 M。",
                answer: "AC",
                baseConditions: ["A(0,0)", "B(4,0)", "C(1,3)", "M 是 AB 中点"],
                displayMode: "single_active_choice",
                choices: [
                  {
                    label: "A",
                    statement: "AM = MB",
                    verdict: "true",
                    explanation: "M 是 AB 中点，所以 AM = MB。",
                    constructionFocus: "A_aux1 标出 AM 与 MB 两段。",
                    commands: ["A_aux1 = Segment(A, M)", "A_aux2 = Segment(M, B)", "A_note = Text(\"AM = MB\", M)"]
                  },
                  {
                    label: "B",
                    statement: "M 在 AC 上",
                    verdict: "false",
                    explanation: "M 是 AB 中点，不在 AC 上。",
                    constructionFocus: "B_aux1 画出 AC，B_mark1 保留 M 的位置作反例。",
                    commands: ["B_aux1 = Line(A, C)", "B_mark1 = Point(M)", "B_note = Text(\"M 不在 AC 上\", M)"]
                  },
                  {
                    label: "C",
                    statement: "CM 是中线",
                    verdict: "true",
                    explanation: "CM 连接顶点 C 与 AB 中点 M。",
                    constructionFocus: "C_aux1 画出从顶点到对边中点的中线。",
                    commands: ["C_aux1 = Segment(C, M)", "C_note = Text(\"CM 是中线\", M)"]
                  },
                  {
                    label: "D",
                    statement: "CM 垂直 AB",
                    verdict: "false",
                    explanation: "C 到 M 的连线不垂直于水平的 AB。",
                    constructionFocus: "D_aux1 画 CM，D_aux2 画 AB 的垂线作对照。",
                    commands: ["D_aux1 = Segment(C, M)", "D_aux2 = PerpendicularLine(M, Segment(A, B))", "D_note = Text(\"CM 非垂线\", M)"]
                  }
                ]
              })
            }
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage: {
            inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 10, text: 0, reasoning: 0 }
          }
        };
      },
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = createAgentRunLedger({
      runId: "choice-finish-repair-run",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: [
        "Agent Skills are disabled for this run.",
        "这是选择题，请判断下列选项。",
        "A. AM = MB",
        "B. M 在 AC 上",
        "C. CM 是中线",
        "D. CM 垂直 AB"
      ].join("\n"),
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });

    const action = await createBackendModelNextAction({
      modelConfig: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "test",
        customBaseUrl: ""
      },
      run,
      model: fakeModel
    });
    expect(action).toMatchObject({
      type: "tool",
      tool: {
        toolCallId: "choice-analysis-1",
        toolName: "showChoiceAnalysis",
        args: {
          choices: [
            { label: "A", verdict: "true" },
            { label: "B", verdict: "false" },
            { label: "C", verdict: "true" },
            { label: "D", verdict: "false" }
          ]
        }
      },
      diagnostics: {
        protocolRepairAttempts: 1,
        protocolRepairErrors: [expect.stringContaining("showChoiceAnalysis")]
      }
    });
    expect(action.type).toBe("tool");
    if (action.type === "tool") {
      expect(JSON.stringify(action.tool.args)).toContain("A_aux1");
      expect(JSON.stringify(action.tool.args)).toContain("D_aux2");
    }
    expect(providerCalls).toBe(2);
    expect(repairPrompt).toContain("showChoiceAnalysis");
    expect(repairPrompt).toContain("不要返回最终文本");
  });

  test("repairs choice analysis cards that omit option-specific visual commands", async () => {
    let providerCalls = 0;
    let repairPrompt = "";
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-choice-visual-repair-model",
      supportedUrls: {},
      doGenerate: async (options: { prompt: unknown }) => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return {
            content: [
              {
                type: "tool-call",
                toolCallId: "choice-analysis-missing-visuals",
                toolName: "showChoiceAnalysis",
                input: JSON.stringify({
                  title: "判断选项",
                  summary: "公共底图为三个圆和参数直线。",
                  answer: "BCD",
                  baseConditions: ["三个单位圆", "直线 $l:y=kx+b$"],
                  displayMode: "single_active_choice",
                  choices: [
                    { label: "A", statement: "$k$ 可以取任意实数", verdict: "false", explanation: "存在不可行斜率。" },
                    { label: "B", statement: "$s_1=s_2=s_3$ 的直线共有 3 条", verdict: "true", explanation: "由距离相等得到三条。" },
                    { label: "C", statement: "$s_1+s_2+s_3=3$ 的直线多于 3 条", verdict: "true", explanation: "等值线穿过可行域。" },
                    { label: "D", statement: "$b=0$ 时最大值为 $2\\\\sqrt{21}/3$", verdict: "true", explanation: "截面函数最大值符合。" }
                  ]
                })
              }
            ],
            finishReason: { unified: "tool-calls", raw: "tool_calls" },
            usage: {
              inputTokens: { total: 16, noCache: 16, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 10, text: 0, reasoning: 0 }
            }
          };
        }
        repairPrompt = JSON.stringify(options.prompt);
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "choice-analysis-with-visuals",
              toolName: "showChoiceAnalysis",
              input: JSON.stringify({
                title: "判断选项",
                summary: "公共底图为三个圆和参数直线。",
                answer: "BCD",
                baseConditions: ["三个单位圆", "直线 $l:y=kx+b$"],
                displayMode: "single_active_choice",
                choices: [
                  {
                    label: "A",
                    statement: "$k$ 可以取任意实数",
                    verdict: "false",
                    explanation: "$k=1/\\\\sqrt3$ 时三组 $b$ 区间没有共同内点。",
                    constructionFocus: "A_aux1 显示参数域中 $k=1/\\\\sqrt3$ 的不可行截面。",
                    commands: ["A_aux1: x = 1 / sqrt(3)", "A_note = Text(\"k=1/sqrt(3) 无共同 b\", (1 / sqrt(3), 0))"]
                  },
                  {
                    label: "B",
                    statement: "$s_1=s_2=s_3$ 的直线共有 3 条",
                    verdict: "true",
                    explanation: "距离相等给出 $b=0,k=\\\\pm\\\\sqrt3$ 和 $k=0,b=\\\\sqrt3/2$。",
                    constructionFocus: "B_aux1/B_aux2/B_aux3 标出三条等弦特殊线。",
                    commands: ["B_aux1: y = sqrt(3) x", "B_aux2: y = -sqrt(3) x", "B_aux3: y = sqrt(3) / 2"]
                  },
                  {
                    label: "C",
                    statement: "$s_1+s_2+s_3=3$ 的直线多于 3 条",
                    verdict: "true",
                    explanation: "参数面上的等值曲线穿过可行区域。",
                    constructionFocus: "C_aux1 用隐式等值曲线表示 $s_1+s_2+s_3=3$。",
                    commands: ["C_aux1: 2 sqrt(1 - ((y - x)^2) / (x^2 + 1)) + 2 sqrt(1 - ((y + x)^2) / (x^2 + 1)) + 2 sqrt(1 - ((y - sqrt(3))^2) / (x^2 + 1)) = 3"]
                  },
                  {
                    label: "D",
                    statement: "$b=0$ 时最大值为 $2\\\\sqrt{21}/3$",
                    verdict: "true",
                    explanation: "$u=\\\\sqrt{k^2-2}=3/2$ 处达到最大。",
                    constructionFocus: "D_aux1 画 $b=0$ 截面下的和函数，D_max 标出极值点。",
                    commands: ["D_aux1(x) = 4 / sqrt(x^2 + 1) + 2 sqrt(x^2 - 2) / sqrt(x^2 + 1)", "D_max = Extremum(D_aux1, 1.42, 3)"]
                  }
                ]
              })
            }
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage: {
            inputTokens: { total: 40, noCache: 40, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 20, text: 0, reasoning: 0 }
          }
        };
      },
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = createAgentRunLedger({
      runId: "choice-visual-repair-run",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: [
        "Agent Skills are disabled for this run.",
        "这是多选题，请判断下列选项。",
        "A．k 可以取任意实数",
        "B．满足 s1=s2=s3 的直线共有 3 条",
        "C．满足 s1+s2+s3=3 的直线多于 3 条",
        "D．当 b=0 时，最大值为 2√21/3"
      ].join("\n"),
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });

    const action = await createBackendModelNextAction({
      modelConfig: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "test",
        customBaseUrl: ""
      },
      run,
      model: fakeModel
    });

    expect(action).toMatchObject({
      type: "tool",
      tool: {
        toolCallId: "choice-analysis-with-visuals",
        toolName: "showChoiceAnalysis",
        args: {
          choices: [
            { label: "A", constructionFocus: expect.stringContaining("不可行截面"), commands: expect.arrayContaining([expect.stringContaining("A_aux1")]) },
            { label: "B", constructionFocus: expect.stringContaining("三条"), commands: expect.arrayContaining([expect.stringContaining("B_aux1")]) },
            { label: "C", constructionFocus: expect.stringContaining("等值曲线"), commands: expect.arrayContaining([expect.stringContaining("C_aux1")]) },
            { label: "D", constructionFocus: expect.stringContaining("截面"), commands: expect.arrayContaining([expect.stringContaining("D_aux1")]) }
          ]
        }
      },
      diagnostics: {
        protocolRepairAttempts: 1,
        protocolRepairErrors: [expect.stringContaining("选项专属可视化场景")]
      }
    });
    expect(providerCalls).toBe(2);
    expect(repairPrompt).toContain("每个选项必须包含非空 constructionFocus");
  });

  test("rejects repeated model protocol failures after the bounded repair attempt", async () => {
    let providerCalls = 0;
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-repeated-empty-finish-model",
      supportedUrls: {},
      doGenerate: async () => {
        providerCalls += 1;
        return {
          content: [{ type: "text", text: "   " }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 0, text: 0, reasoning: 0 }
          }
        };
      },
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = createAgentRunLedger({
      runId: "repeated-empty-finish-run",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "查询圆命令\nAgent Skills are disabled for this run.",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "deepseek",
          model: "deepseek-v4-flash",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: fakeModel
      })
    ).rejects.toThrow("没有返回工具调用");
    expect(providerCalls).toBe(2);
  });

  test("creates the initial canvas read request deterministically without model IO", () => {
    expect(createAgentRunInitialCanvasReadRequest({ requestedAt: "2026-06-06T00:00:00.000Z" })).toMatchObject({
      toolCallId: "initial-canvas-read",
      toolName: "getCanvasContext",
      requestedAt: "2026-06-06T00:00:00.000Z",
      args: {
        includeXml: false,
        nextExpectedAction: "plan_or_execute"
      }
    });
    expect(createAgentRunInitialCanvasReadRequest({ locale: "en-US" }).args).toMatchObject({
      reason: "Read the current GeoGebra canvas context when the backend harness starts.",
      intendedOutcome: expect.stringContaining("Provide reliable canvas objects, expressions, and state summary for later model planning.")
    });
    expect(createAgentRunInitialCanvasReadRequest({ locale: "en-US" }).args.intendedOutcome).toContain("keep ordinary 2D Graphics on GeoGebra defaults");
    expect(createAgentRunInitialCanvasReadRequest({ locale: "zh-CN" }).args.intendedOutcome).toContain("普通 2D Graphics 默认保持 GeoGebra 视觉样式");
  });

  test("passes transient image attachments into backend model messages", async () => {
    let capturedPrompt = "";
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-image-model",
      supportedUrls: {},
      doGenerate: async (options: { prompt: unknown }) => {
        capturedPrompt = JSON.stringify(options.prompt);
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "model-tool-image-1",
              toolName: "executeGeoGebraCommands",
              input: JSON.stringify({ commands: ["A = (0, 0)"] })
            }
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage: {
            inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 4, text: 0, reasoning: 0 }
          }
        };
      },
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = createAgentRunLedger({
      runId: "image-next-action-run",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "看图构造",
      attachmentCount: 1,
      startedAt: "2026-06-06T00:00:00.000Z"
    });

    await createBackendModelNextAction({
      modelConfig: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "test",
        customBaseUrl: ""
      },
      run,
      attachments: [{ name: "problem.png", mediaType: "image/png", dataUrl: "data:image/png;base64,abc123" }],
      model: fakeModel
    });

    expect(capturedPrompt).toContain("image");
    expect(capturedPrompt).toContain("abc123");
  });

  test("rejects image attachments for text-only backend models", async () => {
    const run = createAgentRunLedger({
      runId: "text-only-image-run",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "看图构造",
      attachmentCount: 1,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "deepseek",
          model: "deepseek-v4-flash",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        attachments: [{ name: "problem.png", mediaType: "image/png", dataUrl: "data:image/png;base64,abc123" }],
        model: {} as never
      })
    ).rejects.toThrow("图片输入能力");
  });

  test("continues a runner from ledger tool history into the next model tool call", async () => {
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-next-tool-model",
      supportedUrls: {},
      doGenerate: async (options: { prompt: unknown }) => {
        expect(JSON.stringify(options.prompt)).toContain("tool-result");
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "model-tool-2",
              toolName: "executeGeoGebraCommands",
              input: JSON.stringify({ commands: ["O = (0, 0)", "c = Circle(O, 1)"] })
            }
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage: {
            inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 8, text: 0, reasoning: 0 }
          }
        };
      },
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-run-next",
        conversationId: "conversation-1",
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
      }),
      {
        toolCallId: "model-tool-1",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        result: { ok: true, canvasContext: { objects: [] } },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: fakeModel
      })
    ).resolves.toMatchObject({
      type: "tool",
      tool: {
        toolCallId: "model-tool-2",
        toolName: "executeGeoGebraCommands",
        args: { commands: ["O = (0, 0)", "c = Circle(O, 1)"] }
      }
    });
  });

  test("sanitizes unusual ledger tool output before rebuilding model messages", async () => {
    const circular: Record<string, unknown> = { label: "loop" };
    circular.self = circular;
    let capturedPrompt = "";
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-json-safe-model",
      supportedUrls: {},
      doGenerate: async (options: { prompt: unknown }) => {
        capturedPrompt = JSON.stringify(options.prompt);
        return {
          content: [{ type: "text", text: "已读取历史工具结果。" }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 4, text: 4, reasoning: 0 }
          }
        };
      },
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = upsertAgentRunTool(
      createAgentRunLedger({
        runId: "runner-run-json-safe-history",
        conversationId: "conversation-1",
        mode: "ai-sdk",
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        },
        prompt: "继续解释当前构造",
        attachmentCount: 0,
        startedAt: "2026-06-06T00:00:00.000Z"
      }),
      {
        toolCallId: "json-safe-read",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        result: {
          callback: () => "ignore",
          circular,
          missing: undefined,
          symbol: Symbol("ignore"),
          veryLarge: 9007199254740993n
        },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: fakeModel
      })
    ).resolves.toMatchObject({
      type: "finish",
      text: "已读取历史工具结果。"
    });
    expect(capturedPrompt).toContain("9007199254740993");
    expect(capturedPrompt).toContain("[Circular]");
    expect(capturedPrompt).toContain("callback");
    expect(capturedPrompt).toContain("missing");
  });

  test("forces a canvas read before asking the model to repair failed commands", async () => {
    const run = upsertAgentRunTool(
      upsertAgentRunTool(
        createAgentRunLedger({
          runId: "runner-run-repair-context",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "",
            customBaseUrl: ""
          },
          prompt: "画一个椭圆",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:00.000Z"
        }),
        {
          toolCallId: "read-1",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          result: { ok: true, canvasContext: { objects: [] } },
          startedAt: "2026-06-06T00:00:01.000Z",
          completedAt: "2026-06-06T00:00:02.000Z"
        }
      ),
      {
        toolCallId: "bad-exec-1",
        toolName: "executeGeoGebraCommands",
        status: "failed",
        args: { commands: ["Ellipse((0,0),(1,0))"] },
        result: { ok: false, results: [{ command: "Ellipse((0,0),(1,0))", success: false, error: "Illegal argument" }] },
        error: "Illegal argument",
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    );

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: {
          doGenerate: async () => {
            throw new Error("model should not be called before repair context is captured");
          }
        } as never
      })
    ).resolves.toMatchObject({
      type: "tool",
      tool: {
        toolCallId: "bad-exec-1-repair-context",
        toolName: "getCanvasContext"
      }
    });
  });

  test("uses a repair prompt after failed commands and captured canvas context", async () => {
    let capturedPrompt = "";
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-repair-model",
      supportedUrls: {},
      doGenerate: async (options: { prompt: unknown }) => {
        capturedPrompt = JSON.stringify(options.prompt);
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "repair-exec-1",
              toolName: "executeGeoGebraCommands",
              input: JSON.stringify({ commands: ["F = (-2, 0)", "G = (2, 0)", "A = (0, 3)", "c = Ellipse(F, G, A)"] })
            }
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage: {
            inputTokens: { total: 30, noCache: 30, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 10, text: 0, reasoning: 0 }
          }
        };
      },
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    let run = createAgentRunLedger({
      runId: "runner-run-repair",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "画一个椭圆",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "read-1",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { objects: [] } },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "bad-exec-1",
      toolName: "executeGeoGebraCommands",
      status: "failed",
      args: { commands: ["Ellipse((0,0),(1,0))"] },
      result: { ok: false, results: [{ command: "Ellipse((0,0),(1,0))", success: false, error: "Illegal argument" }] },
      error: "Illegal argument",
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "bad-exec-1-repair-context",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { objects: [{ label: "F" }] } },
      canvasAfter: { objects: [{ label: "F" }] },
      startedAt: "2026-06-06T00:00:05.000Z",
      completedAt: "2026-06-06T00:00:06.000Z"
    });

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: fakeModel
      })
    ).resolves.toMatchObject({
      type: "tool",
      tool: {
        toolCallId: "repair-exec-1",
        toolName: "executeGeoGebraCommands",
        args: { commands: ["F = (-2, 0)", "G = (2, 0)", "A = (0, 3)", "c = Ellipse(F, G, A)"] }
      }
    });
    expect(capturedPrompt).toContain("失败命令");
    expect(capturedPrompt).toContain("Ellipse((0,0),(1,0))");
    expect(capturedPrompt).toContain("Illegal argument");
    expect(capturedPrompt).toContain("objects");
    expect(capturedPrompt).toContain("必须返回 executeGeoGebraCommands 修复命令");
    expect(capturedPrompt).toContain("不要再次调用 getCanvasContext 或 getPNGBase64");
  });

  test("blocks repeated canvas reads during command repair after context is captured", () => {
    let run = createAgentRunLedger({
      runId: "runner-run-repair-reread-block",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "画一个椭圆",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "read-1",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { objects: [] } },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "bad-exec-1",
      toolName: "executeGeoGebraCommands",
      status: "failed",
      args: { commands: ["c = Ellipse(F, G, A)"] },
      result: { ok: false, results: [{ command: "c = Ellipse(F, G, A)", success: false, error: "Unknown object F" }] },
      error: "Unknown object F",
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "bad-exec-1-repair-context",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { objects: [] } },
      startedAt: "2026-06-06T00:00:05.000Z",
      completedAt: "2026-06-06T00:00:06.000Z"
    });

    const decision = decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "repair-read-again",
          toolName: "getCanvasContext",
          args: {
            includeXml: false,
            reason: "再看一次画布",
            intendedOutcome: "检查是否还有对象",
            nextExpectedAction: "executeGeoGebraCommands"
          }
        }
      }
    });

    expect(decision).toMatchObject({
      type: "workflow_blocked",
      message: "GeoGebra 命令失败后，runner 已经读取过修复上下文；下一步必须执行修复命令，不能继续重复读取画布。"
    });
  });

  test("surfaces a structured failure card when repair retries are exhausted", async () => {
    let run = createAgentRunLedger({
      runId: "runner-run-repair-failed",
      conversationId: "conversation-1",
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "画一个椭圆",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "read-1",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "bad-exec-1",
      toolName: "executeGeoGebraCommands",
      status: "failed",
      args: { commands: ["Ellipse((0,0),(1,0))"] },
      error: "Illegal argument",
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "bad-exec-1-repair-context",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      startedAt: "2026-06-06T00:00:05.000Z",
      completedAt: "2026-06-06T00:00:06.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "repair-exec-1",
      toolName: "executeGeoGebraCommands",
      status: "failed",
      args: { commands: ["c = Ellipse(F, G, A)"] },
      error: "Unknown object F",
      startedAt: "2026-06-06T00:00:07.000Z",
      completedAt: "2026-06-06T00:00:08.000Z"
    });

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: {
          doGenerate: async () => {
            throw new Error("model should not be called after repair retries are exhausted");
          }
        } as never
      })
    ).resolves.toMatchObject({
      type: "tool",
      tool: {
        toolName: "showSolutionSteps",
        args: {
          title: "GeoGebra 命令修复失败"
        }
      }
    });
  });

  test("finishes a runner when the model returns text instead of another tool call", async () => {
    const fakeModel = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-finish-model",
      supportedUrls: {},
      doGenerate: async () => ({
        content: [{ type: "text", text: "构造完成。" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 15, noCache: 15, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 6, text: 6, reasoning: 0 }
        }
      }),
      doStream: async () => {
        throw new Error("stream is not used in this test");
      }
    } as never;
    const run = createAgentRunLedger({
      runId: "runner-run-finish",
      conversationId: "conversation-1",
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

    await expect(
      createBackendModelNextAction({
        modelConfig: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "test",
          customBaseUrl: ""
        },
        run,
        model: fakeModel
      })
    ).resolves.toMatchObject({
      type: "finish",
      text: "构造完成。",
      usage: {
        inputTokens: 15,
        outputTokens: 6,
        totalTokens: 21
      }
    });
  });
});
