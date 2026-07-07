import {
  isAgentRunRemoteToolRequestInput,
  findAgentRunRemoteToolRequestConflict,
  type AgentRunRemoteToolRequest,
  type AgentRunRemoteToolRequestInput
} from "./remote-tool";
import {
  finishAgentRunLedger,
  findAgentRunToolCallIdReuseConflict,
  isAgentRunUsage,
  isAgentRunStartInput,
  type AgentRunLedgerRecord,
  type AgentRunStartInput,
  type AgentRunUsage
} from "./run-ledger";
import { evaluateAgentWorkflowToolRecord } from "./workflow-policy";
import {
  findForbiddenFixedAxisObjectCommands,
  findForbiddenTwoDimensionalStyleCommands,
  findForbiddenViewportScaleCommands,
  findGeoGebraCommandBatchPolicyViolations,
  fixedAxisObjectPolicyMessage,
  geogebraCommandBatchPolicyMessage,
  twoDimensionalStylePolicyMessage,
  viewportScalePolicyMessage
} from "./geogebra-style-policy";
import type { GeoGebraCommandSearchScope } from "./geogebra-command-reference";
import {
  createRequiredGeometryPlanRequest,
  createStylePolicyRepairRequest,
  createViewportScalePolicyRepairRequest,
  currentUserPromptForRecipeMatching,
  decideDeleteCommandResetReplacement,
  decideGeoGebra5CommandCompatibilitySearch,
  decideMissingCommandReferenceSearch,
  isGeometryContinuationPrompt,
  requiredGeometryPlanRecipeIdsBeforeRawCommands
} from "./runner-command-policy";
import { agentRunRunnerBudgetFor } from "./runner-lifecycle";
import {
  blockedRunnerContinuation,
  createAgentRunPostWriteCanvasVerificationRequest,
  fatalCanvasFailureReason,
  localizedRunnerText,
  localizeWorkflowBlockedReason,
  maybeFinishAfterVerifiedCanvasCompletion,
  repairCanvasRereadBlockReason,
  shouldAutoVerifyCanvasAfterWrite
} from "./runner-terminal-policy";
import type {
  AgentRunRunnerContinuationDecision,
  AgentRunRunnerModelAction,
  AgentRunRunnerPhase,
  AgentRunRunnerStartDecision,
  AgentRunRunnerStatus
} from "./runner-types";

export type {
  AgentRunRunnerBudget,
  AgentRunRunnerContinuationDecision,
  AgentRunRunnerModelAction,
  AgentRunRunnerPhase,
  AgentRunRunnerSnapshot,
  AgentRunRunnerStartDecision,
  AgentRunRunnerStartInput,
  AgentRunRunnerStatus
} from "./runner-types";
export {
  agentRunRunnerBudgetFor,
  agentRunRunnerModelPolicyFor,
  agentRunRunnerStatusFor,
  createAgentRunInitialCanvasReadRequest,
  isAgentRunRunnerStartInput
} from "./runner-lifecycle";
export {
  agentRunRequiresChoiceAnalysis,
  isChoiceAnalysisPrompt
} from "./runner-choice-policy";
export {
  agentRunRunnerPhaseFor,
  isAgentRunRunnerPhase,
  isAgentRunRunnerStatus
} from "./runner-phase";
export {
  isAgentRunRawGeoGebraCommandFallback,
  requiredGeometryPlanRecipeIdsBeforeRawCommands
} from "./runner-command-policy";
export { isAgentRunRunnerSnapshot } from "./runner-snapshot";

export function decideAgentRunRunnerStart(input: {
  run: AgentRunLedgerRecord;
  firstRequest: AgentRunRemoteToolRequestInput;
}): AgentRunRunnerStartDecision {
  if (!isAgentRunRemoteToolRequestInput(input.firstRequest)) {
    return {
      type: "workflow_blocked",
      run: input.run,
      message: localizedRunnerText(input.run, "invalidFirstTool")
    };
  }

  const workflowDecision = evaluateAgentWorkflowToolRecord(input.run.tools, input.firstRequest);
  if (!workflowDecision.allowed) {
    return {
      type: "workflow_blocked",
      run: input.run,
      message: localizeWorkflowBlockedReason(workflowDecision.reason, input.run.locale) ?? localizedRunnerText(input.run, "firstWorkflowRejected")
    };
  }

  const budget = agentRunRunnerBudgetFor({ run: input.run });
  if (budget.exhausted) {
    return {
      type: "budget_exhausted",
      run: input.run,
      budget
    };
  }

  return {
    type: "enqueue_tool",
    run: input.run,
    firstRequest: input.firstRequest
  };
}

