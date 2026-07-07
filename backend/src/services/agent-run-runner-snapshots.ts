import {
  agentRunRunnerBudgetFor,
  agentRunRunnerModelPolicyFor,
  agentRunRunnerPhaseFor,
  agentRunRunnerStatusFor,
  isTerminalAgentRunStatus,
  type AgentRunLedgerRecord,
  type AgentRunModelStepRecord,
  type AgentRunPolicyDecisionRecord,
  type AgentRunRemoteToolRequest,
  type AgentRunRunnerSnapshot
} from "@geochat-ai/app";
import type { AgentRunRepository } from "../db/agent-run-repository";

export function createAgentRunRunnerSnapshotService(agentRunRepository: AgentRunRepository) {
  async function snapshot(
    record: AgentRunLedgerRecord,
    requests?: AgentRunRemoteToolRequest[],
    policyDecisions?: AgentRunPolicyDecisionRecord[],
    modelSteps?: AgentRunModelStepRecord[]
  ): Promise<AgentRunRunnerSnapshot> {
    const resolvedRequests = requests ?? await agentRunRepository.listRemoteToolRequests(record.runId);
    const resolvedPolicyDecisions = policyDecisions ?? await agentRunRepository.listPolicyDecisions(record.runId);
    const resolvedModelSteps = modelSteps ?? await agentRunRepository.listModelSteps(record.runId);
    const activeRequests = isTerminalAgentRunStatus(record.status)
      ? []
      : resolvedRequests.filter((request) => request.status === "pending" || request.status === "running");
    return {
      run: record,
      status: agentRunRunnerStatusFor({ run: record, pendingToolRequests: activeRequests }),
      phase: agentRunRunnerPhaseFor({ run: record, pendingToolRequests: activeRequests }),
      modelPolicy: agentRunRunnerModelPolicyFor({ run: record }),
      budget: agentRunRunnerBudgetFor({ run: record, pendingToolRequests: activeRequests }),
      pendingToolRequests: activeRequests,
      policyDecisions: resolvedPolicyDecisions,
      modelSteps: resolvedModelSteps
    };
  }

  return {
    snapshot
  };
}

export type AgentRunRunnerSnapshotService = ReturnType<typeof createAgentRunRunnerSnapshotService>;
