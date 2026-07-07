import {
  agentModelPolicySnapshotFor,
  getAgentModelPolicy,
  isAgentModelConfig,
  type AgentModelPolicySnapshot
} from "./model-registry";
import { isOptionalAgentRunImageAttachments } from "./attachments";
import { geogebraCanvasVisualGuidance } from "./canvas-visual-guidance";
import { isAgentRunRemoteToolRequestInput, type AgentRunRemoteToolRequest, type AgentRunRemoteToolRequestInput } from "./remote-tool";
import { isAgentRunStartInput, type AgentRunLedgerRecord } from "./run-ledger";
import type { AgentRunRunnerBudget, AgentRunRunnerStartInput, AgentRunRunnerStatus } from "./runner-types";

export function createAgentRunInitialCanvasReadRequest(input: { requestedAt?: string; locale?: AgentRunLedgerRecord["locale"] } = {}): AgentRunRemoteToolRequestInput {
  const english = input.locale === "en-US";
  return {
    toolCallId: "initial-canvas-read",
    toolName: "getCanvasContext",
    requestedAt: input.requestedAt,
    args: {
      includeXml: false,
      reason: english
        ? "Read the current GeoGebra canvas context when the backend harness starts."
        : "后端 harness 启动时先读取当前 GeoGebra 画布上下文。",
      intendedOutcome: english
        ? `Provide reliable canvas objects, expressions, and state summary for later model planning. ${geogebraCanvasVisualGuidance("en-US")}`
        : `为后续模型规划提供可靠的画布对象、表达式和状态摘要。${geogebraCanvasVisualGuidance("zh-CN")}`,
      nextExpectedAction: "plan_or_execute"
    }
  };
}

export function isAgentRunRunnerStartInput(value: unknown): value is AgentRunRunnerStartInput {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  const hasFirstTool = "firstTool" in payload && payload.firstTool !== undefined;
  return (
    isAgentRunStartInput(payload.run) &&
    (!hasFirstTool || isAgentRunRemoteToolRequestInput(payload.firstTool)) &&
    (hasFirstTool || isAgentModelConfig(payload.model)) &&
    isOptionalAgentRunImageAttachments(payload.attachments)
  );
}

export function agentRunRunnerStatusFor(input: {
  run: Pick<AgentRunLedgerRecord, "status">;
  pendingToolRequests: readonly AgentRunRemoteToolRequest[];
}): AgentRunRunnerStatus {
  if (input.run.status === "succeeded") return "succeeded";
  if (input.run.status === "failed") return "failed";
  if (input.run.status === "cancelled") return "cancelled";
  return input.pendingToolRequests.some((request) => request.status === "pending" || request.status === "running") ? "waiting_for_tool" : "running";
}

export function agentRunRunnerBudgetFor(input: {
  run: Pick<AgentRunLedgerRecord, "modelProvider" | "modelId" | "maxToolSteps" | "tools">;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "status">[];
}): AgentRunRunnerBudget {
  const policy = getAgentModelPolicy({ provider: input.run.modelProvider, model: input.run.modelId, maxToolSteps: input.run.maxToolSteps });
  const completedToolSteps = input.run.tools.length;
  const activeToolRequests = (input.pendingToolRequests ?? []).filter((request) => request.status === "pending" || request.status === "running").length;
  const remainingToolRequests = Math.max(0, policy.maxToolSteps - completedToolSteps - activeToolRequests);
  return {
    maxToolSteps: policy.maxToolSteps,
    completedToolSteps,
    activeToolRequests,
    remainingToolRequests,
    exhausted: remainingToolRequests <= 0
  };
}

export function agentRunRunnerModelPolicyFor(input: { run: Pick<AgentRunLedgerRecord, "modelProvider" | "modelId" | "maxToolSteps"> }): AgentModelPolicySnapshot {
  return agentModelPolicySnapshotFor({
    provider: input.run.modelProvider,
    model: input.run.modelId,
    maxToolSteps: input.run.maxToolSteps
  });
}