export function decideAgentRunRunnerContinuation(input: {
  run: AgentRunLedgerRecord;
  action: AgentRunRunnerModelAction;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId" | "toolName" | "args" | "status">[];
}): AgentRunRunnerContinuationDecision {
  const fatalCanvasFailure = fatalCanvasFailureReason(input.run);
  if (fatalCanvasFailure) {
    return blockedRunnerContinuation(input.run, fatalCanvasFailure);
  }

  if (input.action.type === "finish") {
    const text = input.action.text.trim();
    if (!text) {
      return blockedRunnerContinuation(input.run, "Agent runner finish action must include non-empty text.");
    }
    if (!isAgentRunUsage(input.action.usage)) {
      return blockedRunnerContinuation(input.run, "Agent runner finish action included invalid token usage.");
    }
    return {
      type: "finish",
      run: finishAgentRunLedger(input.run, {
        status: "succeeded",
        usage: input.action.usage ?? null,
        error: null
      }),
      text: input.action.text
    };
  }

  const verifiedCanvasCompletionDecision = maybeFinishAfterVerifiedCanvasCompletion(input.run);
  if (verifiedCanvasCompletionDecision) {
    return verifiedCanvasCompletionDecision;
  }

  if (!isAgentRunRemoteToolRequestInput(input.action.tool)) {
    return blockedRunnerContinuation(input.run, localizedRunnerText(input.run, "invalidNextTool"));
  }

  const toolCallConflict = findAgentRunToolCallIdReuseConflict(input.run.tools, input.action.tool);
  if (toolCallConflict) {
    return blockedRunnerContinuation(input.run, toolCallConflict.message);
  }

  const remoteRequestConflict = findAgentRunRemoteToolRequestConflict(input.pendingToolRequests ?? [], input.action.tool);
  if (remoteRequestConflict) {
    return blockedRunnerContinuation(input.run, remoteRequestConflict.message);
  }

  const repairReadBlockReason = repairCanvasRereadBlockReason(input.run, input.action.tool);
  if (repairReadBlockReason) {
    return blockedRunnerContinuation(input.run, repairReadBlockReason);
  }

  const prematureExplanationDecision = decidePrematureExplanationReplacement({
    run: input.run,
    request: input.action.tool,
    pendingToolRequests: input.pendingToolRequests
  });
  if (prematureExplanationDecision.type === "enqueue_tool") {
    return {
      type: "enqueue_tool",
      run: input.run,
      nextRequest: prematureExplanationDecision.nextRequest
    };
  }
  if (prematureExplanationDecision.type === "block") {
    return blockedRunnerContinuation(input.run, prematureExplanationDecision.message);
  }

  const auxiliaryElementReviewDecision = decideAuxiliaryElementReviewBeforeExplanation({
    run: input.run,
    request: input.action.tool,
    pendingToolRequests: input.pendingToolRequests
  });
  if (auxiliaryElementReviewDecision.type === "enqueue_tool") {
    return {
      type: "enqueue_tool",
      run: input.run,
      nextRequest: auxiliaryElementReviewDecision.nextRequest
    };
  }
  if (auxiliaryElementReviewDecision.type === "block") {
    return blockedRunnerContinuation(input.run, auxiliaryElementReviewDecision.message);
  }

  const styleViolations = findForbiddenTwoDimensionalStyleCommands(input.action.tool.args, { userPrompt: input.run.prompt });
  if (input.action.tool.toolName === "executeGeoGebraCommands" && styleViolations.length) {
    return {
      type: "enqueue_tool",
      run: input.run,
      nextRequest: createStylePolicyRepairRequest({
        run: input.run,
        originalRequest: input.action.tool,
        violationMessage: twoDimensionalStylePolicyMessage(styleViolations, input.run.locale),
        forbiddenCommands: styleViolations.map((violation) => violation.command),
        pendingToolRequests: input.pendingToolRequests
      })
    };
  }
  const viewportViolations = findForbiddenViewportScaleCommands(input.action.tool.args);
  if (input.action.tool.toolName === "executeGeoGebraCommands" && viewportViolations.length) {
    return {
      type: "enqueue_tool",
      run: input.run,
      nextRequest: createViewportScalePolicyRepairRequest({
        run: input.run,
        originalRequest: input.action.tool,
        violationMessage: viewportScalePolicyMessage(viewportViolations, input.run.locale),
        pendingToolRequests: input.pendingToolRequests
      })
    };
  }
  const fixedAxisViolations = findForbiddenFixedAxisObjectCommands(input.action.tool.args);
  if (input.action.tool.toolName === "executeGeoGebraCommands" && fixedAxisViolations.length) {
    return blockedRunnerContinuation(input.run, fixedAxisObjectPolicyMessage(fixedAxisViolations, input.run.locale));
  }
  const commandBatchViolations = findGeoGebraCommandBatchPolicyViolations(input.action.tool.args);
  if (input.action.tool.toolName === "executeGeoGebraCommands" && commandBatchViolations.length) {
    return blockedRunnerContinuation(input.run, geogebraCommandBatchPolicyMessage(commandBatchViolations, input.run.locale));
  }

  const requiredPlanRecipeIds = requiredGeometryPlanRecipeIdsBeforeRawCommands({
    run: input.run,
    request: input.action.tool
  });
  if (requiredPlanRecipeIds.length) {
    return {
      type: "enqueue_tool",
      run: input.run,
      nextRequest: createRequiredGeometryPlanRequest({
        run: input.run,
        recipeId: requiredPlanRecipeIds[0],
        originalRequest: input.action.tool,
        pendingToolRequests: input.pendingToolRequests
      })
    };
  }
  const deleteResetDecision = decideDeleteCommandResetReplacement({
    run: input.run,
    request: input.action.tool,
    pendingToolRequests: input.pendingToolRequests
  });
  if (deleteResetDecision.type === "enqueue_tool") {
    return {
      type: "enqueue_tool",
      run: input.run,
      nextRequest: deleteResetDecision.nextRequest
    };
  }
  if (deleteResetDecision.type === "block") {
    return blockedRunnerContinuation(input.run, deleteResetDecision.message);
  }

  const commandCompatibilityDecision = decideGeoGebra5CommandCompatibilitySearch({
    run: input.run,
    request: input.action.tool,
    pendingToolRequests: input.pendingToolRequests
  });
  if (commandCompatibilityDecision.type === "enqueue_tool") {
    return {
      type: "enqueue_tool",
      run: input.run,
      nextRequest: commandCompatibilityDecision.nextRequest
    };
  }
  if (commandCompatibilityDecision.type === "block") {
    return blockedRunnerContinuation(input.run, commandCompatibilityDecision.message);
  }

  const commandReferenceDecision = decideMissingCommandReferenceSearch({
    run: input.run,
    request: input.action.tool,
    pendingToolRequests: input.pendingToolRequests
  });
  if (commandReferenceDecision.type === "enqueue_tool") {
    return {
      type: "enqueue_tool",
      run: input.run,
      nextRequest: commandReferenceDecision.nextRequest
    };
  }

  const workflowDecision = evaluateAgentWorkflowToolRecord(input.run.tools, input.action.tool);
  const nextRequest = workflowDecision.allowed
    ? input.action.tool
    : shouldAutoVerifyCanvasAfterWrite(input.run, input.action.tool)
      ? createAgentRunPostWriteCanvasVerificationRequest({
          run: input.run,
          pendingToolRequests: input.pendingToolRequests
        })
      : undefined;
  if (!nextRequest) {
    const message = localizeWorkflowBlockedReason(workflowDecision.reason, input.run.locale) ?? localizedRunnerText(input.run, "nextWorkflowRejected");
    return blockedRunnerContinuation(input.run, message);
  }

  const budget = agentRunRunnerBudgetFor({
    run: input.run,
    pendingToolRequests: input.pendingToolRequests
  });
  if (budget.exhausted) {
    return {
      type: "budget_exhausted",
      run: finishAgentRunLedger(input.run, {
        status: "failed",
        usage: null,
        error: localizedRunnerText(input.run, "budgetExhaustedError")
      }),
      text: localizedRunnerText(input.run, "budgetExhaustedText"),
      budget
    };
  }

  return {
    type: "enqueue_tool",
    run: input.run,
    nextRequest
  };
}

