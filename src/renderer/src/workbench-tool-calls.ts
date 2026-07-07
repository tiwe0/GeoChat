import type {
  AgentRunRemoteToolRequest,
  AgentRunRunnerSnapshot,
  AgentRunStatus,
  AgentRunToolRecord,
  DesktopFunctionCall,
  FunctionCallToolName,
  ToolExecutionResult
} from "@geochat-ai/app";
import {
  toolDisplayInfo,
  toolStatusLabel,
  type FunctionCallCard
} from "./functioncalls";
import { createRendererId } from "./ids";
import { interpolate, type Locale, type RendererI18n } from "./i18n";
import { formatIsoTime, nowLabel } from "./workbench-messages";
import type { DesktopChatMessage } from "./workbench-types";

export function localizedToolDisplayInfo(toolName: FunctionCallToolName, copy: RendererI18n) {
  return copy.tools.displays[toolName] ?? toolDisplayInfo(toolName);
}

export function localizedToolStatusLabel(toolName: FunctionCallToolName, status: DesktopFunctionCall["status"], hasError: boolean, copy: RendererI18n) {
  if (status === "running") return localizedToolDisplayInfo(toolName, copy).running;
  if (status === "done") return localizedToolDisplayInfo(toolName, copy).done;
  if (status === "error" || hasError) return localizedToolDisplayInfo(toolName, copy).error;
  return toolStatusLabel(toolName, status, hasError);
}

export type ToolCallVisualStatus = "neutral" | "success" | "repairing" | "failed";

export function toolCallVisualStatus(calls: Pick<DesktopFunctionCall, "status" | "error" | "updatedAt" | "createdAt">[] | undefined): ToolCallVisualStatus {
  const latest = [...(calls ?? [])]
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || "");
      const rightTime = Date.parse(right.updatedAt || right.createdAt || "");
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
      return 0;
    })
    .at(-1);
  if (!latest) return "neutral";
  if (latest.status === "requested" || latest.status === "running") return "repairing";
  if (latest.status === "error" || Boolean(latest.error)) return "failed";
  if (latest.status === "done") return "success";
  return "neutral";
}

export function toolExecutionResult(call: DesktopFunctionCall) {
  return call.result as ToolExecutionResult | undefined;
}

export function commandResultsForCall(call: DesktopFunctionCall) {
  return toolExecutionResult(call)?.results ?? [];
}

export function metricForCall(call: DesktopFunctionCall, copy: RendererI18n) {
  const result = toolExecutionResult(call);
  if (call.toolName === "executeGeoGebraCommands") return interpolate(copy.tools.commandCount, { count: commandResultsForCall(call).length });
  if (call.toolName === "createGeometryPlan") {
    const plan = geometryPlanPayloadFromCall(call)?.plan;
    return plan && typeof plan === "object" && "steps" in plan && Array.isArray(plan.steps) ? interpolate(copy.tools.stepCount, { count: plan.steps.length }) : copy.tools.plan;
  }
  if (call.toolName === "getCanvasContext") {
    const context = result?.canvasContext;
    if (context && typeof context === "object" && "element_count" in context) return interpolate(copy.tools.objectCount, { count: Number(context.element_count) });
  }
  if (call.toolName === "getPNGBase64") {
    const value = result?.result;
    if (value && typeof value === "object" && "byteEstimate" in value) return `${Math.round(Number(value.byteEstimate) / 1024)} KB`;
  }
  if (call.toolName === "searchGeoGebraCommands") return interpolate(copy.tools.referenceCount, { count: Array.isArray(result?.result) ? result.result.length : 0 });
  return localizedToolDisplayInfo(call.toolName, copy).metric;
}

export function geometryPlanPayloadFromCall(call: DesktopFunctionCall) {
  if (call.toolName !== "createGeometryPlan") return null;
  const result = toolExecutionResult(call)?.result;
  if (!result || typeof result !== "object") return null;
  return result as {
    plan?: {
      title?: string;
      taskType?: string;
      objects?: Array<{ id?: string; kind?: string; subtype?: string; role?: string }>;
      steps?: Array<{ id?: string; kind?: string; output?: string; object?: string }>;
      verificationTargets?: Array<{ kind?: string; object?: string; expected?: string; dependsOn?: string[]; description?: string }>;
      explanationGoals?: string[];
    };
    compilation?: { commands?: string[]; warnings?: string[] };
    executeArgs?: { commands?: string[] };
  };
}

