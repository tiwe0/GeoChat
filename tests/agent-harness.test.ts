import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { commandExecutionIntervalMs } from "../src/renderer/src/geogebra-execution";
import { rendererI18n } from "../src/renderer/src/i18n";
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
  getFunctionCallModelInputJsonSchema,
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
  reviewAgentRunLedger,
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
  geogebraSemanticColorPaletteGuidance,
  ADVANCED_DRAWING_TOOL_NAMES,
  compileAdvancedDrawingCommand,
  getAdvancedDrawingToolDefinitions,
  hasExplicitTwoDimensionalStyleIntent,
  hasSemanticTwoDimensionalHighlightIntent,
  findForbiddenFixedAxisObjectCommands,
  findForbiddenTwoDimensionalStyleCommands,
  findForbiddenViewportScaleCommands,
  findGeoGebraCommandBatchPolicyViolations,
  geogebraCommandBatchPolicyMessage,
  agentRoutingPrompt,
  GEOCHAT_SYSTEM_PROMPT,
  GEOCHAT_SYSTEM_PROMPT_EN
} from "@geochat-ai/app";
import { sanitizeRunnerModelError } from "../backend/src/agent/model-error";
import {
  createBackendModelNextAction,
  formatSkillSelectionPacketPrompt,
  remoteToolRequestInputFromToolCall,
  skillSelectorSystemPrompt,
  skillRuntimePolicyFromPrompt
} from "../backend/src/agent/model-runner";
import { createBackendPlanningTools } from "../backend/src/agent/model-runner-planning-tools";
import {
  buildCommandReferencePacketForRun,
  formatCommandReferencePacketPrompt
} from "../backend/src/agent/command-searcher";
import { canExecuteBackendToolRequest, executeBackendToolRequest } from "../backend/src/agent/backend-tools";
import { activateAgentSkill, listAvailableAgentSkills, parseAgentSkillPathList } from "../backend/src/agent/skills";
import { createDatabase } from "../backend/src/db/client";
import { createAgentRunRepository } from "../backend/src/db/agent-run-repository";
import {
  agentRunLedgers,
  agentRunModelSteps,
  agentRunPolicyDecisions,
  agentRunRemoteToolRequests
} from "../backend/src/db/schema";

const sharedHttpDatabasePath = `/tmp/geochat-agent-harness-http-${crypto.randomUUID()}.sqlite`;

