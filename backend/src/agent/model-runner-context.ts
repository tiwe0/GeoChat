import type { ModelMessage } from "ai";
import type {
  AgentRunImageAttachment,
  AgentRunLedgerRecord,
  AgentRunRemoteToolRequestInput,
  AgentRunUsage
} from "@geochat-ai/app";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue | undefined };

const GEOCHAT_REPAIR_ATTEMPTS = 1;

export type BackendRepairAction =
  | {
      type: "tool";
      source: "policy";
      tool: AgentRunRemoteToolRequestInput;
    }
  | {
      type: "finish";
      source: "policy";
      text: string;
      usage?: AgentRunUsage;
    };

export function maybeCreateRepairAction(run: AgentRunLedgerRecord): BackendRepairAction | undefined {
  const failedExecution = latestUnresolvedFailedExecute(run);
  if (!failedExecution) return undefined;
  if (hasFailureCardAfter(run, failedExecution.completedAt ?? failedExecution.startedAt)) {
    return {
      type: "finish",
      source: "policy",
      text: isEnglishLocale(run.locale)
        ? "GeoGebra command repair could not be completed. A failure explanation card was generated."
        : "GeoGebra 命令修复未能完成，已生成失败说明卡片。"
    };
  }
  if (failedExecuteCountSinceLastSuccessfulExecute(run) > GEOCHAT_REPAIR_ATTEMPTS) {
    return {
      type: "tool",
      source: "policy",
      tool: {
        toolCallId: `${failedExecution.toolCallId}-repair-failure`,
        toolName: "showSolutionSteps",
        args: {
          ...repairFailureCardArgs(run, failedExecution),
          nextExpectedAction: "final_answer"
        }
      }
    };
  }
  if (!hasSuccessfulCanvasReadAfter(run, failedExecution.completedAt ?? failedExecution.startedAt)) {
    return {
      type: "tool",
      source: "policy",
      tool: {
        toolCallId: `${failedExecution.toolCallId}-repair-context`,
        toolName: "getCanvasContext",
        args: {
          includeXml: false,
          reason: isEnglishLocale(run.locale)
            ? "Read the current canvas after a command failure to provide context for repair commands."
            : "命令执行失败后读取当前画布，作为修复命令的现场上下文。",
          intendedOutcome: isEnglishLocale(run.locale)
            ? "Capture the objects, expressions, and reusable construction state after the failure."
            : "捕获失败后的对象、表达式和可继续复用的构造状态。",
          nextExpectedAction: "executeGeoGebraCommands"
        }
      }
    };
  }
  return undefined;
}

export function modelMessagesFromRun(run: AgentRunLedgerRecord, attachments: AgentRunImageAttachment[]): ModelMessage[] {
  const messages: ModelMessage[] = [createUserMessage(run.prompt, attachments)];
  for (const toolRecord of run.tools) {
    messages.push({
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: toolRecord.toolCallId,
          toolName: toolRecord.toolName,
          input: toolRecord.args
        }
      ]
    });
    messages.push({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: toolRecord.toolCallId,
          toolName: toolRecord.toolName,
          output: {
            type: "json",
            value: toJsonValue(serializableToolOutput(toolRecord))
          }
        }
      ]
    });
  }
  return messages;
}

