import { geogebraCanvasVisualGuidance } from "./canvas-visual-guidance";
import type { AgentRunRemoteToolRequest, AgentRunRemoteToolRequestInput } from "./remote-tool";
import { finishAgentRunLedger, type AgentRunLedgerRecord } from "./run-ledger";
import { deriveAgentWorkflowStateFromTools } from "./workflow-policy";
import { latestSuccessfulExecuteTimestamp, timestampForRunnerTool } from "./runner-phase";
import type { AgentRunRunnerContinuationDecision } from "./runner-types";

export function blockedRunnerContinuation(
  run: AgentRunLedgerRecord,
  message: string
): Extract<AgentRunRunnerContinuationDecision, { type: "workflow_blocked" }> {
  return {
    type: "workflow_blocked",
    run: finishAgentRunLedger(run, {
      status: "failed",
      usage: null,
      error: message
    }),
    message
  };
}

export function maybeFinishAfterVerifiedCanvasCompletion(
  run: AgentRunLedgerRecord
): Extract<AgentRunRunnerContinuationDecision, { type: "finish" }> | undefined {
  const workflowState = deriveAgentWorkflowStateFromTools(run.tools);
  if (!workflowState.hasCanvasWrite || !workflowState.hasVerificationAfterWrite) return undefined;
  const latestWrite = [...run.tools]
    .reverse()
    .find((toolRecord) => toolRecord.status === "succeeded" && toolRecord.toolName === "executeGeoGebraCommands");
  if (!latestWrite || !looksLikeCompletionVerification(recordString(latestWrite.args, "nextExpectedAction"))) return undefined;
  return {
    type: "finish",
    run: finishAgentRunLedger(run, {
      status: "succeeded",
      usage: null,
      error: null
    }),
    text: verifiedCanvasCompletionText(run.locale, recordString(latestWrite.args, "intendedOutcome"))
  };
}

function looksLikeCompletionVerification(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  const asksForContinuation = /再|继续|下一步|then|next|continue|after verification|after verifying/u.test(normalized);
  if (asksForContinuation) return false;
  const verifiesCanvas = /验证|确认|verify|verified|verification|confirm|check/u.test(normalized);
  const declaresCompletion = /完成|成功|已|complete|completed|done|success|succeeded/u.test(normalized);
  return verifiesCanvas && declaresCompletion;
}

function verifiedCanvasCompletionText(locale: AgentRunLedgerRecord["locale"], intendedOutcome?: string) {
  if (locale === "en-US") {
    return intendedOutcome ? `Canvas verified. ${intendedOutcome}` : "Canvas verified. The requested construction is complete.";
  }
  return intendedOutcome ? `画布已验证，${intendedOutcome}` : "画布已验证，构造目标已完成。";
}

