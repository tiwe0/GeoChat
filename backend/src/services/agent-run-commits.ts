import {
  createAgentRunRemoteToolRequest,
  agentRunRemoteToolRequestInvalidReasons,
  isAgentRunLedgerRecord,
  isAgentRunModelStepRecord,
  isAgentRunPolicyDecisionRecord,
  isAgentRunRemoteToolRequest,
  type AgentRunLedgerRecord,
  type AgentRunModelStepRecord,
  type AgentRunPolicyDecisionRecord,
  type AgentRunRemoteToolRequest
} from "@geochat-ai/app";
import type { AgentRunRepository } from "../db/agent-run-repository";
import type { AgentRunEventService } from "./agent-run-events";

type RemoteToolRequestInput = Parameters<typeof createAgentRunRemoteToolRequest>[1];

export function createAgentRunCommitService(agentRunRepository: AgentRunRepository, agentRunEvents: AgentRunEventService) {
  async function saveRunnerStartCommit(
    run: AgentRunLedgerRecord,
    firstRequest: RemoteToolRequestInput,
    policyDecision: AgentRunPolicyDecisionRecord
  ) {
    const request = createAgentRunRemoteToolRequest(run.runId, firstRequest);
    assertPersistableLedger(run);
    assertPersistableRemoteToolRequest(request);
    assertPersistablePolicyDecision(policyDecision);
    await agentRunRepository.saveRunnerStartCommit({ run, request, policyDecision });
    return { run, request };
  }

  async function saveRunnerTerminalPolicyCommit(
    run: AgentRunLedgerRecord,
    policyDecision: AgentRunPolicyDecisionRecord
  ) {
    assertPersistableLedger(run);
    assertPersistablePolicyDecision(policyDecision);
    const committed = await agentRunRepository.saveRunnerTerminalPolicyCommit({ run, policyDecision });
    await agentRunEvents.saveAgentRunFailureEvents(committed.run);
    await agentRunEvents.savePolicyDecisionErrorEvent(committed.policyDecision);
    for (const request of committed.cancelledRequests) {
      await agentRunEvents.saveRemoteToolRequestFailureEvent(request);
    }
    return committed;
  }

  async function saveRunnerToolResultCommit(input: {
    run: AgentRunLedgerRecord;
    completedRequest: AgentRunRemoteToolRequest;
    expectedCompletedRequest?: AgentRunRemoteToolRequest;
    nextRequest?: RemoteToolRequestInput;
    policyDecision?: AgentRunPolicyDecisionRecord;
    policyDecisions?: AgentRunPolicyDecisionRecord[];
    modelStep?: AgentRunModelStepRecord;
  }) {
    const nextRequest = input.nextRequest ? createAgentRunRemoteToolRequest(input.run.runId, input.nextRequest) : undefined;
    const committed = await agentRunRepository.saveRunnerContinuationCommit({ ...input, nextRequest });
    if (committed.committed) await saveRunnerContinuationCommitEvents(committed);
    return committed;
  }

  async function saveRunnerContinuationCommit(input: {
    run: AgentRunLedgerRecord;
    completedRequest?: AgentRunRemoteToolRequest;
    expectedCompletedRequest?: AgentRunRemoteToolRequest;
    nextRequest?: RemoteToolRequestInput;
    policyDecision?: AgentRunPolicyDecisionRecord;
    policyDecisions?: AgentRunPolicyDecisionRecord[];
    modelStep?: AgentRunModelStepRecord;
  }) {
    if (input.completedRequest) {
      return await saveRunnerToolResultCommit({
        run: input.run,
        completedRequest: input.completedRequest,
        expectedCompletedRequest: input.expectedCompletedRequest,
        nextRequest: input.nextRequest,
        policyDecision: input.policyDecision,
        policyDecisions: input.policyDecisions,
        modelStep: input.modelStep
      });
    }
    const nextRequest = input.nextRequest ? createAgentRunRemoteToolRequest(input.run.runId, input.nextRequest) : undefined;
    const committed = await agentRunRepository.saveRunnerContinuationCommit({ ...input, nextRequest });
    if (committed.committed) await saveRunnerContinuationCommitEvents(committed);
    return committed;
  }

  async function saveAgentRunFinishCommit(run: AgentRunLedgerRecord) {
    return saveAgentRunLedgerCloseCommit(run);
  }

  async function saveAgentRunLedgerCommit(run: AgentRunLedgerRecord) {
    return saveAgentRunLedgerCloseCommit(run);
  }

  async function saveAgentRunLedgerCloseCommit(run: AgentRunLedgerRecord) {
    assertPersistableLedger(run);
    const committed = await agentRunRepository.saveLedgerCloseCommit({ run });
    await agentRunEvents.saveAgentRunFailureEvents(committed.run);
    for (const request of committed.cancelledRequests) {
      await agentRunEvents.saveRemoteToolRequestFailureEvent(request);
    }
    return committed;
  }

  async function saveRemoteToolRequest(runId: string, input: RemoteToolRequestInput) {
    return saveRemoteToolRequestPayload(createAgentRunRemoteToolRequest(runId, input));
  }

  async function saveRemoteToolRequestPayload(payload: AgentRunRemoteToolRequest) {
    assertPersistableRemoteToolRequest(payload);
    await agentRunRepository.saveRemoteToolRequest(payload);
    await agentRunEvents.saveRemoteToolRequestFailureEvent(payload);
    return payload;
  }

  async function saveRemoteToolRequestPayloadIfCurrent(
    payload: AgentRunRemoteToolRequest,
    expected: AgentRunRemoteToolRequest
  ) {
    assertPersistableRemoteToolRequest(payload);
    assertPersistableRemoteToolRequest(expected);
    const result = await agentRunRepository.saveRemoteToolRequestIfCurrent(payload, expected);
    if (result.saved) {
      await agentRunEvents.saveRemoteToolRequestFailureEvent(payload);
      return { saved: true as const, request: payload };
    }
    return {
      saved: false as const,
      request: result.request ?? expected
    };
  }

  async function saveAgentRunPolicyDecision(payload: AgentRunPolicyDecisionRecord) {
    assertPersistablePolicyDecision(payload);
    await agentRunRepository.savePolicyDecision(payload);
    await agentRunEvents.savePolicyDecisionErrorEvent(payload);
    return payload;
  }

  async function saveAgentRunModelStep(payload: AgentRunModelStepRecord) {
    assertPersistableModelStep(payload);
    await agentRunRepository.saveModelStep(payload);
    await agentRunEvents.saveModelStepFailureEvent(payload);
    return payload;
  }

  async function saveAgentRunLedger(payload: AgentRunLedgerRecord) {
    assertPersistableLedger(payload);
    await agentRunRepository.saveLedger(payload);
    await agentRunEvents.saveAgentRunFailureEvents(payload);
  }

  async function saveRunnerContinuationCommitEvents(input: {
    run: AgentRunLedgerRecord;
    request?: AgentRunRemoteToolRequest;
    nextRequest?: AgentRunRemoteToolRequest;
    policyDecisions: AgentRunPolicyDecisionRecord[];
    modelStep?: AgentRunModelStepRecord;
    cancelledRequests: AgentRunRemoteToolRequest[];
  }) {
    await agentRunEvents.saveAgentRunFailureEvents(input.run);
    if (input.request) await agentRunEvents.saveRemoteToolRequestFailureEvent(input.request);
    if (input.nextRequest) await agentRunEvents.saveRemoteToolRequestFailureEvent(input.nextRequest);
    for (const policyDecision of input.policyDecisions) {
      await agentRunEvents.savePolicyDecisionErrorEvent(policyDecision);
    }
    if (input.modelStep) await agentRunEvents.saveModelStepFailureEvent(input.modelStep);
    for (const request of input.cancelledRequests) {
      await agentRunEvents.saveRemoteToolRequestFailureEvent(request);
    }
  }

  return {
    saveRunnerStartCommit,
    saveRunnerTerminalPolicyCommit,
    saveRunnerToolResultCommit,
    saveRunnerContinuationCommit,
    saveAgentRunFinishCommit,
    saveAgentRunLedgerCommit,
    saveRemoteToolRequest,
    saveRemoteToolRequestPayloadIfCurrent,
    saveAgentRunPolicyDecision,
    saveAgentRunModelStep,
    saveAgentRunLedger
  };
}

function assertPersistableLedger(payload: AgentRunLedgerRecord) {
  if (!isAgentRunLedgerRecord(payload)) {
    throw new Error("Refusing to persist invalid agent run ledger.");
  }
}

function assertPersistableRemoteToolRequest(payload: AgentRunRemoteToolRequest) {
  const reasons = agentRunRemoteToolRequestInvalidReasons(payload);
  if (reasons.length) {
    throw new Error(`Refusing to persist invalid remote tool request: ${reasons.join("; ")}.`);
  }
}

function assertPersistablePolicyDecision(payload: AgentRunPolicyDecisionRecord) {
  if (!isAgentRunPolicyDecisionRecord(payload)) {
    throw new Error("Refusing to persist invalid policy decision.");
  }
}

function assertPersistableModelStep(payload: AgentRunModelStepRecord) {
  if (!isAgentRunModelStepRecord(payload)) {
    throw new Error("Refusing to persist invalid model step.");
  }
}

export type AgentRunCommitService = ReturnType<typeof createAgentRunCommitService>;