describe("agent model registry", () => {
  test("normalizes unknown providers but keeps explicit custom model ids for known providers", () => {
    expect(
      normalizeAgentModelConfig({
        provider: "unknown",
        model: "missing",
        apiKey: "key",
        customBaseUrl: ""
      })
    ).toMatchObject({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      apiKey: "key"
    });
    expect(
      normalizeAgentModelConfig({
        provider: "openai",
        model: "gpt-custom-router",
        apiKey: "key",
        customBaseUrl: "https://llm.local/v1"
      })
    ).toMatchObject({
      provider: "openai",
      model: "gpt-custom-router",
      customBaseUrl: "https://llm.local/v1"
    });
    expect(
      normalizeAgentModelConfig({
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4.5",
        apiKey: "key",
        customBaseUrl: ""
      })
    ).toMatchObject({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4.5",
      apiKey: "key"
    });
  });

  test("exposes image and tool capability gates", () => {
    expect(getAgentProviderOptions()).toContainEqual({ value: "openrouter", label: "OpenRouter" });
    expect(getAgentProviderOptions()).toContainEqual({ value: "qwen", label: "通义千问（阿里云百炼）" });
    expect(agentModelSupportsImages("deepseek", "deepseek-v4-flash")).toBe(false);
    expect(agentModelSupportsImages("openai", "gpt-5.5")).toBe(true);
    expect(agentModelSupportsImages("openrouter", "openai/gpt-5.5")).toBe(true);
    expect(agentModelSupportsImages("qwen", "qwen-plus")).toBe(false);
    expect(getAgentModelPolicy({ provider: "openai", model: "gpt-5.5" })).toMatchObject({
      supportsImages: true,
      supportsTools: true,
      toolCallingMode: "native",
      isKnownModel: true
    });
    expect(getAgentModelPolicy({ provider: "openrouter", model: "openai/gpt-5.5" })).toMatchObject({
      supportsImages: true,
      supportsTools: true,
      toolCallingMode: "native",
      isKnownModel: true
    });
    expect(getAgentModelPolicy({ provider: "qwen", model: "qwen-plus" })).toMatchObject({
      supportsImages: false,
      supportsTools: true,
      toolCallingMode: "native",
      isKnownModel: true
    });
    expect(getAgentModelPolicy({ provider: "openai", model: "gpt-custom-router" })).toMatchObject({
      supportsImages: false,
      supportsTools: true,
      toolCallingMode: "assumed",
      maxToolSteps: 8,
      isKnownModel: false,
      isCustomModel: true
    });
    expect(getAgentModelPolicy({ provider: "unknown-provider", model: "missing-model" })).toMatchObject({
      supportsImages: false,
      supportsTools: false,
      toolCallingMode: "unsupported",
      maxToolSteps: 0,
      isKnownModel: false,
      isCustomModel: false
    });
    expect(getAgentModelPolicy({ provider: "openai", model: "gpt-5.5", maxToolSteps: 7 })).toMatchObject({
      maxToolSteps: 7,
      isKnownModel: true
    });
  });

  test("creates a safe model policy snapshot for runner diagnostics", () => {
    expect(agentModelPolicySnapshotFor({ provider: "openai", model: "gpt-5.5" })).toEqual({
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
    expect(agentModelPolicySnapshotFor({ provider: "openai", model: "custom-router" })).toMatchObject({
      provider: "openai",
      model: "custom-router",
      label: null,
      supportsImages: false,
      supportsTools: true,
      toolCallingMode: "assumed",
      maxToolSteps: 8,
      isKnownModel: false,
      isCustomModel: true
    });
    expect(agentModelPolicySnapshotFor({ provider: "openrouter", model: "openai/gpt-5.5" })).toMatchObject({
      provider: "openrouter",
      model: "openai/gpt-5.5",
      label: "OpenRouter GPT-5.5",
      supportsImages: true,
      supportsTools: true,
      toolCallingMode: "native",
      maxToolSteps: 16,
      isKnownModel: true,
      isCustomModel: false
    });
    expect(agentModelPolicySnapshotFor({ provider: "unknown", model: "custom-router" })).toMatchObject({
      supportsImages: false,
      supportsTools: false,
      toolCallingMode: "unsupported",
      maxToolSteps: 0,
      isKnownModel: false,
      isCustomModel: false
    });

    const snapshotJson = JSON.stringify(
      agentModelPolicySnapshotFor({
        provider: "openai",
        model: "custom-router"
      })
    );
    expect(isAgentModelPolicySnapshot(JSON.parse(snapshotJson))).toBe(true);
    expect(snapshotJson).not.toContain("apiKey");
    expect(snapshotJson).not.toContain("customBaseUrl");
  });
});
describe("function call registry", () => {
  test("keeps write tool rollback policy and display metadata in the shared registry", () => {
    const executeCommandsSpecZh = getFunctionCallSpec("executeGeoGebraCommands", "zh-CN");
    const executeCommandsSpecEn = getFunctionCallSpec("executeGeoGebraCommands", "en-US");
    const executeCommandsDescriptionZh = String(executeCommandsSpecZh.description);
    const executeCommandsDescriptionEn = String(executeCommandsSpecEn.description);
    expect(getFunctionCallSpec("executeGeoGebraCommands")).toMatchObject({
      description: expect.stringContaining("不要用 Delete(...) 清理旧画布"),
      sideEffectLevel: "write",
      rollbackPolicy: "rollback_on_error",
      display: {
        label: "构造画布",
        done: "构造完成"
      }
    });
    expect(executeCommandsDescriptionZh.includes(geogebraCanvasVisualGuidance("zh-CN"))).toBe(true);
    expect(executeCommandsDescriptionZh).toContain("StartAnimation");
    expect(executeCommandsDescriptionZh).toContain("静态图形不要强行播放");
    expect(executeCommandsDescriptionZh).toContain("单批命令优先控制在 100 条以内");
    expect(executeCommandsDescriptionZh).toContain("多对象返回命令必须先验证实际 label");
    expect(executeCommandsDescriptionZh).toContain("具体方向约定由当前题型 skill 决定");
    expect(executeCommandsDescriptionZh).not.toContain("Angle(XaxisRef, O, Pθ)");
    expect(executeCommandsDescriptionZh).not.toContain("#0072B2");
    expect(
      String(getFunctionCallInputJsonSchema("executeGeoGebraCommands").properties.commands.description).includes(
        geogebraCanvasVisualGuidance("zh-CN")
      )
    ).toBe(true);
    expect(String(getFunctionCallInputJsonSchema("executeGeoGebraCommands").properties.commands.description)).toContain("StartAnimation");
    expect(getFunctionCallSpec("setPerspective").description).toContain("T=3D Graphics");
    expect(getFunctionCallSpec("setPerspective").description).toContain("S/(GA)");
    expect(getFunctionCallSpec("setPerspective").description).toContain("+D");
    expect(getFunctionCallInputJsonSchema("setPerspective").properties.mode.description).toContain("Use T for 3D Graphics");
    expect(getFunctionCallInputJsonSchema("setPerspective").properties.mode.description).toContain("+Tools");
    expect(getFunctionCallSpec("executeGeoGebraCommands", "en-US")).toMatchObject({
      description: expect.stringContaining("Do not use Delete(...)"),
      display: {
        label: "Construct on canvas",
        done: "Construction complete"
      }
    });
    expect(executeCommandsDescriptionEn.includes(geogebraCanvasVisualGuidance("en-US"))).toBe(true);
    expect(executeCommandsDescriptionEn).toContain("StartAnimation");
    expect(executeCommandsDescriptionEn).toContain("static diagrams");
    expect(executeCommandsDescriptionEn).toContain("prefer at most 100 commands per batch");
    expect(executeCommandsDescriptionEn).toContain("verify actual labels before styling");
    expect(executeCommandsDescriptionEn).toContain("direction conventions belong to the active task skill");
    expect(executeCommandsDescriptionEn).not.toContain("Angle(XaxisRef, O, Pθ)");
    expect(executeCommandsDescriptionEn).not.toContain("#0072B2");
    expect(
      String(getFunctionCallInputJsonSchema("executeGeoGebraCommands", "en-US").properties.commands.description).includes(
        geogebraCanvasVisualGuidance("en-US")
      )
    ).toBe(true);
    expect(String(getFunctionCallInputJsonSchema("executeGeoGebraCommands", "en-US").properties.commands.description)).toContain("StartAnimation");
    expect(getFunctionCallSpec("setPerspective", "en-US").description).toContain("3D Graphics uses code T");
    expect(getFunctionCallInputJsonSchema("searchGeoGebraCommands", "en-US").properties.query.description).toContain("GeoGebra command search keywords");
    expect(getFunctionCallInputJsonSchema("searchGeoGebraCommands").required).toContain("scope");
    expect(getFunctionCallInputJsonSchema("searchGeoGebraCommands", "en-US").properties.scope.description).toContain("Required search scope");
    expect(getFunctionCallInputJsonSchema("createGeometryPlan", "en-US").properties.sourceText.description).toContain("Original problem statement");
    expect(getFunctionCallInputJsonSchema("setPerspective", "en-US").properties.mode.description).toContain("Localized aliases");
    expect(getFunctionCallInputJsonSchema("setPerspective", "en-US").properties.mode.description).not.toContain("画板");
    expect(getFunctionCallSpec("showChoiceAnalysis").description).toContain("A/B/C/D");
    expect(getFunctionCallInputJsonSchema("showChoiceAnalysis").properties.choices.description).toContain("分别分析选项");
    expect(getFunctionCallInputJsonSchema("showChoiceAnalysis", "en-US").properties.choices.description).toContain("Analyze A/B/C/D separately");
    expect(getFunctionCallInputJsonSchema("showChoiceAnalysis").properties.choices.items?.properties?.commands.description).toContain("公共底图");
    expect(getFunctionCallInputJsonSchema("showChoiceAnalysis", "en-US").properties.choices.items?.properties?.commands.description).toContain("restores the base canvas");
    expect(getFunctionCallSpec("showSelectedElements").description).toContain("选中的对象");
    expect(getFunctionCallSpec("showSelectedElements", "en-US").description).toContain("currently selected");
    expect(getFunctionCallInputJsonSchema("showSelectedElements").properties.elements.description).toContain("选中的对象");
    expect(getFunctionCallInputJsonSchema("showSelectedElements", "en-US").properties.elements.description).toContain("currently selected");
    expect(getFunctionCallToolNames().filter((toolName) => getFunctionCallSpec(toolName).description.length === 0)).toEqual([]);
    for (const locale of ["zh-CN", "en-US"] as const) {
      const copy = rendererI18n(locale);
      for (const toolName of getFunctionCallToolNames()) {
        expect(copy.chat.toolActivities[toolName]).toBeTruthy();
        expect(copy.chat.toolActivities[toolName]).not.toBe(toolName);
      }
    }
    for (const toolName of getFunctionCallToolNames()) {
      const schemaZh = getFunctionCallModelInputJsonSchema(toolName, "zh-CN");
      const schemaEn = getFunctionCallModelInputJsonSchema(toolName, "en-US");
      expect(schemaZh.properties.reason.description).toContain("必填");
      expect(schemaEn.properties.reason.description).toContain("Required");
      expect(schemaZh.required).toContain("reason");
      expect(schemaEn.required).toContain("reason");
    }
  });

  test("keeps shared 2D and 3D canvas visual guidance in prompts and tool metadata", () => {
    expect(geogebraCanvasVisualGuidance("zh-CN")).toContain("普通 2D Graphics 默认保持 GeoGebra 视觉样式");
    expect(geogebraCanvasVisualGuidance("zh-CN")).toContain("已激活 skill/visual profile");
    expect(geogebraCanvasVisualGuidance("zh-CN")).toContain("场景规则属于被选中的 skill");
    expect(geogebraCanvasVisualGuidance("en-US")).toContain("keep ordinary 2D Graphics on GeoGebra defaults");
    expect(geogebraCanvasVisualGuidance("en-US")).toContain("active skill/visual profile");
    expect(geogebraCanvasVisualGuidance("en-US")).toContain("Scenario-specific style rules");
    expect(geogebraSemanticColorPaletteGuidance("zh-CN")).toContain("#0072B2");
    expect(geogebraSemanticColorPaletteGuidance("en-US")).toContain("colorblind-safe semantic palette");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain(geogebraCanvasVisualGuidance("zh-CN"));
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain(geogebraCanvasVisualGuidance("en-US"));
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("样式命令必须服务于用户明确外观需求或当前已激活 skill/visual profile");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("Style commands must serve an explicit appearance request");
    expect(GEOCHAT_SYSTEM_PROMPT).not.toContain("Angle(XaxisRef, O, Pθ)");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).not.toContain("Angle(XaxisRef, O, Pθ)");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("每次收到题目后直接执行可视化主路径");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("必须走画板路线");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("并产出一个画板构造");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("不要因为题目也能用代数、公式或文字解出就跳过画板");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("将题目坐标化、函数化、图形化");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("即使题目偏符号运算");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("也必须使用数轴、坐标平面");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("最小可视化表达");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("完成动态表达检查");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("没有动态变量时继续完成静态画板构造");
    expect(GEOCHAT_SYSTEM_PROMPT).not.toContain("text-only");
    expect(GEOCHAT_SYSTEM_PROMPT).not.toContain("兜底条件");
    expect(GEOCHAT_SYSTEM_PROMPT).not.toContain("无法形成有效可视化构造");
    expect(GEOCHAT_SYSTEM_PROMPT).not.toContain("每次收到题目后先做可视化价值判断");
    expect(GEOCHAT_SYSTEM_PROMPT).not.toContain("即使题目偏符号运算，也要尝试");
    expect(GEOCHAT_SYSTEM_PROMPT).not.toContain("如果动态表达不适合");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("优先调用 showAnimationGuide");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("directly execute the visualization main path");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("must take the canvas route");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("produce a canvas construction");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("Do not skip the canvas just because the problem can also be solved");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("Convert the problem into coordinate modeling");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("Even for symbolic manipulation problems");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("use a number line, coordinate plane");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("minimal visual expression");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("Complete the dynamic-expression check");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("continue with a static canvas construction");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).not.toContain("text-only");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).not.toContain("fallback condition");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).not.toContain("first judge its visualization value");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).not.toContain("try to provide a minimal visual expression");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).not.toContain("if dynamic expression is not suitable");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("prefer showAnimationGuide");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("StartAnimation(参数或动点, true)");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("纯静态图形不要强行播放");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("showChoiceAnalysis");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("每个选项当作独立 scenario");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("公共底图独立执行");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("showSelectedElements");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("selectedObjects");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("StartAnimation(parameter or moving point, true)");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("static diagrams");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("showChoiceAnalysis");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("every choice as its own scenario");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("run independently from the shared base construction");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("showSelectedElements");
    expect(GEOCHAT_SYSTEM_PROMPT_EN).toContain("selectedObjects");
  });

  test("derives planning, renderer executable, and remote bridge tool sets from the shared registry", () => {
    expect(getFunctionCallToolNames()).toEqual([
      "searchGeoGebraCommands",
      "readBlackboard",
      "patchBlackboard",
      "listSkills",
      "searchSkills",
      "loadSkill",
      "activateSkill",
      "createGeometryPlan",
      "executeAdvancedDrawingCommand",
      "executeGeoGebraCommands",
      "resetCanvas",
      "getCanvasContext",
      "getPNGBase64",
      "showSolutionSteps",
      "showTeachingHint",
      "showAnimationGuide",
      "showChoiceAnalysis",
      "showSelectedElements",
      "setFinished",
      "setPerspective"
    ]);
    expect(getFunctionCallPlanningToolNames()).toEqual(getFunctionCallToolNames());
    expect(getFunctionCallToolNames().filter(isFunctionCallBackendExecutable)).toEqual([
      "searchGeoGebraCommands",
      "readBlackboard",
      "patchBlackboard",
      "listSkills",
      "searchSkills",
      "loadSkill",
      "activateSkill",
      "createGeometryPlan",
      "executeAdvancedDrawingCommand",
      "showSolutionSteps",
      "showTeachingHint",
      "showAnimationGuide",
      "showChoiceAnalysis",
      "showSelectedElements",
      "setFinished"
    ]);
    expect(getFunctionCallBackendExecutableToolNames()).toEqual([
      "searchGeoGebraCommands",
      "readBlackboard",
      "patchBlackboard",
      "listSkills",
      "searchSkills",
      "loadSkill",
      "activateSkill",
      "createGeometryPlan",
      "executeAdvancedDrawingCommand",
      "showSolutionSteps",
      "showTeachingHint",
      "showAnimationGuide",
      "showChoiceAnalysis",
      "showSelectedElements"
    ]);
    expect(getFunctionCallToolNames().filter(isFunctionCallRendererExecutable)).toEqual([
      "executeGeoGebraCommands",
      "resetCanvas",
      "getCanvasContext",
      "getPNGBase64",
      "setPerspective"
    ]);
    expect(getFunctionCallRemoteBridgeToolNames()).toEqual([
      "executeGeoGebraCommands",
      "resetCanvas",
      "getCanvasContext",
      "getPNGBase64",
      "setPerspective"
    ]);
  });

  test("validates tool args against the shared input schema", () => {
    expect(isFunctionCallArgs("searchGeoGebraCommands", { query: "circle", scope: "conic" })).toBe(true);
    expect(isFunctionCallArgs("searchGeoGebraCommands", { query: "circle" })).toBe(false);
    expect(isFunctionCallArgs("searchGeoGebraCommands", { query: "circle", scope: "unknown" })).toBe(false);
    expect(isFunctionCallArgs("executeGeoGebraCommands", { commands: ["A = (0, 0)"] })).toBe(true);
    expect(isFunctionCallArgs("executeGeoGebraCommands", { commands: [] })).toBe(false);
    expect(isFunctionCallArgs("executeGeoGebraCommands", { commands: "A = (0, 0)" })).toBe(false);
    expect(isFunctionCallArgs("resetCanvas", {})).toBe(true);
    expect(isFunctionCallArgs("resetCanvas", { perspective: "T" })).toBe(true);
    expect(isFunctionCallArgs("createGeometryPlan", { recipeId: "function.parabola.vertex", inputs: { expression: "x^2" } })).toBe(true);
    expect(isFunctionCallArgs("executeAdvancedDrawingCommand", { name: "drawTetrahedronCircumsphere" })).toBe(true);
    expect(isFunctionCallArgs("executeAdvancedDrawingCommand", {
      name: "drawUnitCircleTrigProjection",
      args: {
        angleDegrees: { kind: "ggb_expr", expr: "theta", evaluation: "dynamic" }
      }
    })).toBe(true);
    const advancedArgsDescription = String(getFunctionCallInputJsonSchema("executeAdvancedDrawingCommand").properties.args.description);
    expect(advancedArgsDescription).toContain("ggb_expr");
    expect(advancedArgsDescription).toContain("dynamic");
    expect(advancedArgsDescription).toContain("snapshot");
    expect(advancedArgsDescription).toContain("禁止");
    expect(isFunctionCallArgs("executeAdvancedDrawingCommand", { name: "unknownAdvancedCommand" })).toBe(false);
    expect(isFunctionCallArgs("activateSkill", { name: "geometry-proof" })).toBe(true);
    expect(isFunctionCallArgs("activateSkill", { path: "../geometry-proof" })).toBe(false);
    expect(isFunctionCallArgs("listSkills", { limit: 5 })).toBe(true);
    expect(isFunctionCallArgs("searchSkills", { query: "solid geometry", tags: ["3d"] })).toBe(true);
    expect(isFunctionCallArgs("loadSkill", { name: "geometry-proof" })).toBe(true);
    expect(isFunctionCallArgs("loadSkill", { path: "../geometry-proof" })).toBe(false);
    expect(isFunctionCallArgs("createGeometryPlan", { recipeId: "unknown.recipe", inputs: {} })).toBe(false);
    expect(isFunctionCallArgs("createGeometryPlan", { recipeId: "", inputs: {} })).toBe(false);
    expect(isFunctionCallArgs("setPerspective", { mode: "T" })).toBe(true);
    expect(isFunctionCallArgs("setFinished", { summary: "完成。" })).toBe(true);
    expect(isFunctionCallArgs("setFinished", {})).toBe(false);
    expect(isFunctionCallArgs("setPerspective", { mode: "+D" })).toBe(true);
    expect(isFunctionCallArgs("showSolutionSteps", { title: "步骤", answer: "完成", steps: [{ label: "构造", body: "作圆" }] })).toBe(true);
    expect(isFunctionCallArgs("showChoiceAnalysis", {
      title: "选项分析",
      summary: "题干公共条件为同一组几何对象。",
      choices: [
        { label: "A", statement: "结论 A", verdict: "true", explanation: "由公共条件可推出。" },
        { label: "B", statement: "结论 B", verdict: "false", explanation: "与公共条件矛盾。" }
      ]
    })).toBe(true);
    expect(isFunctionCallArgs("showSelectedElements", {
      title: "当前选中元素",
      summary: "用户当前选中了点 A 和线段 s。",
      elements: [
        { label: "A", type: "point", description: "三角形顶点", role: "要移动的点" },
        { label: "s", type: "segment", description: "边 AB" }
      ]
    })).toBe(true);
    expect(isFunctionCallArgs("showSelectedElements", {
      title: "当前选中元素",
      summary: "缺少对象。",
      elements: []
    })).toBe(false);
  });

  test("accepts every registered tool name in model step output records", () => {
    for (const toolName of getFunctionCallToolNames()) {
      expect(isAgentRunModelStepRecord({
        stepId: `step-${toolName}`,
        runId: "run-model-step-tools",
        stage: "runner_continuation",
        source: "model",
        status: "succeeded",
        modelProvider: "openai",
        modelId: "gpt-5.5",
        startedAt: "2026-06-06T00:00:00.000Z",
        completedAt: "2026-06-06T00:00:01.000Z",
        durationMs: 1000,
        inputToolCount: 1,
        attachmentCount: 0,
        outputType: "tool",
        outputToolCallId: `call-${toolName}`,
        outputToolName: toolName,
        outputTextLength: null,
        usage: null,
        error: null
      })).toBe(true);
    }
  });

  test("discovers built-in skills and remote manifest skills", async () => {
    const baseEnv = {
      ...process.env,
      GEOCHAT_SKILLS_DIR: "",
      GEOCHAT_SKILLS_DIRS: "",
      GEOCHAT_REMOTE_SKILL_MANIFEST_URLS: "",
      GEOCHAT_REMOTE_SKILLS_MANIFEST_URLS: "",
      GEOCHAT_REMOTE_SKILLS_CACHE_DIR: "",
      GEOCHAT_REMOTE_SKILLS_CACHE_DIRS: "",
      GEOCHAT_BUNDLED_SKILLS_DIRS: "",
      GEOCHAT_DESKTOP_RESOURCE_ROOT: ""
    };
    const builtIns = await listAvailableAgentSkills(baseEnv);
    expect(builtIns).toContainEqual(
      expect.objectContaining({
        name: "plane-geometry",
        source: "built-in",
        category: "high-school-plane-geometry",
        tags: expect.arrayContaining(["平面几何"]),
        tools: expect.arrayContaining(["createGeometryPlan"])
      })
    );

    const cacheRoot = await mkdtemp(join(tmpdir(), "geochat-remote-skills-"));
    const manifestUrl = "https://skills.example/geochat-skills.json";
    const skillUrl = "https://skills.example/remote-trig/SKILL.md";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === manifestUrl) {
        return new Response(
          JSON.stringify({
            skills: [
              {
                name: "remote-trig",
                description: "Remote trigonometric visualization workflow.",
                url: skillUrl,
                category: "high-school-functions",
                tags: ["三角函数", "远程技能"],
                tools: ["executeGeoGebraCommands", "showAnimationGuide"]
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (url === skillUrl) {
        return new Response("# Remote Trig\n\nUse the unit circle and function graph before solving.", { status: 200 });
      }
      return new Response("missing", { status: 404 });
    }) as typeof fetch;
    try {
      const remoteEnv = {
        ...baseEnv,
        GEOCHAT_REMOTE_SKILLS_MANIFEST_URLS: manifestUrl,
        GEOCHAT_REMOTE_SKILLS_CACHE_DIR: cacheRoot
      };
      const skills = await listAvailableAgentSkills(remoteEnv);
      expect(skills).toContainEqual(
        expect.objectContaining({
          name: "remote-trig",
          source: "remote",
          category: "high-school-functions",
          tags: expect.arrayContaining(["远程技能"]),
          tools: expect.arrayContaining(["showAnimationGuide"])
        })
      );
      await expect(activateAgentSkill("remote-trig", remoteEnv)).resolves.toMatchObject({
        name: "remote-trig",
        source: "remote",
        markdown: expect.stringContaining("# Remote Trig"),
        toolInstructions: expect.arrayContaining([expect.stringContaining("showAnimationGuide")])
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("parses per-run skill policy for the temporary selector", () => {
    const policy = skillRuntimePolicyFromPrompt([
      "题目：画一个四面体外接球。",
      "【Agent Skill 策略】",
      "本轮技能策略优先于默认技能目录说明。",
      "允许使用的技能：solid-geometry、sphere、pyramid-circumsphere。",
      "自动加载：开启。",
      "可视化表达策略：spatial-3d。"
    ].join("\n"));

    expect(policy).toEqual({
      enabled: true,
      autoActivate: true,
      allowedSkillNames: ["solid-geometry", "sphere", "pyramid-circumsphere"],
      visualProfile: "spatial-3d"
    });
    expect(skillRuntimePolicyFromPrompt("Agent Skills are disabled for this run.")).toMatchObject({
      enabled: false,
      autoActivate: false
    });
  });

  test("formats a compressed skill packet for the main agent without re-injecting the catalog", () => {
    const prompt = formatSkillSelectionPacketPrompt({
      status: "selected",
      visualProfile: "spatial-3d",
      curriculumNodes: [
        {
          id: "pep-senior-a-compulsory-2-solid",
          source: "pep",
          stage: "senior",
          edition: "人教A版",
          book: "必修第二册",
          chapter: "立体几何初步",
          skillIds: ["solid-geometry", "sphere", "pyramid-circumsphere"],
          recipeIds: ["3d-skeleton-first", "center-radius-constraint", "base-circumcenter-axis"],
          visualProfiles: ["spatial-3d"],
          reason: "四面体外接球属于高中立体几何初步。"
        }
      ],
      selectedSkills: [
        {
          name: "pyramid-circumsphere",
          parent: "solid-geometry",
          level: 2,
          recipes: ["base-circumcenter-axis", "equal-distance-center-solve"],
          reason: "四面体外接球需要先定位球心和等距约束。"
        }
      ],
      enabledAdvancedTools: ["drawTetrahedronCircumsphere"],
      selectorReason: "题目目标直接匹配四面体外接球构造。",
      injectedContext: "优先用底面外心轴和等距方程组织构图。"
    }, "zh-CN");

    expect(prompt).toContain("【预选 Agent Skill Packet】");
    expect(prompt).toContain("教材定位：");
    expect(prompt).toContain("人教A版必修第二册 / 立体几何初步");
    expect(prompt).toContain("pyramid-circumsphere");
    expect(prompt).toContain("base-circumcenter-axis");
    expect(prompt).toContain("已解锁高级绘图命令");
    expect(prompt).toContain("drawTetrahedronCircumsphere");
    expect(prompt).toContain("参数：sideLength:number, coordinates:point3d-list");
    expect(prompt).toContain("前提：四个顶点必须构成非退化四面体。");
    expect(prompt).toContain("不变量：球心到四个顶点距离相等。");
    expect(prompt).toContain("压缩指导：优先用底面外心轴和等距方程组织构图。");
    expect(prompt).toContain("不要再次调用 listSkills、searchSkills、loadSkill 或 activateSkill");
    expect(prompt).not.toContain("可用 Agent Skills");
    expect(prompt).not.toContain("七年级上册");
  });

  test("strips skill policy text before curriculum and skill routing", () => {
    const prompt = [
      "画一个正方体展开成平面展开图的动画。",
      "",
      "【Agent Skill 策略】",
      "允许使用的技能：analytic-geometry-conic、derivative-application、solid-geometry、prism。",
      "自动加载：开启。",
      "",
      "GeoChat 工作记忆黑板（结构化上下文）：",
      "- 当前画板：对象 0 个"
    ].join("\n");

    const routingPrompt = agentRoutingPrompt(prompt);

    expect(routingPrompt).toContain("正方体展开");
    expect(routingPrompt).toContain("GeoChat 工作记忆黑板");
    expect(routingPrompt).not.toContain("Agent Skill 策略");
    expect(routingPrompt).not.toContain("analytic-geometry-conic");
    expect(routingPrompt).not.toContain("derivative-application");
  });

  test("omits skill discovery tools after host skill selector packet is available", () => {
    const tools = createBackendPlanningTools("zh-CN", [], {
      status: "selected",
      visualProfile: "spatial-3d",
      curriculumNodes: [],
      selectedSkills: [
        {
          name: "solid-geometry",
          recipes: ["3d-skeleton-first"],
          reason: "Matched solid geometry."
        }
      ],
      enabledAdvancedTools: [],
      selectorReason: "Selected by host selector.",
      injectedContext: "Use 3D skeleton first."
    }, { tools: [{ toolName: "getCanvasContext", status: "succeeded" }] });

    expect(Object.keys(tools)).not.toEqual(expect.arrayContaining(["listSkills", "searchSkills", "loadSkill", "activateSkill"]));
    expect(Object.keys(tools)).not.toEqual(expect.arrayContaining(["readBlackboard", "patchBlackboard"]));
    expect(Object.keys(tools)).toContain("executeGeoGebraCommands");
    expect(Object.keys(tools)).not.toContain("searchGeoGebraCommands");
  });

  test("exposes blackboard tools after drawing work has started", () => {
    const tools = createBackendPlanningTools("zh-CN", [], undefined, {
      tools: [
        { toolName: "getCanvasContext", status: "succeeded" },
        { toolName: "executeGeoGebraCommands", status: "succeeded" }
      ]
    });

    expect(Object.keys(tools)).toEqual(expect.arrayContaining(["readBlackboard", "patchBlackboard"]));
  });

  test("builds a preflight command packet from selected skills for the main agent", () => {
    const skillSelection = {
      status: "selected" as const,
      visualProfile: "spatial-3d",
      curriculumNodes: [
        {
          id: "pep-senior-a-compulsory-2-solid",
          source: "pep" as const,
          stage: "senior" as const,
          edition: "人教A版",
          book: "必修第二册",
          chapter: "立体几何初步",
          skillIds: ["solid-geometry", "sphere", "pyramid-circumsphere"],
          recipeIds: ["3d-skeleton-first", "center-radius-constraint", "base-circumcenter-axis"],
          visualProfiles: ["spatial-3d"],
          reason: "四面体外接球属于高中立体几何初步。"
        }
      ],
      selectedSkills: [
        {
          name: "pyramid-circumsphere",
          parent: "solid-geometry",
          level: 2,
          recipes: ["base-circumcenter-axis", "equal-distance-center-solve"],
          reason: "四面体外接球需要先定位球心和等距约束。"
        }
      ],
      enabledAdvancedTools: ["drawTetrahedronCircumsphere"],
      selectorReason: "题目目标直接匹配四面体外接球构造。",
      injectedContext: "优先用底面外心轴和等距方程组织构图。"
    };

    const packet = buildCommandReferencePacketForRun({
      prompt: "画一个正四面体并作出它的外接球，标出球心和半径。",
      locale: "zh-CN",
      skillSelection
    });
    const prompt = formatCommandReferencePacketPrompt(packet, "zh-CN");

    expect(packet.status).toBe("selected");
    expect(packet.queryIntents.map((intent) => intent.scope)).toContain("geometry-3d");
    expect(packet.references.map((item) => item.command)).toEqual(expect.arrayContaining(["Sphere", "Segment", "Polygon"]));
    expect(packet.injectedContext).toContain("Sphere");
    expect(prompt).toContain("【预检 GeoGebra 命令参考 Packet】");
    expect(prompt).toContain("Sphere");
    expect(prompt).toContain("GeoGebra 5");
    expect(prompt).toContain("不要再次调用 searchGeoGebraCommands");
  });

  test("preloads viewport command references for post-processing skills", () => {
    const packet = buildCommandReferencePacketForRun({
      prompt: "三棱柱已经画好了，调整一下摄像机位置和整体缩放，避免右侧顶点被裁剪。",
      locale: "zh-CN",
      skillSelection: {
        status: "selected",
        visualProfile: "spatial-3d",
        curriculumNodes: [],
        selectedSkills: [
          {
            name: "camera-framing",
            parent: "visual-post-processing",
            level: 2,
            recipes: ["3d-camera-after-skeleton", "avoid-occlusion-and-cropping"],
            reason: "需要在 3D 构造完成后调整摄像机和取景。"
          },
          {
            name: "viewport-scale-composition",
            parent: "visual-post-processing",
            level: 2,
            recipes: ["uniform-zoom-bounds", "preserve-one-to-one-axis-ratio"],
            reason: "需要等比缩放并避免裁剪。"
          }
        ],
        enabledAdvancedTools: [],
        selectorReason: "这是主体构造后的视觉后处理任务。",
        injectedContext: "先读取画布，再做视角和缩放调整。"
      }
    });

    expect(packet.status).toBe("selected");
    expect(packet.queryIntents.map((intent) => intent.scope)).toContain("global");
    expect(packet.references.map((item) => item.command)).toEqual(expect.arrayContaining([
      "SetPerspective",
      "ZoomIn",
      "SetAxesRatio"
    ]));
    expect(formatCommandReferencePacketPrompt(packet, "zh-CN")).toContain("视角、取景或缩放后处理");
  });

  test("preloads viewport command references for 2D post-processing", () => {
    const packet = buildCommandReferencePacketForRun({
      prompt: "二次函数图像已经画好了，调整一下整体缩放和居中位置，不要让顶点标签被边缘裁剪。",
      locale: "zh-CN",
      skillSelection: {
        status: "selected",
        visualProfile: "exam-clean",
        curriculumNodes: [],
        selectedSkills: [
          {
            name: "viewport-scale-composition",
            parent: "visual-post-processing",
            level: 2,
            recipes: ["uniform-zoom-bounds", "center-important-objects"],
            reason: "2D 图像需要等比缩放、居中和留白。"
          }
        ],
        enabledAdvancedTools: [],
        selectorReason: "这是 2D 函数图像的视觉后处理任务。",
        injectedContext: "用等比缩放和居中改善可读性。"
      }
    });

    expect(packet.status).toBe("selected");
    expect(packet.queryIntents.map((intent) => intent.scope)).toContain("global");
    expect(packet.references.map((item) => item.command)).toEqual(expect.arrayContaining([
      "CenterView",
      "ZoomIn",
      "SetAxesRatio"
    ]));
  });

  test("keeps GeoGebra command execution interval at 80ms", async () => {
    const source = await readFile(join(process.cwd(), "src/renderer/src/geogebra-execution.ts"), "utf8");

    expect(commandExecutionIntervalMs).toBe(80);
    expect(source).toContain("commandDelayMs: filteredCommands.length > 1 ? commandExecutionIntervalMs : 0");
  });

  test("instructs the temporary skill selector to choose from prebuilt candidate context", () => {
    const prompt = skillSelectorSystemPrompt("zh-CN");
    const promptEn = skillSelectorSystemPrompt("en-US");

    expect(prompt).toContain("从压缩 Candidate Skill Context 中选择技能");
    expect(prompt).toContain("Candidate Skill Context");
    expect(prompt).toContain("后端已经用代码完成确定性的 list/search/load 流程");
    expect(prompt).toContain("不要请求工具");
    expect(prompt).toContain("不要选择 skillBriefs 之外的技能");
    expect(prompt).toContain("技能选择要按互补关系装配");
    expect(prompt).toContain("后端会在你选择后读取对应 SKILL.md");
    expect(prompt).toContain("最多选择三个教材节点和三个技能");

    expect(promptEn).toContain("choose from a compact Candidate Skill Context");
    expect(promptEn).toContain("Candidate Skill Context");
    expect(promptEn).toContain("deterministic list/search/load pipeline");
    expect(promptEn).toContain("Do not ask for tools");
    expect(promptEn).toContain("outside the provided skillBriefs");
    expect(promptEn).toContain("Choose skills as a complementary set");
    expect(promptEn).toContain("load selected SKILL.md files");
    expect(promptEn).toContain("at most three curriculum nodes and at most three skills");
  });

  test("loads cached remote skills from bundled and user cache roots", async () => {
    const bundleRoot = await mkdtemp(join(tmpdir(), "geochat-bundled-skill-cache-"));
    const userCacheRoot = await mkdtemp(join(tmpdir(), "geochat-user-skill-cache-"));
    const bundledSkillDir = join(bundleRoot, "vendor", "agent-skills", "bundled-plane");
    const userSkillDir = join(userCacheRoot, "user-linear");
    await mkdir(bundledSkillDir, { recursive: true });
    await mkdir(userSkillDir, { recursive: true });
    await writeFile(
      join(bundledSkillDir, "SKILL.md"),
      [
        "---",
        "name: bundled-plane",
        "description: Bundled plane geometry cache skill.",
        "category: high-school-plane-geometry",
        "tags: [bundle-cache]",
        "tools: [createGeometryPlan]",
        "---",
        "",
        "# Bundled Plane"
      ].join("\n")
    );
    await writeFile(
      join(userSkillDir, "SKILL.md"),
      [
        "---",
        "name: user-linear",
        "description: User cached linear programming skill.",
        "category: high-school-functions",
        "tags: [user-cache]",
        "tools: [showAnimationGuide]",
        "---",
        "",
        "# User Linear"
      ].join("\n")
    );

    const cacheEnv = {
      ...process.env,
      GEOCHAT_SKILLS_DIR: "",
      GEOCHAT_SKILLS_DIRS: "",
      GEOCHAT_REMOTE_SKILL_MANIFEST_URLS: "",
      GEOCHAT_REMOTE_SKILLS_MANIFEST_URLS: "",
      GEOCHAT_DESKTOP_RESOURCE_ROOT: bundleRoot,
      GEOCHAT_REMOTE_SKILLS_CACHE_DIR: userCacheRoot,
      GEOCHAT_REMOTE_SKILLS_CACHE_DIRS: ""
    };
    const skills = await listAvailableAgentSkills(cacheEnv);
    expect(skills).toContainEqual(
      expect.objectContaining({
        name: "bundled-plane",
        source: "remote",
        path: bundledSkillDir,
        tags: expect.arrayContaining(["bundle-cache"])
      })
    );
    expect(skills).toContainEqual(
      expect.objectContaining({
        name: "user-linear",
        source: "remote",
        path: userSkillDir,
        tags: expect.arrayContaining(["user-cache"])
      })
    );
    await expect(activateAgentSkill("bundled-plane", cacheEnv)).resolves.toMatchObject({
      name: "bundled-plane",
      markdown: expect.stringContaining("# Bundled Plane")
    });
    await expect(activateAgentSkill("user-linear", cacheEnv)).resolves.toMatchObject({
      name: "user-linear",
      markdown: expect.stringContaining("# User Linear")
    });
  });

  test("parses platform and Windows-style skill path lists without splitting drive letters", () => {
    expect(parseAgentSkillPathList("C:\\GeoChat\\skills;D:\\GeoChat\\more-skills")).toEqual([
      "C:\\GeoChat\\skills",
      "D:\\GeoChat\\more-skills"
    ]);
    if (delimiter === ":") {
      expect(parseAgentSkillPathList("/opt/geochat/skills:/tmp/geochat/skills")).toEqual([
        "/opt/geochat/skills",
        "/tmp/geochat/skills"
      ]);
    }
    expect(parseAgentSkillPathList("C:\\GeoChat\\skills\nD:\\GeoChat\\more-skills")).toEqual([
      "C:\\GeoChat\\skills",
      "D:\\GeoChat\\more-skills"
    ]);
  });

  test("normalizes GeoGebra perspective aliases to manual SetPerspective codes", () => {
    expect(normalizeGeoGebraPerspectiveMode("3D")).toMatchObject({ code: "T", kind: "layout" });
    expect(normalizeGeoGebraPerspectiveMode("三维视图")).toMatchObject({ code: "T", kind: "layout" });
    expect(normalizeGeoGebraPerspectiveMode("画板")).toMatchObject({ code: "G", kind: "layout" });
    expect(normalizeGeoGebraPerspectiveMode("代数")).toMatchObject({ code: "AG", kind: "layout" });
    expect(normalizeGeoGebraPerspectiveMode("AGS")).toMatchObject({ code: "AGS", kind: "layout" });
    expect(normalizeGeoGebraPerspectiveMode("S/(GA)")).toMatchObject({ code: "S/(GA)", kind: "layout" });
    expect(normalizeGeoGebraPerspectiveMode("+graphics2")).toMatchObject({ code: "+D", kind: "view_toggle" });
    expect(normalizeGeoGebraPerspectiveMode("-T")).toMatchObject({ code: "-T", kind: "view_toggle" });
    expect(normalizeGeoGebraPerspectiveMode("5")).toMatchObject({ code: "5", kind: "standard" });
    expect(normalizeGeoGebraPerspectiveMode("not-a-view")).toBeUndefined();
  });

  test("declares free symbolic parameters before dependent GeoGebra commands", () => {
    expect(
      normalizeGeoGebraFreeParameterCommands([
        "A = (0,0,0)",
        "B = (2,0,0)",
        "M = (0, 2-2λ, 2μ)",
        "ShowLabel(M, true)"
      ])
    ).toEqual([
      "A = (0,0,0)",
      "B = (2,0,0)",
      "λ = 0.5",
      "μ = 0.5",
      "M = (0, 2-2λ, 2μ)",
      "ShowLabel(M, true)"
    ]);
    expect(normalizeGeoGebraFreeParameterCommands(["P = (t, 1-t)", "Q = (x, x^2)"])).toEqual([
      "t = 0.5",
      "P = (t, 1-t)",
      "Q = (x, x^2)"
    ]);
    expect(normalizeGeoGebraFreeParameterCommands(["M = (0, 2-2λ, 2μ)"], { declaredNames: ["C"] })).toEqual([
      "λ = 0.5",
      "μ = 0.5",
      "M = (0, 2-2λ, 2μ)"
    ]);
    expect(normalizeGeoGebraFreeParameterCommands(["M = (0, 2-2C, 2μ)"], { declaredNames: ["C"] })).toEqual([
      "μ = 0.5",
      "M = (0, 2-2C, 2μ)"
    ]);
    expect(normalizeGeoGebraFreeParameterCommands(["symAxis: x = 0", "SetColor(symAxis, 0, 0, 255)"])).toEqual([
      "symAxis: x = 0",
      "SetColor(symAxis, 0, 0, 255)"
    ]);
    expect(normalizeGeoGebraFreeParameterCommands([
      "f(x) = 2^(abs(x)) - 4",
      "Intersect(f, xAxis, -5, 0)",
      "Intersect(f, y轴)"
    ])).toEqual([
      "f(x) = 2^(abs(x)) - 4",
      "Intersect(f, xAxis, -5, 0)",
      "Intersect(f, y轴)"
    ]);
    expect(normalizeGeoGebraFreeParameterCommands(["max1 = (-2 + sqrt(5), 16)", "SetPointSize(max1, 8)"])).toEqual([
      "max1 = Point((-2 + sqrt(5), 16))",
      "SetPointSize(max1, 8)"
    ]);
    expect(
      normalizeGeoGebraFreeParameterCommands([
        "SetColor(c, blue)",
        "SetOpacity(poly, 0.25)",
        "HideLabel(aux)",
        "E = Maximum(f)",
        "SetColor(face, 10, 20, 30, 0.4)",
        "a = Slider(0, 10, 1, \"a\")",
        "v = Vector(2, 3)",
        "solid = 棱锥(base, Apex)"
      ], { declaredNames: ["c", "poly", "aux", "f", "face", "base", "Apex"] })
    ).toEqual([
      "SetColor(c, 42, 111, 219)",
      "SetFilling(poly, 0.25)",
      "ShowLabel(aux, false)",
      "E = Extremum(f)",
      "SetColor(face, 10, 20, 30)",
      "SetFilling(face, 0.4)",
      "a = Slider(0, 10, 1, 1, 120, false, true, false, false)",
      "v = Vector((0, 0), (2, 3))",
      "solid = Pyramid(base, Apex)"
    ]);
  });

  test("keeps GeoGebra command reference search in the shared package", () => {
    expect(searchGeoGebraCommandReference("circle", 1)).toMatchObject([
      { command: "Circle" }
    ]);
    expect(searchGeoGebraCommandReference("circle", 1, "en-US")).toMatchObject([
      { command: "Circle", description: "Create a circle from its center and a point on the circle, or from its center and radius." }
    ]);
    expect(searchGeoGebraCommandReference("extrema", 1)).toMatchObject([
      { command: "Extremum" }
    ]);
    expect(searchGeoGebraCommandReference("Sphere through 4 points 3D circumsphere", 3, undefined, "geometry-3d")[0]).toMatchObject(
      { command: "Sphere", syntax: "Sphere( <点>, <半径> ); Sphere( <点>, <点> )" }
    );
    expect(searchGeoGebraCommandReference("外接球 四面体", 3, undefined, "dsl_3d")[0]).toMatchObject({ command: "Sphere" });
    expect(searchGeoGebraCommandReference("y轴 SetColor", 2).map((item) => item.command)).toContain("SetColor");
    expect(searchGeoGebraCommandReference("Extremum", 3, undefined, "style").map((item) => item.command)).not.toContain("Extremum");
    expect(searchGeoGebraCommandReference("Extremum", 3, undefined, "function-graph").map((item) => item.command)).toContain("Extremum");
    expect(searchGeoGebraCommandReference("SetColor", 3, undefined, "style").map((item) => item.command)).toContain("SetColor");
    expect(searchGeoGebraCommandReference("Root function", 8, "en-US", "function-graph").map((item) => item.command)).toContain("Root");
    expect(searchGeoGebraCommandReference("滑块 动画", 8).map((item) => item.command)).toContain("StartAnimation");
    expect(searchGeoGebraCommandReference("slider animation", 8, "en-US").map((item) => item.command)).toContain("StartAnimation");
    expect(searchGeoGebraCommandReference("center radius circle", 3, "en-US", "dsl_geometry")[0]).toMatchObject({
      command: "Circle",
      syntax: expect.stringContaining("<radius length>")
    });
    expect(searchGeoGebraCommandReference("perpendicular bisector plane between two points", 3, "en-US", "dsl_3d")[0]).toMatchObject(
      { command: "PlaneBisector" }
    );
    expect(searchGeoGebraCommandReference("intersection point x axis function", 3, "en-US", "dsl")[0]).toMatchObject(
      { command: "Intersect" }
    );
    expect(searchGeoGebraCommandReference("regular tetrahedron solid", 3, "en-US", "dsl_3d")[0]).toMatchObject(
      { command: "Tetrahedron" }
    );
    expect(searchGeoGebraCommandReference("lowercase point", 1, "en-US")).toMatchObject([
      { command: "Point" }
    ]);
    expect(searchGeoGebraCommandReference("", 2)).toHaveLength(2);
  });

  test("collects GeoGebra command usage stats from persisted runner ledgers", () => {
    expect(extractGeoGebraCommandName("A = (0, 0)")).toBe("Point");
    expect(extractGeoGebraCommandName("f(x) = x^2")).toBe("Function");
    expect(extractGeoGebraCommandName("c = Circle(O, 3)")).toBe("Circle");
    expect(extractGeoGebraCommandName("SetColor(c, 10, 20, 30)")).toBe("SetColor");

    const run = createAgentRunLedger({
      runId: "command-usage-run",
      conversationId: "conversation-usage",
      mode: "ai-sdk",
      model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
      prompt: "画圆并标出圆心",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
    const withSearch = upsertAgentRunTool(run, {
      toolCallId: "search-circle",
      toolName: "searchGeoGebraCommands",
      status: "succeeded",
      args: { query: "Circle", scope: "conic", topN: 2 },
      result: { ok: true, result: [{ command: "Circle" }] },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z",
      durationMs: 1000
    });
    const withExecute = upsertAgentRunTool(withSearch, {
      toolCallId: "execute-circle",
      toolName: "executeGeoGebraCommands",
      status: "succeeded",
      args: { commands: ["O = (0, 0)", "c = Circle(O, 3)", "SetColor(c, 10, 20, 30)"] },
      result: { ok: true },
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z",
      durationMs: 1000
    });

    const finishedRun = finishAgentRunLedger(withExecute, {
      status: "succeeded",
      error: null,
      usage: null,
      completedAt: "2026-06-06T00:00:05.000Z"
    });
    const stats = collectGeoGebraCommandUsageStats([finishedRun], "2026-06-06T00:00:05.000Z");
    expect(stats).toMatchObject({
      generatedAt: "2026-06-06T00:00:05.000Z",
      runCount: 1,
      executeToolCallCount: 1,
      searchToolCallCount: 1,
      runQuality: {
        clean_success: 0,
        recovered_success: 0,
        canvas_failed: 1,
        model_failed: 0
      },
      searchScopes: [{ scope: "conic", count: 1, runCount: 1 }],
      searchQueries: [{ query: "Circle", scope: "conic", count: 1, runCount: 1 }]
    });
    expect(stats.commands).toEqual([
      expect.objectContaining({ commandName: "Circle", executedCount: 1, succeededCount: 1, runCount: 1 }),
      expect.objectContaining({ commandName: "Point", executedCount: 1, succeededCount: 1, runCount: 1 }),
      expect.objectContaining({ commandName: "SetColor", executedCount: 1, succeededCount: 1, runCount: 1 })
    ]);
  });

  test("classifies agent run quality without counting failure cards as clean success", () => {
    const baseRun = (runId: string) => createAgentRunLedger({
      runId,
      conversationId: `conversation-${runId}`,
      mode: "ai-sdk",
      model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
      prompt: "画一个教学图",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });

    const cleanRun = finishAgentRunLedger(upsertAgentRunTool(
      upsertAgentRunTool(baseRun("clean-run"), {
        toolCallId: "execute-clean",
        toolName: "executeGeoGebraCommands",
        status: "succeeded",
        args: { commands: ["A = (0, 0)"] },
        result: { ok: true },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }),
      {
        toolCallId: "context-clean",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: {},
        result: { ok: true, canvasContext: { ready: true, element_count: 1 } },
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    ), {
      status: "succeeded",
      error: null,
      usage: null,
      completedAt: "2026-06-06T00:00:05.000Z"
    });

    const recoveredRun = finishAgentRunLedger(upsertAgentRunTool(
      upsertAgentRunTool(
        upsertAgentRunTool(baseRun("recovered-run"), {
          toolCallId: "execute-failed",
          toolName: "executeGeoGebraCommands",
          status: "failed",
          args: { commands: ["SetOpacity(c, 0.4)"] },
          error: "Unknown command",
          startedAt: "2026-06-06T00:00:01.000Z",
          completedAt: "2026-06-06T00:00:02.000Z"
        }),
        {
          toolCallId: "execute-recovered",
          toolName: "executeGeoGebraCommands",
          status: "succeeded",
          args: { commands: ["SetFilling(c, 0.4)"] },
          result: { ok: true },
          startedAt: "2026-06-06T00:00:03.000Z",
          completedAt: "2026-06-06T00:00:04.000Z"
        }
      ),
      {
        toolCallId: "context-recovered",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: {},
        result: { ok: true, canvasContext: { ready: true, element_count: 2 } },
        startedAt: "2026-06-06T00:00:05.000Z",
        completedAt: "2026-06-06T00:00:06.000Z"
      }
    ), {
      status: "succeeded",
      error: null,
      usage: null,
      completedAt: "2026-06-06T00:00:07.000Z"
    });

    const failureCardRun = finishAgentRunLedger(upsertAgentRunTool(
      upsertAgentRunTool(baseRun("failure-card-run"), {
        toolCallId: "execute-card",
        toolName: "executeGeoGebraCommands",
        status: "succeeded",
        args: { commands: ["A = (0, 0)"] },
        result: { ok: true },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }),
      {
        toolCallId: "failure-card",
        toolName: "showSolutionSteps",
        status: "succeeded",
        args: { title: "GeoGebra 命令修复失败", steps: [] },
        result: { ok: true },
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    ), {
      status: "succeeded",
      error: null,
      usage: null,
      completedAt: "2026-06-06T00:00:05.000Z"
    });

    const modelFailedRun = finishAgentRunLedger(baseRun("model-failed-run"), {
      status: "failed",
      error: "Backend runner exceeded the automatic backend tool execution limit.",
      usage: null,
      completedAt: "2026-06-06T00:00:05.000Z"
    });

    const textOnlyRun = finishAgentRunLedger(upsertAgentRunTool(baseRun("text-only-run"), {
      toolCallId: "choice-analysis",
      toolName: "showChoiceAnalysis",
      status: "succeeded",
      args: { title: "复数化简", summary: "纯代数计算，无需画板。", choices: [] },
      result: { ok: true },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    }), {
      status: "succeeded",
      error: null,
      usage: null,
      completedAt: "2026-06-06T00:00:03.000Z"
    });

    const stats = collectGeoGebraCommandUsageStats([cleanRun, recoveredRun, failureCardRun, modelFailedRun, textOnlyRun], "2026-06-06T00:00:07.000Z");
    expect(stats.runQuality).toEqual({
      clean_success: 2,
      recovered_success: 1,
      canvas_failed: 1,
      model_failed: 1
    });
    expect(Object.fromEntries(stats.runQualityItems.map((item) => [item.runId, item.quality]))).toEqual({
      "clean-run": "clean_success",
      "recovered-run": "recovered_success",
      "failure-card-run": "canvas_failed",
      "model-failed-run": "model_failed",
      "text-only-run": "clean_success"
    });
  });

  test("executes safe read-only backend tools without using the renderer bridge", async () => {
    const backendContext = (locale?: "zh-CN" | "en-US") => ({
      runId: "backend-test-run",
      conversationId: "backend-test-conversation",
      locale,
      readBlackboard: () => [
        {
          id: "memory-1",
          conversationId: "backend-test-conversation",
          key: "original_problem",
          category: "original_problem" as const,
          value: "画一个椭圆",
          status: "active" as const,
          confidence: 0.9,
          reason: "用户原题",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z"
        }
      ],
      patchBlackboard: (args: { ops: Array<{ op: string }> }) => ({
        entries: [],
        changed: args.ops.length,
        archived: args.ops.filter((op) => op.op === "archive").length
      })
    });
    const searchRequest = {
      toolCallId: "backend-search",
      toolName: "searchGeoGebraCommands" as const,
      args: { query: "circle", scope: "conic", topN: 1 }
    };
    expect(canExecuteBackendToolRequest(searchRequest)).toBe(true);
    await expect(executeBackendToolRequest(searchRequest, backendContext(), "2026-06-06T00:00:00.000Z")).resolves.toMatchObject({
      toolCallId: "backend-search",
      toolName: "searchGeoGebraCommands",
      status: "succeeded",
      result: {
        ok: true,
        result: [{ command: "Circle" }],
        clientMeta: { source: "backend-command-reference" }
      },
      error: null
    });
    await expect(executeBackendToolRequest(searchRequest, backendContext("en-US"), "2026-06-06T00:00:00.000Z")).resolves.toMatchObject({
      result: {
        ok: true,
        result: [{ command: "Circle", description: "Create a circle from its center and a point on the circle, or from its center and radius." }]
      }
    });
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-blackboard-read",
          toolName: "readBlackboard",
          args: { categories: ["original_problem"] }
        },
        backendContext(),
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolName: "readBlackboard",
      result: {
        ok: true,
        result: {
          conversationId: "backend-test-conversation",
          entries: [{ key: "original_problem", value: "画一个椭圆" }]
        },
        clientMeta: { source: "backend-blackboard", operation: "read" }
      }
    });
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-blackboard-patch",
          toolName: "patchBlackboard",
          args: {
            ops: [
              {
                op: "upsert",
                key: "main_goal",
                category: "goal",
                value: "构造椭圆并解释焦点定义",
                confidence: 0.9,
                reason: "后续绘图需要"
              }
            ]
          }
        },
        backendContext(),
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolName: "patchBlackboard",
      result: {
        ok: true,
        result: {
          conversationId: "backend-test-conversation",
          changed: 1,
          archived: 0
        },
        clientMeta: { source: "backend-blackboard", operation: "patch" }
      }
    });
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-blackboard-canvas-state-patch",
          toolName: "patchBlackboard",
          args: {
            ops: [
              {
                op: "upsert",
                key: "canvas_snapshot",
                category: "canvas_state",
                value: "manual canvas summary",
                confidence: 0.8,
                reason: "model attempted to persist canvas state"
              }
            ]
          }
        },
        backendContext(),
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolName: "patchBlackboard",
      status: "succeeded",
      result: {
        ok: true,
        result: {
          conversationId: "backend-test-conversation",
          changed: 0,
          archived: 0,
          ignoredOps: 1
        },
        clientMeta: {
          source: "backend-blackboard",
          operation: "patch",
          warning: "ignored-system-maintained-blackboard-ops"
        }
      }
    });
    const skillsRoot = await mkdtemp(join(tmpdir(), "geochat-skills-"));
    const geometrySkillDir = join(skillsRoot, "geometry-proof");
    await mkdir(geometrySkillDir);
    await writeFile(
      join(geometrySkillDir, "SKILL.md"),
      [
        "---",
        "name: geometry-proof",
        "description: Use when a problem needs a formal geometry proof workflow.",
        "---",
        "",
        "# Geometry Proof",
        "",
        "Read the problem, identify givens, construct the diagram, and prove each claim from named facts."
      ].join("\n")
    );
    const previousSkillsDir = process.env.GEOCHAT_SKILLS_DIRS;
    process.env.GEOCHAT_SKILLS_DIRS = skillsRoot;
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-skill-list",
          toolName: "listSkills",
          args: {
            limit: 20,
            reason: "Evaluate available skills before deciding whether one is useful."
          }
        },
        backendContext(),
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolName: "listSkills",
      result: {
        ok: true,
        result: {
          skills: expect.arrayContaining([
            expect.objectContaining({ name: "geometry-proof", description: "Use when a problem needs a formal geometry proof workflow." })
          ])
        },
        clientMeta: { source: "backend-agent-skill", operation: "list" }
      }
    });
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-skill-search",
          toolName: "searchSkills",
          args: {
            query: "formal geometry proof",
            reason: "Find whether a geometry proof skill matches this task."
          }
        },
        backendContext(),
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolName: "searchSkills",
      result: {
        ok: true,
        result: {
          query: "formal geometry proof",
          matches: expect.arrayContaining([expect.objectContaining({ name: "geometry-proof", matchedFields: expect.any(Array) })])
        },
        clientMeta: { source: "backend-agent-skill", operation: "search", query: "formal geometry proof" }
      }
    });
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-skill-load",
          toolName: "loadSkill",
          args: {
            name: "geometry-proof",
            reason: "Load the matched geometry proof workflow."
          }
        },
        backendContext(),
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolName: "loadSkill",
      result: {
        ok: true,
        result: {
          name: "geometry-proof",
          description: "Use when a problem needs a formal geometry proof workflow.",
          source: "local",
          markdown: expect.stringContaining("# Geometry Proof")
        },
        clientMeta: { source: "backend-agent-skill", operation: "load", name: "geometry-proof" }
      }
    });
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-skill",
          toolName: "activateSkill",
          args: {
            name: "geometry-proof",
            reason: "The task needs the formal geometry proof workflow."
          }
        },
        backendContext(),
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolName: "activateSkill",
      result: {
        ok: true,
        result: {
          name: "geometry-proof",
          description: "Use when a problem needs a formal geometry proof workflow.",
          source: "local",
          markdown: expect.stringContaining("# Geometry Proof")
        },
        clientMeta: { source: "backend-agent-skill", name: "geometry-proof" }
      }
    });
    if (previousSkillsDir === undefined) {
      delete process.env.GEOCHAT_SKILLS_DIRS;
    } else {
      process.env.GEOCHAT_SKILLS_DIRS = previousSkillsDir;
    }
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-plan",
          toolName: "createGeometryPlan",
          args: {
            recipeId: "function.parabola.vertex",
            inputs: { expression: "x^2" }
          }
        },
        backendContext(),
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolCallId: "backend-plan",
      toolName: "createGeometryPlan",
      status: "succeeded",
      result: {
        ok: true,
        result: {
          plan: { planId: "plan-parabola-vertex" },
          compilation: {
            commands: ["f(x) = x^2", "V = Extremum(f)", "SetCaption(V, \"顶点\")", "ShowLabel(V, true)"]
          },
          executeArgs: {
            commands: ["f(x) = x^2", "V = Extremum(f)", "SetCaption(V, \"顶点\")", "ShowLabel(V, true)"],
            nextExpectedAction: "getCanvasContext"
          }
        },
        clientMeta: { source: "backend-geometry-plan", recipeId: "function.parabola.vertex" }
      },
      error: null
    });
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-plan-en",
          toolName: "createGeometryPlan",
          args: {
            recipeId: "function.parabola.vertex",
            inputs: { expression: "x^2" }
          }
        },
        backendContext("en-US"),
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      result: {
        ok: true,
        result: {
          plan: {
            title: "Graph the parabola f(x) = x^2 and mark its vertex",
            explanationGoals: ["Explain the parabola's opening direction, vertex, and axis of symmetry."]
          },
          compilation: {
            commands: ["f(x) = x^2", "V = Extremum(f)", "SetCaption(V, \"Vertex\")", "ShowLabel(V, true)"]
          },
          executeArgs: {
            reason: "Execute construction plan: Graph the parabola f(x) = x^2 and mark its vertex",
            intendedOutcome: "Confirm f was created; Confirm V was created; Confirm V depends on f"
          }
        }
      }
    });
    const advancedCompilation = compileAdvancedDrawingCommand({ name: "drawTetrahedronCircumsphere" });
    expect(advancedCompilation.executeArgs).toMatchObject({
      perspective: "T",
      commands: expect.arrayContaining(["circumsphere = Sphere(O, r)", "radA = Segment(O, A)"])
    });
    expect(getAdvancedDrawingToolDefinitions(["drawTetrahedronCircumsphere"])[0]).toMatchObject({
      requiredSkills: expect.arrayContaining(["pyramid-circumsphere"]),
      assumptions: expect.arrayContaining(["四个顶点必须构成非退化四面体。"]),
      invariants: expect.arrayContaining(["球心到四个顶点距离相等。"])
    });
    const mutableAdvancedDefinition = getAdvancedDrawingToolDefinitions(["drawTetrahedronCircumsphere"])[0];
    mutableAdvancedDefinition.requiredSkills.length = 0;
    mutableAdvancedDefinition.assumptions.length = 0;
    mutableAdvancedDefinition.parameters.length = 0;
    mutableAdvancedDefinition.invariants.length = 0;
    expect(getAdvancedDrawingToolDefinitions(["drawTetrahedronCircumsphere"])[0].requiredSkills).toContain("pyramid-circumsphere");
    expect(getAdvancedDrawingToolDefinitions(["drawTetrahedronCircumsphere"])[0].assumptions.length).toBeGreaterThan(0);
    expect(getAdvancedDrawingToolDefinitions(["drawTetrahedronCircumsphere"])[0].parameters.length).toBeGreaterThan(0);
    expect(getAdvancedDrawingToolDefinitions(["drawTetrahedronCircumsphere"])[0].invariants.length).toBeGreaterThan(0);
    for (const definition of getAdvancedDrawingToolDefinitions()) {
      expect(definition.assumptions.length).toBeGreaterThan(0);
      expect(definition.parameters.length).toBeGreaterThan(0);
      expect(definition.invariants.length).toBeGreaterThan(0);
    }
    const advancedSmokeCases = [
      {
        name: "drawTriangularPrismSkeleton",
        prompt: "画一个三棱柱骨架，标出上下底面和侧棱。",
        expectedCommand: "baseFace = Polygon(A, B, C)",
        perspective: "T"
      },
      {
        name: "drawSquarePyramidSkeleton",
        prompt: "画一个四棱锥，标出底面中心和高。",
        expectedCommand: "baseSquare = Polygon(A, B, C, D)",
        perspective: "T"
      },
      {
        name: "drawTetrahedronCircumsphere",
        prompt: "画一个正四面体并作出它的外接球，标出球心和半径。",
        expectedCommand: "circumsphere = Sphere(O, r)",
        perspective: "T"
      },
      {
        name: "drawTetrahedronInsphere",
        prompt: "画一个正四面体内切球，标出内心和到面的半径。",
        expectedCommand: "insphere = Sphere(I, rin)",
        perspective: "T"
      },
      {
        name: "drawUnitCircleTrigProjection",
        prompt: "用单位圆解释正弦余弦投影，画出 45 度终边。",
        expectedCommand: "angleMark = Angle(U, O, P)",
        perspective: "G"
      },
      {
        name: "drawParabolaFocusDirectrix",
        prompt: "画抛物线的焦点准线，并展示点到焦点和准线的距离。",
        expectedCommand: "focusRadius = Segment(P, F)",
        perspective: "G"
      },
      {
        name: "drawQuadraticVertexDiagram",
        prompt: "画二次函数顶点图，标出顶点和对称轴。",
        expectedCommand: "V = (h, k)",
        perspective: "G"
      },
      {
        name: "drawClassicalProbabilityGrid",
        prompt: "画两枚骰子的样本空间网格，并标出点数和为7。",
        expectedCommand: "eventLabel = Text(\"sum = 7\", (0.2, 6.4))",
        perspective: "G"
      }
    ] as const;
    expect(ADVANCED_DRAWING_TOOL_NAMES).toEqual(advancedSmokeCases.map((item) => item.name));
    for (const smokeCase of advancedSmokeCases) {
      const compilation = compileAdvancedDrawingCommand({ name: smokeCase.name });
      expect(Array.isArray(compilation.executeArgs.commands)).toBe(true);
      const commandBatch = Array.isArray(compilation.executeArgs.commands) ? compilation.executeArgs.commands : [];
      expect(commandBatch.length).toBeLessThanOrEqual(100);
      expect(compilation.executeArgs).toMatchObject({
        perspective: smokeCase.perspective,
        commands: expect.arrayContaining([smokeCase.expectedCommand])
      });
      expect(compilation.expectedObjects.length).toBeGreaterThan(0);
      await expect(
        executeBackendToolRequest(
          {
            toolCallId: `backend-advanced-${smokeCase.name}`,
            toolName: "executeAdvancedDrawingCommand",
            args: {
              name: smokeCase.name,
              reason: "The prompt matches an experimental high-level drawing command."
            }
          },
          {
            ...backendContext(),
            prompt: smokeCase.prompt
          },
          "2026-06-06T00:00:00.000Z"
        )
      ).rejects.toThrow("Advanced drawing command is not enabled by loaded skills");
    }
    expect(compileAdvancedDrawingCommand({
      name: "drawTriangularPrismSkeleton",
      args: {
        pointLabels: ["P", "Q", "R", "P1", "Q1", "R1"],
        coordinates: [[0, 0, 0], [3, 0, 0], [0, 2, 0], [0, 0, 4], [3, 0, 4], [0, 2, 4]]
      }
    }).executeArgs.commands).toEqual(expect.arrayContaining([
      "P = (0, 0, 0)",
      "Q1 = (3, 0, 4)",
      "baseFace = Polygon(P, Q, R)"
    ]));
    expect(compileAdvancedDrawingCommand({
      name: "drawSquarePyramidSkeleton",
      args: { baseHalfSize: 3, height: 5, centerName: "M", heightName: "SM" }
    }).executeArgs.commands).toEqual(expect.arrayContaining([
      "A = (-3, -3, 0)",
      "S = (0, 0, 5)",
      "SM = Segment(S, M)"
    ]));
    expect(compileAdvancedDrawingCommand({
      name: "drawTetrahedronCircumsphere",
      args: { sideLength: 6, centerName: "Oc", sphereName: "omega", radiusName: "R" }
    }).executeArgs.commands).toEqual(expect.arrayContaining([
      "B = (6, 0, 0)",
      "Oc = (3, 1.7321, 1.2247)",
      "omega = Sphere(Oc, R)"
    ]));
    expect(compileAdvancedDrawingCommand({
      name: "drawTetrahedronCircumsphere",
      args: {
        coordinates: [[0, 0, 0], [2, 0, 0], [0, 4, 0], [0, 0, 6]],
        centerName: "Oc2"
      }
    }).executeArgs.commands).toEqual(expect.arrayContaining([
      "Oc2 = (1, 2, 3)",
      "r = Distance(Oc2, A)"
    ]));
    expect(() => compileAdvancedDrawingCommand({
      name: "drawTetrahedronCircumsphere",
      args: {
        coordinates: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]]
      }
    })).toThrow("requires four non-coplanar points");
    expect(compileAdvancedDrawingCommand({
      name: "drawTetrahedronInsphere",
      args: { sideLength: 6, centerName: "Ic", tangentPointName: "T0", sphereName: "iSphere" }
    }).executeArgs.commands).toEqual(expect.arrayContaining([
      "Ic = (3, 1.7321, 1.2247)",
      "T0 = (3, 1.7321, 0)",
      "iSphere = Sphere(Ic, rin)"
    ]));
    expect(compileAdvancedDrawingCommand({
      name: "drawUnitCircleTrigProjection",
      args: { angleDegrees: 120, angleName: "alpha", pointName: "Palpha", radius: 2 }
    }).executeArgs.commands).toEqual(expect.arrayContaining([
      "alpha = 120°",
      "unitCircle = Circle(O, 2)",
      "Palpha = (2 * cos(alpha), 2 * sin(alpha))",
      "angleMark = Angle(U, O, Palpha)"
    ]));
    expect(compileAdvancedDrawingCommand({
      name: "drawUnitCircleTrigProjection",
      args: {
        angleName: "thetaDyn",
        angleDegrees: { kind: "ggb_expr", expr: "theta", evaluation: "dynamic" }
      }
    }).executeArgs.commands).toEqual(expect.arrayContaining([
      "thetaDyn = theta",
      "P = (1 * cos(thetaDyn), 1 * sin(thetaDyn))"
    ]));
    expect(compileAdvancedDrawingCommand({
      name: "drawUnitCircleTrigProjection",
      args: {
        angleName: "thetaSnap",
        angleDegrees: { kind: "ggb_expr", expr: "theta", evaluation: "snapshot" }
      }
    }).executeArgs.commands).toEqual(expect.arrayContaining([
      "thetaSnap = CopyFreeObject(theta)",
      "P = (1 * cos(thetaSnap), 1 * sin(thetaSnap))"
    ]));
    expect(() => compileAdvancedDrawingCommand({
      name: "drawQuadraticVertexDiagram",
      args: {
        helper: {
          kind: "advanced_command",
          name: "drawUnitCircleTrigProjection",
          args: { angleDegrees: 30 }
        }
      }
    })).toThrow("Advanced drawing commands cannot be nested");
    expect(compileAdvancedDrawingCommand({
      name: "drawParabolaFocusDirectrix",
      args: { p: 2, sampleX: 4, parameterName: "q" }
    }).executeArgs.commands).toEqual(expect.arrayContaining([
      "q = 2",
      "parabola = x^2 / (4 * q)",
      "P = (4, (4)^2 / (4 * q))"
    ]));
    expect(compileAdvancedDrawingCommand({
      name: "drawQuadraticVertexDiagram",
      args: { a: -2, h: 3, k: 1, sampleOffset: 4 }
    }).executeArgs.commands).toEqual(expect.arrayContaining([
      "a = -2",
      "h = 3",
      "k = 1",
      "L = (h - 4, f(h - 4))",
      "R = (h + 4, f(h + 4))"
    ]));
    expect(compileAdvancedDrawingCommand({
      name: "drawClassicalProbabilityGrid",
      args: { sides: 4, targetSum: 5 }
    }).executeArgs.commands).toEqual(expect.arrayContaining([
      "v4 = Segment((4, 0), (4, 4))",
      "h4 = Segment((0, 4), (4, 4))",
      "E14 = (0.5, 3.5)",
      "E41 = (3.5, 0.5)",
      "eventLabel = Text(\"sum = 5\", (0.2, 4.4))"
    ]));
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-advanced-denied",
          toolName: "executeAdvancedDrawingCommand",
          args: {
            name: "drawTetrahedronCircumsphere",
            reason: "Try to call a high-level command without an enabling skill."
          }
        },
        backendContext(),
        "2026-06-06T00:00:00.000Z"
      )
    ).rejects.toThrow("Advanced drawing command is not enabled by loaded skills");
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-advanced",
          toolName: "executeAdvancedDrawingCommand",
          args: {
            name: "drawTetrahedronCircumsphere",
            reason: "Use the circumsphere skill's high-level command.",
            intendedOutcome: "Compile the tetrahedron circumsphere construction."
          }
        },
        {
          ...backendContext(),
          enabledAdvancedTools: ["drawTetrahedronCircumsphere"]
        },
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolName: "executeAdvancedDrawingCommand",
      status: "succeeded",
      result: {
        ok: true,
        result: {
          name: "drawTetrahedronCircumsphere",
          executeArgs: {
            perspective: "T",
            commands: expect.arrayContaining(["circumsphere = Sphere(O, r)", "radA = Segment(O, A)"])
          },
          nextTool: {
            toolName: "executeGeoGebraCommands"
          }
        },
        clientMeta: {
          source: "backend-advanced-drawing-command",
          operation: "compile",
          name: "drawTetrahedronCircumsphere"
        }
      }
    });
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-advanced-semantic-defaults",
          toolName: "executeAdvancedDrawingCommand",
          args: {
            name: "drawTriangularPrismSkeleton",
            args: {
              pointLabels: "standard",
              coordinates: {
                kind: "ggb_expr",
                expr: "[ (0,0,0), (4,0,0), (1,3,0), (0,0,3), (4,0,3), (1,3,3) ]",
                evaluation: "snapshot"
              }
            },
            reason: "Compile a triangular prism with stable semantic defaults."
          }
        },
        {
          ...backendContext(),
          enabledAdvancedTools: ["drawTriangularPrismSkeleton"]
        },
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolName: "executeAdvancedDrawingCommand",
      status: "succeeded",
      result: {
        ok: true,
        result: {
          name: "drawTriangularPrismSkeleton",
          executeArgs: {
            perspective: "T",
            commands: expect.arrayContaining(["A = (0, 0, 0)", "C1 = (1, 3, 3)", "baseFace = Polygon(A, B, C)"])
          },
          nextTool: {
            toolName: "executeGeoGebraCommands"
          }
        }
      }
    });
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-advanced-prompt-derived",
          toolName: "executeAdvancedDrawingCommand",
          args: {
            name: "drawTetrahedronCircumsphere",
            reason: "The prompt is a tetrahedron circumsphere construction."
          }
        },
        {
          ...backendContext(),
          prompt: "画一个正四面体并作出它的外接球，标出球心和半径。"
        },
        "2026-06-06T00:00:00.000Z"
      )
    ).rejects.toThrow("Advanced drawing command is not enabled by loaded skills");
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-plan-from-text",
          toolName: "createGeometryPlan",
          args: {
            recipeId: "function.intersections",
            sourceText: "求直线 y = 2x + 1 和 y = x^2 的交点。"
          }
        },
        backendContext(),
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolCallId: "backend-plan-from-text",
      toolName: "createGeometryPlan",
      status: "succeeded",
      result: {
        ok: true,
        result: {
          compilation: {
            commands: ["f(x) = 2x + 1", "g(x) = x^2", "I = Intersect(f, g)"]
          },
          inputNormalization: {
            extractedFields: ["leftExpression", "rightExpression"],
            missingRequiredInputs: []
          }
        },
        clientMeta: {
          source: "backend-geometry-plan",
          extractedFields: ["leftExpression", "rightExpression"],
          missingRequiredInputs: []
        }
      }
    });
    await expect(
      executeBackendToolRequest(
        {
          toolCallId: "backend-card",
          toolName: "showSolutionSteps",
          args: { title: "步骤", answer: "完成", steps: [{ label: "构造", body: "作圆" }] }
        },
        backendContext(),
        "2026-06-06T00:00:00.000Z"
      )
    ).resolves.toMatchObject({
      toolCallId: "backend-card",
      toolName: "showSolutionSteps",
      status: "succeeded",
      result: {
        ok: true,
        result: { title: "步骤", answer: "完成" },
        clientMeta: { source: "backend-display-card" }
      },
      error: null
    });
    expect(
      canExecuteBackendToolRequest({
        toolCallId: "frontend-read",
        toolName: "getCanvasContext",
        args: { includeXml: false }
      })
    ).toBe(false);
  });

});

