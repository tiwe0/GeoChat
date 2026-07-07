import {
  claimAgentRunRemoteToolRequest,
  failAgentRunRemoteToolRequestForAttemptLimit,
  finishAgentRunLedger,
  getFunctionCallRemoteBridgeToolNames,
  isAgentRunRemoteToolRequestClaimable,
  isTerminalAgentRunStatus,
  upsertAgentRunTool,
  type AgentRunLedgerRecord,
  type AgentRunPolicyDecisionRecord,
  type AgentRunRemoteToolRequest
} from "@geochat-ai/app";
import type { AgentRunRepository } from "../db/agent-run-repository";
import type { AgentRunCommitService } from "./agent-run-commits";

export function createAgentRunRemoteToolService(
  agentRunRepository: AgentRunRepository,
  agentRunCommits: AgentRunCommitService,
  options: { maxAttempts: number }
) {
  async function claimRemoteToolRequests(
    record: AgentRunLedgerRecord,
    input: { claimOwner: string; now: string; leaseMs: number }
  ) {
    const currentRequests = await agentRunRepository.listRemoteToolRequests(record.runId);
    const targetRequests = currentRequests.map((item) => {
      if (!isAgentRunRemoteToolRequestClaimable(item, input.now)) return item;
      if (!getFunctionCallRemoteBridgeToolNames().includes(item.toolName)) {
        return failAgentRunRemoteToolRequestForAttemptLimit(item, {
          completedAt: input.now,
          maxAttempts: options.maxAttempts,
          error: `${item.toolName} is not executable through the renderer remote bridge.`
        });
      }
      return claimAgentRunRemoteToolRequest(item, {
        claimedAt: input.now,
        claimedBy: input.claimOwner,
        leaseMs: input.leaseMs,
        maxAttempts: options.maxAttempts
      });
    });

    const savedRequests = [];
    for (const [index, item] of targetRequests.entries()) {
      const expectedRequest = currentRequests[index];
      if (!expectedRequest || item === expectedRequest) {
        savedRequests.push(item);
      } else {
        savedRequests.push((await agentRunCommits.saveRemoteToolRequestPayloadIfCurrent(item, expectedRequest)).request ?? expectedRequest);
      }
    }
    const deadLetteredRequests = savedRequests.filter((item, index) => item.status === "failed" && currentRequests[index]?.status !== "failed");
    let run = record;
    if (deadLetteredRequests.length > 0 && !isTerminalAgentRunStatus(record.status)) {
      for (const failedRequest of deadLetteredRequests) {
        run = upsertAgentRunTool(run, remoteToolRequestFailureRecord(failedRequest, input.now));
      }
      const firstFailedRequest = deadLetteredRequests[0];
      const error = firstFailedRequest.error ?? "Remote tool request exceeded the retry limit.";
      run = finishAgentRunLedger(run, {
        status: "failed",
        completedAt: firstFailedRequest.completedAt ?? input.now,
        error
      });
      const policyDecision = createRemoteToolDeadLetterPolicyDecision(firstFailedRequest, error);
      const committed = await agentRunCommits.saveRunnerTerminalPolicyCommit(run, policyDecision);
      run = committed.run;
    }
    return { run, requests: await agentRunRepository.listRemoteToolRequests(run.runId) };
  }

  return {
    claimRemoteToolRequests
  };
}

function remoteToolRequestFailureRecord(request: AgentRunRemoteToolRequest, now: string) {
  return {
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    status: "failed" as const,
    args: request.args,
    error: request.error ?? "Remote tool request exceeded the retry limit.",
    startedAt: request.claimedAt ?? request.requestedAt,
    completedAt: request.completedAt ?? now
  };
}

function createRemoteToolDeadLetterPolicyDecision(
  request: AgentRunRemoteToolRequest,
  message: string
): AgentRunPolicyDecisionRecord {
  return {
    decisionId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    runId: request.runId,
    stage: "runner_continuation",
    kind: "tool_request_dead_letter",
    allowed: false,
    message,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    details: {
      attemptCount: request.attemptCount ?? 0,
      status: request.status,
      claimedBy: request.claimedBy ?? null
    }
  };
}

export type AgentRunRemoteToolService = ReturnType<typeof createAgentRunRemoteToolService>;
