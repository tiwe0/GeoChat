import type { DesktopFunctionCall } from "@geochat-ai/app";
import type { DesktopChatMessage } from "./workbench-types";
import { commandResultsForCall, toolExecutionResult } from "./workbench-tool-calls";

type ExecuteCommandsCall = DesktopFunctionCall<"executeGeoGebraCommands">;

function isExecuteCommandsCall(call: DesktopFunctionCall): call is ExecuteCommandsCall {
  return call.toolName === "executeGeoGebraCommands";
}

function callKey(call: Pick<DesktopFunctionCall, "id" | "callId">) {
  return call.id || call.callId;
}

export function commandReplayKey(call: Pick<DesktopFunctionCall, "id" | "callId">) {
  return callKey(call);
}

export function commandsFromToolCall(call: DesktopFunctionCall) {
  if (!isExecuteCommandsCall(call)) return [];
  const resultCommands = commandResultsForCall(call).map((result) => result.command);
  const fallbackCommands = Array.isArray(call.args?.commands) ? call.args.commands : [];
  return (resultCommands.length ? resultCommands : fallbackCommands).map((command) => command.trim()).filter(Boolean);
}

export function isSuccessfulReplayCall(call: DesktopFunctionCall) {
  if (!isExecuteCommandsCall(call) || call.status !== "done" || call.error) return false;
  const result = toolExecutionResult(call);
  return result?.ok !== false && commandsFromToolCall(call).length > 0;
}

export function collectConversationReplayCommands(messages: DesktopChatMessage[]) {
  return messages
    .flatMap((message) => message.toolCalls ?? [])
    .filter(isSuccessfulReplayCall)
    .flatMap(commandsFromToolCall);
}

export function collectCommandsThroughToolCall(messages: DesktopChatMessage[], target: DesktopFunctionCall) {
  const targetKey = callKey(target);
  const commands: string[] = [];
  for (const message of messages) {
    for (const call of message.toolCalls ?? []) {
      if (!isExecuteCommandsCall(call)) continue;
      const isTarget = callKey(call) === targetKey;
      if (isTarget || isSuccessfulReplayCall(call)) {
        commands.push(...commandsFromToolCall(call));
      }
      if (isTarget) return commands;
    }
  }
  return commandsFromToolCall(target);
}
