import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ChatMessageMetadata } from "@geochat-ai/app/chat";
import type { AgentRunLedgerRecord } from "@geochat-ai/app/agent-run";
import { isFunctionCallArgs } from "@geochat-ai/app/functioncalls";
import type { UIMessage } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import {
  createNativeChatResponse,
  type NativeChatDependencies,
  type NativeChatRequest,
} from "../backend/src/agent/native-chat";
import { nativeUserMessageFingerprint } from "../backend/src/agent/native-chat-request";
import { validateNativeRunContinuation } from "../backend/src/agent/agent-run-lifecycle";
import { persistNativeConversationMessages } from "../backend/src/agent/agent-run-persistence";
import { createDatabase } from "../backend/src/db/client";
import { createConversationRepository } from "../backend/src/db/conversation-repository";
import {
  fetchConversationMessages,
  parseConversationParts,
} from "../src/renderer-react/src/features/conversations/api";
import {
  restoreConversationMessages,
  type ChatMessage,
} from "../src/renderer-react/src/features/conversations/messageAdapter";
import { nativeChatTransportMessages } from "../src/renderer-react/src/hooks/useAgentRunChat";
import { createDefaultDesktopConfig } from "../src/shared/desktop/desktop-config";
import { createHttpHarness } from "./agent-harness-http-utils";

const temporaryDirectories = new Set<string>();

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
});

type ToolStateCase = {
  name: string;
  part: ChatMessage["parts"][number];
};

const completeInput = {
  commands: ["A=(1,2)"],
  perspective: "2D",
  reason: "Restore the persisted tool state.",
};

const partialStreamingInput = { perspective: "2D" };

const toolStateCases: ToolStateCase[] = [
  {
    name: "input-streaming with DeepPartial input",
    part: {
      type: "tool-executeGeoGebraCommands",
      toolCallId: "tool-input-streaming",
      state: "input-streaming",
      input: partialStreamingInput,
      callProviderMetadata: { openai: { itemId: "call-streaming" } },
    } as never,
  },
  {
    name: "input-available",
    part: {
      type: "tool-executeGeoGebraCommands",
      toolCallId: "tool-input-available",
      state: "input-available",
      input: completeInput,
    } as never,
  },
  {
    name: "approval-requested",
    part: {
      type: "tool-executeGeoGebraCommands",
      toolCallId: "tool-approval-requested",
      state: "approval-requested",
      input: completeInput,
      approval: {
        id: "approval-requested-1",
        descriptor: { risk: "canvas-write" },
        requestReason: "The canvas will be changed.",
        isAutomatic: false,
        signature: "approval-request-signature",
      },
    } as never,
  },
  {
    name: "approval-responded",
    part: {
      type: "tool-executeGeoGebraCommands",
      toolCallId: "tool-approval-responded",
      state: "approval-responded",
      input: completeInput,
      approval: {
        id: "approval-responded-1",
        approved: true,
        requestReason: "The canvas will be changed.",
        reason: "Approved for this construction.",
        isAutomatic: false,
        signature: "approval-response-signature",
      },
    } as never,
  },
  {
    name: "output-available",
    part: {
      type: "tool-executeGeoGebraCommands",
      toolCallId: "tool-output-available",
      state: "output-available",
      input: completeInput,
      output: {
        ok: true,
        results: [{ command: "A=(1,2)", success: true }],
      },
      approval: { id: "approval-output-1", approved: true },
      resultProviderMetadata: { openai: { itemId: "result-available" } },
    } as never,
  },
  {
    name: "output-error",
    part: {
      type: "tool-executeGeoGebraCommands",
      toolCallId: "tool-output-error",
      state: "output-error",
      input: completeInput,
      errorText: "GeoGebra rejected the command.",
      approval: { id: "approval-error-1", approved: true },
      resultProviderMetadata: { openai: { itemId: "result-error" } },
    } as never,
  },
  {
    name: "output-error with undefined input and rawInput",
    part: {
      type: "tool-executeGeoGebraCommands",
      toolCallId: "tool-output-error-missing-input",
      state: "output-error",
      input: undefined,
      rawInput: "{invalid tool input",
      errorText: "Tool input could not be parsed.",
      resultProviderMetadata: { openai: { itemId: "result-input-error" } },
      providerExtension: { retryable: false },
    } as never,
  },
  {
    name: "output-denied",
    part: {
      type: "tool-executeGeoGebraCommands",
      toolCallId: "tool-output-denied",
      state: "output-denied",
      input: completeInput,
      approval: {
        id: "approval-denied-1",
        approved: false,
        requestReason: "The canvas will be changed.",
        reason: "Keep the existing construction.",
      },
    } as never,
  },
];

