import {
  createAgentRunLedger,
  finishAgentRunLedger,
  normalizeAgentRunThinkingEffort,
  type AgentRunLedgerRecord,
  type AgentRunToolRecord,
} from "@geochat-ai/app/agent-run";
import type { FunctionCallToolName } from "@geochat-ai/app/functioncalls";
import type { UIMessage } from "ai";
import type { NativeChatRequest } from "./native-chat-request";
import { nativeMessageText, nativeUserMessageFingerprint } from "./native-chat-request";
import type { NativeChatRunStore } from "./native-chat-ports";

type AgentRunStatus = AgentRunLedgerRecord["status"];

export const NATIVE_AGENT_RUN_TRANSITIONS: Readonly<Record<AgentRunStatus, readonly AgentRunStatus[]>> = {
  running: ["running", "succeeded", "failed", "cancelled"],
  succeeded: ["succeeded"],
  failed: ["failed"],
  cancelled: ["cancelled"],
};

export async function loadOrCreateNativeRun(
  input: NativeChatRequest,
  latestUser: UIMessage,
  runs: NativeChatRunStore,
  seedBlackboard: (run: AgentRunLedgerRecord) => Promise<void>,
  clientSessionId: string,
) {
  const existing = await runs.getLedger(input.runId);
  if (existing) return { run: existing, isNew: false } as const;
  const created = createAgentRunLedger({
    runId: input.runId,
    conversationId: input.conversationId,
    clientSessionId,
    userMessageId: latestUser.id,
    assistantMessageId: null,
    model: input.model,
    locale: input.locale,
    thinking: input.thinking,
    thinkingEffort: input.thinkingEffort,
    prompt: nativeMessageText(latestUser),
    attachmentCount: latestUser.parts.filter((part) => part.type === "file").length,
  });
  const run = { ...created, requestFingerprint: nativeUserMessageFingerprint(latestUser) };
  await seedBlackboard(run);
  return { run, isNew: true } as const;
}

export function validateNativeRunContinuation(
  run: AgentRunLedgerRecord,
  input: NativeChatRequest,
  latestUser: UIMessage,
  clientSessionId?: string,
) {
  if (run.status !== "running") return `Agent run is already terminal: ${run.runId} (${run.status}).`;
  if (run.conversationId !== input.conversationId) return "Agent run conversation does not match the continuation request.";
  if (clientSessionId !== undefined && run.clientSessionId !== clientSessionId) return "Agent run client session does not match the continuation request.";
  if (run.userMessageId && run.userMessageId !== latestUser.id) return "Agent run user-message lineage does not match the continuation request.";
  if (run.modelProvider !== input.model.provider || run.modelId !== input.model.model) return "Agent run model does not match the continuation request.";
  if ((run.modelProtocol ?? null) !== (input.model.protocol ?? null)) return "Agent run model protocol does not match the continuation request.";
  if (run.prompt !== nativeMessageText(latestUser)) return "Agent run prompt does not match the continuation request.";
  if (run.attachmentCount !== latestUser.parts.filter((part) => part.type === "file").length) return "Agent run attachments do not match the continuation request.";
  if (run.requestFingerprint && run.requestFingerprint !== nativeUserMessageFingerprint(latestUser)) return "Agent run request fingerprint does not match the continuation request.";
  if ((run.locale ?? input.locale) !== input.locale) return "Agent run locale does not match the continuation request.";
  if ((run.thinking ?? input.thinking) !== input.thinking) return "Agent run reasoning mode does not match the continuation request.";
  const effort = normalizeAgentRunThinkingEffort(input.thinkingEffort) ?? "standard";
  if ((run.thinkingEffort ?? effort) !== effort) return "Agent run reasoning effort does not match the continuation request.";
  return undefined;
}

export function claimNativeRunLease(
  run: AgentRunLedgerRecord,
  leaseId: string,
  now: Date,
) {
  assertNativeRunTransition(run.status, "running");
  return {
    ...run,
    continuationLeaseId: leaseId,
    continuationLeaseExpiresAt: new Date(now.getTime() + (run.modelStepTimeoutMs ?? 120_000) + 30_000).toISOString(),
  };
}

export function nativeRunLeaseIsActive(run: AgentRunLedgerRecord, now = new Date()) {
  if (!run.continuationLeaseId || !run.continuationLeaseExpiresAt) return false;
  return Date.parse(run.continuationLeaseExpiresAt) > now.getTime();
}

export function releaseNativeRunLease(run: AgentRunLedgerRecord, leaseId: string) {
  if (run.continuationLeaseId !== leaseId) return run;
  return { ...run, continuationLeaseId: null, continuationLeaseExpiresAt: null };
}

export function terminalizeNativeModelTurn(
  run: AgentRunLedgerRecord,
  finishReason: string,
  maxModelSteps: number,
) {
  if (run.status !== "running") return run;
  if (hasCompletedControlTool(run)) return finishNativeRun(run, "succeeded");
  const failedTool = latestUnrecoveredToolFailure(run);
  if (failedTool && finishReason !== "tool-calls") {
    return finishNativeRun(run, "failed", failedTool.error ?? `${failedTool.toolName} failed.`);
  }
  if ((run.modelStepCount ?? 0) >= maxModelSteps && finishReason === "tool-calls") {
    return finishNativeRun(run, "failed", `Model step budget exhausted (${maxModelSteps}) before the run reached a terminal answer.`);
  }
  if (finishReason === "stop") return finishNativeRun(run, "succeeded");
  if (finishReason !== "tool-calls") {
    return finishNativeRun(run, "failed", `Model stopped without a successful terminal answer (finish reason: ${finishReason}).`);
  }
  return run;
}

export function failNativeRun(run: AgentRunLedgerRecord, error: string) {
  return run.status === "running" ? finishNativeRun(run, "failed", error) : run;
}

export function bindNativeRunAssistantMessage(run: AgentRunLedgerRecord, messages: UIMessage[]) {
  if (run.assistantMessageId) return run;
  const userIndex = messages.findIndex((message) => message.id === run.userMessageId);
  if (userIndex < 0) return run;
  const assistant = messages.slice(userIndex + 1).find((message) => message.role === "assistant");
  return assistant ? { ...run, assistantMessageId: assistant.id } : run;
}

export function hasCompletedControlTool(run: Pick<AgentRunLedgerRecord, "tools">) {
  return run.tools.some((tool) => tool.toolName === "setFinished" && tool.status === "succeeded");
}

function finishNativeRun(run: AgentRunLedgerRecord, status: Exclude<AgentRunStatus, "running">, error?: string) {
  assertNativeRunTransition(run.status, status);
  return finishAgentRunLedger(run, {
    status,
    ...(error ? { error } : {}),
    ...(status === "succeeded" && run.usage ? { usage: run.usage } : {}),
  });
}

function assertNativeRunTransition(from: AgentRunStatus, to: AgentRunStatus) {
  if (!NATIVE_AGENT_RUN_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid native agent run transition: ${from} -> ${to}`);
  }
}

function latestUnrecoveredToolFailure(run: Pick<AgentRunLedgerRecord, "tools">) {
  const seen = new Set<FunctionCallToolName>();
  for (let index = run.tools.length - 1; index >= 0; index -= 1) {
    const tool = run.tools[index] as AgentRunToolRecord;
    if (seen.has(tool.toolName)) continue;
    seen.add(tool.toolName);
    if (tool.status === "failed") return tool;
  }
  return null;
}
