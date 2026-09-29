import { describe, expect, test } from "bun:test";
import {
  decodeDesktopConversationDetailResponse,
  decodeUpsertDesktopConversationMessageInput
} from "@geochat-ai/app/desktop-contracts";
import {
  decodeLegacyConversationImportRequest,
  decodeLegacyConversationImportResponse
} from "@geochat-ai/app/legacy-conversation-import";
import {
  decodeModelDiscoveryRequest,
  decodeModelDiscoveryResponse
} from "@geochat-ai/app/model-discovery";
import {
  decodeMigrationExportResponse,
  decodeMigrationImportRequest
} from "@geochat-ai/app/migration";

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

  test("decodes legacy import receipts and migration packages", () => {
    const fingerprint = "a".repeat(64);
    const legacyRequest = {
      schemaVersion: 1,
      sourceFingerprint: fingerprint,
      conversation: {
        id: "legacy-1",
        model: "gpt-5.5",
        title: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: [{ id: "message-1", role: "user", parts: [{ type: "text", text: "hello" }] }]
      }
    };
    expect(decodeLegacyConversationImportRequest(legacyRequest).ok).toBe(true);
    expect(decodeLegacyConversationImportResponse({
      importResult: { outcome: "imported", conversationId: "legacy-1", sourceFingerprint: fingerprint }
    }).ok).toBe(true);

    const migrationPackage = {
      schemaVersion: 1,
      product: "geochat",
      exportedAt: timestamp,
      source: { databaseDriver: "sqlite", migrationsSchema: "sqlite" },
      scope: { ownerUserId: null, mode: "anonymous_offline" },
      totals: { conversations: 0, messages: 0, blackboardEntries: 0, problemAttempts: 0 },
      conversations: []
    };
    expect(decodeMigrationImportRequest({ migrationPackage })).toEqual({
      ok: true,
      value: { migrationPackage }
    });
    expect(decodeMigrationExportResponse({ migrationPackage }).ok).toBe(true);
    expect(decodeMigrationImportRequest({ migrationPackage: { ...migrationPackage, schemaVersion: 2 } })).toEqual({
      ok: false,
      errorCode: "migration_package_invalid"
    });
  });
});
