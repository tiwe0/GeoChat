import { afterEach, describe, expect, test } from "bun:test";
import { parseConversationMessages } from "../src/renderer-react/src/features/conversations/api";
import { restoreConversationMessages } from "../src/renderer-react/src/features/conversations/messageAdapter";

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

  test("keeps backend payload parsing independent from legacy renderer cache timestamps", () => {
    const stored = parseConversationMessages([{
      id: "message-backend",
      clientMessageId: "assistant-backend",
      role: "assistant",
      content: "backend",
      payload: { parts: [{ type: "text", text: "backend" }] },
    }]);
    expect(restoreConversationMessages(stored)[0]?.parts).toEqual([{ type: "text", text: "backend" }]);
  });

  test("uses backend history as the sole runtime authority after legacy migration", async () => {
    const source = await Bun.file(new URL("../src/renderer-react/src/features/conversations/useConversations.ts", import.meta.url)).text();
    expect(source).toContain("migrateLegacyConversationCache");
    expect(source).not.toContain("saveLocalConversation");
    expect(source).not.toContain("readLocalConversation");
    expect(source).not.toContain("mergeConversationSummaries");
    expect(source).not.toContain("Falling back to local conversation snapshot");
  });
});
