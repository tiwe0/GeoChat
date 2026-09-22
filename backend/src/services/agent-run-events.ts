import { createHash } from "node:crypto";
import type {
  AgentRunLedgerRecord
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

  async function backfillPersistedAgentErrorEvents() {
    for (const run of await agentRunRepository.listAllLedgers()) {
      await saveAgentRunFailureEvents(run);
    }
  }


  return {
    backfillPersistedAgentErrorEvents,
    saveAgentRunFailureEvents,
  };
}

export type AgentRunEventService = ReturnType<typeof createAgentRunEventService>;

function summarizeRunForErrorEvent(run: AgentRunLedgerRecord) {
  return {
    runId: run.runId,
    conversationId: run.conversationId,
    status: run.status,
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
