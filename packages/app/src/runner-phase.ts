import { deriveAgentWorkflowStateFromTools } from "./workflow-policy";
import type { AgentRunRemoteToolRequest } from "./remote-tool";
import type { AgentRunLedgerRecord } from "./run-ledger";
import type { AgentRunRunnerPhase, AgentRunRunnerStatus } from "./runner-types";

export function agentRunRunnerPhaseFor(input: {
  run: AgentRunLedgerRecord;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolName" | "status" | "toolCallId">[];
}): AgentRunRunnerPhase {
  if (input.run.status !== "running") return "done";
  const activeRequest = input.pendingToolRequests?.find((request) => request.status === "pending" || request.status === "running");
  const repairing = hasUnresolvedFailedExecute(input.run);
  if (repairing) {
    if (!activeRequest) return "repairing";
    if (activeRequest.toolName === "showSolutionSteps" || activeRequest.toolName === "showChoiceAnalysis" || activeRequest.toolName === "showSelectedElements") return "explaining";
    return "repairing";
  }
  if (activeRequest) return phaseForToolName(activeRequest.toolName, input.run);
  const workflowState = deriveAgentWorkflowStateFromTools(input.run.tools);
  return workflowState.phase;
}

export function isAgentRunRunnerStatus(value: unknown): value is AgentRunRunnerStatus {
  return typeof value === "string" && ["waiting_for_tool", "running", "succeeded", "failed", "cancelled"].includes(value);
}

export function isAgentRunRunnerPhase(value: unknown): value is AgentRunRunnerPhase {
  return (
    typeof value === "string" &&
    ["needs_canvas_read", "planning", "writing", "verifying", "repairing", "explaining", "done"].includes(value)
  );
}

export function phaseForToolName(toolName: AgentRunRemoteToolRequest["toolName"], run: AgentRunLedgerRecord): AgentRunRunnerPhase {
  if (toolName === "searchGeoGebraCommands") return "planning";
  if (toolName === "executeGeoGebraCommands" || toolName === "resetCanvas" || toolName === "setPerspective") return "writing";
  if (toolName === "getPNGBase64") return "verifying";
  if (toolName === "showSolutionSteps" || toolName === "showTeachingHint" || toolName === "showAnimationGuide" || toolName === "showChoiceAnalysis" || toolName === "showSelectedElements") return "explaining";
  if (toolName === "getCanvasContext") return run.tools.some((toolRecord) => toolRecord.toolName === "executeGeoGebraCommands") ? "verifying" : "needs_canvas_read";
  return "planning";
}

export function hasUnresolvedFailedExecute(run: AgentRunLedgerRecord) {
  const latestSuccessfulExecuteAt = latestSuccessfulExecuteTimestamp(run);
  return run.tools.some(
    (toolRecord) =>
      toolRecord.toolName === "executeGeoGebraCommands" &&
      toolRecord.status === "failed" &&
      timestampForRunnerTool(toolRecord) > latestSuccessfulExecuteAt
  );
}

export function latestSuccessfulExecuteTimestamp(run: AgentRunLedgerRecord) {
  return Math.max(
    0,
    ...run.tools
      .filter((toolRecord) => toolRecord.toolName === "executeGeoGebraCommands" && toolRecord.status === "succeeded")
      .map(timestampForRunnerTool)
  );
}

export function timestampForRunnerTool(toolRecord: Pick<AgentRunLedgerRecord["tools"][number], "startedAt" | "completedAt">) {
  return new Date(toolRecord.completedAt ?? toolRecord.startedAt).getTime();
}