export function createRepairUserMessage(
  run: AgentRunLedgerRecord,
  failedExecution: AgentRunLedgerRecord["tools"][number],
  attachments: AgentRunImageAttachment[]
): ModelMessage {
  const failedAt = failedExecution.completedAt ?? failedExecution.startedAt;
  const successfulCommands = successfulCommandsBefore(run, failedAt);
  const context = latestCanvasContextAfter(run, failedAt) ?? failedExecution.canvasAfter ?? failedExecution.canvasBefore ?? null;
  const prompt = isEnglishLocale(run.locale)
    ? [
        "Original user request:",
        run.prompt,
        "",
        "A GeoGebra command failed and needs repair. Use the structured information below to generate a more conservative next tool call.",
        "",
        "Failed commands:",
        JSON.stringify(failedCommands(failedExecution), null, 2),
        "",
        "Error message:",
        failedExecution.error ?? "GeoGebra did not return a clear error.",
        "",
        "Previously successful commands:",
        JSON.stringify(successfulCommands, null, 2),
        "",
        "Current canvas context:",
        JSON.stringify(context, null, 2),
        "",
        "Recent tool trace:",
        JSON.stringify(toolTraceForRepair(run), null, 2),
        "",
        `Repair budget: at most ${GEOCHAT_REPAIR_ATTEMPTS} attempt(s). This is the repair after failure ${failedExecuteCountSinceLastSuccessfulExecute(run)}.`,
        "Return executeGeoGebraCommands with repair commands now. Do not call getCanvasContext or getPNGBase64 again; the current canvas context is already included above. If repair is not possible, use showSolutionSteps with a structured failure reason."
      ].join("\n")
    : [
        "原始用户请求：",
        run.prompt,
        "",
        "需要修复的 GeoGebra 命令失败了。请根据下面的结构化信息，生成更保守的下一步工具调用。",
        "",
        "失败命令：",
        JSON.stringify(failedCommands(failedExecution), null, 2),
        "",
        "错误信息：",
        failedExecution.error ?? "GeoGebra 未返回明确错误。",
        "",
        "此前已成功执行的命令：",
        JSON.stringify(successfulCommands, null, 2),
        "",
        "当前画布上下文：",
        JSON.stringify(context, null, 2),
        "",
        "最近工具轨迹：",
        JSON.stringify(toolTraceForRepair(run), null, 2),
        "",
        `修复预算：最多 ${GEOCHAT_REPAIR_ATTEMPTS} 次。当前是第 ${failedExecuteCountSinceLastSuccessfulExecute(run)} 次失败后的修复。`,
        "现在必须返回 executeGeoGebraCommands 修复命令。不要再次调用 getCanvasContext 或 getPNGBase64；当前画布上下文已经包含在上方。如果无法修复，用 showSolutionSteps 给出结构化失败原因。"
      ].join("\n");
  return createUserMessage(prompt, attachments);
}

export function latestUnresolvedFailedExecute(run: AgentRunLedgerRecord) {
  const latestSuccessfulExecuteAt = latestSuccessfulExecuteTimestamp(run);
  return [...run.tools]
    .reverse()
    .find(
      (toolRecord) =>
        toolRecord.toolName === "executeGeoGebraCommands" &&
        toolRecord.status === "failed" &&
        timestampForTool(toolRecord) > latestSuccessfulExecuteAt
    );
}

function repairFailureCardArgs(run: AgentRunLedgerRecord, failedExecution: AgentRunLedgerRecord["tools"][number]) {
  if (isEnglishLocale(run.locale)) {
    return {
      title: "GeoGebra command repair failed",
      summary: "GeoChat tried to repair the failed command, but the repaired construction still did not execute in GeoGebra.",
      answer: "Check the problem conditions, object names, or GeoGebra command syntax before trying again.",
      steps: [
        { label: "Failed commands", body: failedCommands(failedExecution).join("\n") || "Could not parse the failed commands." },
        { label: "Error message", body: failedExecution.error ?? "GeoGebra did not return a clear error." },
        { label: "Next suggestion", body: "Split the construction into smaller steps, or first ask for GeoGebra command references." }
      ],
      reason: "The repair retry budget is exhausted, so the user needs a structured failure explanation.",
      intendedOutcome: "Help the user identify the failure point and the next actionable step."
    };
  }
  return {
    title: "GeoGebra 命令修复失败",
    summary: "系统已尝试修复失败命令，但修复后的构造仍未通过 GeoGebra 执行。",
    answer: "请检查题目条件、对象命名或 GeoGebra 命令语法后再试。",
    steps: [
      { label: "失败命令", body: failedCommands(failedExecution).join("\n") || "未能解析失败命令。" },
      { label: "错误信息", body: failedExecution.error ?? "GeoGebra 未返回明确错误。" },
      { label: "后续建议", body: "可以把构造拆成更小步骤，或先要求查询 GeoGebra 命令参考。" }
    ],
    reason: "修复重试预算已耗尽，需要向用户展示结构化失败原因。",
    intendedOutcome: "让用户知道失败位置和下一步可操作建议。"
  };
}

function latestSuccessfulExecuteTimestamp(run: AgentRunLedgerRecord) {
  return Math.max(
    0,
    ...run.tools
      .filter((toolRecord) => toolRecord.toolName === "executeGeoGebraCommands" && toolRecord.status === "succeeded")
      .map(timestampForTool)
  );
}

function failedExecuteCountSinceLastSuccessfulExecute(run: AgentRunLedgerRecord) {
  const latestSuccessfulAt = latestSuccessfulExecuteTimestamp(run);
  return run.tools.filter(
    (toolRecord) =>
      toolRecord.toolName === "executeGeoGebraCommands" &&
      toolRecord.status === "failed" &&
      timestampForTool(toolRecord) > latestSuccessfulAt
  ).length;
}

