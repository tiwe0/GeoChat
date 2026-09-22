import { describe, expect, test } from "bun:test";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { APICallError, type UIMessage } from "ai";
import { createNativeChatResponse, type NativeChatRequest } from "../backend/src/agent/native-chat";
import type { BackendHttpContext } from "../backend/src/http/context";
import type { AgentRunLedgerRecord } from "@geochat-ai/app";

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};

function contextWithLedgerStore() {
  const ledgers = new Map<string, AgentRunLedgerRecord>();
  const context = {
    repositories: {
      agentRuns: {
        getLedger: async (runId: string) => ledgers.get(runId),
        createLedger: async (record: AgentRunLedgerRecord) => {
          if (ledgers.has(record.runId)) throw new Error("Agent run ledger revision conflict");
          const created = { ...record, revision: 0 };
          ledgers.set(record.runId, structuredClone(created));
          return created;
        },
        compareAndSwapLedger: async (record: AgentRunLedgerRecord, expectedRevision: number) => {
          const current = ledgers.get(record.runId);
          if (!current || current.revision !== expectedRevision) throw new Error("Agent run ledger revision conflict");
          const next = { ...record, revision: expectedRevision + 1 };
          ledgers.set(record.runId, structuredClone(next));
          return next;
        },
        saveLedger: async (record: AgentRunLedgerRecord) => {
          const next = { ...record, revision: (ledgers.get(record.runId)?.revision ?? -1) + 1 };
          ledgers.set(record.runId, structuredClone(next));
          return next;
        },
      },
      blackboard: {
        listEntries: async () => [],
        patchEntries: async () => ({ entries: [], applied: 0 }),
      },
    },
  } as unknown as BackendHttpContext;
  return { context, ledgers };
}

function request(messages: UIMessage[]): NativeChatRequest {
  return {
    messages,
    runId: "run_native_tool_loop",
    conversationId: "conv_native_tool_loop",
    model: {
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "test-key",
      customBaseUrl: "",
      maxToolSteps: 8,
    },
    locale: "zh-CN",
    thinking: false,
    thinkingEffort: "standard",
  };
}

