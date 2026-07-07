import { isAgentModelPolicySnapshot, type AgentModelPolicySnapshot } from "./model-registry";
import { isAgentRunRemoteToolRequest, type AgentRunRemoteToolRequest } from "./remote-tool";
import {
  findAgentRunToolCallIdReuseConflict,
  isAgentRunLedgerRecord,
  isAgentRunModelStepRecord,
  isAgentRunPolicyDecisionRecord,
  isTerminalAgentRunStatus,
  type AgentRunModelStepRecord,
  type AgentRunPolicyDecisionRecord
} from "./run-ledger";
import {
  agentRunRunnerBudgetFor,
  agentRunRunnerModelPolicyFor,
  agentRunRunnerStatusFor
} from "./runner-lifecycle";
import {
  agentRunRunnerPhaseFor,
  isAgentRunRunnerPhase,
  isAgentRunRunnerStatus
} from "./runner-phase";
import type { AgentRunRunnerBudget, AgentRunRunnerSnapshot } from "./runner-types";

export function isAgentRunRunnerSnapshot(value: unknown): value is AgentRunRunnerSnapshot {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (!isAgentRunLedgerRecord(payload.run)) return false;
  if (!Array.isArray(payload.pendingToolRequests) || !payload.pendingToolRequests.every(isAgentRunRemoteToolRequest)) return false;
  if (!isAgentRunRunnerStatus(payload.status)) return false;
  if (!isAgentRunRunnerPhase(payload.phase)) return false;
  if (!isAgentModelPolicySnapshot(payload.modelPolicy)) return false;
  if (!isAgentRunRunnerBudget(payload.budget)) return false;
  const run = payload.run;
  const pendingToolRequests = payload.pendingToolRequests;
  const status = payload.status;
  const phase = payload.phase;
  const modelPolicy = payload.modelPolicy;
  const budget = payload.budget;
  const policyDecisions = payload.policyDecisions;
  const modelSteps = payload.modelSteps;
  if (
    policyDecisions !== undefined &&
    (!Array.isArray(policyDecisions) || !policyDecisions.every(isAgentRunPolicyDecisionRecord))
  ) {
    return false;
  }
  if (
    modelSteps !== undefined &&
    (!Array.isArray(modelSteps) || !modelSteps.every(isAgentRunModelStepRecord))
  ) {
    return false;
  }
  if (!pendingToolRequests.every((request) => request.runId === run.runId)) return false;
  if (isTerminalAgentRunStatus(run.status) && pendingToolRequests.length > 0) return false;
  if (pendingToolRequests.some((request) => findAgentRunToolCallIdReuseConflict(run.tools, request))) return false;
  if (policyDecisions !== undefined && !(policyDecisions as AgentRunPolicyDecisionRecord[]).every((decision) => decision.runId === run.runId)) return false;
  if (modelSteps !== undefined && !(modelSteps as AgentRunModelStepRecord[]).every((step) => step.runId === run.runId)) return false;
  if (
    modelSteps !== undefined &&
    !(modelSteps as AgentRunModelStepRecord[]).every((step) => step.modelProvider === run.modelProvider && step.modelId === run.modelId)
  ) {
    return false;
  }
  if (!hasUniqueValues(pendingToolRequests, (request) => request.toolCallId)) return false;
  if (policyDecisions !== undefined && !hasUniqueValues(policyDecisions as AgentRunPolicyDecisionRecord[], (decision) => decision.decisionId)) return false;
  if (modelSteps !== undefined && !hasUniqueValues(modelSteps as AgentRunModelStepRecord[], (step) => step.stepId)) return false;
  if (!pendingToolRequests.every(isActiveRemoteToolRequest)) return false;
  if (!isSortedByTimestamp(pendingToolRequests, (request) => request.requestedAt)) return false;
  if (policyDecisions !== undefined && !isSortedByTimestamp(policyDecisions as AgentRunPolicyDecisionRecord[], (decision) => decision.createdAt)) return false;
  if (modelSteps !== undefined && !isSortedByTimestamp(modelSteps as AgentRunModelStepRecord[], (step) => step.startedAt)) return false;
  if (status !== agentRunRunnerStatusFor({ run, pendingToolRequests })) return false;
  if (phase !== agentRunRunnerPhaseFor({ run, pendingToolRequests })) return false;
  if (!agentRunRunnerBudgetsEqual(budget, agentRunRunnerBudgetFor({ run, pendingToolRequests }))) {
    return false;
  }
  if (!agentModelPolicySnapshotsEqual(modelPolicy, agentRunRunnerModelPolicyFor({ run }))) return false;
  return true;
}

function isAgentRunRunnerBudget(value: unknown): value is AgentRunRunnerBudget {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isNonNegativeInteger(payload.maxToolSteps) &&
    isNonNegativeInteger(payload.completedToolSteps) &&
    isNonNegativeInteger(payload.activeToolRequests) &&
    isNonNegativeInteger(payload.remainingToolRequests) &&
    typeof payload.exhausted === "boolean"
  );
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isActiveRemoteToolRequest(request: Pick<AgentRunRemoteToolRequest, "status">) {
  return request.status === "pending" || request.status === "running";
}

function agentRunRunnerBudgetsEqual(left: AgentRunRunnerBudget, right: AgentRunRunnerBudget) {
  return (
    left.maxToolSteps === right.maxToolSteps &&
    left.completedToolSteps === right.completedToolSteps &&
    left.activeToolRequests === right.activeToolRequests &&
    left.remainingToolRequests === right.remainingToolRequests &&
    left.exhausted === right.exhausted
  );
}

function agentModelPolicySnapshotsEqual(left: AgentModelPolicySnapshot, right: AgentModelPolicySnapshot) {
  return (
    left.provider === right.provider &&
    left.model === right.model &&
    left.label === right.label &&
    left.supportsImages === right.supportsImages &&
    left.supportsTools === right.supportsTools &&
    left.toolCallingMode === right.toolCallingMode &&
    left.maxToolSteps === right.maxToolSteps &&
    left.defaultTemperature === right.defaultTemperature &&
    left.isKnownModel === right.isKnownModel &&
    left.isCustomModel === right.isCustomModel
  );
}

function hasUniqueValues<T>(items: readonly T[], getValue: (item: T) => string) {
  const seen = new Set<string>();
  for (const item of items) {
    const value = getValue(item);
    if (seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}

function isSortedByTimestamp<T>(items: readonly T[], getTimestamp: (item: T) => string) {
  let previous = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const current = new Date(getTimestamp(item)).getTime();
    if (current < previous) return false;
    previous = current;
  }
  return true;
}
