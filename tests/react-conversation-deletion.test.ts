import { describe, expect, test } from "bun:test";
import {
  deleteConversationAfterRemoteConfirmation,
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
  test("does not touch UI state when the backend rejects deletion", async () => {
    const events: string[] = [];

    await expect(deleteConversationAfterRemoteConfirmation({
      conversation,
      deleteRemote: async () => { events.push("remote"); throw new Error("conflict"); },
      removeFromUi: () => { events.push("ui"); },
      onDeleted: () => { events.push("onDelete"); },
    })).rejects.toThrow("conflict");

    expect(events).toEqual(["remote"]);
  });

  test("confirms backend deletion before removing UI and current conversation state", async () => {
    const events: string[] = [];

    await deleteConversationAfterRemoteConfirmation({
      conversation,
      deleteRemote: async () => { events.push("remote"); },
      removeFromUi: () => { events.push("ui"); },
      onDeleted: () => { events.push("onDelete"); },
    });

    expect(events).toEqual(["remote", "ui", "onDelete"]);
  });

  test("preserves the active thread for background deletes and clears it for current deletes", async () => {
    let currentConversationId: string | null = "conversation-1";
    const remove = async (id: string) => deleteConversationAfterRemoteConfirmation({
      conversation: { ...conversation, id },
      deleteRemote: async () => undefined,
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

});