export function geometryPlanCardFromCall(call: DesktopFunctionCall, copy: RendererI18n): FunctionCallCard | null {
  const payload = geometryPlanPayloadFromCall(call);
  const plan = payload?.plan;
  if (!plan) return null;
  const objects = plan.objects ?? [];
  const steps = plan.steps ?? [];
  const verificationTargets = plan.verificationTargets ?? [];
  const commands = payload?.executeArgs?.commands ?? payload?.compilation?.commands ?? [];
  return {
    title: plan.title ?? copy.cards.geometryPlanTitle,
    summary: [
      interpolate(copy.cards.taskType, { type: plan.taskType ?? "construct" }),
      objects.length ? interpolate(copy.cards.objects, { objects: objects.map((object) => [object.id, object.subtype ?? object.kind].filter(Boolean).join(":")).join(", ") }) : "",
      verificationTargets.length ? interpolate(copy.cards.verificationTargets, { count: verificationTargets.length }) : ""
    ].filter(Boolean).join("; "),
    steps: steps.map((step, index) => ({
      label: `${index + 1}. ${step.kind ?? "step"}`,
      body: [step.output ?? step.object, step.id].filter(Boolean).join(" / ")
    })),
    items: [
      ...verificationTargets.map((target) => verificationTargetText(target, copy)),
      ...(payload?.compilation?.warnings ?? []).map((warning) => interpolate(copy.cards.warning, { warning })),
      ...(plan.explanationGoals ?? []).map((goal) => interpolate(copy.cards.explanationGoal, { goal }))
    ],
    commands
  };
}

function verificationTargetText(target: { kind?: string; object?: string; expected?: string; dependsOn?: string[]; description?: string }, copy: RendererI18n) {
  if (target.kind === "object_exists") return interpolate(copy.cards.verifyObjectExists, { object: target.object ?? "--" });
  if (target.kind === "object_type") return interpolate(copy.cards.verifyObjectType, { object: target.object ?? "--", expected: target.expected ?? "--" });
  if (target.kind === "dependency") return interpolate(copy.cards.verifyDependency, { object: target.object ?? "--", dependsOn: target.dependsOn?.join(", ") ?? "--" });
  return target.description ?? interpolate(copy.cards.verifyRelation, { kind: target.kind ?? "geometry relation" });
}

export function geometryVerificationReportFromCall(call: DesktopFunctionCall) {
  const result = toolExecutionResult(call);
  if (!result || typeof result !== "object") return null;
  const direct = (result as { geometryVerification?: unknown }).geometryVerification;
  if (direct && typeof direct === "object") return direct as { passed?: boolean; results?: Array<{ status?: string; message?: string }> };
  const clientMeta = result.clientMeta;
  if (clientMeta && typeof clientMeta === "object" && "geometryVerification" in clientMeta) {
    const report = (clientMeta as { geometryVerification?: unknown }).geometryVerification;
    if (report && typeof report === "object") return report as { passed?: boolean; results?: Array<{ status?: string; message?: string }> };
  }
  return null;
}

export function geometryVerificationCardFromCall(call: DesktopFunctionCall, copy: RendererI18n): FunctionCallCard | null {
  if (call.toolName !== "getCanvasContext") return null;
  const report = geometryVerificationReportFromCall(call);
  if (!report?.results?.length) return null;
  const failed = report.results.filter((item) => item.status === "failed");
  const unknown = report.results.filter((item) => item.status === "unknown");
  return {
    title: report.passed ? copy.cards.verificationPassedTitle : copy.cards.verificationNeedsCheckTitle,
    summary: report.passed
      ? copy.cards.verificationPassedSummary
      : interpolate(copy.cards.verificationNeedsCheckSummary, { failed: failed.length, unknown: unknown.length }),
    items: report.results.map((item) => `${item.status === "passed" ? copy.cards.passed : item.status === "failed" ? copy.cards.failed : copy.cards.unknown}: ${item.message ?? ""}`)
  };
}

export function displayCardFromCall(call: DesktopFunctionCall, copy: RendererI18n): FunctionCallCard | null {
  const geometryPlanCard = geometryPlanCardFromCall(call, copy);
  if (geometryPlanCard) return geometryPlanCard;
  const geometryVerificationCard = geometryVerificationCardFromCall(call, copy);
  if (geometryVerificationCard) return geometryVerificationCard;
  if (!["showSolutionSteps", "showTeachingHint", "showAnimationGuide", "showChoiceAnalysis", "showSelectedElements"].includes(call.toolName)) return null;
  const result = toolExecutionResult(call)?.result;
  if (!result || typeof result !== "object") return call.args as FunctionCallCard;
  return result as FunctionCallCard;
}

export function cardsFromToolCalls(calls: DesktopFunctionCall[], copy: RendererI18n) {
  return calls.map((call) => displayCardFromCall(call, copy)).filter((card): card is FunctionCallCard => Boolean(card));
}

