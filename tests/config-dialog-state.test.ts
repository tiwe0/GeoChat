import { describe, expect, test } from "bun:test";
import {
  deriveProviderChange,
  deriveSavedDesktopConfig,
  deriveVisionProviderChange,
  maxToolStepsInputValue,
  modelOptionsWithCustom,
  primaryUpdateAction,
  primaryUpdateActionBusy,
  primaryUpdateActionLabel,
  providerCredentialsSnapshot
} from "../src/renderer/src/config-dialog/config-dialog-state";
import { rendererI18n } from "../src/renderer/src/i18n";
import type {
  DesktopConfig,
  RendererAppBundleUpdateState,
  RendererUnifiedUpdateState,
  RendererUpdateState
} from "../src/renderer/src/workbench-types";

const copy = rendererI18n("zh-CN");

const updatePreferences = {
  autoCheck: true,
  autoDownload: true,
  installOnQuit: false
};

const updateState: RendererUpdateState = {
  available: true,
  status: "not_available",
  currentVersion: "0.2.4",
  updateVersion: null,
  releaseName: null,
  releaseDate: null,
  downloaded: false,
  downloadPercent: null,
  error: null,
  errorCode: null,
  checkedAt: "2026-06-24T00:00:00.000Z",
  preferences: updatePreferences
};

const appBundleUpdateState: RendererAppBundleUpdateState = {
  available: true,
  configured: true,
  updateAvailable: false,
  status: "not_available",
  manifestUrl: "https://download.example.test/releases/latest/app-bundle.json",
  currentBundleVersion: "0.2.4",
  bundleVersion: null,
  rollbackAvailable: false,
  checkedAt: "2026-06-24T00:00:00.000Z",
  installedAt: null,
  requiresRestart: false,
  error: null,
  errorCode: null
};

const unifiedUpdateState: RendererUnifiedUpdateState = {
  available: true,
  status: "not_available",
  recommendation: "none",
  shell: updateState,
  appBundle: appBundleUpdateState,
  message: null,
  error: null,
  errorCode: null
};