const prematureExplanationTools = new Set<AgentRunRemoteToolRequestInput["toolName"]>([
  "showSolutionSteps",
  "showTeachingHint",
  "showAnimationGuide",
  "showChoiceAnalysis"
]);

function decidePrematureExplanationReplacement(input: {
  run: AgentRunLedgerRecord;
  request: AgentRunRemoteToolRequestInput;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId" | "toolName" | "args" | "status">[];
}): { type: "none" } | { type: "enqueue_tool"; nextRequest: AgentRunRemoteToolRequestInput } | { type: "block"; message: string } {
  if (!prematureExplanationTools.has(input.request.toolName)) return { type: "none" };
  if (hasSuccessfulCanvasWrite(input.run)) return { type: "none" };
  const currentPrompt = currentUserPromptForRecipeMatching(input.run.prompt);
  if (isGeometryContinuationPrompt(currentPrompt)) return { type: "none" };
  const hasSearchOrPlan = input.run.tools.some(
    (toolRecord) =>
      (toolRecord.toolName === "searchGeoGebraCommands" || toolRecord.toolName === "createGeometryPlan") &&
      toolRecord.status === "succeeded"
  );
  const hasPendingSearchOrPlan = input.pendingToolRequests?.some(
    (request) =>
      (request.toolName === "searchGeoGebraCommands" || request.toolName === "createGeometryPlan") &&
      request.status !== "failed" &&
      request.status !== "cancelled"
  );
  if (!hasSearchOrPlan && !hasPendingSearchOrPlan) {
    return {
      type: "enqueue_tool",
      nextRequest: createPrematureExplanationCommandSearchRequest({
        run: input.run,
        originalRequest: input.request,
        pendingToolRequests: input.pendingToolRequests
      })
    };
  }
  return {
    type: "block",
    message: input.run.locale === "en-US"
      ? "The model tried to explain before creating a canvas construction. A first-pass problem must write a GeoGebra visualization before explanation cards."
      : "模型在创建画板构造前就尝试解释；首次解题必须先写入 GeoGebra 可视化构造，再生成解释卡片。"
  };
}

