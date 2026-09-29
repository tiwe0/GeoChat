import { describe, expect, test } from "bun:test";
import {
  deleteConversationAfterRemoteConfirmation,
  filterHiddenConversations,
  retryPendingLocalConversationDeletes,
} from "../src/renderer-react/src/features/conversations/deletion";

const conversation = {
  id: "conversation-1",
  model: "deepseek-chat",
  title: "test",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  messageCount: 1,
};

describe("conversation deletion coordination", () => {
  test("does not touch local or UI state when the backend rejects deletion", async () => {
    const events: string[] = [];
    const hidden = new Set<string>();

    await expect(deleteConversationAfterRemoteConfirmation({
      conversation,
      deleteRemote: async () => { events.push("remote"); throw new Error("conflict"); },
      deleteLocal: () => { events.push("local"); },
      hiddenConversationIds: hidden,
      removeFromUi: () => { events.push("ui"); },
      onDeleted: () => { events.push("onDelete"); },
    })).rejects.toThrow("conflict");

    expect(events).toEqual(["remote"]);
    expect(hidden.size).toBe(0);
  });

  test("confirms backend deletion before removing local, UI, and current conversation state", async () => {
    const events: string[] = [];

    const result = await deleteConversationAfterRemoteConfirmation({
      conversation,
      deleteRemote: async () => { events.push("remote"); },
      deleteLocal: () => { events.push("local"); },
      hiddenConversationIds: new Set(),
      removeFromUi: () => { events.push("ui"); },
      onDeleted: () => { events.push("onDelete"); },
    });

    expect(events).toEqual(["remote", "ui", "local", "onDelete"]);
    expect(result.localCleanupError).toBeNull();
  });

  test("preserves the active thread for background deletes and clears it for current deletes", async () => {
    let currentConversationId: string | null = "conversation-1";
    const remove = async (id: string) => deleteConversationAfterRemoteConfirmation({
      conversation: { ...conversation, id },
      deleteRemote: async () => undefined,
      deleteLocal: () => undefined,
      hiddenConversationIds: new Set(),
      removeFromUi: () => undefined,
      onDeleted: () => {
        if (currentConversationId === id) currentConversationId = null;
      },
    });

    await remove("conversation-background");
    expect(currentConversationId).toBe("conversation-1");
    await remove("conversation-1");
    expect(currentConversationId).toBeNull();
  });

  test("keeps a remotely deleted conversation hidden when local cleanup fails, then retries", async () => {
    const hidden = new Set<string>();
    let attempts = 0;
    const result = await deleteConversationAfterRemoteConfirmation({
      conversation,
      deleteRemote: async () => undefined,
      deleteLocal: () => { attempts += 1; throw new Error("quota"); },
      hiddenConversationIds: hidden,
      removeFromUi: () => undefined,
      onDeleted: () => undefined,
    });

    expect(result.localCleanupError?.message).toBe("quota");
    expect(hidden.has(conversation.id)).toBe(true);
    expect(filterHiddenConversations([conversation], hidden)).toEqual([]);

    const errors = retryPendingLocalConversationDeletes(hidden, () => { attempts += 1; });
    expect(errors).toEqual([]);
    expect(attempts).toBe(2);
    expect(hidden.size).toBe(0);
  });
});
