import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  conversationMessages,
  conversations,
  legacyConversationImportReceipts,
} from "../backend/src/db/schema";
import { createDatabaseForPath, createHttpHarness } from "./agent-harness-http-utils";

function legacyImportBody(overrides: Record<string, unknown> = {}) {
  const conversationId = `legacy-${crypto.randomUUID()}`;
  return {
    schemaVersion: 1,
    sourceFingerprint: crypto.randomUUID().replaceAll("-", "").repeat(2),
    conversation: {
      id: conversationId,
      model: "deepseek-chat",
      title: "旧会话标题",
      createdAt: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-01-02T03:04:06.000Z",
      messages: [
        {
          id: `${conversationId}-user`,
          role: "user",
          parts: [
            { type: "text", text: "请画出三角形。" },
            { type: "file", mediaType: "image/png", filename: "problem.png", url: "data:image/png;base64,AA==" },
          ],
        },
        {
          id: `${conversationId}-assistant`,
          role: "assistant",
          parts: [
            { type: "reasoning", text: "先确定三个顶点。" },
            {
              type: "tool-executeGeoGebraCommands",
              toolCallId: "tool-legacy-1",
              state: "output-available",
              input: { commands: ["A=(0,0)", "B=(1,0)", "C=(0,1)"] },
              output: { ok: true },
            },
            { type: "text", text: "三角形已完成。" },
          ],
          metadata: { tokenUsage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 } },
        },
      ],
    },
    ...overrides,
  };
}

