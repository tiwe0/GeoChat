import type { BlackboardEntry, DesktopFunctionCall } from "@geochat-ai/app";
import { toolDisplayInfo, type FunctionCallCard } from "./functioncalls";
import {
  commandResultsForCall,
  geometryPlanPayloadFromCall,
  toolExecutionResult
} from "./workbench-tool-calls";
import type { DesktopChatMessage } from "./workbench-types";

const BLACKBOARD_TEXT_LIMIT = 900;
const BLACKBOARD_LIST_LIMIT = 8;

type AgentContextBlackboard = {
  memoryEntries: string[];
  originalProblem?: string;
  previousObjective?: string;
  drawingPlan: string[];
  currentCanvas?: string;
  completedTools: string[];
  failedTools: string[];
  displayNotes: string[];
};

export function backendPromptWithBlackboard(prompt: string, previousMessages: DesktopChatMessage[], persistedEntries: BlackboardEntry[] = []) {
  const blackboard = createAgentContextBlackboard(previousMessages, persistedEntries);
  const lines = renderAgentContextBlackboard(blackboard);
  if (!lines.length) return prompt;
  return [
    prompt,
    "",
    "GeoChat 工作记忆黑板（结构化上下文；用于解析“继续”“它”“上面”“这个”等指代；如果当前消息是新题，请以当前消息为准）：",
    ...lines,
    "",
    "请基于当前用户消息继续；当当前消息是继续、补充或指代时，优先延续黑板中的原始题目、绘图思路、当前画板和失败原因。不要把黑板当作可见回复逐字复述。"
  ].join("\n");
}

function createAgentContextBlackboard(messages: DesktopChatMessage[], persistedEntries: BlackboardEntry[] = []): AgentContextBlackboard {
  const userPrompts = messages
    .filter((message) => message.role === "user")
    .map((message) => normalizeBlackboardText(message.content))
    .filter(isSubstantiveUserPrompt);
  const toolCalls = messages.flatMap((message) => message.toolCalls ?? []);
  return {
    memoryEntries: formatPersistedBlackboardMemory(persistedEntries),
    originalProblem: userPrompts[0],
    previousObjective: userPrompts.at(-1),
    drawingPlan: extractDrawingPlanMemory(messages, toolCalls),
    currentCanvas: latestCanvasMemory(toolCalls),
    completedTools: toolCalls.filter((call) => call.status === "done").slice(-BLACKBOARD_LIST_LIMIT).map(formatCompletedToolMemory),
    failedTools: toolCalls.filter((call) => call.status === "error" || Boolean(call.error)).slice(-5).map(formatFailedToolMemory),
    displayNotes: extractDisplayNoteMemory(messages)
  };
}

function renderAgentContextBlackboard(blackboard: AgentContextBlackboard) {
  const lines: string[] = [];
  if (blackboard.originalProblem) lines.push(`- 原始题目：${truncateBlackboardText(blackboard.originalProblem)}`);
  if (blackboard.memoryEntries.length) lines.push(`- 持久化关键记忆：${blackboard.memoryEntries.join("；")}`);
  if (blackboard.previousObjective && blackboard.previousObjective !== blackboard.originalProblem) {
    lines.push(`- 上一明确目标：${truncateBlackboardText(blackboard.previousObjective, 520)}`);
  }
  if (blackboard.drawingPlan.length) lines.push(`- 绘图/解题思路：${blackboard.drawingPlan.join("；")}`);
  if (blackboard.currentCanvas) lines.push(`- 当前画板：${blackboard.currentCanvas}`);
  if (blackboard.completedTools.length) lines.push(`- 已完成工具：${blackboard.completedTools.join("；")}`);
  if (blackboard.failedTools.length) lines.push(`- 失败/风险：${blackboard.failedTools.join("；")}`);
  if (blackboard.displayNotes.length) lines.push(`- 教学展示要点：${blackboard.displayNotes.join("；")}`);
  return lines;
}

function formatPersistedBlackboardMemory(entries: BlackboardEntry[]) {
  return entries
    .filter((entry) => entry.status === "active")
    .map((entry) => `[${entry.category}/${entry.key}] ${truncateBlackboardText(entry.value, 520)}（置信度 ${Math.round(entry.confidence * 100)}%，原因：${truncateBlackboardText(entry.reason, 180)}）`)
    .slice(0, BLACKBOARD_LIST_LIMIT);
}

function extractDrawingPlanMemory(messages: DesktopChatMessage[], toolCalls: DesktopFunctionCall[]) {
  const notes: string[] = [];
  for (const call of toolCalls) {
    if (call.toolName === "createGeometryPlan" && call.status === "done") {
      const payload = geometryPlanPayloadFromCall(call);
      const plan = payload?.plan;
      const title = plan?.title ? truncateBlackboardText(plan.title, 180) : "";
      const steps = plan?.steps?.slice(0, 5).map((step) => [step.output ?? step.object, step.kind].filter(Boolean).join("/")).filter(Boolean) ?? [];
      const commands = payload?.executeArgs?.commands ?? payload?.compilation?.commands ?? [];
      notes.push([
        title ? `方案 ${title}` : "已生成几何方案",
        steps.length ? `步骤 ${steps.join(", ")}` : "",
        commands.length ? `命令 ${commands.slice(0, 6).join(" | ")}` : ""
      ].filter(Boolean).join("，"));
    }
    if (call.toolName === "executeGeoGebraCommands" && call.status === "done") {
      const results = commandResultsForCall(call);
      if (results.length) notes.push(`已写入画板命令 ${results.length} 条：${results.slice(-5).map((result) => result.command).join(" | ")}`);
    }
  }
  for (const card of latestFunctionCards(messages)) {
    const brief = formatFunctionCardMemory(card);
    if (brief) notes.push(brief);
  }
  return uniqueNonEmpty(notes).slice(-BLACKBOARD_LIST_LIMIT).map((item) => truncateBlackboardText(item, 520));
}

