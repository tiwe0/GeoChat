import {
  agentWorkflowCanvasMutationTools,
  agentWorkflowCanvasVerificationTools,
} from "@geochat-ai/app/agent-policy";
import {
  isFunctionCallArgs,
  isFunctionCallToolName,
  type FunctionCallToolName,
} from "@geochat-ai/app/functioncalls";
import type { PatchBlackboardArgs, ReadBlackboardArgs } from "@geochat-ai/app/blackboard";
import {
  upsertAgentRunTool,
  type AgentRunLedgerRecord,
  type AgentRunToolRecord,
} from "@geochat-ai/app/agent-run";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { NativeChatDependencies, NativeToolExecutionContext } from "./native-chat-ports";

const logger = createStructuredLogger("agent.tool-orchestrator");

export function createNativeToolExecutionContext(
  getRun: () => AgentRunLedgerRecord,
  blackboard: NativeChatDependencies["blackboard"],
): NativeToolExecutionContext {
  const run = getRun();
  return {
    runId: run.runId,
    conversationId: run.conversationId,
    prompt: run.prompt,
    locale: run.locale ?? "zh-CN",
    get toolHistory() { return getRun().tools; },
    readBlackboard: (args: ReadBlackboardArgs) => blackboard.listEntries(run.conversationId, args),
    patchBlackboard: (args: PatchBlackboardArgs, context: { runId: string; toolCallId: string }) =>
      blackboard.patchEntries(run.conversationId, args, context),
  };
}

export function nativeControlTool(
  toolCallId: string,
  toolName: FunctionCallToolName,
  args: unknown,
  startedAt: string,
  decision: { allowed: boolean; reason?: string },
): AgentRunToolRecord {
  const completedAt = new Date().toISOString();
  if (!decision.allowed) {
    const error = decision.reason ?? `Workflow policy rejected ${toolName}.`;
    return {
      toolCallId,
      toolName,
      status: "failed",
      args,
      result: {
        ok: false,
        results: [],
        error,
        clientMeta: { source: "ai-sdk-native-control", recoverable: true },
      },
      error,
      startedAt,
      completedAt,
      durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    };
  }
  return {
    toolCallId,
    toolName,
    status: "succeeded",
    args,
    result: { ok: true, result: args, clientMeta: { source: "ai-sdk-native-control" } },
    error: null,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
  };
}

export function mergeCompletedNativeUITools(run: AgentRunLedgerRecord, messages: UIMessage[]) {
  let next = run;
  const existingById = new Map(run.tools.map((tool) => [tool.toolCallId, tool]));
  for (const message of messages) {
    if (message.role !== "assistant" || message.id !== run.assistantMessageId) continue;
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      const toolName = getToolName(part);
      if (!isFunctionCallToolName(toolName)) continue;
      if (part.state !== "output-available" && part.state !== "output-error" && part.state !== "output-denied") continue;
      const previous = existingById.get(part.toolCallId);
      const args = completedUIToolArgs(part, toolName, previous?.args);
      if (args === null) {
        logger.warn("invalid_ui_tool_input", "AGENT_TOOL_INPUT_INVALID", {
          runId: run.runId,
          conversationId: run.conversationId,
          toolName,
          toolCallId: part.toolCallId,
        });
        continue;
      }
      const now = new Date().toISOString();
      const output = part.state === "output-available" && "output" in part ? part.output : previous?.result;
      const outputError = toolOutputError(output);
      const tool: AgentRunToolRecord = {
        toolCallId: part.toolCallId,
        toolName: toolName as FunctionCallToolName,
        status: part.state === "output-available" && !outputError ? "succeeded" : "failed",
        args,
        result: output,
        error: part.state === "output-error" && "errorText" in part && typeof part.errorText === "string"
          ? part.errorText
          : part.state === "output-denied"
            ? "Tool output was denied."
            : outputError,
        startedAt: previous?.startedAt ?? now,
        completedAt: previous?.completedAt ?? now,
        durationMs: previous?.durationMs ?? 0,
      };
      next = upsertAgentRunTool(next, tool);
      existingById.set(tool.toolCallId, tool);
    }
  }
  return next;
}

export function activeNativeToolNames(
  run: Pick<AgentRunLedgerRecord, "tools">,
  availableToolNames: readonly string[],
) {
  void run;
  return availableToolNames.filter(isFunctionCallToolName);
}

export function nativeConvergenceInstruction(
  run: Pick<AgentRunLedgerRecord, "locale" | "modelStepCount" | "tools">,
  maxModelSteps: number,
) {
  const verifiedMutationCycles = countVerifiedCanvasMutationCycles(run.tools);
  const remainingSteps = Math.max(0, maxModelSteps - (run.modelStepCount ?? 0));
  const isEnglish = run.locale === "en-US";
  if (verifiedMutationCycles >= 6 || remainingSteps <= 4) {
    return isEnglish
      ? "[Convergence guard] Stop repeated local sign/angle patches. Re-derive the dependency chain from the original construction once. Make at most one final corrective canvas mutation, verify it immediately, then produce the user-facing explanation and call setFinished. If an invariant still fails, report the limitation explicitly instead of starting another repair loop."
      : "【收敛保护】停止反复局部修改符号或角度。仅从原始构造重新推导一次依赖链；最多再执行一次最终修正，随后立即验证、输出用户可读说明并调用 setFinished。若不变量仍不成立，明确说明限制，不要开启新一轮修补。";
  }
  if (verifiedMutationCycles >= 4) {
    return isEnglish
      ? "[Convergence warning] Multiple verified canvas mutation cycles have not completed the task. Before another mutation, re-check the mathematical invariants and dependency graph from the original construction; do not continue by changing only signs or angles."
      : "【收敛提醒】已经历多轮写入与验证但任务仍未完成。再次写入前，必须从原始构造重新检查数学不变量和依赖图；不要只靠继续调整符号或角度推进。";
  }
  return "";
}

export function countVerifiedCanvasMutationCycles(
  tools: readonly Pick<AgentRunToolRecord, "toolName" | "status">[],
) {
  let pendingMutation = false;
  let cycles = 0;
  for (const tool of tools) {
    if (tool.status !== "succeeded") continue;
    if (agentWorkflowCanvasMutationTools.has(tool.toolName)) {
      pendingMutation = true;
      continue;
    }
    if (pendingMutation && agentWorkflowCanvasVerificationTools.has(tool.toolName)) {
      cycles += 1;
      pendingMutation = false;
    }
  }
  return cycles;
}

function completedUIToolArgs(
  part: UIMessage["parts"][number],
  toolName: FunctionCallToolName,
  previousArgs: unknown,
) {
  const payload = part as unknown as Record<string, unknown>;
  const candidates = [payload.input, parseRawToolInput(payload.rawInput), previousArgs];
  return candidates.find((candidate) => isFunctionCallArgs(toolName, candidate)) ?? null;
}

function parseRawToolInput(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function toolOutputError(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const payload = output as Record<string, unknown>;
  if (payload.ok !== false) return null;
  return typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : "Tool execution failed.";
}
