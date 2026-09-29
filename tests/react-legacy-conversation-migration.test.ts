import { describe, expect, test } from "bun:test";
import type { LegacyConversationImportRequest } from "@geochat-ai/app/legacy-conversation-import";
import {
  LEGACY_CONVERSATIONS_KEY,
  LEGACY_CONVERSATION_BINARY_OMISSION,
  type LegacyConversationStorage,
} from "../src/renderer-react/src/features/conversations/localStore";
import {
  exportLegacyConversationRecovery,
  migrateLegacyConversationCache,
  readLegacyConversationMigrationJournal,
} from "../src/renderer-react/src/features/conversations/legacyMigration";

function storage(initial: Record<string, string> = {}): LegacyConversationStorage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function conversation(id: string, overrides: Record<string, unknown> = {}) {
  return {
    summary: {
      id,
      model: "deepseek-chat",
      title: "旧标题",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      messageCount: 2,
    },
    messages: [
      { id: `${id}-user`, role: "user", parts: [{ type: "text", text: "画一个圆" }] },
      {
        id: `${id}-assistant`,
        role: "assistant",
        parts: [
          { type: "reasoning", text: "确定圆心和半径" },
          { type: "tool-executeGeoGebraCommands", toolCallId: "tool-1", state: "output-available", input: { commands: ["Circle((0,0),1)"] }, output: { ok: true } },
        ],
        metadata: { tokenUsage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 }, trace: "preserve" },
      },
    ],
    ...overrides,
  };
}

function legacyEnvelope(...records: unknown[]) {
  return JSON.stringify({ version: 1, conversations: records });
}

function importResponder(outcomes: Record<string, "imported" | "skipped" | "conflict">, seen: LegacyConversationImportRequest[]) {
  return async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as LegacyConversationImportRequest;
    seen.push(body);
    const outcome = outcomes[body.conversation.id] ?? "imported";
    return new Response(JSON.stringify({ importResult: {
      outcome,
      conversationId: body.conversation.id,
      sourceFingerprint: body.sourceFingerprint,
      ...(outcome === "conflict" ? { reason: "conversation_content_conflict" } : {}),
    } }), { status: outcome === "imported" ? 201 : outcome === "conflict" ? 409 : 200, headers: { "content-type": "application/json" } });
  };
}