describe("geometry semantics layer", () => {
  test("creates validated geometry plans from deterministic construction recipes", () => {
    expect(findConstructionRecipesForIntent("画出抛物线 y = x^2，并标出顶点。").map((recipe) => recipe.id)).toContain("function.parabola.vertex");
    expect(findConstructionRecipesForIntent("求直线 y = 2x + 1 和 y = x^2 的交点。").map((recipe) => recipe.id)).toContain("function.intersections");
    expect(findConstructionRecipesForIntent("帮我一步一步构造一个椭圆。").map((recipe) => recipe.id)).toContain("conic.ellipse.foci-point");
    expect(findConstructionRecipesForIntent("画出双曲线 x^2/4 - y^2 = 1，标出两个焦点和渐近线。").map((recipe) => recipe.id)).toEqual([]);
    expect(findConstructionRecipesForIntent("画出函数 y = ln(x)，标出点 (1,0)，并说明定义域。").map((recipe) => recipe.id)).toEqual([]);
    expect(findConstructionRecipesForIntent("在 3D 画板中构造棱长为 2 的正方体 ABCD-A1B1C1D1，并标出顶点。").map((recipe) => recipe.id)).toEqual([]);
    expect(findConstructionRecipesForIntent("画出椭圆 x^2/9 + y^2/4 = 1，标出长轴、短轴和焦点。").map((recipe) => recipe.id)).toEqual([]);

    const plan = createGeometryPlanFromRecipe("conic.ellipse.foci-point", {
      focusA: [-2, 0],
      focusB: [2, 0],
      point: [0, 3]
    });
    expect(isGeometryPlan(plan)).toBe(true);
    expect(plan).toMatchObject({
      taskType: "construct",
      objects: [
        { id: "F", kind: "point" },
        { id: "G", kind: "point" },
        { id: "A", kind: "point" },
        { id: "c", kind: "conic", subtype: "ellipse" }
      ],
      constraints: [
        { kind: "focus", object: "c", focus: "F" },
        { kind: "focus", object: "c", focus: "G" },
        { kind: "point_on", point: "A", object: "c" }
      ]
    });
  });

  test("normalizes deterministic construction inputs from Chinese source text", () => {
    expect(
      normalizeConstructionRecipeInputs({
        recipeId: "function.parabola.vertex",
        sourceText: "画出抛物线 y = x^2，并标出顶点。"
      })
    ).toMatchObject({
      inputs: { expression: "x^2" },
      extractedFields: ["expression"],
      missingRequiredInputs: []
    });
    expect(
      normalizeConstructionRecipeInputs({
        recipeId: "function.intersections",
        sourceText: "求直线 y = 2x + 1 和 y = x^2 的交点。"
      })
    ).toMatchObject({
      inputs: { leftExpression: "2x + 1", rightExpression: "x^2" },
      extractedFields: ["leftExpression", "rightExpression"],
      missingRequiredInputs: []
    });
    expect(
      normalizeConstructionRecipeInputs({
        recipeId: "conic.ellipse.foci-point",
        sourceText: "焦点在 (-2, 0)、(2, 0)，过点 (0, 3) 的椭圆"
      })
    ).toMatchObject({
      inputs: { focusA: [-2, 0], focusB: [2, 0], point: [0, 3] },
      extractedFields: ["focusA", "focusB", "point"],
      missingRequiredInputs: []
    });
    expect(
      normalizeConstructionRecipeInputs({
        recipeId: "function.parabola.vertex",
        sourceText: "画出抛物线 y = x^2，并标出顶点。",
        inputs: { expression: "x^2 + 1" }
      })
    ).toMatchObject({
      inputs: { expression: "x^2 + 1" },
      extractedFields: [],
      missingRequiredInputs: []
    });
    expect(() =>
      normalizeConstructionRecipeInputs({
        recipeId: "unknown.recipe",
        sourceText: "画一个椭圆"
      })
    ).toThrow("Unknown construction recipe: unknown.recipe");
  });

  test("compiles geometry plans into safe GeoGebra command args", () => {
    const plan = createGeometryPlanFromRecipe("function.intersections", {
      leftExpression: "x^2",
      rightExpression: "2x + 1"
    });
    expect(compileGeometryPlanToGeoGebra(plan)).toEqual({
      commands: ["f(x) = x^2", "g(x) = 2x + 1", "I = Intersect(f, g)"],
      warnings: []
    });
    expect(compileGeometryPlanToExecuteArgs(plan)).toMatchObject({
      commands: ["f(x) = x^2", "g(x) = 2x + 1", "I = Intersect(f, g)"],
      restoreOnError: true,
      reason: "执行构造计划：求 f(x) = x^2 与 g(x) = 2x + 1 的交点",
      intendedOutcome: "确认 f 已创建；确认 g 已创建；确认 I 依赖 f, g",
      nextExpectedAction: "getCanvasContext"
    });
    expect(compileGeometryPlanToExecuteArgs(createGeometryPlanFromRecipe("function.intersections", {
      leftExpression: "x^2",
      rightExpression: "2x + 1"
    }, "en-US"), "en-US")).toMatchObject({
      commands: ["f(x) = x^2", "g(x) = 2x + 1", "I = Intersect(f, g)"],
      restoreOnError: true,
      reason: "Execute construction plan: Find intersections of f(x) = x^2 and g(x) = 2x + 1",
      intendedOutcome: "Confirm f was created; Confirm g was created; Confirm I depends on f, g",
      nextExpectedAction: "getCanvasContext"
    });
    expect(isFunctionCallArgs("executeGeoGebraCommands", compileGeometryPlanToExecuteArgs(plan))).toBe(true);
  });

  test("injects labels but no 2D visual styling in compiled geometry plans", () => {
    const plan = createGeometryPlanFromRecipe("conic.ellipse.foci-point", {
      focusA: [-2, 0],
      focusB: [2, 0],
      point: [0, 3]
    });
    const commands = compileGeometryPlanToGeoGebra(plan).commands;
    expect(commands).toEqual(
      expect.arrayContaining([
        "SetCaption(F, \"焦点\")",
        "ShowLabel(F, true)",
        "SetCaption(G, \"焦点\")",
        "ShowLabel(G, true)",
        "SetCaption(A, \"椭圆上一点\")",
        "ShowLabel(A, true)"
      ])
    );
    expect(commands.some((command) => command.startsWith("SetPointSize("))).toBe(false);
    expect(findForbiddenTwoDimensionalStyleCommands({ commands })).toEqual([]);
  });

  test("verifies geometry plans against canvas object evidence without pretending unknown relations passed", () => {
    const plan = createGeometryPlanFromRecipe("conic.ellipse.foci-point", {
      focusA: [-2, 0],
      focusB: [2, 0],
      point: [0, 3]
    });
    const report = verifyGeometryPlanAgainstCanvas(plan, {
      objects: [
        { name: "F", kind: "point" },
        { name: "G", kind: "point" },
        { name: "A", kind: "point" },
        { name: "c", kind: "conic", subtype: "ellipse", dependsOn: ["F", "G", "A"] }
      ]
    });
    expect(report.passed).toBe(true);
    expect(report.results.every((result) => result.status === "passed")).toBe(true);

    const missingDependencyReport = verifyGeometryPlanAgainstCanvas(plan, {
      objects: [
        { name: "F", kind: "point" },
        { name: "G", kind: "point" },
        { name: "A", kind: "point" },
        { name: "c", kind: "conic", subtype: "ellipse", dependsOn: ["F", "G"] }
      ]
    });
    expect(missingDependencyReport.passed).toBe(false);
    expect(missingDependencyReport.results).toContainEqual(
      expect.objectContaining({
        status: "failed",
        message: "c does not report dependencies: A."
      })
    );
  });

  test("verifies geometry plans against renderer-style GeoGebra canvas summaries", () => {
    const plan = createGeometryPlanFromRecipe("conic.ellipse.foci-point", {
      focusA: [-2, 0],
      focusB: [2, 0],
      point: [0, 3]
    });
    const report = verifyGeometryPlanAgainstCanvas(plan, {
      ready: true,
      element_count: 4,
      expression_count: 4,
      selectedObjects: [],
      objects: [
        { name: "F", label: "F", type: "point" },
        { name: "G", label: "G", type: "point" },
        { name: "A", label: "A", type: "point" },
        { name: "c", label: "c", type: "conic", subtype: "ellipse", definition: "Ellipse(F, G, A)" }
      ],
      object_index: { conic: ["c"], point: ["F", "G", "A"] },
      expressions: ["F", "G", "A", "c"],
      source: "geogebra-applet"
    });

    expect(report.passed).toBe(true);
    expect(report.results.every((result) => result.status === "passed")).toBe(true);
  });

  test("falls back to legacy renderer object_index summaries without fabricating dependency proof", () => {
    const plan = createGeometryPlanFromRecipe("function.parabola.vertex", {
      expression: "x^2"
    });
    const report = verifyGeometryPlanAgainstCanvas(plan, {
      ready: true,
      element_count: 2,
      expression_count: 2,
      selectedObjects: [],
      object_index: { function: ["f"], point: ["V"] },
      expressions: ["f", "V"],
      source: "geogebra-applet"
    });

    expect(report.passed).toBe(false);
    expect(report.results).not.toContainEqual(expect.objectContaining({ status: "failed" }));
    expect(report.results).toContainEqual(expect.objectContaining({ status: "unknown", message: "V exists, but dependency metadata is unavailable." }));
  });

  test("extracts geometry plans from backend tool results for post-execution verification", () => {
    const plan = createGeometryPlanFromRecipe("conic.ellipse.foci-point", {
      focusA: [-2, 0],
      focusB: [2, 0],
      point: [0, 3]
    });
    const report = verifyGeometryPlanToolResultAgainstCanvas(
      {
        ok: true,
        result: {
          plan
        }
      },
      {
        objects: [
          { name: "F", kind: "point" },
          { name: "G", kind: "point" },
          { name: "A", kind: "point" },
          { name: "c", kind: "conic", subtype: "ellipse", dependsOn: ["F", "G", "A"] }
        ]
      }
    );
    expect(report).toMatchObject({ passed: true });
  });

  test("enriches canvas reads with the latest geometry plan verification report", () => {
    const plan = createGeometryPlanFromRecipe("conic.ellipse.foci-point", {
      focusA: [-2, 0],
      focusB: [2, 0],
      point: [0, 3]
    });
    const planTool = {
      toolCallId: "plan-1",
      toolName: "createGeometryPlan" as const,
      status: "succeeded" as const,
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
        result: { plan }
      },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    };
    const canvasTool = {
      toolCallId: "verify-1",
      toolName: "getCanvasContext" as const,
      status: "succeeded" as const,
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
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    };

    const enriched = enrichCanvasReadToolWithGeometryVerification([planTool], canvasTool);
    expect(geometryVerificationReportFromToolResult(enriched.result)).toMatchObject({
      passed: true
    });
    expect(geometryVerificationReportFromToolResult(enriched.result)?.results.every((result) => result.status === "passed")).toBe(true);
  });

  test("rejects geometry plans that reference undeclared objects", () => {
    const plan = createGeometryPlanFromRecipe("function.parabola.vertex", {
      expression: "x^2"
    });
    expect(isGeometryPlan({
      ...plan,
      verificationTargets: [...plan.verificationTargets, { kind: "object_exists", object: "Missing" }]
    })).toBe(false);
  });
});

