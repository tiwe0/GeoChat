import { afterEach, describe, expect, test } from "bun:test";
import { parseConversationMessages } from "../src/renderer-react/src/features/conversations/api";
import { restoreConversationMessages } from "../src/renderer-react/src/features/conversations/messageAdapter";
import {
  readLocalConversation,
  saveLocalConversation,
} from "../src/renderer-react/src/features/conversations/localStore";
import { mergeConversationSummaries } from "../src/renderer-react/src/features/conversations/useConversations";

const originalLocalStorage = globalThis.localStorage;

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
});

describe("conversation transcript persistence", () => {
  test("restores native reasoning and tool parts from payload.parts", () => {
    const stored = parseConversationMessages([{
      id: "message-1",
      clientMessageId: "assistant-1",
      role: "assistant",
      content: "完成。",
      payload: {
        parts: [
          { type: "reasoning", text: "先检查画板。" },
          {
            type: "tool-executeGeoGebraCommands",
            toolCallId: "tool-1",
            state: "output-available",
            input: { commands: ["A=(0,0)"] },
            output: { ok: true },
          },
          { type: "text", text: "完成。" },
        ],
        usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      },
    }]);

    const [message] = restoreConversationMessages(stored);
    expect(message?.id).toBe("assistant-1");
    expect(message?.parts.map((part) => part.type)).toEqual([
      "reasoning",
      "tool-executeGeoGebraCommands",
      "text",
    ]);
    expect(message?.metadata?.tokenUsage?.totalTokens).toBe(6);
  });

  test("round-trips local native UI messages through the versioned envelope", () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
    });
    saveLocalConversation({
      id: "conversation-1",
      model: "deepseek-chat",
      title: "测试",
      messages: [{
        id: "assistant-local",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "思考。" },
          {
            type: "tool-resetCanvas",
            toolCallId: "reset-local",
            state: "output-available",
            input: {},
            output: { ok: true },
          } as never,
        ],
      }],
    });

    const raw = values.get("geochatDesktopConversations");
    expect(raw).toContain('"version":1');
    expect(readLocalConversation("conversation-1")?.messages[0]?.parts.map((part) => part.type)).toEqual([
      "reasoning",
      "tool-resetCanvas",
    ]);
  });

  test("rejects malformed local UI message snapshots", () => {
    const values = new Map<string, string>();
    values.set("geochatDesktopConversations", JSON.stringify([{
      summary: {
        id: "conversation-invalid",
        model: "deepseek-chat",
        title: "bad",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        messageCount: 1,
      },
      messages: [{ id: "message-invalid", role: "assistant", parts: [{ type: "tool-resetCanvas" }] }],
    }]));
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
    });

    expect(readLocalConversation("conversation-invalid")).toBeNull();
  });

  test("reports local persistence failures instead of silently claiming success", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => { throw new Error("quota exceeded"); },
        removeItem: () => undefined,
      },
    });

    expect(() => saveLocalConversation({
      id: "conversation-quota",
      model: "deepseek-chat",
      title: "quota",
      messages: [{ id: "user-quota", role: "user", parts: [{ type: "text", text: "test" }] }],
    })).toThrow("quota exceeded");
  });

  test("prefers the freshest conversation summary instead of always shadowing backend history with local data", () => {
    const local = [{ id: "conversation-1", model: "deepseek-chat", title: "local", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:01.000Z", messageCount: 1 }];
    const backend = [{ id: "conversation-1", model: "deepseek-chat", title: "backend", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:02.000Z", messageCount: 4 }];
    expect(mergeConversationSummaries(local, backend)).toEqual(backend);
  });
});