function extractDisplayNoteMemory(messages: DesktopChatMessage[]) {
  return uniqueNonEmpty(
    latestFunctionCards(messages).flatMap((card) => [
      card.summary ?? "",
      card.answer ?? "",
      ...(card.items ?? []),
      ...(card.observations ?? [])
    ])
  ).slice(-6).map((item) => truncateBlackboardText(item, 360));
}

function latestFunctionCards(messages: DesktopChatMessage[]) {
  return messages.flatMap((message) => message.cards ?? []).slice(-6);
}

function formatFunctionCardMemory(card: FunctionCallCard) {
  const parts = [
    card.title,
    card.summary ?? "",
    card.answer ?? "",
    ...(card.steps?.slice(0, 4).map((step) => [step.label, step.body].filter(Boolean).join(": ")) ?? []),
    ...(card.commands?.slice(0, 4) ?? [])
  ];
  return uniqueNonEmpty(parts).join("，");
}

function latestCanvasMemory(toolCalls: DesktopFunctionCall[]) {
  for (const call of [...toolCalls].reverse()) {
    const canvas = canvasContextFromToolCall(call);
    const summary = formatCanvasMemory(canvas);
    if (summary) return summary;
  }
  return undefined;
}

function canvasContextFromToolCall(call: DesktopFunctionCall) {
  const result = toolExecutionResult(call);
  const nestedResult = result?.result;
  if (result?.canvasAfter !== undefined) return result.canvasAfter;
  if (result?.canvasContext !== undefined) return result.canvasContext;
  if (nestedResult && typeof nestedResult === "object" && "canvasAfter" in nestedResult) {
    return (nestedResult as { canvasAfter?: unknown }).canvasAfter;
  }
  if (nestedResult && typeof nestedResult === "object" && "canvasContext" in nestedResult) {
    return (nestedResult as { canvasContext?: unknown }).canvasContext;
  }
  return undefined;
}

function formatCanvasMemory(canvas: unknown) {
  if (!canvas || typeof canvas !== "object") return undefined;
  const context = canvas as {
    ready?: boolean;
    error?: string;
    element_count?: unknown;
    expression_count?: unknown;
    selectedObjects?: unknown;
    object_index?: unknown;
    expressions?: unknown;
  };
  if (context.ready === false) return context.error ? `画板不可用：${truncateBlackboardText(context.error, 240)}` : undefined;
  const objectGroups = formatCanvasObjectIndex(context.object_index);
  const expressions = Array.isArray(context.expressions)
    ? context.expressions.map(String).filter(Boolean).slice(0, 8).join(" | ")
    : "";
  const selectedObjects = Array.isArray(context.selectedObjects)
    ? context.selectedObjects.map(String).filter(Boolean).slice(0, 6).join(", ")
    : "";
  const countText = [
    typeof context.element_count === "number" ? `对象 ${context.element_count} 个` : "",
    typeof context.expression_count === "number" ? `表达式 ${context.expression_count} 个` : ""
  ].filter(Boolean).join("，");
  return truncateBlackboardText([
    countText,
    objectGroups ? `对象索引 ${objectGroups}` : "",
    expressions ? `表达式 ${expressions}` : "",
    selectedObjects ? `选中 ${selectedObjects}` : ""
  ].filter(Boolean).join("；"));
}

function formatCanvasObjectIndex(objectIndex: unknown) {
  if (!objectIndex || typeof objectIndex !== "object") return "";
  return Object.entries(objectIndex as Record<string, unknown>)
    .map(([type, labels]) => {
      if (!Array.isArray(labels)) return "";
      const names = labels.map(String).filter(Boolean).slice(0, 16);
      return names.length ? `${type}: ${names.join(", ")}` : "";
    })
    .filter(Boolean)
    .slice(0, 8)
    .join("; ");
}

function formatCompletedToolMemory(call: DesktopFunctionCall) {
  if (call.toolName === "executeGeoGebraCommands") return `构造画板 ${commandResultsForCall(call).length} 条`;
  if (call.toolName === "getCanvasContext") {
    const summary = formatCanvasMemory(canvasContextFromToolCall(call));
    return summary ? `读取画板：${summary}` : "读取画板";
  }
  return `${toolDisplayInfo(call.toolName).label}: 完成`;
}

function formatFailedToolMemory(call: DesktopFunctionCall) {
  const error = call.error ?? toolExecutionResult(call)?.error ?? "";
  return `${toolDisplayInfo(call.toolName).label}: ${truncateBlackboardText(error || "失败", 240)}`;
}

function isSubstantiveUserPrompt(value: string) {
  if (!value || isContinuationCue(value)) return false;
  if (value.length >= 18) return true;
  return /[=。？?]|函数|几何|立方体|正方体|椭圆|抛物线|证明|求|画|构造|轨迹|切线|焦点/.test(value);
}

function isContinuationCue(value: string) {
  return /^(嗯|好|好的|ok|OK|继续|接着|嗯继续|再继续|继续吧|下一步|对|是的|可以|再来一步|继续优化)[。！!,.，\s]*$/.test(value);
}

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeBlackboardText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeBlackboardText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateBlackboardText(value: string, limit = BLACKBOARD_TEXT_LIMIT) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}