function hasSuccessfulCanvasWrite(run: AgentRunLedgerRecord) {
  return run.tools.some((toolRecord) => toolRecord.toolName === "executeGeoGebraCommands" && toolRecord.status === "succeeded");
}

function decideAuxiliaryElementReviewBeforeExplanation(input: {
  run: AgentRunLedgerRecord;
  request: AgentRunRemoteToolRequestInput;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId" | "toolName" | "args" | "status">[];
}): { type: "none" } | { type: "enqueue_tool"; nextRequest: AgentRunRemoteToolRequestInput } | { type: "block"; message: string } {
  if (!prematureExplanationTools.has(input.request.toolName)) return { type: "none" };
  if (!hasSuccessfulCanvasWrite(input.run)) return { type: "none" };
  if (!hasVerificationAfterLatestCanvasWrite(input.run)) return { type: "none" };
  if (explanationRequestHasAuxiliaryElementReview(input.request)) return { type: "none" };
  const hasPendingAuxiliaryReview = input.pendingToolRequests?.some(
    (request) =>
      request.toolCallId.startsWith("auto-auxiliary-review-") &&
      request.status !== "failed" &&
      request.status !== "cancelled"
  );
  if (hasPendingAuxiliaryReview) return { type: "none" };
  if (!hasAuxiliaryReviewCanvasReadAfterLatestCanvasWrite(input.run)) {
    return {
      type: "enqueue_tool",
      nextRequest: createAuxiliaryElementReviewCanvasReadRequest({
        run: input.run,
        pendingToolRequests: input.pendingToolRequests
      })
    };
  }
  return {
    type: "block",
    message: input.run.locale === "en-US"
      ? "Before the final explanation card, review construction helper objects. Hide helper-only objects with SetConditionToShowObject(object, false), then verify the canvas again; or include auxiliaryElementReview explaining why nothing should be hidden."
      : "生成最终解释卡片前，必须先审查作图辅助元素。若存在仅用于构造的辅助对象，请用 SetConditionToShowObject(object, false) 隐藏并再次验证画布；若无需隐藏，请在 auxiliaryElementReview 中说明判断依据。"
  };
}

function explanationRequestHasAuxiliaryElementReview(request: AgentRunRemoteToolRequestInput) {
  if (!request.args || typeof request.args !== "object" || Array.isArray(request.args)) return false;
  const review = (request.args as { auxiliaryElementReview?: unknown }).auxiliaryElementReview;
  return typeof review === "string" && review.trim().length > 0;
}

function hasVerificationAfterLatestCanvasWrite(run: AgentRunLedgerRecord) {
  const latestWriteIndex = latestSuccessfulCanvasWriteIndex(run);
  if (latestWriteIndex < 0) return false;
  return run.tools.slice(latestWriteIndex + 1).some(
    (toolRecord) =>
      (toolRecord.toolName === "getCanvasContext" || toolRecord.toolName === "getPNGBase64") &&
      toolRecord.status === "succeeded"
  );
}