function recordString(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

export function shouldAutoVerifyCanvasAfterWrite(
  run: AgentRunLedgerRecord,
  request: Pick<AgentRunRemoteToolRequestInput, "toolName">
) {
  if (request.toolName === "getCanvasContext" || request.toolName === "getPNGBase64") return false;
  const workflowState = deriveAgentWorkflowStateFromTools(run.tools);
  return workflowState.hasCanvasWrite && !workflowState.hasVerificationAfterWrite;
}

export function createAgentRunPostWriteCanvasVerificationRequest(input: {
  run: AgentRunLedgerRecord;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId">[];
}): AgentRunRemoteToolRequestInput {
  const english = input.run.locale === "en-US";
  const usedToolCallIds = new Set([
    ...input.run.tools.map((toolRecord) => toolRecord.toolCallId),
    ...(input.pendingToolRequests ?? []).map((request) => request.toolCallId)
  ]);
  let index = 1;
  while (usedToolCallIds.has(`post-write-canvas-verify-${index}`)) index += 1;
  return {
    toolCallId: `post-write-canvas-verify-${index}`,
    toolName: "getCanvasContext",
    args: {
      includeXml: false,
      reason: english
        ? "The model tried to continue after writing to the canvas. The harness is verifying the GeoGebra canvas first."
        : "模型写入画布后尝试继续构造或解释，harness 先自动验证 GeoGebra 画布。",
      intendedOutcome: english
        ? `Confirm the written objects and canvas state before allowing more construction or explanation. ${geogebraCanvasVisualGuidance("en-US")}`
        : `确认已写入对象和画布状态，再允许继续构造或生成解释。${geogebraCanvasVisualGuidance("zh-CN")}`,
      nextExpectedAction: "continue_after_canvas_verification"
    }
  };
}

export function localizedRunnerText(
  run: Pick<AgentRunLedgerRecord, "locale">,
  key:
    | "invalidFirstTool"
    | "firstWorkflowRejected"
    | "invalidNextTool"
    | "nextWorkflowRejected"
    | "budgetExhaustedError"
    | "budgetExhaustedText"
) {
  const english = run.locale === "en-US";
  const texts = {
    invalidFirstTool: english ? "Agent runner first tool must be a valid remote tool request input." : "Agent runner first tool must be a valid remote tool request input.",
    firstWorkflowRejected: english ? "Agent workflow rejected the first tool request." : "Agent workflow rejected the first tool request.",
    invalidNextTool: english ? "Agent runner tool action must be a valid remote tool request input." : "Agent runner tool action must be a valid remote tool request input.",
    nextWorkflowRejected: english ? "Agent workflow rejected the next tool request." : "Agent workflow rejected the next tool request.",
    budgetExhaustedError: english ? "Agent runner tool budget was exhausted before the next tool request." : "Agent runner tool budget exhausted before the next tool request.",
    budgetExhaustedText: english ? "The backend agent reached the tool-call budget for the current model and stopped this run." : "后端 Agent 已达到当前模型的工具调用预算，已停止本轮编排。"
  };
  return texts[key];
}

export function localizeWorkflowBlockedReason(reason: string | undefined | null, locale?: AgentRunLedgerRecord["locale"]) {
  if (!reason || locale !== "en-US") return reason ?? undefined;
  if (reason === "工作流要求第一步必须读取 GeoGebra 画布上下文。") {
    return "The workflow requires the first step to read the GeoGebra canvas context.";
  }
  if (reason === "画布构造写入后必须先通过 getCanvasContext 或 getPNGBase64 验证，再继续构造或生成解释。") {
    return "After writing to the canvas, the workflow must verify with getCanvasContext or getPNGBase64 before continuing construction or generating explanations.";
  }
  const phaseMatch = reason.match(/^当前工作流阶段 (.+) 不允许调用 (.+)。$/);
  if (phaseMatch) {
    return `The current workflow phase ${phaseMatch[1]} does not allow calling ${phaseMatch[2]}.`;
  }
  return reason;
}

export function repairCanvasRereadBlockReason(
  run: AgentRunLedgerRecord,
  request: Pick<AgentRunRemoteToolRequestInput, "toolName">
) {
  if (request.toolName !== "getCanvasContext" && request.toolName !== "getPNGBase64") return undefined;
  const failedExecution = latestUnresolvedFailedExecute(run);
  if (!failedExecution) return undefined;
  if (!hasSuccessfulCanvasReadAfter(run, timestampForRunnerTool(failedExecution))) return undefined;
  return run.locale === "en-US"
    ? "After a GeoGebra command failure, the runner has already captured repair context. The next repair step must execute corrected GeoGebra commands instead of rereading the canvas."
    : "GeoGebra 命令失败后，runner 已经读取过修复上下文；下一步必须执行修复命令，不能继续重复读取画布。";
}

function latestUnresolvedFailedExecute(run: AgentRunLedgerRecord) {
  const latestSuccessfulExecuteAt = latestSuccessfulExecuteTimestamp(run);
  return [...run.tools]
    .reverse()
    .find(
      (toolRecord) =>
        toolRecord.toolName === "executeGeoGebraCommands" &&
        toolRecord.status === "failed" &&
        timestampForRunnerTool(toolRecord) > latestSuccessfulExecuteAt
    );
}

function hasSuccessfulCanvasReadAfter(run: AgentRunLedgerRecord, timestamp: number) {
  return run.tools.some(
    (toolRecord) =>
      toolRecord.toolName === "getCanvasContext" &&
      toolRecord.status === "succeeded" &&
      timestampForRunnerTool(toolRecord) > timestamp
  );
}

export function fatalCanvasFailureReason(run: AgentRunLedgerRecord) {
  const latestExecute = [...run.tools]
    .filter((toolRecord) => toolRecord.toolName === "executeGeoGebraCommands")
    .sort((left, right) => new Date(right.completedAt ?? right.startedAt).getTime() - new Date(left.completedAt ?? left.startedAt).getTime())[0];
  if (!latestExecute || latestExecute.status !== "failed") return undefined;
  const failureTexts = [latestExecute.error, ...toolResultFailureTexts(latestExecute.result)].filter((text): text is string => typeof text === "string");
  if (failureTexts.some(isTerminalCanvasFailureText)) {
    return run.locale === "en-US"
      ? "Canvas construction hit a terminal renderer timeout or GeoGebra readiness failure; the runner stopped instead of retrying indefinitely."
      : "画布构造遇到终止性的渲染超时或 GeoGebra 未就绪错误，runner 已停止本轮编排，避免无限重试。";
  }
  return undefined;
}

function isTerminalCanvasFailureText(text: string) {
  return /timed out|timeout|GeoGebra applet is not ready/i.test(text);
}

function toolResultFailureTexts(value: unknown, depth = 0): string[] {
  if (depth > 8) return [];
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => toolResultFailureTexts(item, depth + 1));

  const output: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "error" || normalizedKey === "message" || normalizedKey === "reason") {
      output.push(...toolResultFailureTexts(child, depth + 1));
      continue;
    }
    if (child && typeof child === "object") {
      output.push(...toolResultFailureTexts(child, depth + 1));
    }
  }
  return output;
}
