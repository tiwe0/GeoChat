import { describe, expect, test } from "bun:test";
import {
  completeInterruptedToolParts,
  isRetryableNativeChatError,
  messagesWithSkillPolicy,
  nativeChatNetworkRetryDelay,
  queueToolOutput,
  shouldAutomaticallyContinueNativeRun,
  shouldCompleteNativeRun,
  type AddToolOutput,
} from "../src/renderer-react/src/hooks/useAgentRunChat";
import { createDefaultDesktopConfig } from "../src/shared/desktop/desktop-config";

describe("native AI SDK renderer-tool handoff", () => {
  test("turns stale pending tool calls into explicit interrupted results before a new request", () => {
    const messages = [{
      id: "assistant-interrupted",
      role: "assistant" as const,
      parts: [{
        type: "tool-getCanvasContext",
        toolCallId: "canvas-interrupted",
        state: "input-available",
        input: {},
      } as never],
    }];

    const completed = completeInterruptedToolParts(messages);

    expect(completed[0]?.parts[0]).toMatchObject({
      toolCallId: "canvas-interrupted",
      state: "output-error",
      errorText: "Tool execution was interrupted before a result was received.",
    });
    expect(messages[0]?.parts[0]).toMatchObject({ state: "input-available" });
  });

  test("retries only transient transport failures with bounded backoff", () => {
    expect(nativeChatNetworkRetryDelay(0)).toBe(750);
    expect(nativeChatNetworkRetryDelay(1)).toBe(1_500);
    expect(nativeChatNetworkRetryDelay(2)).toBe(3_000);
    expect(nativeChatNetworkRetryDelay(3)).toBeNull();

    expect(isRetryableNativeChatError(new TypeError("Load failed"))).toBe(true);
    expect(isRetryableNativeChatError(new Error("HTTP 503 Service Unavailable"))).toBe(true);
    expect(isRetryableNativeChatError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableNativeChatError(new Error("HTTP 400 invalid_request"))).toBe(false);
    expect(isRetryableNativeChatError(new Error("Agent run is already terminal"))).toBe(false);
  });

  test("defers addToolOutput until the SDK onToolCall task has exited", async () => {
    let received: Parameters<AddToolOutput>[0] | undefined;
    const addToolOutput: AddToolOutput = (input) => {
      received = input;
      return new Promise<void>(() => {});
    };

    queueToolOutput(addToolOutput, {
      tool: "getCanvasContext",
      toolCallId: "canvas-call-1",
      output: { ok: true },
    });

    expect(received).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toEqual({
      tool: "getCanvasContext",
      toolCallId: "canvas-call-1",
      output: { ok: true },
    });
  });

  test("adds the configured Skill policy only to the request copy", () => {
    const messages = [{
      id: "user-1",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "画一个三角形。" }],
    }];
    const config = createDefaultDesktopConfig("zh-CN");

    const requestMessages = messagesWithSkillPolicy(messages, config, "zh-CN");

    expect(messages[0]?.parts[0]?.text).toBe("画一个三角形。");
    expect(requestMessages).not.toBe(messages);
    expect(requestMessages[0]?.parts[0]?.text).toContain("画一个三角形。");
    expect(requestMessages[0]?.parts[0]?.text).toContain("【Agent Skill 策略】");
    expect(requestMessages[0]?.parts[0]?.text).toContain("自动加载：开启");
  });

  test("continues only completed renderer tool handoffs", () => {
    const rendererTool = {
      id: "assistant-renderer",
      role: "assistant" as const,
      parts: [{
        type: "tool-getCanvasContext",
        toolCallId: "renderer-1",
        state: "output-available",
        input: {},
        output: { ok: true },
      } as never],
    };
    expect(shouldAutomaticallyContinueNativeRun({ messages: [rendererTool] })).toBe(true);

    const pending = {
      ...rendererTool,
      parts: [{
        type: "tool-getCanvasContext",
        toolCallId: "renderer-pending",
        state: "input-available",
        input: {},
      } as never],
    };
    expect(shouldAutomaticallyContinueNativeRun({ messages: [pending] })).toBe(false);

    const backendTool = {
      ...rendererTool,
      parts: [{
        type: "tool-searchGeoGebraCommands",
        toolCallId: "backend-1",
        state: "output-available",
        input: { query: "Circle", scope: "global" },
        output: { ok: true },
      } as never],
    };
    expect(shouldAutomaticallyContinueNativeRun({ messages: [backendTool] })).toBe(false);

    const completedLaterStep = {
      ...rendererTool,
      parts: [
        ...rendererTool.parts,
        { type: "step-start" as const },
        { type: "text" as const, text: "最终回答。" },
      ],
    };
    expect(shouldAutomaticallyContinueNativeRun({ messages: [completedLaterStep] })).toBe(false);
  });

  test("treats completed setFinished as terminal even with tool-calls finish reason", () => {
    const terminal = {
      id: "assistant-terminal",
      role: "assistant" as const,
      parts: [{
        type: "tool-setFinished",
        toolCallId: "terminal-1",
        state: "output-available",
        input: { summary: "done" },
        output: { ok: true },
      } as never],
    };
    expect(shouldAutomaticallyContinueNativeRun({ messages: [terminal] })).toBe(false);
    expect(shouldCompleteNativeRun(terminal, "tool-calls")).toBe(true);
  });

  test("does not treat failed or denied setFinished results as successful terminal completion", () => {
    for (const state of ["output-error", "output-denied"] as const) {
      const terminal = {
        id: `assistant-${state}`,
        role: "assistant" as const,
        parts: [{
          type: "tool-setFinished",
          toolCallId: `terminal-${state}`,
          state,
          input: { summary: "done" },
          ...(state === "output-error" ? { errorText: "failed" } : {}),
        } as never],
      };
      expect(shouldCompleteNativeRun(terminal, "tool-calls")).toBe(false);
    }
  });

  test("drops a queued tool output when its run generation is stale", async () => {
    const received: unknown[] = [];
    queueToolOutput((input) => { received.push(input); }, {
      tool: "getCanvasContext",
      toolCallId: "stale-call",
      output: { ok: true },
    }, () => false);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toEqual([]);
  });
});