describe("UIMessage conversation persistence roundtrip", () => {
  test("fixture proves streaming input is intentionally incomplete", () => {
    expect(isFunctionCallArgs("executeGeoGebraCommands", partialStreamingInput)).toBe(false);
  });

  test("preserves message identity, ordered rich parts, provider metadata, files, and token usage", async () => {
    const message = {
      id: "assistant-rich-roundtrip",
      role: "assistant",
      metadata: {
        tokenUsage: { inputTokens: 31, outputTokens: 17, totalTokens: 48 },
      },
      parts: [
        {
          type: "text",
          text: "先读取题目。",
          state: "done",
          providerMetadata: { openai: { itemId: "text-item-1" } },
        },
        {
          type: "reasoning",
          id: "reasoning-1",
          text: "由两点确定所需构造。",
          state: "done",
          providerMetadata: { openai: { itemId: "reasoning-item-1" } },
        },
        {
          type: "file",
          mediaType: "image/png",
          filename: "diagram.png",
          url: "data:image/png;base64,AA==",
          providerMetadata: { openai: { fileId: "file-1" } },
        },
        {
          type: "text",
          text: "构造完成。",
          providerMetadata: { openai: { itemId: "text-item-2" } },
        },
      ],
    } satisfies UIMessage<ChatMessageMetadata>;

    expect(await roundTripMessage(message)).toEqual(message);
  });

  test("preserves user message id, role, and ordered file parts", async () => {
    const message = {
      id: "user-file-roundtrip",
      role: "user",
      parts: [
        { type: "text", text: "请分析这张图。" },
        {
          type: "file",
          mediaType: "image/jpeg",
          filename: "problem.jpg",
          url: "data:image/jpeg;base64,AA==",
        },
      ],
    } satisfies UIMessage<ChatMessageMetadata>;

    expect(await roundTripMessage(message)).toEqual(message);
  });

  test("keeps provider-only Skill policy out of persisted and restarted user history", async () => {
    const directory = createTemporaryDirectory();
    const databasePath = join(directory, "native-submit.sqlite");
    const conversationId = "conversation-provider-only-policy";
    const rawUser = {
      id: "user-provider-only-policy",
      role: "user",
      parts: [
        { type: "text", text: "画一个三角形。" },
        {
          type: "file",
          mediaType: "image/png",
          filename: "triangle.png",
          url: "data:image/png;base64,AA==",
        },
      ],
    } satisfies ChatMessage;
    const transport = nativeChatTransportMessages(
      [rawUser],
      createDefaultDesktopConfig("zh-CN"),
      "zh-CN",
    );
    const database = createDatabase({ databasePath });
    const conversations = createConversationRepository({
      requestedDriver: "sqlite",
      sqlitePath: databasePath,
      migrationsSchema: "sqlite",
    }, database);
    const native = nativeDependencies(conversations);
    let providerPrompt: unknown;
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        providerPrompt = options.prompt;
        return {
          stream: simulateReadableStream({ chunks: [
            { type: "text-start", id: "provider-policy-answer" },
            { type: "text-delta", id: "provider-policy-answer", delta: "三角形已完成。" },
            { type: "text-end", id: "provider-policy-answer" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: { total: 8, noCache: 8, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 4, text: 4, reasoning: 0 },
              },
            },
          ] }),
        };
      },
    });
    let databaseClosed = false;
    try {
      const request: NativeChatRequest = {
        ...transport,
        runId: "run-provider-only-policy",
        conversationId,
        model: {
          provider: "deepseek",
          model: "deepseek-chat",
          credentialRef: "credential-provider-only-policy",
          maxToolSteps: 8,
        },
        locale: "zh-CN",
        thinking: false,
        thinkingEffort: "standard",
      };
      const response = await createNativeChatResponse(request, native.dependencies, {
        model,
        dataScope: { ownerUserId: null },
      });
      await response.text();
      expect(JSON.stringify(providerPrompt)).toContain("【Agent Skill 策略】");
      expect(native.selectedPrompt).toContain("【Agent Skill 策略】");
      const ledger = native.ledgers.get("run-provider-only-policy");
      expect(ledger?.prompt).toBe("画一个三角形。");
      expect(ledger?.requestFingerprint).toBe(nativeUserMessageFingerprint(rawUser));
      expect(JSON.stringify(ledger)).not.toContain("Agent Skill 策略");
      expect(validateNativeRunContinuation(
        { ...ledger!, status: "running" },
        request,
        rawUser,
      )).toBeUndefined();
      expect(validateNativeRunContinuation(
        { ...ledger!, status: "running" },
        request,
        transport.providerMessages[0]!,
      )).toBe("Agent run prompt does not match the continuation request.");
      expect(native.blackboardPatches).toHaveLength(1);
      expect(native.blackboardPatches[0]).toMatchObject({
        ops: [
          expect.objectContaining({ key: "original_problem", value: "画一个三角形。" }),
          expect.objectContaining({ key: "current_goal", value: "完成当前用户请求：画一个三角形。" }),
        ],
      });
      expect(JSON.stringify(native.blackboardPatches)).not.toContain("Agent Skill 策略");

      database.close();
      databaseClosed = true;
      const restored = await fetchRestartedConversation(databasePath, conversationId);
      const restoredUser = restored.messages.find((message) => message.role === "user");
      expect(restoredUser).toEqual(rawUser);
      expect(restoredUser?.parts).toEqual(rawUser.parts);
      expect(JSON.stringify(restoredUser)).not.toContain("Agent Skill 策略");
      expect(restored.title).toBe("画一个三角形。");
      expect(restored.title).not.toContain("Agent Skill 策略");
    } finally {
      if (!databaseClosed) database.close();
    }
  });

  test.each(toolStateCases)("preserves $name through SQLite restart and renderer decode", async ({ part }) => {
    const message = {
      id: `assistant-${part.state}`,
      role: "assistant",
      metadata: {
        tokenUsage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 },
      },
      parts: [part],
    } as ChatMessage;

    expect(await roundTripMessage(message)).toEqual(message);
  });

  test.each(toolStateCases)("parseConversationParts retains every field for $name", ({ part }) => {
    expect(parseConversationParts([part])).toEqual([part]);
  });
});

