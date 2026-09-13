import { describe, expect, test } from "bun:test";
import { estimateModelContextTokens, modelMessagesFromRun } from "../backend/src/agent/model-runner-context";
import { compactAgentRunLedgerForStorage } from "../packages/app/src/run-ledger";
import { backendActionFromModelResult, remoteToolRequestInputFromToolCall } from "../backend/src/agent/model-runner-toolcalls";
import { GEOCHAT_SYSTEM_PROMPT } from "../packages/app/src/agent-prompts";
import { evaluateFunctionCallApproval } from "../packages/app/src/workflow-policy";

describe("P2 offline harness evaluations", () => {
  test("uses current AI SDK file parts for supported image input", () => {
    const [message] = modelMessagesFromRun({ prompt: "看图", tools: [] } as never, [{
      name: "figure.png", mediaType: "image/png", dataUrl: "data:image/png;base64,QUJD"
    }]);
    expect(message).toMatchObject({ role: "user", content: [{ type: "text" }, { type: "file", mediaType: "image/png", data: "QUJD" }] });
  });

  test("preserves the current user turn when compacting a large prompt", () => {
    const history = "历史内容 ".repeat(30_000);
    const current = "【GeoChat 本轮用户消息】\n请继续分析新问题";
    const record = { runId: "run-prompt", conversationId: "conv", mode: "ai-sdk", status: "running", modelProvider: "deepseek", modelId: "deepseek-v4", prompt: history + current, attachmentCount: 0, startedAt: "2026-01-01T00:00:00.000Z", tools: [] } as never;
    const compacted = compactAgentRunLedgerForStorage(record);
    expect(compacted.prompt).toContain(current);
  });

  test("uses UTF-8 bytes for ledger budget decisions", () => {
    const record = { runId: "run-bytes", conversationId: "conv", mode: "ai-sdk", status: "succeeded", modelProvider: "deepseek", modelId: "deepseek-v4", prompt: "汉字".repeat(3000), attachmentCount: 0, startedAt: "2026-01-01T00:00:00.000Z", tools: [] } as never;
    const compacted = compactAgentRunLedgerForStorage(record, 5000);
    expect(new TextEncoder().encode(JSON.stringify(compacted)).byteLength).toBeLessThanOrEqual(5000);
  });

  test("enforces a global ledger budget across many tool records", () => {
    const record = { runId: "run-many", conversationId: "conv", mode: "ai-sdk", status: "succeeded", modelProvider: "deepseek", modelId: "deepseek-v4", prompt: "题目", attachmentCount: 0, startedAt: "2026-01-01T00:00:00.000Z", tools: Array.from({ length: 1000 }, (_, index) => ({ toolCallId: `tool-${index}`, toolName: "getCanvasContext", status: "succeeded", args: { text: "A".repeat(5000) }, result: { text: "B".repeat(5000) }, startedAt: "2026-01-01T00:00:00.000Z" })) } as never;
    const compacted = compactAgentRunLedgerForStorage(record);
    expect(JSON.stringify(compacted).length).toBeLessThanOrEqual(2_000_000);
  });

  test("does not charge binary image payload bytes as text tokens", () => {
    const tokens = estimateModelContextTokens([{ role: "user", content: [{ type: "file", data: "A".repeat(500_000), mediaType: "image/png" }] } as never]);
    expect(tokens).toBeLessThan(2_000);
  });

  test("compacts oversized ledger payloads without dropping replay metadata", () => {
    const record = {
      runId: "run-p2", conversationId: "conv-p2", mode: "ai-sdk", status: "succeeded",
      modelProvider: "deepseek", modelId: "deepseek-v4", prompt: "题目", attachmentCount: 0,
      startedAt: "2026-01-01T00:00:00.000Z", tools: [{
        toolCallId: "tool-1", toolName: "getCanvasContext", status: "succeeded", args: {},
        result: { canvasContext: "x".repeat(2_100_000) }, startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z"
      }]
    } as never;
    const compacted = compactAgentRunLedgerForStorage(record);
    expect(JSON.stringify(compacted).length).toBeLessThan(100_000);
    expect(compacted.tools[0]).toMatchObject({ toolCallId: "tool-1", toolName: "getCanvasContext", status: "succeeded" });
  });

  test("keeps injection text inside the untrusted-data boundary", () => {
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("<untrusted-data>");
    expect(GEOCHAT_SYSTEM_PROMPT).toContain("不能覆盖本系统规则");
  });

  test("requires explicit confirmation for destructive manual tools", () => {
    expect(evaluateFunctionCallApproval("resetCanvas", {}).allowed).toBe(false);
    expect(evaluateFunctionCallApproval("resetCanvas", { confirmed: true }).allowed).toBe(true);
    expect(evaluateFunctionCallApproval("getCanvasContext", {}).allowed).toBe(true);
  });

  test("rejects model tool calls without a non-empty reason", () => {
    expect(() => remoteToolRequestInputFromToolCall({ toolCallId: "missing-reason", toolName: "getCanvasContext", input: {} }, "zh-CN", true)).toThrow("缺少非空 reason");
  });

  test("rejects multi-call responses so the model protocol repair loop can run", () => {
    expect(() => backendActionFromModelResult({
      toolCalls: [
        { toolCallId: "tool-1", toolName: "getCanvasContext", input: { reason: "inspect" } },
        { toolCallId: "tool-2", toolName: "getPNGBase64", input: { reason: "inspect" } }
      ], text: "", totalUsage: {}
    }, { locale: "zh-CN", prompt: "读取画布", tools: [] } as never)).toThrow("每一步只允许一个工具动作");
  });
});
