import { createHash } from "node:crypto";
import type {
  AgentRunLedgerRecord,
  AgentRunModelStepRecord,
  AgentRunPolicyDecisionRecord,
  AgentRunRemoteToolRequest
} from "@geochat-ai/app";
import type { AgentErrorEventInput, AgentRunRepository } from "../db/agent-run-repository";

export function createAgentRunEventService(agentRunRepository: AgentRunRepository) {
  async function saveAgentErrorEvent(input: AgentErrorEventInput) {
    await agentRunRepository.saveErrorEvent(input);
  }

  async function saveAgentRunFailureEvents(run: AgentRunLedgerRecord) {
    if (run.status === "failed") {
      const message = run.error ?? "Agent run failed.";
      await saveAgentErrorEvent({
        eventId: `run:${run.runId}:failed:${shortHash(message)}`,
        runId: run.runId,
        conversationId: run.conversationId,
        source: "run",
        code: "run_failed",
        severity: "error",
        message,
        modelProvider: run.modelProvider,
        modelId: run.modelId,
        createdAt: run.completedAt ?? undefined,
        payload: { run }
      });
    }

    for (const tool of run.tools) {
      if (tool.status !== "failed") continue;
      const message = tool.error ?? `${tool.toolName} failed.`;
      await saveAgentErrorEvent({
        eventId: `tool:${run.runId}:${tool.toolCallId}:failed`,
        runId: run.runId,
        conversationId: run.conversationId,
        source: "tool",
        code: "tool_failed",
        severity: "error",
        message,
        modelProvider: run.modelProvider,
        modelId: run.modelId,
        toolCallId: tool.toolCallId,
        toolName: tool.toolName,
        createdAt: tool.completedAt ?? tool.startedAt,
        payload: { tool, run: summarizeRunForErrorEvent(run) }
      });
    }
  }

  async function saveRemoteToolRequestFailureEvent(request: AgentRunRemoteToolRequest) {
    if (request.status !== "failed") return;
    const run = await agentRunRepository.getLedger(request.runId);
    const message = request.error ?? `${request.toolName} remote request failed.`;
    await saveAgentErrorEvent({
      eventId: `remote-tool-request:${request.runId}:${request.toolCallId}:failed`,
      runId: request.runId,
      conversationId: run?.conversationId ?? null,
      source: "remote_tool_request",
      code: "remote_tool_request_failed",
      severity: "error",
      message,
      modelProvider: run?.modelProvider ?? null,
      modelId: run?.modelId ?? null,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      createdAt: request.completedAt ?? request.requestedAt,
      payload: { request, run: run ? summarizeRunForErrorEvent(run) : null }
    });
  }

  async function savePolicyDecisionErrorEvent(decision: AgentRunPolicyDecisionRecord) {
    if (decision.allowed) return;
    const run = await agentRunRepository.getLedger(decision.runId);
    const message = decision.message ?? `${decision.kind} was rejected.`;
    await saveAgentErrorEvent({
      eventId: `policy:${decision.decisionId}`,
      runId: decision.runId,
      conversationId: run?.conversationId ?? null,
      source: "policy",
      code: `policy_${decision.kind}`,
      severity: "warning",
      message,
      modelProvider: run?.modelProvider ?? null,
      modelId: run?.modelId ?? null,
      toolCallId: decision.toolCallId ?? null,
      toolName: decision.toolName ?? null,
      createdAt: decision.createdAt,
      payload: { decision, run: run ? summarizeRunForErrorEvent(run) : null }
    });
  }

  async function saveModelStepFailureEvent(step: AgentRunModelStepRecord) {
    if (step.status !== "failed") return;
    const run = await agentRunRepository.getLedger(step.runId);
    const message = step.error ?? "Model step failed.";
    await saveAgentErrorEvent({
      eventId: `model-step:${step.stepId}:failed`,
      runId: step.runId,
      conversationId: run?.conversationId ?? null,
      source: "model_step",
      code: "model_step_failed",
      severity: "error",
      message,
      modelProvider: step.modelProvider,
      modelId: step.modelId,
      toolCallId: step.outputToolCallId ?? null,
      toolName: step.outputToolName ?? null,
      createdAt: step.completedAt ?? step.startedAt,
      payload: { step, run: run ? summarizeRunForErrorEvent(run) : null }
    });
  }

  async function backfillPersistedAgentErrorEvents() {
    for (const run of await agentRunRepository.listAllLedgers()) {
      await saveAgentRunFailureEvents(run);
    }
    for (const request of await agentRunRepository.listAllRemoteToolRequests()) {
      await saveRemoteToolRequestFailureEvent(request);
    }
    for (const decision of await agentRunRepository.listAllPolicyDecisions()) {
      await savePolicyDecisionErrorEvent(decision);
    }
    for (const step of await agentRunRepository.listAllModelSteps()) {
      await saveModelStepFailureEvent(step);
    }
  }

  return {
    backfillPersistedAgentErrorEvents,
    saveAgentRunFailureEvents,
    saveRemoteToolRequestFailureEvent,
    savePolicyDecisionErrorEvent,
    saveModelStepFailureEvent
  };
}

export type AgentRunEventService = ReturnType<typeof createAgentRunEventService>;

function summarizeRunForErrorEvent(run: AgentRunLedgerRecord) {
  return {
    runId: run.runId,
    conversationId: run.conversationId,
    status: run.status,
    mode: run.mode,
    modelProvider: run.modelProvider,
    modelId: run.modelId,
    prompt: run.prompt,
    attachmentCount: run.attachmentCount,
    toolCount: run.tools.length,
    startedAt: run.startedAt,
    completedAt: run.completedAt ?? null,
    error: run.error ?? null
  };
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