export function runStatusFromToolCall(call: DesktopFunctionCall): AgentRunStatus {
  if (call.status === "done") return "succeeded";
  if (call.status === "error") return "failed";
  return "running";
}

export function ledgerToolFromCall(call: DesktopFunctionCall): AgentRunToolRecord {
  const result = toolExecutionResult(call);
  return {
    toolCallId: call.callId,
    toolName: call.toolName,
    status: runStatusFromToolCall(call),
    args: call.args,
    result: call.result,
    canvasBefore: result?.canvasBefore,
    canvasAfter: result?.canvasAfter ?? result?.canvasContext,
    error: call.error ?? null,
    startedAt: call.createdAt,
    completedAt: call.status === "done" || call.status === "error" ? call.updatedAt : null
  };
}

export function desktopCallFromRemoteToolRequest(request: AgentRunRemoteToolRequest): DesktopFunctionCall {
  const now = new Date().toISOString();
  return {
    id: `tool-${request.toolCallId}`,
    callId: request.toolCallId,
    toolName: request.toolName,
    args: request.args as DesktopFunctionCall["args"],
    status: "requested",
    createdAt: request.requestedAt || now,
    updatedAt: now
  };
}

export function desktopCallFromLedgerTool(tool: AgentRunToolRecord): DesktopFunctionCall {
  const status =
    tool.status === "succeeded" ? "done" :
    tool.status === "failed" || tool.status === "cancelled" ? "error" :
    "running";
  return {
    id: `tool-${tool.toolCallId}`,
    callId: tool.toolCallId,
    toolName: tool.toolName,
    args: tool.args as DesktopFunctionCall["args"],
    status,
    result: tool.result,
    error: tool.error ?? null,
    createdAt: tool.startedAt,
    updatedAt: tool.completedAt ?? tool.startedAt
  };
}

export function mergeLedgerToolCalls(calls: DesktopFunctionCall[], tools: AgentRunToolRecord[]) {
  const next = [...calls];
  for (const tool of tools) {
    const call = desktopCallFromLedgerTool(tool);
    const existingIndex = next.findIndex((item) => item.callId === call.callId);
    if (existingIndex >= 0) next[existingIndex] = call;
    else next.push(call);
  }
  return next;
}

export function runnerFinishedText(snapshot: AgentRunRunnerSnapshot, copy: RendererI18n) {
  const finishedDecision = [...(snapshot.policyDecisions ?? [])].reverse().find((decision) => decision.kind === "runner_finished");
  return finishedDecision?.message || copy.chat.constructionSynced;
}

export function assistantContentFromRunnerSnapshot(snapshot: AgentRunRunnerSnapshot, fallback: string, copy: RendererI18n) {
  if (snapshot.run.error) return snapshot.run.error;
  if (snapshot.run.status === "succeeded") return runnerFinishedText(snapshot, copy);
  if (snapshot.run.status === "failed") return copy.status.failed;
  if (snapshot.run.status === "cancelled") return copy.status.cancelled;
  return fallback;
}

export function chatMessagesFromRunnerSnapshot(snapshot: AgentRunRunnerSnapshot, input: { assistantFallback: string; createdAt?: string; copy: RendererI18n; locale?: Locale }) {
  const toolCalls = snapshot.run.tools.map(desktopCallFromLedgerTool);
  const assistantCreatedAt = input.createdAt ?? nowLabel(input.locale);
  const assistantContent = assistantContentFromRunnerSnapshot(snapshot, input.assistantFallback, input.copy);
  const userMessage: DesktopChatMessage = {
    id: snapshot.run.userMessageId ?? createRendererId(),
    role: "user",
    content: snapshot.run.prompt,
    createdAt: formatIsoTime(snapshot.run.startedAt, input.locale),
    createdAtIso: snapshot.run.startedAt
  };
  const assistantMessage: DesktopChatMessage = {
    id: snapshot.run.assistantMessageId ?? createRendererId(),
    role: "assistant",
    content: assistantContent,
    createdAt: assistantCreatedAt,
    createdAtIso: snapshot.run.startedAt,
    activity: snapshot.status === "waiting_for_tool" || snapshot.status === "running"
      ? { kind: "backend_cached_tool" }
      : undefined,
    toolCalls,
    cards: cardsFromToolCalls(toolCalls, input.copy),
    usage: snapshot.run.usage ?? undefined
  };
  return { userMessage, assistantMessage, toolCalls, assistantContent };
}

export function nextRunnableToolRequest(runner: AgentRunRunnerSnapshot | undefined) {
  return runner?.pendingToolRequests.find((request) => request.status === "pending" || request.status === "running");
}