function hasAuxiliaryReviewCanvasReadAfterLatestCanvasWrite(run: AgentRunLedgerRecord) {
  const latestWriteIndex = latestSuccessfulCanvasWriteIndex(run);
  if (latestWriteIndex < 0) return false;
  return run.tools.slice(latestWriteIndex + 1).some(
    (toolRecord) =>
      toolRecord.toolCallId.startsWith("auto-auxiliary-review-") &&
      toolRecord.toolName === "getCanvasContext" &&
      toolRecord.status === "succeeded"
  );
}

function latestSuccessfulCanvasWriteIndex(run: AgentRunLedgerRecord) {
  for (let index = run.tools.length - 1; index >= 0; index -= 1) {
    const toolRecord = run.tools[index];
    if (toolRecord?.toolName === "executeGeoGebraCommands" && toolRecord.status === "succeeded") return index;
  }
  return -1;
}

function createAuxiliaryElementReviewCanvasReadRequest(input: {
  run: AgentRunLedgerRecord;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId">[];
}): AgentRunRemoteToolRequestInput {
  const english = input.run.locale === "en-US";
  const usedToolCallIds = new Set([
    ...input.run.tools.map((toolRecord) => toolRecord.toolCallId),
    ...(input.pendingToolRequests ?? []).map((request) => request.toolCallId)
  ]);
  let index = 1;
  while (usedToolCallIds.has(`auto-auxiliary-review-${index}`)) index += 1;
  return {
    toolCallId: `auto-auxiliary-review-${index}`,
    toolName: "getCanvasContext",
    args: {
      includeXml: false,
      reason: english
        ? "The construction has been verified. Read the canvas once more so the model can decide which helper-only objects should be hidden before final explanation."
        : "作图已经完成验证。再次读取画布，让模型判断哪些仅用于构造的辅助对象应在最终解释前隐藏。",
      intendedOutcome: english
        ? "Identify helper-only objects to hide with SetConditionToShowObject(object, false), or justify that all visible objects are key teaching/given/conclusion objects."
        : "识别需要用 SetConditionToShowObject(object, false) 隐藏的辅助对象，或说明当前可见对象都是关键教学、题设或结论对象。",
      nextExpectedAction: "hide_auxiliary_elements_or_explain_none"
    }
  };
}

function createPrematureExplanationCommandSearchRequest(input: {
  run: AgentRunLedgerRecord;
  originalRequest: AgentRunRemoteToolRequestInput;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId">[];
}): AgentRunRemoteToolRequestInput {
  const prompt = currentUserPromptForRecipeMatching(input.run.prompt);
  return {
    toolCallId: `auto-visualization-command-search-${input.run.tools.length + (input.pendingToolRequests?.length ?? 0) + 1}`,
    toolName: "searchGeoGebraCommands",
    args: {
      query: visualizationCommandSearchQuery(prompt),
      scope: visualizationCommandSearchScope(prompt),
      reason: input.run.locale === "en-US"
        ? "The model tried to explain before creating a canvas construction. Search GeoGebra syntax and force the next step back to visualization commands."
        : "模型在创建画板构造前尝试解释；先查询 GeoGebra 语法，并把下一步拉回可视化构造命令。",
      intendedOutcome: input.run.locale === "en-US"
        ? "Prepare command references so the next model step writes a GeoGebra visualization before explanation."
        : "准备命令参考，使下一步模型先写入 GeoGebra 可视化构造，再生成解释。",
      nextExpectedAction: "executeGeoGebraCommands"
    }
  };
}

function visualizationCommandSearchQuery(prompt: string) {
  const terms = [
    /圆|circle|弦|chord/i.test(prompt) ? "Circle" : "",
    /直线|line|切线|tangent/i.test(prompt) ? "Line Intersect" : "",
    /函数|function|极值|extremum/i.test(prompt) ? "Function Extremum" : "",
    /椭圆|ellipse|双曲线|hyperbola|抛物线|parabola|conic/i.test(prompt) ? "Conic" : "",
    /动点|参数|slider|animation|轨迹|locus/i.test(prompt) ? "Slider Locus StartAnimation" : ""
  ].filter(Boolean);
  return `${terms.length ? terms.join(" ") : "GeoGebra construction"} command syntax`;
}

function visualizationCommandSearchScope(prompt: string): GeoGebraCommandSearchScope {
  if (/3D|三维|空间|棱锥|棱柱|球|平面/u.test(prompt)) return "geometry-3d";
  if (/函数|function|极值|extremum|切线|tangent/u.test(prompt)) return "function-graph";
  if (/圆|circle|椭圆|ellipse|双曲线|hyperbola|抛物线|parabola|conic|弦/u.test(prompt)) return "conic";
  return "geometry-2d";
}
