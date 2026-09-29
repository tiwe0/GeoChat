import { describe, expect, test } from "bun:test";
import { createAgentRunLedger, finishAgentRunLedger, type AgentRunLedgerRecord } from "@geochat-ai/app";
import { gateNativeChatTerminalEvents } from "../backend/src/agent/ai-sdk-sse-transport";
import { failNativeRun, NATIVE_AGENT_RUN_TRANSITIONS } from "../backend/src/agent/agent-run-lifecycle";
import { NativeRunPersistenceCoordinator, persistNativeConversationMessages } from "../backend/src/agent/agent-run-persistence";
import type { NativeChatRunStore } from "../backend/src/agent/native-chat-ports";

function runningRun(runId: string) {
  return createAgentRunLedger({
    runId,
    conversationId: `conversation-${runId}`,
    userMessageId: `user-${runId}`,
    assistantMessageId: null,
    model: {
      provider: "deepseek",
      model: "deepseek-chat",
      credentialRef: "credential-test",
      maxToolSteps: 8,
    },
    locale: "zh-CN",
    thinking: false,
    prompt: "test",
    attachmentCount: 0,
  });
}

function memoryRunStore(initial: AgentRunLedgerRecord) {
  let stored = structuredClone(initial);
  let compareAndSwapCalls = 0;
  const store: NativeChatRunStore = {
    async getLedger(runId) {
      return stored.runId === runId ? structuredClone(stored) : undefined;
    },
    async createLedger(record) {
      stored = { ...structuredClone(record), revision: 0 };
      return structuredClone(stored);
    },
    async compareAndSwapLedger(record, expectedRevision) {
      compareAndSwapCalls += 1;
      if (stored.revision !== expectedRevision) throw new Error("Agent run ledger revision conflict");
      stored = { ...structuredClone(record), revision: expectedRevision + 1 };
      return structuredClone(stored);
    },
  };
  return {
    store,
    current: () => stored,
    replace: (run: AgentRunLedgerRecord) => { stored = structuredClone(run); },
    compareAndSwapCalls: () => compareAndSwapCalls,
  };
}

describe("native chat application boundaries", () => {
  test("does not persist transient AI SDK messages before they have a stable id", async () => {
    const persisted: string[] = [];
    const conversations = {
      findMessageById: async () => undefined,
      upsertConversationMessage: async (input: { message: { id: string } }) => {
        persisted.push(input.message.id);
        return {};
      },
    };
    await persistNativeConversationMessages(
      conversations as never,
      "conversation-restore",
      [
        { id: "", role: "assistant", parts: [{ type: "text", text: "transient" }] },
        { id: "assistant-stable", role: "assistant", parts: [{ type: "text", text: "done" }] },
      ] as never,
      {},
    );
    expect(persisted).toEqual(["assistant-stable"]);
  });

  test("declares terminal states as self-only transitions", () => {
    expect(NATIVE_AGENT_RUN_TRANSITIONS.running).toEqual(["running", "succeeded", "failed", "cancelled"]);
    expect(NATIVE_AGENT_RUN_TRANSITIONS.succeeded).toEqual(["succeeded"]);
    expect(NATIVE_AGENT_RUN_TRANSITIONS.failed).toEqual(["failed"]);
    expect(NATIVE_AGENT_RUN_TRANSITIONS.cancelled).toEqual(["cancelled"]);
  });

  test("makes repeated terminalization idempotent without another ledger write", async () => {
    const memory = memoryRunStore(runningRun("run-idempotent"));
    const persistence = new NativeRunPersistenceCoordinator(memory.current(), memory.store);

    const terminal = await persistence.commit((run) => failNativeRun(run, "provider failed"));
    const repeated = await persistence.commit((run) => failNativeRun(run, "different stale error"));

    expect(terminal.status).toBe("failed");
    expect(repeated).toEqual(terminal);
    expect(repeated.error).toBe("provider failed");
    expect(memory.compareAndSwapCalls()).toBe(1);
  });

  test("rejects a stale running writer after another writer made the run terminal", async () => {
    const initial = runningRun("run-stale");
    const memory = memoryRunStore(initial);
    const persistence = new NativeRunPersistenceCoordinator(initial, memory.store);
    memory.replace({
      ...finishAgentRunLedger(initial, { status: "cancelled", error: "cancelled elsewhere" }),
      revision: initial.revision + 1,
    });

    await expect(persistence.commit((run) => ({ ...run, prompt: "stale update" })))
      .rejects.toThrow("revision conflict");
    expect(memory.current().status).toBe("cancelled");
  });

  test("withholds the SSE finish event until terminal persistence succeeds", async () => {
    const upstream = new Response("data: {\"type\":\"text-delta\",\"delta\":\"ok\"}\n\ndata: {\"type\":\"finish\"}\n\ndata: [DONE]\n\n", {
      headers: { "content-type": "text/event-stream" },
    });
    const response = gateNativeChatTerminalEvents(upstream, Promise.resolve({
      status: "failed",
      error: "terminal persistence refused",
    }));

    const stream = await response.text();
    expect(stream).toContain("text-delta");
    expect(stream).not.toContain("\"type\":\"finish\"");
    expect(stream).toContain("terminal persistence refused");
    expect(stream).toContain("[DONE]");
  });
});