describe("agent run review", () => {
  function baseReviewRun(runId: string) {
    return createAgentRunLedger({
      runId,
      conversationId: `conversation-${runId}`,
      mode: "ai-sdk",
      model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
      prompt: "构造一个椭圆并解释。",
      attachmentCount: 0,
      startedAt: "2026-06-06T00:00:00.000Z"
    });
  }

  function passedEllipseVerification() {
    const plan = createGeometryPlanFromRecipe("conic.ellipse.foci-point", {
      focusA: [-2, 0],
      focusB: [2, 0],
      point: [0, 3]
    });
    return {
      passed: true,
      results: plan.verificationTargets.map((target) => ({
        target,
        status: "passed" as const,
        message: "verified"
      }))
    };
  }

  test("passes a single-agent run with ordered planning, writing, and verification evidence", () => {
    let run = baseReviewRun("review-clean-run");
    run = upsertAgentRunTool(run, {
      toolCallId: "read-initial",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { ready: true, objects: [] } },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "plan-ellipse",
      toolName: "createGeometryPlan",
      status: "succeeded",
      args: { recipeId: "conic.ellipse.foci-point", inputs: { focusA: [-2, 0], focusB: [2, 0], point: [0, 3] } },
      result: { ok: true },
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "draw-ellipse",
      toolName: "executeGeoGebraCommands",
      status: "succeeded",
      args: { commands: ["F = (-2, 0)", "G = (2, 0)", "A = (0, 3)", "c = Ellipse(F, G, A)"] },
      result: { ok: true },
      startedAt: "2026-06-06T00:00:05.000Z",
      completedAt: "2026-06-06T00:00:06.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "verify-ellipse",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: {
        ok: true,
        canvasContext: { ready: true },
        geometryVerification: passedEllipseVerification()
      },
      startedAt: "2026-06-06T00:00:07.000Z",
      completedAt: "2026-06-06T00:00:08.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "explain-ellipse",
      toolName: "showSolutionSteps",
      status: "succeeded",
      args: {
        title: "椭圆构造",
        answer: "已构造椭圆。",
        steps: [{ label: "构造", body: "先放置两个焦点和椭圆上一点，再用 Ellipse 命令生成椭圆。" }]
      },
      result: { ok: true },
      startedAt: "2026-06-06T00:00:09.000Z",
      completedAt: "2026-06-06T00:00:10.000Z"
    });

    const report = reviewAgentRunLedger(finishAgentRunLedger(run, {
      status: "succeeded",
      completedAt: "2026-06-06T00:00:11.000Z",
      usage: null,
      error: null
    }));

    expect(report).toMatchObject({
      verdict: "pass",
      metrics: {
        totalTools: 5,
        canvasWriteTools: 1,
        canvasVerificationTools: 2,
        geometryVerificationReports: 1
      }
    });
    expect(report.findings).toEqual([]);
    expect(report.roles.map((role) => [role.role, role.verdict])).toEqual([
      ["planner", "pass"],
      ["verifier", "pass"],
      ["critic", "pass"]
    ]);
  });

  test("fails a successful run that writes to GeoGebra without terminal verification", () => {
    const run = finishAgentRunLedger(upsertAgentRunTool(
      upsertAgentRunTool(baseReviewRun("review-unverified-run"), {
        toolCallId: "read-initial",
        toolName: "getCanvasContext",
        status: "succeeded",
        args: { includeXml: false },
        result: { ok: true, canvasContext: { ready: true } },
        startedAt: "2026-06-06T00:00:01.000Z",
        completedAt: "2026-06-06T00:00:02.000Z"
      }),
      {
        toolCallId: "draw-without-verification",
        toolName: "executeGeoGebraCommands",
        status: "succeeded",
        args: { commands: ["A = (0, 0)"] },
        result: { ok: true },
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    ), {
      status: "succeeded",
      completedAt: "2026-06-06T00:00:05.000Z",
      usage: null,
      error: null
    });

    expect(reviewAgentRunLedger(run)).toMatchObject({
      verdict: "fail",
      findings: [
        expect.objectContaining({
          role: "planner",
          code: "workflow_order_violation"
        }),
        expect.objectContaining({
          role: "verifier",
          code: "terminal_verification_missing"
        })
      ]
    });
  });

  test("warns when geometry verification evidence is incomplete rather than treating it as passed", () => {
    const plan = createGeometryPlanFromRecipe("function.parabola.vertex", {
      expression: "x^2"
    });
    let run = baseReviewRun("review-unknown-geometry");
    run = upsertAgentRunTool(run, {
      toolCallId: "read-initial",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { ready: true } },
      startedAt: "2026-06-06T00:00:01.000Z",
      completedAt: "2026-06-06T00:00:02.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "plan-parabola",
      toolName: "createGeometryPlan",
      status: "succeeded",
      args: { recipeId: "function.parabola.vertex", inputs: { expression: "x^2" } },
      result: { ok: true, result: { plan } },
      startedAt: "2026-06-06T00:00:03.000Z",
      completedAt: "2026-06-06T00:00:04.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "draw-parabola",
      toolName: "executeGeoGebraCommands",
      status: "succeeded",
      args: { commands: ["f(x) = x^2", "V = Extremum(f)"] },
      result: { ok: true },
      startedAt: "2026-06-06T00:00:05.000Z",
      completedAt: "2026-06-06T00:00:06.000Z"
    });
    run = upsertAgentRunTool(run, {
      toolCallId: "verify-parabola",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: {
        ok: true,
        canvasContext: { ready: true },
        geometryVerification: {
          passed: false,
          results: plan.verificationTargets.map((target) => ({
            target,
            status: target.kind === "dependency" ? "unknown" as const : "passed" as const,
            message: target.kind === "dependency" ? "V exists, but dependency metadata is unavailable." : "verified"
          }))
        }
      },
      startedAt: "2026-06-06T00:00:07.000Z",
      completedAt: "2026-06-06T00:00:08.000Z"
    });

    const report = reviewAgentRunLedger(finishAgentRunLedger(run, {
      status: "succeeded",
      completedAt: "2026-06-06T00:00:09.000Z",
      usage: null,
      error: null
    }));

    expect(report.verdict).toBe("warn");
    expect(report.findings).toContainEqual(expect.objectContaining({
      role: "verifier",
      severity: "warn",
      code: "geometry_verification_incomplete",
      toolCallId: "verify-parabola"
    }));
  });
});

