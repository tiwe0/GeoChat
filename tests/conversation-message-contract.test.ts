import { describe, expect, test } from "bun:test";
import {
  CONVERSATION_TOOL_STATES,
  decodePersistedConversationMessage,
  decodePersistedConversationParts,
} from "@geochat-ai/app/conversation-message-contract";
import { encodeConversationMessagePayload } from "../backend/src/agent/conversation-message-encoder";

const completeInput = { commands: ["A=(0,0)"], perspective: "2D", reason: "test" };

describe("persisted conversation message contract", () => {
  test("encoder always emits schema version 1", () => {
    expect(encodeConversationMessagePayload({
      message: { id: "message-write-v1", role: "assistant", parts: [{ type: "text", text: "done" }] },
      content: "done",
      createdAt: "2026-10-01T00:00:00.000Z",
    })).toMatchObject({
      schemaVersion: 1,
      id: "message-write-v1",
      role: "assistant",
      content: "done",
    });
  });

  test("accepts the real AI SDK UI part families and preserves extension fields", () => {
    const parts = [
      { type: "text", text: "answer", state: "done", providerMetadata: { openai: { itemId: "text-1" } }, futureField: "kept" },
      { type: "reasoning", id: "reasoning-1", text: "work", state: "done" },
      { type: "file", mediaType: "image/png", filename: "graph.png", url: "data:image/png;base64,AA==", providerReference: { openai: { fileId: "file-1" } } },
      { type: "reasoning-file", mediaType: "application/json", url: "data:application/json;base64,e30=" },
      { type: "source-url", sourceId: "source-1", url: "https://example.com/source", title: "Source" },
      { type: "source-document", sourceId: "document-1", mediaType: "application/pdf", title: "Proof", filename: "proof.pdf" },
      { type: "custom", kind: "provider.thought-signature", providerMetadata: { provider: { value: 1 } } },
      { type: "data-progress", id: "progress-1", data: { completed: 2, total: 3 } },
      { type: "step-start", providerExtension: true },
      { type: "future-sdk-part", opaque: { nested: true } },
    ];

    expect(decodePersistedConversationParts(parts)).toEqual({ ok: true, value: parts });
  });

  test("accepts all seven AI SDK tool states without discarding provider fields", () => {
    const states = [
      { state: "input-streaming", input: { perspective: "2D" } },
      { state: "input-available", input: completeInput },
      { state: "approval-requested", input: completeInput, approval: { id: "approval-1", descriptor: { risk: "canvas-write" } } },
      { state: "approval-responded", input: completeInput, approval: { id: "approval-2", approved: true, reason: "ok" } },
      { state: "output-available", input: completeInput, output: { ok: true }, resultProviderMetadata: { openai: { itemId: "result-1" } } },
      { state: "output-error", input: completeInput, errorText: "failed" },
      { state: "output-denied", input: completeInput, approval: { id: "approval-3", approved: false, reason: "no" } },
    ].map((part, index) => ({
      type: "tool-executeGeoGebraCommands",
      toolCallId: `tool-${index}`,
      callProviderMetadata: { openai: { itemId: `call-${index}` } },
      futureToolField: { kept: true },
      ...part,
    }));

    expect(states.map((part) => part.state)).toEqual(CONVERSATION_TOOL_STATES);
    expect(decodePersistedConversationParts(states)).toEqual({ ok: true, value: states });
  });

  test("restores output-error input after a real JSON roundtrip and preserves raw and extension fields", () => {
    const original = [{
      type: "tool-executeGeoGebraCommands",
      toolCallId: "tool-json-output-error",
      state: "output-error",
      input: undefined,
      rawInput: "{not valid json",
      errorText: "Tool input could not be parsed.",
      providerExtension: { retryable: false },
    }];
    const persisted = JSON.parse(JSON.stringify(original));

    expect(Object.hasOwn(persisted[0], "input")).toBe(false);
    expect(decodePersistedConversationParts(persisted)).toEqual({
      ok: true,
      value: original,
    });
  });

  test("allows supported URL schemes and rejects unsafe or obfuscated persisted URLs", () => {
    const accepted = [
      { type: "source-url", sourceId: "https", url: "https://example.com/source" },
      { type: "source-url", sourceId: "http", url: "http://127.0.0.1:17365/source" },
      { type: "file", mediaType: "image/png", url: "https://example.com/image.png" },
      { type: "file", mediaType: "image/png", url: "data:image/png;base64,AA==" },
      { type: "file", mediaType: "image/png", url: "blob:https://example.com/550e8400-e29b-41d4-a716-446655440000" },
      { type: "reasoning-file", mediaType: "application/json", url: "data:application/json;base64,e30=" },
    ];
    expect(decodePersistedConversationParts(accepted)).toEqual({ ok: true, value: accepted });

    for (const part of [
      { type: "source-url", sourceId: "script", url: "javascript:alert(1)" },
      { type: "source-url", sourceId: "local", url: "file:///tmp/source.html" },
      { type: "source-url", sourceId: "control", url: "https://example.com\njavascript:alert(1)" },
      { type: "source-url", sourceId: "data", url: "data:text/html,source" },
      { type: "file", mediaType: "image/svg+xml", url: "javascript:alert(1)" },
      { type: "file", mediaType: "image/png", url: "file:///tmp/image.png" },
      { type: "reasoning-file", mediaType: "text/plain", url: "https://example.com/\u0000payload" },
      { type: "file", mediaType: "image/png", url: "not-a-url" },
    ]) {
      expect(decodePersistedConversationParts([part])).toEqual({
        ok: false,
        errorCode: "conversation_parts_invalid",
      });
    }
  });

  test("rejects malformed known parts as one invalid message payload", () => {
    expect(decodePersistedConversationParts([{ type: "text", text: 42 }])).toEqual({
      ok: false,
      errorCode: "conversation_parts_invalid",
    });
    expect(decodePersistedConversationParts([{
      type: "tool-executeGeoGebraCommands",
      toolCallId: "tool-bad",
      state: "output-error",
      input: completeInput,
    }])).toEqual({ ok: false, errorCode: "conversation_parts_invalid" });
  });

  test("requires versioned payload identity and exact row consistency", () => {
    const row = {
      id: "message-1",
      clientMessageId: "client-message-1",
      role: "assistant",
      content: "done",
      createdAt: "2026-10-01T00:00:00.000Z",
      payload: {
        schemaVersion: 1,
        id: "message-1",
        role: "assistant",
        content: "done",
        createdAt: "2026-10-01T00:00:00.000Z",
        parts: [{ type: "text", text: "done" }],
      },
    };

    expect(decodePersistedConversationMessage(row).ok).toBe(true);
    const legacy = structuredClone(row);
    delete (legacy.payload as Partial<typeof row.payload>).schemaVersion;
    expect(decodePersistedConversationMessage(legacy)).toEqual({
      ok: false,
      errorCode: "conversation_message_invalid",
    });

    for (const mutate of [
      (value: typeof row) => { value.payload.schemaVersion = 2; },
      (value: typeof row) => { value.payload.id = "other-message"; },
      (value: typeof row) => { value.payload.role = "user"; },
      (value: typeof row) => { value.payload.content = "other content"; },
      (value: typeof row) => { value.payload.createdAt = "not-a-timestamp"; },
      (value: typeof row) => { value.payload.createdAt = "2026-10-01T00:00:01.000Z"; },
    ]) {
      const invalid = structuredClone(row);
      mutate(invalid);
      expect(decodePersistedConversationMessage(invalid)).toEqual({
        ok: false,
        errorCode: "conversation_message_invalid",
      });
    }
  });
});
