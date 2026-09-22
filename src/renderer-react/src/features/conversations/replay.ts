import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { ToolExecutionResult } from "@geochat-ai/app/geogebra-protocol";
import { executeRendererTool } from "../agent-run/toolWorker";

type ReplayToolName = "resetCanvas" | "executeGeoGebraCommands" | "setPerspective";
type ReplayExecutor = (toolName: ReplayToolName, args: unknown) => Promise<ToolExecutionResult>;

export type CanvasReplayAction =
  | { type: "reset"; input: Record<string, unknown> }
  | { type: "execute"; input: Record<string, unknown>; commands: string[] }
  | { type: "perspective"; input: Record<string, unknown> };

export function extractCanvasReplayActions(messages: readonly UIMessage[]): CanvasReplayAction[] {
  const actions: CanvasReplayAction[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolUIPart(part) || part.state !== "output-available") continue;
      if (!isSuccessfulReplayOutput((part as unknown as Record<string, unknown>).output)) continue;
      const input = readRecord((part as unknown as Record<string, unknown>).input);
      const toolName = getToolName(part);
      if (toolName === "resetCanvas") {
        actions.push({ type: "reset", input });
      } else if (toolName === "setPerspective") {
        actions.push({ type: "perspective", input });
      } else if (toolName === "executeGeoGebraCommands") {
        const commands = Array.isArray(input.commands)
          ? input.commands.filter((command): command is string => typeof command === "string" && Boolean(command.trim()))
          : [];
        if (!commands.length) continue;
        if (input.resetBefore === true) actions.push({ type: "reset", input: perspectiveInput(input) });
        actions.push({ type: "execute", input: { ...input, resetBefore: false }, commands });
      }
    }
  }
  return actions;
}

function isSuccessfulReplayOutput(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).ok === true);
}

export async function replayConversationCanvas(
  actions: readonly CanvasReplayAction[],
  execute: ReplayExecutor = executeRendererTool,
  shouldContinue: () => boolean = () => true,
) {
  // Selecting a text-only conversation must not destroy the current canvas.
  if (!actions.length) return;

  assertReplayCurrent(shouldContinue);
  if (actions[0]?.type !== "reset") await executeReset({}, execute);
  for (const action of actions) {
    assertReplayCurrent(shouldContinue);
    if (action.type === "reset") {
      await executeReset(action.input, execute);
      continue;
    }
    if (action.type === "perspective") {
      const result = await execute("setPerspective", action.input);
      if (!result.ok) throw new Error(`Canvas perspective restore failed: ${result.error ?? "unknown error"}`);
      continue;
    }
    assertReplayCurrent(shouldContinue);
    const result = await execute("executeGeoGebraCommands", {
      ...action.input,
      commands: action.commands,
      resetBefore: false,
      restoreOnError: true,
    });
    if (!result.ok) {
      const failedIndex = readFailedCommandIndex(result);
      const failedCommand = action.commands[failedIndex - 1] ?? action.commands[0] ?? "unknown command";
      throw new Error(`Command ${failedIndex} failed (${failedCommand}): ${result.error ?? "unknown error"}`);
    }
  }
}

function assertReplayCurrent(shouldContinue: () => boolean) {
  if (!shouldContinue()) throw new DOMException("Conversation replay was superseded.", "AbortError");
}

async function executeReset(input: Record<string, unknown>, execute: ReplayExecutor) {
  const reset = await execute("resetCanvas", input);
  if (!reset.ok) throw new Error(`Canvas reset failed: ${reset.error ?? "unknown error"}`);
}

function perspectiveInput(input: Record<string, unknown>) {
  return typeof input.perspective === "string" ? { perspective: input.perspective } : {};
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readFailedCommandIndex(result: ToolExecutionResult) {
  const payload = result.result;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return 1;
  const index = (payload as Record<string, unknown>).failedCommandIndex;
  return typeof index === "number" && Number.isInteger(index) && index >= 1 ? index : 1;
}
