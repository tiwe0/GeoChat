import { describe, expect, test } from "bun:test";
import {
  decodeDesktopConversationDetailResponse,
  decodeUpsertDesktopConversationMessageInput
} from "@geochat-ai/app/desktop-contracts";
import {
  decodeGeoGebraDocumentResponse,
  decodeUpsertGeoGebraDocumentInput
} from "@geochat-ai/app/geogebra-documents";
import {
  decodeModelDiscoveryRequest,
  decodeModelDiscoveryResponse
} from "@geochat-ai/app/model-discovery";

const timestamp = "2026-09-29T00:00:00.000Z";

describe("shared runtime contracts", () => {
  test("decodes conversation upsert and restore boundaries without returning rejected payloads", () => {
    const rejected = decodeUpsertDesktopConversationMessageInput({
      conversationId: "conversation-1",
      secret: "do-not-reflect",
      message: { id: "", role: "user" }
    });
    expect(rejected).toEqual({ ok: false, errorCode: "conversation_message_upsert_invalid" });
    expect(JSON.stringify(rejected)).not.toContain("do-not-reflect");

    const restored = decodeDesktopConversationDetailResponse({
      conversation: {
        id: "conversation-1",
        model: "gpt-5.5",
        title: "A title",
        summary: "A summary",
        messageCount: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: [{
          id: "message-1",
          conversationId: "conversation-1",
          role: "user",
          content: "hello",
          createdAt: timestamp,
          payload: { id: "message-1", role: "user", content: "hello", createdAt: "08:00:00" }
        }]
      }
    });
    expect(restored.ok).toBe(true);
  });

  test("decodes provider discovery request and response envelopes", () => {
    expect(decodeModelDiscoveryRequest({ credentialRef: "credential-1" })).toEqual({
      ok: true,
      value: { credentialRef: "credential-1" }
    });
    expect(decodeModelDiscoveryRequest({ credentialRef: "credential-1", secret: "do-not-reflect" })).toEqual({
      ok: false,
      errorCode: "model_discovery_request_invalid"
    });
    expect(decodeModelDiscoveryResponse({ ids: ["gpt-5.5"] })).toEqual({
      ok: true,
      value: { ids: ["gpt-5.5"] }
    });
    expect(decodeModelDiscoveryResponse({ ids: [] })).toEqual({
      ok: false,
      errorCode: "model_discovery_response_invalid"
    });
  });

  test("decodes GeoGebra documents", () => {
    const documentInput = {
      id: "worksheet-1",
      title: "Worksheet",
      mimeType: "application/xml",
      contentKind: "text" as const,
      content: "<xml/>"
    };
    expect(decodeUpsertGeoGebraDocumentInput(documentInput).ok).toBe(true);
    expect(decodeGeoGebraDocumentResponse({ document: {
      ...documentInput,
      sizeBytes: 6,
      createdAt: timestamp,
      updatedAt: timestamp
    } }).ok).toBe(true);

  });
});
