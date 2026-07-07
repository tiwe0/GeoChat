import type { AgentRunLedgerRecord } from "@geochat-ai/app";
import type { AgentErrorEventOutput } from "../db/agent-run-repository";
import type { ConversationDataScope } from "../db/conversation-repository";
import type { BackendHttpContext } from "./context";

export async function filterAgentRunsForScope(
  records: AgentRunLedgerRecord[],
  scope: ConversationDataScope,
  context: BackendHttpContext
) {
  const visible = await Promise.all(records.map(async (record) => await agentRunConversationVisibleInScope(record, scope, context)));
  return records.filter((_, index) => visible[index]);
}

export async function filterAgentErrorEventsForScope(
  records: AgentErrorEventOutput[],
  scope: ConversationDataScope,
  context: BackendHttpContext
) {
  const visible = await Promise.all(records.map(async (record) => await agentErrorEventVisibleInScope(record, scope, context)));
  return records.filter((_, index) => visible[index]);
}

export async function agentRunConversationVisibleInScope(
  record: Pick<AgentRunLedgerRecord, "conversationId">,
  scope: ConversationDataScope,
  context: BackendHttpContext
) {
  const expectedOwner = scope.ownerUserId ?? null;
  const ownerUserId = await context.repositories.conversations.getConversationOwnerUserId(record.conversationId);
  if (ownerUserId === undefined) return expectedOwner === null;
  return ownerUserId === expectedOwner;
}

async function agentErrorEventVisibleInScope(
  record: Pick<AgentErrorEventOutput, "runId" | "conversationId">,
  scope: ConversationDataScope,
  context: BackendHttpContext
) {
  if (record.conversationId) {
    return agentRunConversationVisibleInScope({ conversationId: record.conversationId }, scope, context);
  }
  const run = await context.repositories.agentRuns.getLedger(record.runId);
  if (run) return agentRunConversationVisibleInScope(run, scope, context);
  return (scope.ownerUserId ?? null) === null;
}
