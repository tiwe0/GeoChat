import { describe, expect, test } from "bun:test";
import { createRoot } from "solid-js";
import type { RuntimeInfo } from "@geochat-ai/app";
import type { GeoChatDesktopApi } from "../src/shared/desktop-api";
import { createWorkbenchImprovementState } from "../src/renderer/src/workbench-improvement-state";
import { createWorkbenchAccessState } from "../src/renderer/src/workbench-access-state";
import { createWorkbenchUpdateState } from "../src/renderer/src/workbench-update-state";
import type {
  DesktopChatMessage,
  DesktopConfig,
  RendererAppBundleUpdateState,
  RendererAccessState,
  RendererUpdateState
} from "../src/renderer/src/workbench-types";

const runtime: RuntimeInfo = {
  appVersion: "0.2.4-test",
  backendBaseUrl: "http://127.0.0.1:17369",
  backendAuthToken: "test-token",
  mcpEndpoint: null,
  mcpHealthUrl: null,
  mcpEnabled: false
};

const inactiveAccess: RendererAccessState = {
  available: true,
  status: "error",
  features: {
    local: false,
    problemBank: false,
    improvementUpload: false
  },
  checkedAt: null,
  error: null,
  errorCode: null
};

const activeAccess: RendererAccessState = {
  ...inactiveAccess,
  status: "active",
  features: {
    ...inactiveAccess.features,
    local: true,
    problemBank: true,
    improvementUpload: true
  }
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

const shellUpdateState: RendererUpdateState = {
  available: true,
  status: "available",
  currentVersion: "0.2.4",
  updateVersion: "0.2.5",
  releaseName: "GeoChat 0.2.5",
  releaseDate: null,
  downloaded: false,
  downloadPercent: null,
  error: null,
  errorCode: null,
  checkedAt: "2026-06-24T00:00:00.000Z",
  preferences: {
    autoCheck: true,
    autoDownload: true,
    installOnQuit: false
  }
};

const appBundleUpdateState: RendererAppBundleUpdateState = {
  available: true,
  configured: true,
  updateAvailable: true,
  status: "available",
  manifestUrl: "https://download.example.test/releases/latest/app-bundle.json",
  currentBundleVersion: "0.2.4",
  bundleVersion: "0.2.5",
  rollbackAvailable: false,
  checkedAt: "2026-06-24T00:00:00.000Z",
  installedAt: null,
  requiresRestart: false,
  error: null,
  errorCode: null
};

function partialDesktopApi(api: Partial<GeoChatDesktopApi>): GeoChatDesktopApi {
  return api as GeoChatDesktopApi;
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("workbench controller state boundaries", () => {
  test("update state falls back without patching the global desktop API", async () => {
    await createRoot(async (dispose) => {
      const updates = createWorkbenchUpdateState({
        runtime: () => runtime,
        desktopRuntime: {
          desktopApi: () => undefined
        }
      });

      await tick();

      expect(updates.updateState().available).toBe(false);
      expect(updates.updateState().currentVersion).toBe("0.2.4-test");
      expect(updates.appBundleUpdateState().available).toBe(false);
      expect(updates.unifiedUpdateState().recommendation).toBe("none");
      dispose();
    });
  });

  test("update listeners use injected desktop API and clean up with the Solid owner", async () => {
    let updateCallback: ((state: RendererUpdateState) => void) | undefined;
    let appBundleCallback: ((state: RendererAppBundleUpdateState) => void) | undefined;
    let disposeUpdateCount = 0;
    let disposeAppBundleCount = 0;
    const desktopApi = partialDesktopApi({
      getUpdateState: async () => ({ ...shellUpdateState, status: "not_available", available: true, updateVersion: null }),
      getAppBundleUpdateState: async () => ({ ...appBundleUpdateState, updateAvailable: false, status: "not_available" }),
      onUpdateState: (callback) => {
        updateCallback = callback;
        return () => {
          disposeUpdateCount += 1;
        };
      },
      onAppBundleUpdateState: (callback) => {
        appBundleCallback = callback;
        return () => {
          disposeAppBundleCount += 1;
        };
      }
    });

    const root = createRoot((dispose) => {
      const updates = createWorkbenchUpdateState({
        runtime: () => runtime,
        desktopRuntime: {
          desktopApi: () => desktopApi
        }
      });
      return { updates, dispose };
    });

    await tick();
    updateCallback?.(shellUpdateState);
    appBundleCallback?.(appBundleUpdateState);

    expect(root.updates.updateState().updateVersion).toBe("0.2.5");
    expect(root.updates.appBundleUpdateState().bundleVersion).toBe("0.2.5");
    expect(root.updates.unifiedUpdateState().recommendation).toBe("both_shell_first");

    root.dispose();

    expect(disposeUpdateCount).toBe(1);
    expect(disposeAppBundleCount).toBe(1);
  });

  test("access controller uses injected timers and clears refresh interval", async () => {
    let refetchCount = 0;
    let setIntervalCount = 0;
    let clearIntervalValue: number | undefined;
    const desktopApi = partialDesktopApi({
      checkAccess: async () => inactiveAccess,
      getAccessState: async () => inactiveAccess
    });

    const root = createRoot((dispose) => {
      const access = createWorkbenchAccessState({
        refetchRuntime: () => {
          refetchCount += 1;
        },
        desktopRuntime: {
          desktopApi: () => desktopApi,
          setInterval: () => {
            setIntervalCount += 1;
            return 42;
          },
          clearInterval: (id) => {
            clearIntervalValue = id;
          }
        }
      });
      return { access, dispose };
    });

    await tick();

    expect(root.access.accessState().available).toBe(true);
    expect(root.access.accessState().status).toBe("error");
    expect(refetchCount).toBe(1);
    expect(setIntervalCount).toBe(1);

    root.dispose();

    expect(clearIntervalValue).toBe(42);
  });

  test("improvement state enqueues only when preferences and access allow uploads", async () => {
    const enqueued: Array<{ conversationId: string; message: DesktopChatMessage }> = [];
    let disposeCount = 0;
    const desktopApi = partialDesktopApi({
      getImprovementPlanPreferences: async () => ({ enabled: true }),
      setImprovementPlanPreferences: async (preferences) => ({ enabled: Boolean(preferences.enabled) })
    });
    const message: DesktopChatMessage = {
      id: "message-1",
      role: "user",
      content: "测试消息",
      createdAt: "2026-06-24T00:00:00.000Z"
    };

    const root = createRoot((dispose) => {
      const improvement = createWorkbenchImprovementState({
        runtime: () => runtime,
        accessState: () => activeAccess,
        config: () => config,
        locale: () => "zh-CN",
        desktopRuntime: {
          desktopApi: () => desktopApi
        },
        createUploader: () => ({
          enqueueMessage: async (input) => {
            enqueued.push({
              conversationId: input.conversationId,
              message: input.message
            });
          },
          flush: async () => undefined,
          dispose: () => {
            disposeCount += 1;
          }
        })
      });
      return { improvement, dispose };
    });

    await tick();
    root.improvement.enqueueMessage({ conversationId: "conversation-1", message });
    await tick();
    expect(enqueued).toHaveLength(1);

    await root.improvement.changeImprovementPlanPreferences({ enabled: false });
    root.improvement.enqueueMessage({ conversationId: "conversation-1", message });
    await tick();
    expect(enqueued).toHaveLength(1);

    root.dispose();
    expect(disposeCount).toBe(1);
  });
});
