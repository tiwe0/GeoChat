import { describe, expect, test } from "bun:test";
import type {
  AppendMessage,
  ThreadMessageLike,
} from "@assistant-ui/react";
import type { UIMessage } from "ai";
import {
  createGeoChatExternalStoreAdapter,
  resolveGeoChatConversationId,
  toGeoChatAssistantSubmission,
} from "../src/renderer-react/src/features/assistant-ui/runtimeAdapter";

const userMessage = (overrides: Partial<AppendMessage> = {}): AppendMessage => ({
  role: "user",
  content: [{ type: "text", text: "  画一个圆  " }],
  attachments: [],
  createdAt: new Date(0),
  metadata: { custom: {} },
  parentId: null,
  sourceId: null,
  runConfig: undefined,
  ...overrides,
});

describe("assistant-ui external runtime bridge", () => {
  test("keeps a new conversation on the runtime thread id used before submission", () => {
    const runtimeThreadId = "conv_client_generated";

    expect(resolveGeoChatConversationId(runtimeThreadId, null)).toBe(runtimeThreadId);
    expect(resolveGeoChatConversationId(runtimeThreadId, runtimeThreadId)).toBe(runtimeThreadId);
    expect(resolveGeoChatConversationId(runtimeThreadId, null, "conv_requested")).toBe("conv_requested");
  });

  test("bridges composer text and image attachments into the existing agent-run shape", () => {
    const submission = toGeoChatAssistantSubmission(userMessage({
      content: [
        { type: "text", text: "  分析图片  " },
        {
          type: "image",
          image: "data:image/png;base64,AAAA",
          filename: "diagram.png",
        },
      ],
    }));

    expect(submission).toEqual({
      text: "分析图片",
      files: [{
        type: "file",
        mediaType: "image/png",
        filename: "diagram.png",
        url: "data:image/png;base64,AAAA",
      }],
    });
  });

  test("normalizes attachment base64 and de-duplicates content mirrored by assistant-ui", () => {
    const image = {
      type: "file" as const,
      data: "BBBB",
      mimeType: "image/jpeg",
    };
    const submission = toGeoChatAssistantSubmission(userMessage({
      content: [image],
      attachments: [{
        id: "attachment-1",
        type: "image",
        name: "photo.jpg",
        contentType: "image/jpeg",
        status: { type: "complete" },
        content: [image],
      }],
    }));

    expect(submission.files).toEqual([{
      type: "file",
      mediaType: "image/jpeg",
      filename: "photo.jpg",
      url: "data:image/jpeg;base64,BBBB",
    }]);
  });

  test("delegates one new message and cancellation without enabling assistant-ui tools", async () => {
    const calls: unknown[] = [];
    let cancelled = 0;
    const messages: UIMessage[] = [{
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    }];
    const adapter = createGeoChatExternalStoreAdapter({
      threadId: "conversation-1",
      messages,
      isRunning: true,
      isSendDisabled: false,
      convertMessage: (message): ThreadMessageLike => ({
        id: message.id,
        role: message.role,
        content: message.parts
          .filter((part) => part.type === "text")
          .map((part) => ({ type: "text" as const, text: part.text })),
      }),
      onNew: (submission) => {
        calls.push(submission);
      },
      onCancel: () => {
        cancelled += 1;
      },
    });

    await adapter.onNew(userMessage());
    await adapter.onCancel?.();

    expect(adapter.messages).toBe(messages);
    expect(adapter.isRunning).toBe(true);
    expect(adapter.isSendDisabled).toBe(false);
    expect(adapter.adapters?.attachments?.accept).toBe("image/*");
    expect(adapter.adapters?.threadList?.threadId).toBe("conversation-1");
    expect(adapter.unstable_enableToolInvocations).toBe(false);
    expect(calls).toEqual([{ text: "画一个圆" }]);
    expect(cancelled).toBe(1);
  });

  test("waits for cancellation to finish before resolving the runtime callback", async () => {
    let releaseCancellation!: () => void;
    let completed = false;
    const adapter = createGeoChatExternalStoreAdapter({
      messages: [],
      isRunning: true,
      convertMessage: () => ({ role: "user", content: [] }),
      onNew: () => undefined,
      onCancel: async () => {
        await new Promise<void>((resolve) => {
          releaseCancellation = resolve;
        });
        completed = true;
      },
    });

    const cancellation = adapter.onCancel?.();
    await Promise.resolve();
    expect(completed).toBe(false);

    releaseCancellation();
    await cancellation;
    expect(completed).toBe(true);
  });

  test("propagates cancellation failures to assistant-ui", async () => {
    const adapter = createGeoChatExternalStoreAdapter({
      messages: [],
      isRunning: true,
      convertMessage: () => ({ role: "user", content: [] }),
      onNew: () => undefined,
      onCancel: async () => {
        throw new Error("cancel failed");
      },
    });

    await expect(adapter.onCancel?.()).rejects.toThrow("cancel failed");
  });

  test("rejects non-user appends before they reach the business callback", () => {
    expect(() => toGeoChatAssistantSubmission({
      ...userMessage(),
      role: "assistant",
      content: [{ type: "text", text: "not a user submission" }],
      status: { type: "complete", reason: "stop" },
    } as AppendMessage)).toThrow("GeoChat only accepts user submissions");
  });
});