describe("legacy renderer conversation migration", () => {
  test("backs up raw v1 before journaling and imports metadata, reasoning, and tool state losslessly", async () => {
    const raw = legacyEnvelope(conversation("local-only"));
    const local = storage({ [LEGACY_CONVERSATIONS_KEY]: raw });
    const seen: LegacyConversationImportRequest[] = [];

    const result = await migrateLegacyConversationCache({
      apiOrigin: "http://127.0.0.1:17369",
      token: "session",
      storage: local,
      request: importResponder({}, seen),
      now: () => "2026-02-03T04:05:06.000Z",
    });

    expect(result.counts).toEqual({ migrated: 1, skipped: 0, conflicted: 0, quarantined: 0, failed: 0 });
    expect(local.getItem(LEGACY_CONVERSATIONS_KEY)).toBeNull();
    expect(local.getItem(result.backupKey)).toBe(raw);
    expect(seen[0]?.conversation.messages[1]?.metadata).toEqual({ tokenUsage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 }, trace: "preserve" });
    expect(seen[0]?.conversation.messages[1]?.parts[0]).toEqual({ type: "reasoning", text: "确定圆心和半径" });
    expect(seen[0]?.conversation.messages[1]?.parts[1]).toMatchObject({ state: "output-available", output: { ok: true } });
  });

  test("marks compressed binary payloads missing instead of fabricating bytes", async () => {
    const record = conversation("missing-binary");
    (record.messages[1]!.parts[1] as Record<string, unknown>).output = {
      ok: true,
      base64: LEGACY_CONVERSATION_BINARY_OMISSION,
      mediaType: "image/png",
    };
    const local = storage({ [LEGACY_CONVERSATIONS_KEY]: legacyEnvelope(record) });
    const seen: LegacyConversationImportRequest[] = [];

    await migrateLegacyConversationCache({ apiOrigin: "http://localhost", token: null, storage: local, request: importResponder({}, seen) });

    expect(seen[0]?.conversation.messages[1]?.parts[1]).toMatchObject({
      output: { base64: LEGACY_CONVERSATION_BINARY_OMISSION, mediaType: "image/png", attachmentPayloadMissing: true },
    });
  });

  test("quarantines conflicts, keeps main and backup, and exposes complete recovery JSON", async () => {
    const raw = legacyEnvelope(conversation("conflict"), { malformed: true });
    const local = storage({ [LEGACY_CONVERSATIONS_KEY]: raw });
    const seen: LegacyConversationImportRequest[] = [];

    const result = await migrateLegacyConversationCache({
      apiOrigin: "http://localhost",
      token: null,
      storage: local,
      request: importResponder({ conflict: "conflict" }, seen),
    });

    expect(result.counts).toEqual({ migrated: 0, skipped: 0, conflicted: 1, quarantined: 2, failed: 0 });
    expect(result.requiresUserAction).toBe(true);
    expect(local.getItem(LEGACY_CONVERSATIONS_KEY)).toBe(raw);
    expect(local.getItem(result.backupKey)).toBe(raw);
    const recovery = JSON.parse(exportLegacyConversationRecovery(local));
    expect(recovery.backup.raw).toBe(raw);
    expect(recovery.quarantine).toHaveLength(2);
    expect(recovery.quarantine[0].rawItem).toBeTruthy();
  });

  test("resumes failed items without duplicating imported or skipped items", async () => {
    const raw = legacyEnvelope(conversation("first"), conversation("second"), conversation("third"));
    const local = storage({ [LEGACY_CONVERSATIONS_KEY]: raw });
    const firstRun: string[] = [];
    const firstRequest = async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as LegacyConversationImportRequest;
      firstRun.push(body.conversation.id);
      if (body.conversation.id === "second") throw new Error("backend unavailable");
      const outcome = body.conversation.id === "third" ? "skipped" : "imported";
      return new Response(JSON.stringify({ importResult: { outcome, conversationId: body.conversation.id, sourceFingerprint: body.sourceFingerprint } }), {
        status: outcome === "imported" ? 201 : 200,
        headers: { "content-type": "application/json" },
      });
    };
    const first = await migrateLegacyConversationCache({ apiOrigin: "http://localhost", token: null, storage: local, request: firstRequest });
    expect(first.counts).toEqual({ migrated: 1, skipped: 1, conflicted: 0, quarantined: 0, failed: 1 });
    expect(local.getItem(LEGACY_CONVERSATIONS_KEY)).toBe(raw);

    const retried: LegacyConversationImportRequest[] = [];
    const second = await migrateLegacyConversationCache({ apiOrigin: "http://localhost", token: null, storage: local, request: importResponder({}, retried) });
    expect(retried.map((item) => item.conversation.id)).toEqual(["second"]);
    expect(second.counts).toEqual({ migrated: 2, skipped: 1, conflicted: 0, quarantined: 0, failed: 0 });
    expect(local.getItem(LEGACY_CONVERSATIONS_KEY)).toBeNull();

    const thirdSeen: LegacyConversationImportRequest[] = [];
    await migrateLegacyConversationCache({ apiOrigin: "http://localhost", token: null, storage: local, request: importResponder({}, thirdSeen) });
    expect(thirdSeen).toEqual([]);
    expect(readLegacyConversationMigrationJournal(local)?.items.map((item) => item.itemId)).toEqual(second.items.map((item) => item.itemId));
  });

  test("reports all five migration counters from a mixed recovery fixture", async () => {
    const raw = legacyEnvelope(
      conversation("migrated"),
      conversation("skipped"),
      conversation("conflicted"),
      { malformed: true },
      conversation("failed"),
    );
    const local = storage({ [LEGACY_CONVERSATIONS_KEY]: raw });
    const request = async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as LegacyConversationImportRequest;
      if (body.conversation.id === "failed") throw new Error("temporary outage");
      const outcome = body.conversation.id === "skipped" ? "skipped" : body.conversation.id === "conflicted" ? "conflict" : "imported";
      return new Response(JSON.stringify({ importResult: {
        outcome,
        conversationId: body.conversation.id,
        sourceFingerprint: body.sourceFingerprint,
        ...(outcome === "conflict" ? { reason: "conversation_content_conflict" } : {}),
      } }), { status: outcome === "imported" ? 201 : outcome === "conflict" ? 409 : 200, headers: { "content-type": "application/json" } });
    };

    const result = await migrateLegacyConversationCache({ apiOrigin: "http://localhost", token: null, storage: local, request });

    expect(result.counts).toEqual({ migrated: 1, skipped: 1, conflicted: 1, quarantined: 2, failed: 1 });
    expect(result.items.map((item) => item.itemId).every((id) => /^legacy-v1:[a-f0-9]{64}$/.test(id))).toBe(true);
  });
});