function hasSuccessfulCanvasReadAfter(run: AgentRunLedgerRecord, isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp).getTime();
  return run.tools.some(
    (toolRecord) =>
      toolRecord.toolName === "getCanvasContext" &&
      toolRecord.status === "succeeded" &&
      timestampForTool(toolRecord) > timestamp
  );
}

function hasFailureCardAfter(run: AgentRunLedgerRecord, isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp).getTime();
  return run.tools.some(
    (toolRecord) =>
      toolRecord.toolName === "showSolutionSteps" &&
      toolRecord.status === "succeeded" &&
      timestampForTool(toolRecord) > timestamp &&
      (JSON.stringify(toolRecord.args).includes("GeoGebra 命令修复失败") ||
        JSON.stringify(toolRecord.args).includes("GeoGebra command repair failed"))
  );
}

function latestCanvasContextAfter(run: AgentRunLedgerRecord, isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp).getTime();
  const contextRecord = [...run.tools]
    .reverse()
    .find(
      (toolRecord) =>
        toolRecord.toolName === "getCanvasContext" &&
        toolRecord.status === "succeeded" &&
        timestampForTool(toolRecord) > timestamp
    );
  return canvasContextFromTool(contextRecord);
}

function successfulCommandsBefore(run: AgentRunLedgerRecord, isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp).getTime();
  return run.tools
    .filter(
      (toolRecord) =>
        toolRecord.toolName === "executeGeoGebraCommands" &&
        toolRecord.status === "succeeded" &&
        timestampForTool(toolRecord) < timestamp
    )
    .flatMap(commandsFromTool);
}

function failedCommands(toolRecord: AgentRunLedgerRecord["tools"][number]) {
  return commandsFromTool(toolRecord);
}

function commandsFromTool(toolRecord: AgentRunLedgerRecord["tools"][number]) {
  const args = toolRecord.args as { commands?: unknown } | undefined;
  return Array.isArray(args?.commands) ? args.commands.filter((item): item is string => typeof item === "string") : [];
}

function canvasContextFromTool(toolRecord?: AgentRunLedgerRecord["tools"][number]) {
  if (!toolRecord) return undefined;
  if (toolRecord.canvasAfter !== undefined) return toolRecord.canvasAfter;
  const result = toolRecord.result;
  if (result && typeof result === "object" && "canvasContext" in result) return (result as { canvasContext?: unknown }).canvasContext;
  if (result && typeof result === "object" && "result" in result) {
    const nested = (result as { result?: unknown }).result;
    if (nested && typeof nested === "object" && "canvasContext" in nested) return (nested as { canvasContext?: unknown }).canvasContext;
  }
  return undefined;
}

function toolTraceForRepair(run: AgentRunLedgerRecord) {
  return run.tools.slice(-8).map((toolRecord) => ({
    toolCallId: toolRecord.toolCallId,
    toolName: toolRecord.toolName,
    status: toolRecord.status,
    args: toolRecord.args,
    error: toolRecord.error ?? null
  }));
}

function timestampForTool(toolRecord: AgentRunLedgerRecord["tools"][number]) {
  return new Date(toolRecord.completedAt ?? toolRecord.startedAt).getTime();
}

function createUserMessage(prompt: string, attachments: AgentRunImageAttachment[]): ModelMessage {
  if (!attachments.length) return { role: "user", content: prompt };
  return {
    role: "user",
    content: [
      { type: "text", text: prompt },
      ...attachments.map((attachment) => ({
        type: "image" as const,
        image: dataUrlPayload(attachment.dataUrl),
        mediaType: attachment.mediaType || "image/png"
      }))
    ]
  };
}

function dataUrlPayload(dataUrl: string) {
  return dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
}

function serializableToolOutput(toolRecord: AgentRunLedgerRecord["tools"][number]) {
  if (toolRecord.status === "succeeded") {
    return {
      ok: true,
      result: toolRecord.result ?? null,
      canvasBefore: toolRecord.canvasBefore ?? null,
      canvasAfter: toolRecord.canvasAfter ?? null
    };
  }
  return {
    ok: false,
    error: toolRecord.error ?? "Tool execution failed.",
    result: toolRecord.result ?? null
  };
}

function toJsonValue(value: unknown): JsonValue {
  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (typeof item === "function" || typeof item === "symbol" || item === undefined) return null;
    if (item && typeof item === "object") {
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
    }
    return item;
  });
  if (serialized === undefined) return null;
  return JSON.parse(serialized) as JsonValue;
}

function isEnglishLocale(locale: AgentRunLedgerRecord["locale"] | undefined) {
  return locale === "en-US";
}