async function importLegacy(request: Awaited<ReturnType<typeof createHttpHarness>>["request"], body: unknown) {
  return request("/v1/legacy-conversations/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("legacy conversation import", () => {
  test("imports a complete UIMessage transcript losslessly and records a durable receipt", async () => {
    const { databasePath, request } = await createHttpHarness();
    const body = legacyImportBody();
    const created = await importLegacy(request, body);

    expect(created.status).toBe(201);
    expect(created.json.importResult).toMatchObject({
      outcome: "imported",
      conversationId: body.conversation.id,
      sourceFingerprint: body.sourceFingerprint,
    });

    const detail = await request(`/v1/conversations/${encodeURIComponent(body.conversation.id)}`);
    expect(detail.status).toBe(200);
    expect(detail.json.conversation).toMatchObject({
      id: body.conversation.id,
      title: body.conversation.title,
      createdAt: body.conversation.createdAt,
      updatedAt: body.conversation.updatedAt,
      messageCount: 2,
    });
    expect(detail.json.conversation.messages[0].payload.parts).toEqual(body.conversation.messages[0].parts);
    expect(detail.json.conversation.messages[1].payload.parts).toEqual(body.conversation.messages[1].parts);
    expect(detail.json.conversation.messages[1].payload.metadata).toEqual(body.conversation.messages[1].metadata);
    expect(detail.json.conversation.messages[1].payload.usage).toEqual(body.conversation.messages[1].metadata.tokenUsage);

    const db = createDatabaseForPath(databasePath);
    expect(db.select().from(conversations).where(eq(conversations.id, body.conversation.id)).get()).toMatchObject({
      model: body.conversation.model,
      sourceTitle: body.conversation.title,
    });
    expect(db.select().from(legacyConversationImportReceipts).all()).toHaveLength(1);
  });

  test("uses canonical content equality to skip an existing conversation without overwriting it", async () => {
    const { request } = await createHttpHarness();
    const body = legacyImportBody();
    expect((await importLegacy(request, body)).status).toBe(201);

    const equivalentSource = { ...body, sourceFingerprint: "a".repeat(64) };
    const equivalent = await importLegacy(request, equivalentSource);
    expect(equivalent.status).toBe(200);
    expect(equivalent.json.importResult.outcome).toBe("skipped");

    const conflictSource = {
      ...body,
      sourceFingerprint: "b".repeat(64),
      conversation: { ...body.conversation, title: "冲突标题" },
    };
    const conflict = await importLegacy(request, conflictSource);
    expect(conflict.status).toBe(409);
    expect(conflict.json.importResult).toMatchObject({
      outcome: "conflict",
      reason: "conversation_content_conflict",
    });

    const detail = await request(`/v1/conversations/${encodeURIComponent(body.conversation.id)}`);
    expect(detail.json.conversation.title).toBe("旧会话标题");
  });

  test("preserves source message order when timestamps are equal and recognizes an equivalent second source", async () => {
    const { request } = await createHttpHarness();
    const body = legacyImportBody();
    const sameTimestamp = "2026-01-02T03:04:05.500Z";
    body.conversation.messages = [
      {
        id: `${body.conversation.id}-z-first`,
        role: "user",
        createdAt: sameTimestamp,
        parts: [{ type: "text", text: "第一条" }],
      },
      {
        id: `${body.conversation.id}-a-second`,
        role: "assistant",
        createdAt: sameTimestamp,
        parts: [{ type: "text", text: "第二条" }],
      },
    ];

    expect((await importLegacy(request, body)).status).toBe(201);
    const detail = await request(`/v1/conversations/${encodeURIComponent(body.conversation.id)}`);
    expect(detail.json.conversation.messages.map((message: { id: string }) => message.id)).toEqual([
      `${body.conversation.id}-z-first`,
      `${body.conversation.id}-a-second`,
    ]);
    expect(Date.parse(detail.json.conversation.messages[1].createdAt)).toBe(
      Date.parse(detail.json.conversation.messages[0].createdAt) + 1,
    );

    const equivalent = await importLegacy(request, { ...body, sourceFingerprint: "c".repeat(64) });
    expect(equivalent.status).toBe(200);
    expect(equivalent.json.importResult.outcome).toBe("skipped");
  });

  test("preflights message IDs and never partially writes a conflicting conversation", async () => {
    const { databasePath, request } = await createHttpHarness();
    const first = legacyImportBody();
    expect((await importLegacy(request, first)).status).toBe(201);

    const second = legacyImportBody();
    second.conversation.messages[0]!.id = first.conversation.messages[0]!.id;
    const response = await importLegacy(request, second);
    expect(response.status).toBe(409);
    expect(response.json.importResult).toMatchObject({ outcome: "conflict", reason: "message_id_conflict" });

    const db = createDatabaseForPath(databasePath);
    expect(db.select().from(conversations).where(eq(conversations.id, second.conversation.id)).get()).toBeUndefined();
    expect(db.select().from(conversationMessages).where(eq(conversationMessages.conversationId, second.conversation.id)).all()).toEqual([]);
  });

  test("keeps the source receipt after deletion so an old backup cannot resurrect the conversation", async () => {
    const { databasePath, request } = await createHttpHarness();
    const body = legacyImportBody();
    expect((await importLegacy(request, body)).status).toBe(201);

    const db = createDatabaseForPath(databasePath);
    db.delete(conversationMessages).where(eq(conversationMessages.conversationId, body.conversation.id)).run();
    db.delete(conversations).where(eq(conversations.id, body.conversation.id)).run();

    const replay = await importLegacy(request, body);
    expect(replay.status).toBe(200);
    expect(replay.json.importResult.outcome).toBe("skipped");
    expect(db.select().from(conversations).where(eq(conversations.id, body.conversation.id)).get()).toBeUndefined();
  });

  test("is idempotent under concurrent duplicate requests", async () => {
    const { request } = await createHttpHarness();
    const body = legacyImportBody();
    const responses = await Promise.all(Array.from({ length: 4 }, () => importLegacy(request, body)));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 200, 201]);
    expect(responses.map((response) => response.json.importResult.outcome).sort()).toEqual([
      "imported", "skipped", "skipped", "skipped",
    ]);
  });

  test("rejects malformed imports before touching persistence", async () => {
    const { request } = await createHttpHarness();
    const response = await importLegacy(request, {
      ...legacyImportBody(),
      sourceFingerprint: "not-a-sha256",
    });
    expect(response.status).toBe(400);
    expect(response.json).toMatchObject({ error: "invalid_legacy_conversation_import" });
  });
});
