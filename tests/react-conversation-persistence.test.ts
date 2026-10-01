import { afterEach, describe, expect, test } from "bun:test";
import {
  fetchConversationMessages,
  parseConversationMessages
} from "../src/renderer-react/src/features/conversations/api";
import { restoreConversationMessages } from "../src/renderer-react/src/features/conversations/messageAdapter";

const originalLocalStorage = globalThis.localStorage;

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
});

describe("conversation transcript persistence", () => {
  test("restores native reasoning and tool parts from payload.parts", () => {
    const createdAt = "2026-10-01T00:00:00.000Z";
    const stored = parseConversationMessages([{
      id: "message-1",
      clientMessageId: "assistant-1",
      role: "assistant",
      content: "完成。",
      createdAt,
      payload: {
        schemaVersion: 1,
        id: "message-1",
        role: "assistant",
        content: "完成。",
        createdAt,
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

  test("parses canonical backend payload timestamps without renderer state", () => {
    const createdAt = "2026-10-01T00:00:00.000Z";
    const stored = parseConversationMessages([{
      id: "message-backend",
      clientMessageId: "assistant-backend",
      role: "assistant",
      content: "backend",
      createdAt,
      payload: {
        schemaVersion: 1,
        id: "message-backend",
        role: "assistant",
        content: "backend",
        createdAt,
        parts: [{ type: "text", text: "backend" }],
      },
    }]);
    expect(stored[0]?.schemaVersion).toBe(1);
    expect(restoreConversationMessages(stored)[0]?.parts).toEqual([{ type: "text", text: "backend" }]);
  });

  test("rejects malformed restore responses with a stable contract error code", async () => {
    const request = (async () => Response.json({ conversation: { messages: [] } })) as typeof fetch;
    try {
      await fetchConversationMessages("http://127.0.0.1:17382", null, "conversation-1", request);
      throw new Error("expected restore contract rejection");
    } catch (error) {
      expect(error).toMatchObject({ errorCode: "conversation_restore_invalid" });
    }
  });

  test("isolates a corrupt message while restoring valid neighbors", async () => {
    const timestamp = "2026-10-01T00:00:00.000Z";
    const message = (id: string, text: unknown) => ({
      id,
      conversationId: "conversation-isolation",
      clientMessageId: id,
      role: "assistant",
      content: typeof text === "string" ? text : "corrupt",
      createdAt: timestamp,
      payload: {
        schemaVersion: 1,
        id,
        role: "assistant",
        content: typeof text === "string" ? text : "corrupt",
        createdAt: timestamp,
        parts: [{ type: "text", text }],
      },
    });
    const request = (async () => Response.json({
      conversation: {
        id: "conversation-isolation",
        model: null,
        title: "Isolation",
        summary: "valid after corrupt",
        messageCount: 3,
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: [message("valid-before", "before"), message("corrupt", 42), message("valid-after", "after")],
      },
    })) as typeof fetch;

    const restored = await fetchConversationMessages(
      "http://127.0.0.1:17382",
      null,
      "conversation-isolation",
      request,
    );
    expect(restoreConversationMessages(restored.messages).map((item) => item.id)).toEqual([
      "valid-before",
      "valid-after",
    ]);
  });

  test("uses SQLite-backed backend history as the sole runtime authority", async () => {
    const source = await Bun.file(new URL("../src/renderer-react/src/features/conversations/useConversations.ts", import.meta.url)).text();
    expect(source).not.toContain("migrateLegacyConversationCache");
    expect(source).not.toContain("legacyMigration");
    expect(source).not.toContain("saveLocalConversation");
    expect(source).not.toContain("readLocalConversation");
    expect(source).not.toContain("mergeConversationSummaries");
    expect(source).not.toContain("Falling back to local conversation snapshot");
  });
});
