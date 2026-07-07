import { describe, expect, test } from "bun:test";
import type { RuntimeInfo } from "@geochat-ai/app";
import type { GeoChatDesktopApi } from "../src/shared/desktop-api";
import {
  createImprovementPlanUploader,
  type ImprovementPlanUploaderRuntime
} from "../src/renderer/src/improvement-plan";
import type { DesktopChatMessage, DesktopConfig } from "../src/renderer/src/workbench-types";

const runtime: RuntimeInfo = {
  appVersion: "0.2.4-test",
  backendBaseUrl: "http://127.0.0.1:17369",
  backendAuthToken: "test-token",
  mcpEndpoint: null,
  mcpHealthUrl: null,
  mcpEnabled: false
};

const config: DesktopConfig = {
  model: {
    provider: "deepseek",
    model: "deepseek-chat",
    apiKey: "",
    customBaseUrl: ""
  },
  visionModel: {
    provider: "openai",
    model: "gpt-4o-mini",
    apiKey: "",
    customBaseUrl: ""
  },
  providerCredentials: {},
  skills: {
    enabled: true,
    autoActivate: true,
    enabledSkillNames: [],
    visualProfile: "exam-clean"
  },
  locale: "zh-CN"
};

function partialDesktopApi(api: Partial<GeoChatDesktopApi>): GeoChatDesktopApi {
  return api as GeoChatDesktopApi;
}

function createMemoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

describe("improvement plan uploader", () => {
  test("uploads queued samples through injected runtime boundaries", async () => {
    const uploadedBatches: unknown[][] = [];
    const desktopApi = partialDesktopApi({
      uploadImprovementPlanSamples: async (samples) => {
        uploadedBatches.push(samples);
        return { ok: true };
      }
    });
    const storage = createMemoryStorage();
    let intervalId: number | undefined;
    let clearedIntervalId: number | undefined;
    let timeoutId: number | undefined;
    let clearedTimeoutId: number | undefined;
    let onlineListener: (() => void) | undefined;
    let removedOnlineListener: (() => void) | undefined;
    const desktopRuntime: Partial<ImprovementPlanUploaderRuntime> = {
      desktopApi: () => desktopApi,
      queueStorage: storage,
      isOnline: () => true,
      setInterval: (() => {
        intervalId = 101;
        return intervalId;
      }) as typeof window.setInterval,
      clearInterval: ((id) => {
        clearedIntervalId = id;
      }) as typeof window.clearInterval,
      setTimeout: (() => {
        timeoutId = 202;
        return timeoutId;
      }) as typeof window.setTimeout,
      clearTimeout: ((id) => {
        clearedTimeoutId = id;
      }) as typeof window.clearTimeout,
      addOnlineListener: (handler) => {
        onlineListener = handler;
      },
      removeOnlineListener: (handler) => {
        removedOnlineListener = handler;
      }
    };
    const message: DesktopChatMessage = {
      id: "message-1",
      role: "assistant",
      content: "hello admin@example.com https://example.test/path",
      createdAt: "2026-06-24T00:00:00.000Z"
    };

    const uploader = createImprovementPlanUploader({
      runtime: () => runtime,
      enabled: () => true,
      desktopRuntime
    });

    await uploader.enqueueMessage({
      conversationId: "conversation-1",
      message,
      config,
      locale: "zh-CN",
      appVersion: runtime.appVersion
    });
    await uploader.flush();

    expect(intervalId).toBe(101);
    expect(timeoutId).toBe(202);
    expect(onlineListener).toBeDefined();
    expect(uploadedBatches).toHaveLength(1);
    expect(uploadedBatches[0]).toHaveLength(1);
    expect(uploadedBatches[0]?.[0]).toMatchObject({
      source: "desktop",
      appVersion: "0.2.4-test",
      contentRedacted: "hello [email] [url]"
    });

    uploader.dispose();

    expect(clearedIntervalId).toBe(101);
    expect(clearedTimeoutId).toBe(202);
    expect(removedOnlineListener).toBe(onlineListener);
  });
});
