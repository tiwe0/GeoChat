import { describe, expect, test } from "bun:test";
import {
  agentRunStartPayload,
  createAgentRunLedger
} from "@geochat-ai/app";
import { conversationBlackboardEntries } from "../backend/src/db/schema";
import { createDatabaseForPath, createHttpHarness } from "./agent-harness-http-utils";

describe("conversation history", () => {
  test("creates isolated backend HTTP handlers from explicit contexts", async () => {
    const conversationId = `isolated-context-${crypto.randomUUID()}`;
    const harnessA = await createHttpHarness();
    const harnessB = await createHttpHarness();

    const created = await harnessA.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId,
        message: {
          id: `${conversationId}-user`,
          role: "user",
          content: "context A only",
          createdAt: "2026-06-06T04:00:00.000Z",
          payload: {
            id: `${conversationId}-user`,
            role: "user",
            content: "context A only",
            createdAt: "12:00:00"
          }
        }
      })
    });

    expect(created.status).toBe(201);
    expect((await harnessA.request(`/v1/conversations/${encodeURIComponent(conversationId)}`)).status).toBe(200);
    expect((await harnessB.request(`/v1/conversations/${encodeURIComponent(conversationId)}`)).status).toBe(404);
  });

  test("serves legacy top-level message routes through the desktop backend", async () => {
    const { request } = await createHttpHarness();
    const content = `legacy top-level message ${crypto.randomUUID()}`;

    const created = await request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content })
    });

    expect(created).toMatchObject({
      status: 201,
      json: {
        message: {
          role: "user",
          content
        }
      }
    });
    expect(typeof created.json.message.id).toBe("string");
    expect(created.json.message.createdAt).toContain("T");

    const listed = await request("/v1/messages");
    expect(listed.status).toBe(200);
    expect(listed.json.messages).toContainEqual(created.json.message);
  });

  test("persists, restores, and deletes complete desktop conversations", async () => {
    const { databasePath, request } = await createHttpHarness();
    const conversationId = `history-${crypto.randomUUID()}`;
    const createdAt = "2026-06-06T04:00:00.000Z";

    const userMessage = {
      id: `${conversationId}-user`,
      role: "user" as const,
      content: "画一个椭圆，并标出焦点。",
      createdAt,
      payload: {
        id: `${conversationId}-user`,
        role: "user",
        content: "画一个椭圆，并标出焦点。",
        createdAt: "12:00:00",
        attachments: [{ id: "image-1", name: "problem.png", mediaType: "image/png", size: 12, dataUrl: "data:image/png;base64,AA==" }]
      }
    };
    const assistantDraftMessage = {
      id: `${conversationId}-assistant`,
      role: "assistant" as const,
      content: "正在规划构造...",
      createdAt: "2026-06-06T04:00:01.000Z",
      payload: {
        id: `${conversationId}-assistant`,
        role: "assistant",
        content: "正在规划构造...",
        createdAt: "12:00:01",
        toolCalls: []
      }
    };
    const assistantMessage = {
      id: `${conversationId}-assistant`,
      role: "assistant" as const,
      content: "椭圆已经绘制完成。",
      createdAt: "2026-06-06T04:00:01.000Z",
      payload: {
        id: `${conversationId}-assistant`,
        role: "assistant",
        content: "椭圆已经绘制完成。",
        createdAt: "12:00:01",
        cards: [{ title: "构造画布", status: "done" }],
        toolCalls: [{ callId: "tool-1", toolName: "executeGeoGebraCommands", status: "done" }],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
      }
    };

    expect(
      await request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message: userMessage })
      })
    ).toMatchObject({ status: 201 });
    expect(
      await request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message: assistantDraftMessage })
      })
    ).toMatchObject({ status: 201 });
    expect(
      await request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message: assistantMessage })
      })
    ).toMatchObject({ status: 201 });
    createDatabaseForPath(databasePath).insert(conversationBlackboardEntries).values({
      id: `${conversationId}-blackboard-original-problem`,
      conversationId,
      key: "original-problem",
      category: "original_problem",
      value: "画一个椭圆，并标出焦点。",
      status: "active",
      confidence: 950,
      reason: "Persisted for conversation restore.",
      sourceMessageId: `${conversationId}-user`,
      sourceToolCallId: null,
      sourceRunId: null,
      createdAt: new Date("2026-06-06T04:00:02.000Z"),
      updatedAt: new Date("2026-06-06T04:00:02.000Z"),
      archivedAt: null
    }).run();

    const list = await request("/v1/conversations");
    expect(list.status).toBe(200);
    expect(list.json.conversations.some((conversation: { id: string }) => conversation.id === conversationId)).toBe(true);

    const detail = await request(`/v1/conversations/${encodeURIComponent(conversationId)}`);
    expect(detail.status).toBe(200);
    expect(detail.json.conversation).toMatchObject({
      id: conversationId,
      title: "画一个椭圆，并标出焦点。",
      summary: "椭圆已经绘制完成。",
      messageCount: 2
    });
    expect(detail.json.conversation.messages).toHaveLength(2);
    expect(detail.json.conversation.messages[0].payload.attachments).toHaveLength(1);
    expect(detail.json.conversation.messages[1].content).toBe("椭圆已经绘制完成。");
    expect(detail.json.conversation.messages[1].payload.cards).toHaveLength(1);
    expect(detail.json.conversation.messages[1].payload.toolCalls[0].status).toBe("done");
    expect(detail.json.conversation.messages[1].payload.usage.totalTokens).toBe(15);
    expect(detail.json.conversation.blackboardEntries).toContainEqual(
      expect.objectContaining({
        conversationId,
        key: "original-problem",
        category: "original_problem",
        value: "画一个椭圆，并标出焦点。",
        status: "active"
      })
    );

    const followUpUserMessage = {
      id: `${conversationId}-follow-up-user`,
      role: "user" as const,
      content: "继续添加一个动点。",
      createdAt: "2026-06-06T04:00:03.000Z",
      payload: {
        id: `${conversationId}-follow-up-user`,
        role: "user",
        content: "继续添加一个动点。",
        createdAt: "12:00:03"
      }
    };
    const followUpAssistantMessage = {
      id: `${conversationId}-follow-up-assistant`,
      role: "assistant" as const,
      content: "动点已经加入椭圆轨迹。",
      createdAt: "2026-06-06T04:00:04.000Z",
      payload: {
        id: `${conversationId}-follow-up-assistant`,
        role: "assistant",
        content: "动点已经加入椭圆轨迹。",
        createdAt: "12:00:04",
        toolCalls: [{ callId: "tool-2", toolName: "executeGeoGebraCommands", status: "done" }]
      }
    };
    expect(
      await request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message: followUpUserMessage })
      })
    ).toMatchObject({ status: 201 });
    expect(
      await request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message: followUpAssistantMessage })
      })
    ).toMatchObject({ status: 201 });

    const appendedDetail = await request(`/v1/conversations/${encodeURIComponent(conversationId)}`);
    expect(appendedDetail.json.conversation).toMatchObject({
      id: conversationId,
      title: "画一个椭圆，并标出焦点。",
      summary: "动点已经加入椭圆轨迹。",
      messageCount: 4
    });
    expect(appendedDetail.json.conversation.messages.map((message: { id: string }) => message.id)).toEqual([
      `${conversationId}-user`,
      `${conversationId}-assistant`,
      `${conversationId}-follow-up-user`,
      `${conversationId}-follow-up-assistant`
    ]);

    const deleted = await request(`/v1/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
    expect((await request(`/v1/conversations/${encodeURIComponent(conversationId)}`)).status).toBe(404);
  });

  test("rejects conversation messages with unrecoverable payload snapshots", async () => {
    const { request } = await createHttpHarness();
    const conversationId = `history-unrecoverable-${crypto.randomUUID()}`;

    const response = await request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId,
        message: {
          id: `${conversationId}-user`,
          role: "user",
          content: "画一个圆",
          createdAt: "2026-06-06T04:05:00.000Z",
          payload: { id: `${conversationId}-user`, role: "system", content: "画一个圆", createdAt: "12:05:00" }
        }
      })
    });

    expect(response).toMatchObject({
      status: 400,
      json: {
        error: "invalid_request"
      }
    });
    expect((await request(`/v1/conversations/${encodeURIComponent(conversationId)}`)).status).toBe(404);
  });

  test("exports and imports desktop migration packages through the backend API", async () => {
    const { request } = await createHttpHarness();
    const conversationId = `migration-${crypto.randomUUID()}`;

    expect(
      await request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: {
            id: `${conversationId}-user`,
            role: "user",
            content: "导出迁移测试。",
            createdAt: "2026-06-06T04:06:00.000Z",
            payload: {
              id: `${conversationId}-user`,
              role: "user",
              content: "导出迁移测试。",
              createdAt: "12:06:00"
            }
          }
        })
      })
    ).toMatchObject({ status: 201 });

    const exported = await request("/v1/migration/export");
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-disposition")).toContain("geochat-migration-anonymous_offline-");
    expect(exported.json.migrationPackage).toMatchObject({
      schemaVersion: 1,
      product: "geochat",
      source: {
        databaseDriver: "sqlite",
        migrationsSchema: "sqlite"
      },
      scope: {
        ownerUserId: null,
        mode: "anonymous_offline"
      }
    });
    expect(
      exported.json.migrationPackage.conversations.some((bundle: { conversation: { id: string } }) => bundle.conversation.id === conversationId)
    ).toBe(true);

    const invalid = await request("/v1/migration/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ migrationPackage: { product: "geochat", schemaVersion: 999 } })
    });
    expect(invalid).toMatchObject({
      status: 400,
      json: { error: "invalid_migration_package" }
    });

    const imported = await request("/v1/migration/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ migrationPackage: exported.json.migrationPackage })
    });
    expect(imported.status).toBe(200);
    expect(imported.json.importResult.importedConversations).toBeGreaterThan(0);
    expect(imported.json.importResult.importedMessages).toBeGreaterThan(0);
  });

  test("rejects malformed conversation messages", async () => {
    const { request } = await createHttpHarness();
    const conversationId = `history-invalid-${crypto.randomUUID()}`;

    const response = await request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId,
        message: {
          id: " ",
          role: "user",
          content: "画一个圆",
          createdAt: "not-a-date",
          payload: {}
        }
      })
    });

    expect(response).toMatchObject({
      status: 400,
      json: {
        error: "invalid_request"
      }
    });
    expect((await request(`/v1/conversations/${encodeURIComponent(conversationId)}`)).status).toBe(404);
  });

  test("rejects conversation message id reuse across conversations", async () => {
    const { request } = await createHttpHarness();
    const firstConversationId = `history-first-${crypto.randomUUID()}`;
    const secondConversationId = `history-second-${crypto.randomUUID()}`;
    const messageId = `history-message-${crypto.randomUUID()}`;

    const message = {
      id: messageId,
      role: "user" as const,
      content: "画一个圆。",
      createdAt: "2026-06-06T04:08:00.000Z",
      payload: {
        id: messageId,
        role: "user" as const,
        content: "画一个圆。",
        createdAt: "12:08:00"
      }
    };

    expect(
      await request(`/v1/conversations/${encodeURIComponent(firstConversationId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: firstConversationId, message })
      })
    ).toMatchObject({ status: 201 });

    const conflict = await request(`/v1/conversations/${encodeURIComponent(secondConversationId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: secondConversationId, message })
    });

    expect(conflict).toMatchObject({
      status: 409,
      json: {
        error: "conflict"
      }
    });
    expect((await request(`/v1/conversations/${encodeURIComponent(secondConversationId)}`)).status).toBe(404);
  });

  test("deletes the whole conversation including runner ledger state", async () => {
    const { handler, request } = await createHttpHarness();
    const getConversationPersistenceDiagnostics = handler.getConversationPersistenceDiagnostics;
    const conversationId = `history-cascade-${crypto.randomUUID()}`;
    const runId = `${conversationId}-run`;

    await request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId,
        message: {
          id: `${conversationId}-user`,
          role: "user",
          content: "画一个圆并解释半径。",
          createdAt: "2026-06-06T04:10:00.000Z",
          payload: {
            id: `${conversationId}-user`,
            role: "user",
            content: "画一个圆并解释半径。",
            createdAt: "12:10:00"
          }
        }
      })
    });

    const run = createAgentRunLedger({
      runId,
      conversationId,
      userMessageId: `${conversationId}-user`,
      assistantMessageId: `${conversationId}-assistant`,
      mode: "ai-sdk",
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      prompt: "画一个圆并解释半径。",
      attachmentCount: 0,
      startedAt: "2026-06-06T04:10:01.000Z"
    });
    const start = await request("/v1/agent-runs/runner/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        run: agentRunStartPayload(run),
        model: {
          provider: "openai",
          model: "gpt-5.5",
          apiKey: "",
          customBaseUrl: ""
        }
      })
    });

    expect(start.status).toBe(201);
    expect(start.json.runner.run.runId).toBe(runId);
    expect(start.json.runner.pendingToolRequests).toHaveLength(1);
    expect(start.json.runner.policyDecisions).toHaveLength(1);
    const seededBlackboard = await request(`/v1/conversations/${encodeURIComponent(conversationId)}/blackboard`);
    expect(seededBlackboard.status).toBe(200);
    expect(seededBlackboard.json.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId,
          key: "current_goal",
          category: "goal",
          status: "active",
          sourceRunId: runId
        }),
        expect.objectContaining({
          conversationId,
          key: "original_problem",
          category: "original_problem",
          value: "画一个圆并解释半径。",
          status: "active",
          sourceRunId: runId
        })
      ])
    );
    expect((await request(`/v1/agent-runs/${encodeURIComponent(runId)}/runner`)).status).toBe(200);
    await expect(getConversationPersistenceDiagnostics(conversationId, [runId])).resolves.toMatchObject({
      conversations: 1,
      conversationMessages: 1,
      agentRunLedgers: 1,
      agentRunRemoteToolRequests: 1,
      agentRunPolicyDecisions: 1,
      agentRunModelSteps: 0,
      agentErrorEvents: 0
    });

    expect((await request(`/v1/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" })).status).toBe(204);
    expect((await request(`/v1/conversations/${encodeURIComponent(conversationId)}`)).status).toBe(404);
    expect((await request(`/v1/agent-runs/${encodeURIComponent(runId)}/runner`)).status).toBe(404);
    await expect(getConversationPersistenceDiagnostics(conversationId, [runId])).resolves.toEqual({
      conversations: 0,
      conversationMessages: 0,
      agentRunLedgers: 0,
      agentRunRemoteToolRequests: 0,
      agentRunPolicyDecisions: 0,
      agentRunModelSteps: 0,
      agentErrorEvents: 0
    });
    const runList = await request("/v1/agent-runs");
    expect(runList.json.runs.some((item: { runId: string }) => item.runId === runId)).toBe(false);
  });
});

describe("desktop-only removed web surfaces", () => {
  test("does not expose web account or public inquiry APIs", async () => {
    const { request } = await createHttpHarness();

    const removedRoutes: Array<[string, RequestInit | undefined]> = [
      ["/v1/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }],
      ["/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }],
      ["/v1/auth/session", undefined],
      ["/v1/auth/logout", { method: "POST" }],
      ["/v1/web-inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }],
      ["/v1/admin/web-inquiries", undefined],
      ["/v1/admin/registration-applications", undefined]
    ];

    for (const [path, init] of removedRoutes) {
      const response = await request(path, init);
      expect(response.status).toBe(404);
      expect(response.json?.error).toBe("not_found");
    }
  });
});