describe("native AI SDK UI tool loop", () => {
  test("retries a retryable provider network error before streaming the answer", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    let attempts = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new APICallError({
            message: "temporary network interruption",
            url: "https://example.invalid/chat",
            requestBodyValues: {},
            isRetryable: true,
          });
        }
        return {
          stream: simulateReadableStream({ chunks: [
            { type: "text-start", id: "retry-text" },
            { type: "text-delta", id: "retry-text", delta: "网络恢复后完成。" },
            { type: "text-end", id: "retry-text" },
            { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
          ] }),
        };
      },
    });
    const user: UIMessage = {
      id: "user-provider-retry",
      role: "user",
      parts: [{ type: "text", text: "本轮已关闭 Agent Skills。测试网络重试。" }],
    };

    const response = await createNativeChatResponse(request([user]), context, { model });
    const stream = await response.text();

    expect(attempts).toBe(2);
    expect(stream).toContain("网络恢复后完成。");
    expect(ledgers.get("run_native_tool_loop")?.status).toBe("succeeded");
  });

  test("keeps an HTTP-disconnected run resumable instead of recording a user cancellation", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const controller = new AbortController();
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          initialDelayInMs: 100,
          chunks: [
            { type: "text-start", id: "disconnect-text" },
            { type: "text-delta", id: "disconnect-text", delta: "稍后完成。" },
            { type: "text-end", id: "disconnect-text" },
            { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
          ],
        }),
      }),
    });
    const user: UIMessage = {
      id: "user-disconnect",
      role: "user",
      parts: [{ type: "text", text: "本轮已关闭 Agent Skills。测试断流恢复。" }],
    };

    const response = await createNativeChatResponse(request([user]), context, {
      model,
      abortSignal: controller.signal,
    });
    controller.abort(new Error("simulated network disconnect"));
    await response.text().catch(() => "");
    await Bun.sleep(10);

    expect(ledgers.get("run_native_tool_loop")?.status).toBe("running");
    expect(ledgers.get("run_native_tool_loop")?.error).toBeNull();
    expect(ledgers.get("run_native_tool_loop")?.continuationLeaseId).toBeNull();
  });

  test("rejects unsupported reasoning before creating a provider request", async () => {
    const { context } = contextWithLedgerStore();
    const input = request([{
      id: "user-reasoning",
      role: "user",
      parts: [{ type: "text", text: "请思考后作图。" }],
    }]);
    input.model.model = "deepseek-flash";
    input.thinking = true;

    const response = await createNativeChatResponse(input, context);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Reasoning mode is not supported");
  });

  test("streams a frontend tool part and continues from addToolOutput messages", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const user: UIMessage = {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "本轮已关闭 Agent Skills。读取画板。" }],
    };
    const toolModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          {
            type: "tool-call",
            toolCallId: "canvas-call-1",
            toolName: "getCanvasContext",
            input: "{}",
          },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
        ] }),
      }),
    });

    const first = await createNativeChatResponse(request([user]), context, { model: toolModel });
    const firstStream = await first.text();
    expect(first.headers.get("content-type")).toContain("text/event-stream");
    expect(firstStream).toContain('"toolName":"getCanvasContext"');
    expect(firstStream).toContain("canvas-call-1");
    expect(ledgers.get("run_native_tool_loop")?.status).toBe("running");

    const assistantTool: UIMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [{
        type: "tool-getCanvasContext",
        toolCallId: "canvas-call-1",
        state: "output-available",
        input: {},
        output: { ok: true, objects: [] },
      } as never],
    };
    const finalModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "画板已读取。" },
          { type: "text-end", id: "text-1" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
        ] }),
      }),
    });

    const second = await createNativeChatResponse(request([user, assistantTool]), context, { model: finalModel });
    const secondStream = await second.text();
    expect(secondStream).toContain("画板已读取。");
    expect(secondStream).not.toContain(JSON.stringify({ ok: true, objects: [] }));
    expect(ledgers.get("run_native_tool_loop")?.status).toBe("succeeded");
    expect(ledgers.get("run_native_tool_loop")?.tools).toEqual([
      expect.objectContaining({
        toolCallId: "canvas-call-1",
        toolName: "getCanvasContext",
        status: "succeeded",
        result: { ok: true, objects: [] },
      }),
    ]);
  });

  test("serializes backend-tool, step, and terminal ledger writes in one model turn", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const compareAndSwap = context.repositories.agentRuns.compareAndSwapLedger.bind(context.repositories.agentRuns);
    context.repositories.agentRuns.compareAndSwapLedger = async (record, expectedRevision) => {
      // SQLite writes complete asynchronously in the desktop runtime. This
      // delay makes overlapping AI SDK callbacks deterministic in the test.
      await Bun.sleep(5);
      return compareAndSwap(record, expectedRevision);
    };
    const user: UIMessage = {
      id: "user-mixed-tools",
      role: "user",
      parts: [{ type: "text", text: "本轮已关闭 Agent Skills。读取工作记忆和画板。" }],
    };
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          {
            type: "tool-call",
            toolCallId: "blackboard-mixed-1",
            toolName: "readBlackboard",
            input: JSON.stringify({
              reason: "检查已有计划。",
              intendedOutcome: "读取当前工作记忆。",
              nextExpectedAction: "继续检查画板。",
            }),
          },
          {
            type: "tool-call",
            toolCallId: "canvas-mixed-1",
            toolName: "getCanvasContext",
            input: JSON.stringify({
              reason: "读取当前画板。",
              intendedOutcome: "确认已有对象。",
              nextExpectedAction: "继续构造。",
            }),
          },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
        ] }),
      }),
    });

    const response = await createNativeChatResponse(request([user]), context, { model });
    const stream = await response.text();

    expect(stream).not.toContain('"type":"error"');
    expect(stream).toContain('"toolName":"getCanvasContext"');
    expect(ledgers.get("run_native_tool_loop")?.status).toBe("running");
    expect(ledgers.get("run_native_tool_loop")?.tools).toContainEqual(expect.objectContaining({
      toolCallId: "blackboard-mixed-1",
      toolName: "readBlackboard",
      status: "succeeded",
    }));
  });

  test("marks a run failed when the final answer leaves a frontend tool failure unrecovered", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const user: UIMessage = {
      id: "user-failed-tool",
      role: "user",
      parts: [{ type: "text", text: "读取画板。" }],
    };
    const failedTool: UIMessage = {
      id: "assistant-failed-tool",
      role: "assistant",
      parts: [{
        type: "tool-getCanvasContext",
        toolCallId: "canvas-failed-1",
        state: "output-error",
        input: {},
        errorText: "The GeoGebra canvas is not ready.",
      } as never],
    };
    const finalModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "text-start", id: "text-failed" },
          { type: "text-delta", id: "text-failed", delta: "暂时无法读取。" },
          { type: "text-end", id: "text-failed" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
        ] }),
      }),
    });

    const response = await createNativeChatResponse(request([user, failedTool]), context, { model: finalModel });
    await response.text();

    expect(ledgers.get("run_native_tool_loop")?.status).toBe("failed");
    expect(ledgers.get("run_native_tool_loop")?.error).toBe("The GeoGebra canvas is not ready.");
  });

  test("does not merge completed tools from an earlier conversation turn into a new run", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const oldUser: UIMessage = {
      id: "user-old",
      role: "user",
      parts: [{ type: "text", text: "上一题。" }],
    };
    const oldAssistant: UIMessage = {
      id: "assistant-old",
      role: "assistant",
      parts: [{
        type: "tool-setFinished",
        toolCallId: "finished-old",
        state: "output-available",
        input: { summary: "上一题完成。" },
        output: { ok: true },
      } as never],
    };
    const currentUser: UIMessage = {
      id: "user-current",
      role: "user",
      parts: [{ type: "text", text: "本轮已关闭 Agent Skills。开始新题。" }],
    };
    const finalModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "text-start", id: "text-current" },
          { type: "text-delta", id: "text-current", delta: "开始处理新题。" },
          { type: "text-end", id: "text-current" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
        ] }),
      }),
    });

    const input = request([oldUser, oldAssistant, currentUser]);
    input.runId = "run_new_turn";
    const response = await createNativeChatResponse(input, context, { model: finalModel });
    await response.text();

    expect(ledgers.get("run_new_turn")?.userMessageId).toBe("user-current");
    expect(ledgers.get("run_new_turn")?.tools).toEqual([]);
  });

  test("commits setFinished as terminal and rejects any later continuation", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const user: UIMessage = {
      id: "user-terminal",
      role: "user",
      parts: [{ type: "text", text: "完成当前任务。" }],
    };
    const inspected: UIMessage = {
      id: "assistant-terminal",
      role: "assistant",
      parts: [{
        type: "tool-getCanvasContext",
        toolCallId: "canvas-terminal",
        state: "output-available",
        input: {},
        output: { ok: true, objects: [] },
      } as never],
    };
    const terminalModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          {
            type: "tool-call",
            toolCallId: "finished-terminal",
            toolName: "setFinished",
            input: JSON.stringify({ summary: "任务完成。" }),
          },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
        ] }),
      }),
    });

    const first = await createNativeChatResponse(request([user, inspected]), context, { model: terminalModel });
    await first.text();
    expect(ledgers.get("run_native_tool_loop")?.status).toBe("succeeded");
    expect(ledgers.get("run_native_tool_loop")?.tools).toContainEqual(expect.objectContaining({
      toolName: "setFinished",
      status: "succeeded",
    }));

    const second = await createNativeChatResponse(request([user, inspected]), context, { model: terminalModel });
    expect(second.status).toBe(409);
    expect(await second.text()).toContain("already terminal");
  });

  test("enforces the model-step budget across renderer continuations", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const user: UIMessage = {
      id: "user-budget",
      role: "user",
      parts: [{ type: "text", text: "连续读取画板。" }],
    };
    const firstModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "tool-call", toolCallId: "budget-1", toolName: "getCanvasContext", input: "{}" },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
        ] }),
      }),
    });
    const limited = request([user]);
    limited.model.maxToolSteps = 2;
    await (await createNativeChatResponse(limited, context, { model: firstModel })).text();
    expect(ledgers.get(limited.runId)?.modelStepCount).toBe(1);
    expect(ledgers.get(limited.runId)?.status).toBe("running");

    const firstOutput: UIMessage = {
      id: "assistant-budget",
      role: "assistant",
      parts: [{
        type: "tool-getCanvasContext",
        toolCallId: "budget-1",
        state: "output-available",
        input: {},
        output: { ok: true },
      } as never],
    };
    const secondModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "tool-call", toolCallId: "budget-2", toolName: "getCanvasContext", input: "{}" },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
        ] }),
      }),
    });
    limited.messages = [user, firstOutput];
    await (await createNativeChatResponse(limited, context, { model: secondModel })).text();
    expect(ledgers.get(limited.runId)?.modelStepCount).toBe(2);
    expect(ledgers.get(limited.runId)?.status).toBe("failed");
    expect(ledgers.get(limited.runId)?.error).toContain("budget exhausted");

    const third = await createNativeChatResponse(limited, context, { model: secondModel });
    expect(third.status).toBe(409);
  });

  test("rejects a continuation whose immutable run lineage changed", async () => {
    const { context } = contextWithLedgerStore();
    const user: UIMessage = {
      id: "user-lineage",
      role: "user",
      parts: [{ type: "text", text: "读取画板。" }],
    };
    const toolModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "tool-call", toolCallId: "lineage-1", toolName: "getCanvasContext", input: "{}" },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
        ] }),
      }),
    });
    await (await createNativeChatResponse(request([user]), context, { model: toolModel })).text();

    const changed = request([user]);
    changed.conversationId = "conv-other";
    const response = await createNativeChatResponse(changed, context, { model: toolModel });
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("conversation does not match");
  });

  test("rejects a concurrent continuation while the previous HTTP lease is active", async () => {
    const { context } = contextWithLedgerStore();
    const user: UIMessage = {
      id: "user-concurrent",
      role: "user",
      parts: [{ type: "text", text: "读取画板。" }],
    };
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "tool-call", toolCallId: "concurrent-1", toolName: "getCanvasContext", input: "{}" },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
        ], initialDelayInMs: 50 }),
      }),
    });

    const first = await createNativeChatResponse(request([user]), context, { model });
    const second = await createNativeChatResponse(request([user]), context, { model });
    expect(second.status).toBe(409);
    expect(await second.text()).toContain("active continuation");
    await first.text();
  });

  test("marks truncated model output failed instead of treating it as a successful answer", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const user: UIMessage = {
      id: "user-truncated",
      role: "user",
      parts: [{ type: "text", text: "直接回答。" }],
    };
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "text-start", id: "truncated-text" },
          { type: "text-delta", id: "truncated-text", delta: "未完成" },
          { type: "text-end", id: "truncated-text" },
          { type: "finish", finishReason: { unified: "length", raw: "length" }, usage },
        ] }),
      }),
    });

    await (await createNativeChatResponse(request([user]), context, { model })).text();
    expect(ledgers.get("run_native_tool_loop")?.status).toBe("failed");
    expect(ledgers.get("run_native_tool_loop")?.error).toContain("finish reason: length");
  });

  test("accumulates token usage across HTTP continuations", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const user: UIMessage = {
      id: "user-usage",
      role: "user",
      parts: [{ type: "text", text: "读取后回答。" }],
    };
    const firstModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "tool-call", toolCallId: "usage-1", toolName: "getCanvasContext", input: "{}" },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
        ] }),
      }),
    });
    await (await createNativeChatResponse(request([user]), context, { model: firstModel })).text();
    const assistant: UIMessage = {
      id: "assistant-usage",
      role: "assistant",
      parts: [{
        type: "tool-getCanvasContext",
        toolCallId: "usage-1",
        state: "output-available",
        input: {},
        output: { ok: true },
      } as never],
    };
    const secondUsage = {
      inputTokens: { total: 4, noCache: 4, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    };
    const finalModel = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "text-start", id: "usage-text" },
          { type: "text-delta", id: "usage-text", delta: "完成。" },
          { type: "text-end", id: "usage-text" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: secondUsage },
        ] }),
      }),
    });
    await (await createNativeChatResponse(request([user, assistant]), context, { model: finalModel })).text();

    expect(ledgers.get("run_native_tool_loop")?.usage).toEqual({
      inputTokens: 7,
      outputTokens: 3,
      totalTokens: 10,
    });
  });

  test("a successful setFinished commit wins over an earlier tool failure", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const user: UIMessage = {
      id: "user-recovered",
      role: "user",
      parts: [{ type: "text", text: "恢复后完成。" }],
    };
    const history: UIMessage = {
      id: "assistant-recovered",
      role: "assistant",
      parts: [
        {
          type: "tool-getCanvasContext",
          toolCallId: "failed-before-recovery",
          state: "output-error",
          input: {},
          errorText: "temporary failure",
        } as never,
        {
          type: "tool-getCanvasContext",
          toolCallId: "successful-recovery",
          state: "output-available",
          input: {},
          output: { ok: true },
        } as never,
      ],
    };
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          {
            type: "tool-call",
            toolCallId: "finish-recovered",
            toolName: "setFinished",
            input: JSON.stringify({ summary: "已恢复并完成。" }),
          },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
        ] }),
      }),
    });
    await (await createNativeChatResponse(request([user, history]), context, { model })).text();
    expect(ledgers.get("run_native_tool_loop")?.status).toBe("succeeded");
    expect(ledgers.get("run_native_tool_loop")?.error).toBeNull();
  });

  test("persists native reasoning and tool UI parts for backend history restore", async () => {
    const { context } = contextWithLedgerStore();
    const stored = new Map<string, { payload: { parts?: unknown[] } }>();
    context.repositories.conversations = {
      findMessageById: async (id: string) => stored.get(id) as never,
      upsertConversationMessage: async (input: { message: { id: string; payload: { parts?: unknown[] } } }) => {
        stored.set(input.message.id, structuredClone(input.message));
        return {} as never;
      },
    } as never;
    const user: UIMessage = {
      id: "user-persist",
      role: "user",
      parts: [{ type: "text", text: "读取后解释。" }],
    };
    const toolHistory: UIMessage = {
      id: "assistant-persist",
      role: "assistant",
      parts: [{
        type: "tool-getCanvasContext",
        toolCallId: "persist-tool",
        state: "output-available",
        input: {},
        output: { ok: true, objects: [] },
      } as never],
    };
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "reasoning-start", id: "reasoning-persist" },
          { type: "reasoning-delta", id: "reasoning-persist", delta: "检查画板对象。" },
          { type: "reasoning-end", id: "reasoning-persist" },
          { type: "text-start", id: "text-persist" },
          { type: "text-delta", id: "text-persist", delta: "已经完成。" },
          { type: "text-end", id: "text-persist" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
        ] }),
      }),
    });
    const response = await createNativeChatResponse(request([user, toolHistory]), context, {
      model,
      dataScope: { ownerUserId: null },
    });
    await response.text();

    const persistedParts = [...stored.values()].flatMap((message) => message.payload.parts ?? []) as Array<{ type?: string }>;
    expect(persistedParts.some((part) => part.type === "tool-getCanvasContext")).toBe(true);
    expect(persistedParts.some((part) => part.type === "reasoning")).toBe(true);
    expect(persistedParts.some((part) => part.type === "text")).toBe(true);
  });

  test("turns terminal ledger persistence failure into a stream error", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const compareAndSwap = context.repositories.agentRuns.compareAndSwapLedger.bind(context.repositories.agentRuns);
    context.repositories.agentRuns.compareAndSwapLedger = async (record, expectedRevision) => {
      if (record.status === "succeeded") throw new Error("terminal persistence refused");
      return compareAndSwap(record, expectedRevision);
    };
    const user: UIMessage = {
      id: "user-persistence-failure",
      role: "user",
      parts: [{ type: "text", text: "直接回答。" }],
    };
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "text-start", id: "text-persistence-failure" },
          { type: "text-delta", id: "text-persistence-failure", delta: "回答。" },
          { type: "text-end", id: "text-persistence-failure" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
        ] }),
      }),
    });
    const response = await createNativeChatResponse(request([user]), context, { model });
    const stream = await response.text();

    expect(stream).toContain("terminal persistence refused");
    expect(ledgers.get("run_native_tool_loop")?.status).toBe("failed");
  });

  test("fails the ledger when final conversation persistence fails instead of recording a false success", async () => {
    const { context, ledgers } = contextWithLedgerStore();
    const stored = new Map<string, unknown>();
    context.repositories.conversations = {
      findMessageById: async (id: string) => stored.get(id) as never,
      upsertConversationMessage: async (input: { message: { id: string; role: string } }) => {
        if (input.message.role === "assistant") throw new Error("conversation persistence refused");
        stored.set(input.message.id, input.message);
        return {} as never;
      },
    } as never;
    const user: UIMessage = {
      id: "user-conversation-persistence-failure",
      role: "user",
      parts: [{ type: "text", text: "直接回答。" }],
    };
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: [
          { type: "text-start", id: "conversation-persistence-text" },
          { type: "text-delta", id: "conversation-persistence-text", delta: "回答。" },
          { type: "text-end", id: "conversation-persistence-text" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
        ] }),
      }),
    });

    const response = await createNativeChatResponse(request([user]), context, { model, dataScope: { ownerUserId: null } });
    const stream = await response.text();
    expect(stream).toContain("conversation persistence refused");
    expect(ledgers.get("run_native_tool_loop")).toMatchObject({
      status: "failed",
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    });
  });
});