describe("workflow policy", () => {
  test("requires the first workflow tool to read the canvas context", () => {
    const state = createInitialAgentWorkflowState();
    expect(evaluateAgentWorkflowToolCall(state, "executeGeoGebraCommands")).toMatchObject({
      allowed: false
    });
    expect(evaluateAgentWorkflowToolCall(state, "searchGeoGebraCommands")).toMatchObject({
      allowed: false
    });
    expect(evaluateAgentWorkflowToolCall(state, "createGeometryPlan")).toMatchObject({
      allowed: false
    });
    expect(evaluateAgentWorkflowToolCall(state, "getPNGBase64")).toMatchObject({
      allowed: false
    });
    expect(evaluateAgentWorkflowToolCall(state, "showSolutionSteps")).toMatchObject({
      allowed: false
    });
    expect(evaluateAgentWorkflowToolCall(state, "listSkills")).toEqual({ allowed: true });
    expect(evaluateAgentWorkflowToolCall(state, "searchSkills")).toEqual({ allowed: true });
    expect(evaluateAgentWorkflowToolCall(state, "loadSkill")).toEqual({ allowed: true });
    expect(evaluateAgentWorkflowToolCall(state, "activateSkill")).toEqual({ allowed: true });
    expect(advanceAgentWorkflowState(state, "listSkills", true)).toMatchObject({
      phase: "needs_canvas_read",
      hasInitialCanvasRead: false
    });
    expect(evaluateAgentWorkflowToolCall(state, "getCanvasContext")).toEqual({ allowed: true });
  });

  test("requires command reference search or geometry plan before construction commands", () => {
    let state = createInitialAgentWorkflowState();
    state = advanceAgentWorkflowState(state, "getCanvasContext", true);
    expect(evaluateAgentWorkflowToolCall(state, "createGeometryPlan")).toEqual({ allowed: true });
    expect(evaluateAgentWorkflowToolCall(state, "searchGeoGebraCommands")).toEqual({ allowed: true });
    expect(evaluateAgentWorkflowToolCall(state, "executeGeoGebraCommands")).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("searchGeoGebraCommands")
    });

    const searchedState = advanceAgentWorkflowState(state, "searchGeoGebraCommands", true);
    expect(searchedState).toMatchObject({ hasCommandReferenceSearch: true });
    expect(evaluateAgentWorkflowToolCall(searchedState, "executeGeoGebraCommands")).toEqual({ allowed: true });

    const plannedState = advanceAgentWorkflowState(state, "createGeometryPlan", true);
    expect(plannedState).toMatchObject({ hasGeometryPlan: true });
    expect(evaluateAgentWorkflowToolCall(plannedState, "executeGeoGebraCommands")).toEqual({ allowed: true });
  });

  test("allows perspective changes before construction without forcing verification", () => {
    let state = createInitialAgentWorkflowState();
    state = advanceAgentWorkflowState(state, "getCanvasContext", true);
    state = advanceAgentWorkflowState(state, "setPerspective", true);

    expect(state).toMatchObject({
      phase: "planning",
      hasCanvasWrite: false,
      hasVerificationAfterWrite: false
    });
    state = advanceAgentWorkflowState(state, "searchGeoGebraCommands", true);
    expect(evaluateAgentWorkflowToolCall(state, "executeGeoGebraCommands")).toEqual({ allowed: true });
  });

  test("allows explicit canvas reset before a new construction without forcing verification", () => {
    let state = createInitialAgentWorkflowState();
    expect(evaluateAgentWorkflowToolCall(state, "resetCanvas")).toMatchObject({ allowed: false });

    state = advanceAgentWorkflowState(state, "getCanvasContext", true);
    expect(evaluateAgentWorkflowToolCall(state, "resetCanvas")).toEqual({ allowed: true });

    state = advanceAgentWorkflowState(state, "resetCanvas", true);
    expect(state).toMatchObject({
      phase: "planning",
      hasCanvasWrite: false,
      hasVerificationAfterWrite: true
    });

    state = advanceAgentWorkflowState(state, "searchGeoGebraCommands", true);
    expect(evaluateAgentWorkflowToolCall(state, "executeGeoGebraCommands")).toEqual({ allowed: true });
  });

  test("requires verification after construction before more construction or final explanation tools", () => {
    let state = createInitialAgentWorkflowState();
    state = advanceAgentWorkflowState(state, "getCanvasContext", true);
    state = advanceAgentWorkflowState(state, "searchGeoGebraCommands", true);
    expect(evaluateAgentWorkflowToolCall(state, "executeGeoGebraCommands")).toEqual({ allowed: true });

    state = advanceAgentWorkflowState(state, "executeGeoGebraCommands", true);
    expect(evaluateAgentWorkflowToolCall(state, "executeGeoGebraCommands")).toMatchObject({
      allowed: false
    });
    expect(evaluateAgentWorkflowToolCall(state, "showSolutionSteps")).toMatchObject({
      allowed: false
    });

    state = advanceAgentWorkflowState(state, "getPNGBase64", true);
    expect(evaluateAgentWorkflowToolCall(state, "showSolutionSteps")).toEqual({ allowed: true });
  });

  test("replays ledger tool records before accepting the next tool event", () => {
    const tools = [
      {
        toolCallId: "read-1",
        toolName: "getCanvasContext" as const,
        status: "succeeded" as const
      },
      {
        toolCallId: "write-1",
        toolName: "executeGeoGebraCommands" as const,
        status: "succeeded" as const
      }
    ];

    expect(deriveAgentWorkflowStateFromTools(tools)).toMatchObject({
      hasInitialCanvasRead: true,
      hasCanvasWrite: true,
      hasVerificationAfterWrite: false
    });
    expect(evaluateAgentWorkflowToolRecord(tools, { toolCallId: "explain-1", toolName: "showSolutionSteps" })).toMatchObject({
      allowed: false
    });
    expect(evaluateAgentWorkflowToolRecord(tools, { toolCallId: "write-again", toolName: "executeGeoGebraCommands" })).toMatchObject({
      allowed: false
    });
    expect(evaluateAgentWorkflowToolRecord(tools, { toolCallId: "verify-1", toolName: "getPNGBase64" })).toEqual({ allowed: true });
  });

  test("blocks model-supplied visual style commands in 2D GeoGebra drawing", () => {
    const run = upsertAgentRunTool(
      upsertAgentRunTool(
        createAgentRunLedger({
          runId: "runner-block-2d-style",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "",
            customBaseUrl: ""
          },
          prompt: "画一个二维圆并标出圆心。",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:00.000Z"
        }),
        {
          toolCallId: "read-before-style",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          startedAt: "2026-06-06T00:00:01.000Z",
          completedAt: "2026-06-06T00:00:02.000Z"
        }
      ),
      {
        toolCallId: "search-before-style",
        toolName: "searchGeoGebraCommands",
        status: "succeeded",
        args: { query: "Circle Point GeoGebra command syntax", scope: "conic" },
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    );

    const args = {
      commands: [
        "O = (0, 0)",
        "c = Circle(O, 3)",
        "SetColor(c, 220, 60, 60)",
        "SetPointSize(O, 6)",
        "setlinethickness(c, 3)"
      ]
    };
    expect(findForbiddenTwoDimensionalStyleCommands(args).map((item) => item.commandName)).toEqual([
      "SetColor",
      "SetPointSize",
      "SetLineThickness"
    ]);
    expect(decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "styled-2d-execute",
          toolName: "executeGeoGebraCommands",
          args
        }
      }
    })).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolName: "executeGeoGebraCommands",
        args: {
          commands: [
            "O = (0, 0)",
            "c = Circle(O, 3)"
          ],
          reason: expect.stringContaining("违规命令：SetColor, SetPointSize, SetLineThickness")
        }
      }
    });
  });

  test("allows 2D style commands when the user explicitly asks for appearance edits", () => {
    const run = upsertAgentRunTool(
      upsertAgentRunTool(
        createAgentRunLedger({
          runId: "runner-allow-explicit-2d-style",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "",
            customBaseUrl: ""
          },
          prompt: "把当前图形填充粉色，并高亮边界。",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:00.000Z"
        }),
        {
          toolCallId: "read-before-explicit-style",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          startedAt: "2026-06-06T00:00:01.000Z",
          completedAt: "2026-06-06T00:00:02.000Z"
        }
      ),
      {
        toolCallId: "search-before-explicit-style",
        toolName: "searchGeoGebraCommands",
        status: "succeeded",
        args: { query: "SetColor SetFilling GeoGebra command syntax", scope: "style" },
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    );

    const args = {
      commands: [
        "SetColor(poly, 255, 105, 180)",
        "SetFilling(poly, 0.55)",
        "SetLineThickness(poly, 4)"
      ]
    };

    expect(hasExplicitTwoDimensionalStyleIntent("把当前图形填充粉色，并高亮边界。")).toBe(true);
    expect(hasExplicitTwoDimensionalStyleIntent("不要改颜色，保持默认样式。")).toBe(false);
    expect(findForbiddenTwoDimensionalStyleCommands(args).map((item) => item.commandName)).toEqual([
      "SetColor",
      "SetFilling",
      "SetLineThickness"
    ]);
    expect(findForbiddenTwoDimensionalStyleCommands(args, { userPrompt: run.prompt })).toEqual([]);
    expect(decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "explicit-styled-2d-execute",
          toolName: "executeGeoGebraCommands",
          args
        }
      }
    })).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolName: "executeGeoGebraCommands"
      }
    });
  });

  test("allows limited 2D style commands for semantic mathematical highlighting", () => {
    const run = upsertAgentRunTool(
      upsertAgentRunTool(
        createAgentRunLedger({
          runId: "runner-allow-semantic-2d-highlight",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "",
            customBaseUrl: ""
          },
          prompt: "画两个骰子的 6x6 样本空间网格，突出显示点数和为 7 的格子。",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:00.000Z"
        }),
        {
          toolCallId: "read-before-semantic-highlight",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          startedAt: "2026-06-06T00:00:01.000Z",
          completedAt: "2026-06-06T00:00:02.000Z"
        }
      ),
      {
        toolCallId: "search-before-semantic-highlight",
        toolName: "searchGeoGebraCommands",
        status: "succeeded",
        args: { query: "Polygon SetColor SetFilling GeoGebra command syntax", scope: "style" },
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    );

    const semanticArgs = {
      commands: [
        "E7 = Polygon((1, 6), (2, 6), (2, 7), (1, 7))",
        "SetColor(E7, 0, 114, 178)",
        "SetFilling(E7, 0.35)"
      ]
    };
    const decorativeArgs = {
      commands: [
        ...semanticArgs.commands,
        "SetFontSize(txt, 24)"
      ]
    };
    const lineThicknessArgs = {
      commands: [
        ...semanticArgs.commands,
        "SetLineThickness(E7, 3)"
      ]
    };

    expect(hasSemanticTwoDimensionalHighlightIntent(run.prompt)).toBe(true);
    expect(hasSemanticTwoDimensionalHighlightIntent("画单位圆，标出 30°、45°、60° 三个角对应的点，并用投影展示 sin 和 cos 的几何意义。")).toBe(true);
    expect(hasExplicitTwoDimensionalStyleIntent(run.prompt)).toBe(false);
    expect(hasSemanticTwoDimensionalHighlightIntent("不要高亮，保持默认样式。")).toBe(false);
    expect(findForbiddenTwoDimensionalStyleCommands(semanticArgs, { userPrompt: run.prompt })).toEqual([]);
    expect(findForbiddenTwoDimensionalStyleCommands(decorativeArgs, { userPrompt: run.prompt }).map((item) => item.commandName)).toEqual([
      "SetFontSize"
    ]);
    expect(findForbiddenTwoDimensionalStyleCommands(lineThicknessArgs, { userPrompt: run.prompt }).map((item) => item.commandName)).toEqual([
      "SetLineThickness"
    ]);
    expect(decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "semantic-highlight-execute",
          toolName: "executeGeoGebraCommands",
          args: semanticArgs
        }
      }
    })).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolName: "executeGeoGebraCommands"
      }
    });
  });

  test("allows style commands for explicit 3D GeoGebra drawing requests", () => {
    const run = upsertAgentRunTool(
      upsertAgentRunTool(
        createAgentRunLedger({
          runId: "runner-allow-3d-style",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "",
            customBaseUrl: ""
          },
          prompt: "在 3D 画一个棱锥。",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:00.000Z"
        }),
        {
          toolCallId: "read-before-3d",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          startedAt: "2026-06-06T00:00:01.000Z",
          completedAt: "2026-06-06T00:00:02.000Z"
        }
      ),
      {
        toolCallId: "search-before-3d",
        toolName: "searchGeoGebraCommands",
        status: "succeeded",
        args: { query: "Pyramid Polygon SetFilling GeoGebra command syntax", scope: "geometry-3d" },
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    );
    const args = {
      perspective: "T",
      commands: [
        "A = (0, 0, 0)",
        "B = (2, 0, 0)",
        "C = (0, 2, 0)",
        "base = Polygon(A, B, C)",
        "P = (0, 0, 3)",
        "pyr = Pyramid(base, P)",
        "SetFilling(base, 0.25)"
      ]
    };

    expect(findForbiddenTwoDimensionalStyleCommands(args)).toEqual([]);
    expect(decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "styled-3d-execute",
          toolName: "executeGeoGebraCommands",
          args
        }
      }
    })).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolCallId: "styled-3d-execute",
        toolName: "executeGeoGebraCommands"
      }
    });
  });

  test("repairs viewport commands that distort GeoGebra axis scale", () => {
    const run = upsertAgentRunTool(
      upsertAgentRunTool(
        createAgentRunLedger({
          runId: "runner-block-distorted-zoom",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "",
            customBaseUrl: ""
          },
          prompt: "把当前构造调整到正常视野。",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:00.000Z"
        }),
        {
          toolCallId: "read-before-zoom",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          startedAt: "2026-06-06T00:00:01.000Z",
          completedAt: "2026-06-06T00:00:02.000Z"
        }
      ),
      {
        toolCallId: "search-before-zoom",
        toolName: "searchGeoGebraCommands",
        status: "succeeded",
        args: { query: "ZoomIn SetAxesRatio GeoGebra", scope: "global" },
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    );

    expect(findForbiddenViewportScaleCommands({ commands: ["ZoomIn(-3, -1.2, 3, 3.4)"] })).toEqual([
      {
        command: "ZoomIn(-3, -1.2, 3, 3.4)",
        commandName: "ZoomIn",
        reason: "non_uniform_zoom_bounds"
      }
    ]);
    expect(findForbiddenViewportScaleCommands({ commands: ["ZoomIn(-3, -3, 3, 3)", "SetAxesRatio(1, 1)"] })).toEqual([]);
    expect(findForbiddenViewportScaleCommands({ commands: ["SetAxesRatio(2, 1)"] })).toEqual([
      {
        command: "SetAxesRatio(2, 1)",
        commandName: "SetAxesRatio",
        reason: "non_unit_axis_ratio"
      }
    ]);

    expect(decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "distorted-zoom",
          toolName: "executeGeoGebraCommands",
          args: { commands: ["ZoomIn(-3, -1.2, 3, 3.4)"] }
        }
      }
    })).toMatchObject({
      type: "enqueue_tool",
      nextRequest: {
        toolName: "executeGeoGebraCommands",
        args: {
          commands: ["ZoomIn(-3, -1.9, 3, 4.1)"],
          reason: expect.stringContaining("1:1 比例")
        }
      }
    });
  });

  test("blocks oversized GeoGebra batches and dynamic coordinate text labels", () => {
    const run = upsertAgentRunTool(
      upsertAgentRunTool(
        createAgentRunLedger({
          runId: "runner-block-command-batch",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "",
            customBaseUrl: ""
          },
          prompt: "画单位圆并展示 sin 和 cos 的投影。",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:00.000Z"
        }),
        {
          toolCallId: "read-before-command-batch",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          startedAt: "2026-06-06T00:00:01.000Z",
          completedAt: "2026-06-06T00:00:02.000Z"
        }
      ),
      {
        toolCallId: "search-before-command-batch",
        toolName: "searchGeoGebraCommands",
        status: "succeeded",
        args: { query: "Circle Segment Text GeoGebra command syntax", scope: "geometry-2d" },
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    );
    const oversizedArgs = {
      commands: Array.from({ length: 101 }, (_, index) => `P${index} = (${index}, 0)`)
    };
    const dynamicTextArgs = {
      commands: [
        "P30 = (cos(30°), sin(30°))",
        "txt30 = Text(\"cos30°=\"+x(P30)+\" sin30°=\"+y(P30), (0.2, -0.4))"
      ]
    };

    expect(findGeoGebraCommandBatchPolicyViolations(oversizedArgs)).toEqual([
      {
        reason: "too_many_commands",
        commandCount: 101,
        maxCommands: 100
      }
    ]);
    expect(geogebraCommandBatchPolicyMessage(findGeoGebraCommandBatchPolicyViolations(dynamicTextArgs))).toContain("不要在 Text");
    expect(decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "oversized-execute",
          toolName: "executeGeoGebraCommands",
          args: oversizedArgs
        }
      }
    })).toMatchObject({
      type: "workflow_blocked",
      message: expect.stringContaining("超过 100 条上限")
    });
    expect(decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "dynamic-text-execute",
          toolName: "executeGeoGebraCommands",
          args: dynamicTextArgs
        }
      }
    })).toMatchObject({
      type: "workflow_blocked",
      message: expect.stringContaining("不要在 Text")
    });
  });

  test("blocks built-in fixed axis assignments but allows axis references", () => {
    const run = upsertAgentRunTool(
      upsertAgentRunTool(
        createAgentRunLedger({
          runId: "runner-block-fixed-axis",
          conversationId: "conversation-1",
          mode: "ai-sdk",
          model: {
            provider: "openai",
            model: "gpt-5.5",
            apiKey: "",
            customBaseUrl: ""
          },
          prompt: "画出函数并求它与 x 轴的交点。",
          attachmentCount: 0,
          startedAt: "2026-06-06T00:00:00.000Z"
        }),
        {
          toolCallId: "read-before-axis-reference",
          toolName: "getCanvasContext",
          status: "succeeded",
          args: { includeXml: false },
          startedAt: "2026-06-06T00:00:01.000Z",
          completedAt: "2026-06-06T00:00:02.000Z"
        }
      ),
      {
        toolCallId: "search-before-axis-reference",
        toolName: "searchGeoGebraCommands",
        status: "succeeded",
        args: { query: "function root x axis", scope: "function-graph" },
        startedAt: "2026-06-06T00:00:03.000Z",
        completedAt: "2026-06-06T00:00:04.000Z"
      }
    );

    expect(findForbiddenFixedAxisObjectCommands({
      commands: ["f(x) = 2^(abs(x)) - 4", "Intersect(f, xAxis, -5, 0)"]
    })).toEqual([]);
    expect(findForbiddenFixedAxisObjectCommands({
      commands: ["xAxis = 0.5", "y轴: x = 0", "zAxis = 3", "z轴 = 2"]
    })).toEqual([
      {
        command: "xAxis = 0.5",
        objectName: "xAxis"
      },
      {
        command: "y轴: x = 0",
        objectName: "y轴"
      },
      {
        command: "zAxis = 3",
        objectName: "zAxis"
      },
      {
        command: "z轴 = 2",
        objectName: "z轴"
      }
    ]);
    expect(findForbiddenFixedAxisObjectCommands({
      commands: ["txt = Text(\"xAxis is fixed\", (0, 0))", "Z = Root(f, -5, 0)", "xRef: y = 0"]
    })).toEqual([]);

    expect(decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "fixed-axis-intersect",
          toolName: "executeGeoGebraCommands",
          args: { commands: ["f(x) = 2^(abs(x)) - 4", "Intersect(f, xAxis, -5, 0)"] }
        }
      }
    })).toMatchObject({
      type: "enqueue_tool"
    });

    expect(decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "fixed-axis-assignment",
          toolName: "executeGeoGebraCommands",
          args: { commands: ["f(x) = 2^(abs(x)) - 4", "xAxis = 0.5"] }
        }
      }
    })).toMatchObject({
      type: "workflow_blocked",
      message: expect.stringContaining("赋值")
    });

    expect(decideAgentRunRunnerContinuation({
      run,
      action: {
        type: "tool",
        tool: {
          toolCallId: "root-command",
          toolName: "executeGeoGebraCommands",
          args: { commands: ["f(x) = 2^(abs(x)) - 4", "Z = Root(f, -5, 0)"] }
        }
      }
    })).toMatchObject({
      type: "enqueue_tool"
    });
  });
});