const desktopConfig: DesktopConfig = {
  model: {
    provider: "deepseek",
    model: "deepseek-chat",
    apiKey: "",
    customBaseUrl: ""
  },
  visionModel: {
    provider: "openrouter",
    model: "openai/gpt-5.5",
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

describe("config dialog derived state", () => {
  test("adds a custom model option only when the selected model is missing", () => {
    const options = [
      {
        value: "deepseek-chat",
        label: "DeepSeek Chat",
        supportsImages: false,
        supportsTools: true,
        toolCallingMode: "native" as const
      }
    ];

    expect(modelOptionsWithCustom(options, "deepseek-chat", copy)).toBe(options);
    expect(modelOptionsWithCustom(options, "custom-model", copy)[0]).toMatchObject({
      value: "custom-model",
      supportsImages: false,
      supportsTools: true,
      toolCallingMode: "assumed"
    });
  });

  test("normalizes model max tool-step input values", () => {
    expect(maxToolStepsInputValue(12)).toBe("12");
    expect(maxToolStepsInputValue(null)).toBe("");
    expect(maxToolStepsInputValue(Number.NaN)).toBe("");
  });

  test("snapshots provider credentials for primary and separate vision providers", () => {
    expect(providerCredentialsSnapshot({
      provider: "deepseek",
      apiKey: "primary-key",
      customBaseUrl: "https://primary.example.test/v1",
      visionProvider: "openrouter",
      visionApiKey: "vision-key",
      visionCustomBaseUrl: "https://vision.example.test/v1",
      providerCredentials: {}
    })).toEqual({
      deepseek: {
        apiKey: "primary-key",
        customBaseUrl: "https://primary.example.test/v1"
      },
      openrouter: {
        apiKey: "vision-key",
        customBaseUrl: "https://vision.example.test/v1"
      }
    });
  });

  test("derives provider changes from saved credentials without touching save semantics", () => {
    const next = deriveProviderChange({
      provider: "deepseek",
      apiKey: "deepseek-current-key",
      customBaseUrl: "",
      visionProvider: "openrouter",
      visionApiKey: "openrouter-current-key",
      visionCustomBaseUrl: "",
      providerCredentials: {
        openai: {
          apiKey: "openai-saved-key",
          customBaseUrl: "https://openai.example.test/v1"
        }
      },
      nextProvider: "openai"
    });

    expect(next.provider).toBe("openai");
    expect(next.apiKey).toBe("openai-saved-key");
    expect(next.customBaseUrl).toBe("https://openai.example.test/v1");
    expect(next.model).toBeTruthy();
    expect(next.providerCredentials.deepseek.apiKey).toBe("deepseek-current-key");
    expect(next.providerCredentials.openrouter.apiKey).toBe("openrouter-current-key");
  });

  test("derives vision provider changes using primary credentials when providers match", () => {
    const next = deriveVisionProviderChange({
      provider: "deepseek",
      apiKey: "primary-key",
      customBaseUrl: "https://primary.example.test/v1",
      visionProvider: "openrouter",
      visionApiKey: "vision-key",
      visionCustomBaseUrl: "",
      providerCredentials: {},
      nextProvider: "deepseek"
    });

    expect(next.visionProvider).toBe("deepseek");
    expect(next.visionApiKey).toBe("primary-key");
    expect(next.visionCustomBaseUrl).toBe("https://primary.example.test/v1");
    expect(next.visionModel).toBeTruthy();
    expect(next.providerCredentials.openrouter.apiKey).toBe("vision-key");
  });

  test("derives saved desktop config while keeping persistence side effects outside helpers", () => {
    const next = deriveSavedDesktopConfig({
      baseConfig: desktopConfig,
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "primary-key",
      customBaseUrl: "https://primary.example.test/v1",
      maxToolSteps: 9,
      visionProvider: "deepseek",
      visionModel: "deepseek-chat",
      visionApiKey: "stale-vision-key",
      visionCustomBaseUrl: "https://stale.example.test/v1",
      providerCredentials: {},
      skillsEnabled: false,
      skillAutoActivate: false,
      enabledSkillNames: ["function-graph"],
      visualProfile: "teaching-demo",
      modelStepTimeoutSeconds: "180"
    });

    expect(next.model).toMatchObject({
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "primary-key",
      customBaseUrl: "https://primary.example.test/v1",
      maxToolSteps: 9
    });
    expect(next.visionModel).toMatchObject({
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "primary-key",
      customBaseUrl: "https://primary.example.test/v1"
    });
    expect(next.skills).toMatchObject({
      enabled: false,
      autoActivate: false,
      visualProfile: "teaching-demo"
    });
    expect(next.skills.enabledSkillNames).toEqual(["function-graph"]);
    expect(next.debug.modelStepTimeoutMs).toBe(180_000);
  });

  test("derives update primary action priority and labels", () => {
    expect(primaryUpdateAction({
      updateState: { ...updateState, status: "downloaded", downloaded: true },
      appBundleUpdateState: { ...appBundleUpdateState, updateAvailable: true, status: "available" }
    })).toBe("install_shell");
    expect(primaryUpdateAction({
      updateState: { ...updateState, status: "available", downloaded: false },
      appBundleUpdateState
    })).toBe("download_shell");
    expect(primaryUpdateAction({
      updateState,
      appBundleUpdateState: { ...appBundleUpdateState, updateAvailable: true, status: "available" }
    })).toBe("install_app_bundle");
    expect(primaryUpdateAction({ updateState, appBundleUpdateState })).toBe("check");

    expect(primaryUpdateActionBusy({
      unifiedUpdateBusy: false,
      updateBusy: false,
      appBundleUpdateBusy: false,
      unifiedUpdateState,
      updateState: { ...updateState, status: "downloading" },
      appBundleUpdateState
    })).toBe(true);
    expect(primaryUpdateActionLabel({
      busy: false,
      updateState: { ...updateState, status: "available", downloaded: false },
      appBundleUpdateState,
      copy
    })).toBe(copy.config.updateDownload);
  });
});
