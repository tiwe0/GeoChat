import type { AgentRunRemoteToolRequest } from "@geochat-ai/app/client";
import type { ToolExecutionResult } from "@geochat-ai/app/geogebra-protocol";
import { executeRendererTool } from "../agent-run/toolWorker";

type ReplayToolName = Extract<AgentRunRemoteToolRequest["toolName"], "resetCanvas" | "executeGeoGebraCommands">;
type ReplayExecutor = (toolName: ReplayToolName, args: unknown) => Promise<ToolExecutionResult>;

const COMMAND_BATCH_SIZE = 100;

export async function replayConversationCanvas(
  commands: readonly string[],
  execute: ReplayExecutor = executeRendererTool,
) {
  const reset = await execute("resetCanvas", {});
  if (!reset.ok) throw new Error(`Canvas reset failed: ${reset.error ?? "unknown error"}`);

  for (let offset = 0; offset < commands.length; offset += COMMAND_BATCH_SIZE) {
    const batch = commands.slice(offset, offset + COMMAND_BATCH_SIZE);
    const result = await execute("executeGeoGebraCommands", { commands: batch });
    if (!result.ok) {
      const failedInBatch = readFailedCommandIndex(result);
      const failedIndex = offset + failedInBatch;
      const failedCommand = commands[failedIndex - 1] ?? batch[0] ?? "unknown command";
      throw new Error(`Command ${failedIndex} failed (${failedCommand}): ${result.error ?? "unknown error"}`);
    }
  }
}

function readFailedCommandIndex(result: ToolExecutionResult) {
  const payload = result.result;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return 1;
  const index = (payload as Record<string, unknown>).failedCommandIndex;
  return typeof index === "number" && Number.isInteger(index) && index >= 1 ? index : 1;
}