async function roundTripMessage(message: ChatMessage): Promise<ChatMessage> {
  const directory = createTemporaryDirectory();
  const databasePath = join(directory, "conversation.sqlite");
  const conversationId = `conversation-${message.id}`;

  const database = createDatabase({ databasePath });
  const conversations = createConversationRepository({
    requestedDriver: "sqlite",
    sqlitePath: databasePath,
    migrationsSchema: "sqlite",
  }, database);
  try {
    await persistNativeConversationMessages(
      conversations,
      conversationId,
      [message],
      {},
    );
  } finally {
    database.close();
  }

  const harness = await createHttpHarness({ databasePath });
  try {
    const request = ((input: string | URL | Request, init?: RequestInit) =>
      harness.handleRequest(input instanceof Request ? input : new Request(input, init))) as typeof fetch;
    const restored = await fetchConversationMessages(
      "http://127.0.0.1:17365",
      null,
      conversationId,
      request,
    );
    expect(restored.messages).toHaveLength(1);
    const messages = restoreConversationMessages(restored.messages);
    expect(messages).toHaveLength(1);
    return messages[0]!;
  } finally {
    harness.close();
  }
}

function createTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "geochat-conversation-roundtrip-"));
  temporaryDirectories.add(directory);
  return directory;
}

async function fetchRestartedConversation(databasePath: string, conversationId: string) {
  const harness = await createHttpHarness({ databasePath });
  try {
    const request = ((input: string | URL | Request, init?: RequestInit) =>
      harness.handleRequest(input instanceof Request ? input : new Request(input, init))) as typeof fetch;
    const detail = await harness.request(`/v1/conversations/${encodeURIComponent(conversationId)}`);
    expect(detail.status).toBe(200);
    const restored = await fetchConversationMessages(
      "http://127.0.0.1:17365",
      null,
      conversationId,
      request,
    );
    return {
      messages: restoreConversationMessages(restored.messages),
      title: detail.json.conversation.title as string,
    };
  } finally {
    harness.close();
  }
}

function nativeDependencies(
  conversations: ReturnType<typeof createConversationRepository>,
) {
  const ledgers = new Map<string, AgentRunLedgerRecord>();
  const blackboardPatches: unknown[] = [];
  let selectedPrompt = "";
  let generatedId = 0;
  const dependencies: NativeChatDependencies = {
    conversations,
    runs: {
      async getLedger(runId) {
        return ledgers.get(runId);
      },
      async createLedger(record) {
        const created = { ...structuredClone(record), revision: 0 };
        ledgers.set(record.runId, created);
        return structuredClone(created);
      },
      async compareAndSwapLedger(record, expectedRevision) {
        const current = ledgers.get(record.runId);
        if (!current || current.revision !== expectedRevision) throw new Error("Agent run ledger revision conflict");
        const next = { ...structuredClone(record), revision: expectedRevision + 1 };
        ledgers.set(record.runId, next);
        return structuredClone(next);
      },
    },
    blackboard: {
      async listEntries() {
        return [];
      },
      async patchEntries(_conversationId, patch) {
        blackboardPatches.push(structuredClone(patch));
        return { entries: [], changed: 0, archived: 0 };
      },
    },
    selectSkills: async ({ run }) => {
      selectedPrompt = run.prompt;
      return {
        status: "disabled",
        curriculumNodes: [],
        selectedSkills: [],
        loadedSkills: [],
        failedSkillLoads: [],
        enabledAdvancedTools: [],
        selectorReason: "Disabled for provider-only persistence test.",
        injectedContext: "",
        modelCallCount: 0,
        usage: null,
        cacheHit: false,
      };
    },
    createId: () => `generated-provider-policy-${generatedId += 1}`,
  };
  return {
    dependencies,
    ledgers,
    blackboardPatches,
    get selectedPrompt() {
      return selectedPrompt;
    },
  };
}
