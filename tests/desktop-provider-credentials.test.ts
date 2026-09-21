import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL_CONFIG,
  DEFAULT_VISION_MODEL_CONFIG,
  normalizeCustomProviderConfig,
  normalizeDesktopConfig,
  updateProviderCredentials,
} from "../src/shared/desktop/desktop-config";

describe("desktop provider credentials", () => {
  test("keeps explicit provider credentials instead of restoring a stale model mirror", () => {
    const config = normalizeDesktopConfig({
      model: { ...DEFAULT_MODEL_CONFIG, apiKey: "old-key" },
      visionModel: DEFAULT_VISION_MODEL_CONFIG,
      providerCredentials: {
        deepseek: { apiKey: "new-key", customBaseUrl: "" },
      },
    }, "zh-CN");

    expect(config.providerCredentials.deepseek?.apiKey).toBe("new-key");
    expect(config.model.apiKey).toBe("new-key");
  });

  test("still migrates legacy model credentials when no provider entry exists", () => {
    const config = normalizeDesktopConfig({
      model: { ...DEFAULT_MODEL_CONFIG, apiKey: "legacy-key" },
      visionModel: DEFAULT_VISION_MODEL_CONFIG,
      providerCredentials: {},
    }, "zh-CN");

    expect(config.providerCredentials.deepseek?.apiKey).toBe("legacy-key");
    expect(config.model.apiKey).toBe("legacy-key");
  });

  test("updates provider credentials and every matching compatibility mirror", () => {
    const initial = normalizeDesktopConfig({}, "zh-CN");
    const updated = updateProviderCredentials(initial, "deepseek", {
      apiKey: "saved-key",
      customBaseUrl: "https://api.deepseek.com",
    });
    const reloaded = normalizeDesktopConfig(updated, "zh-CN");

    expect(reloaded.providerCredentials.deepseek).toEqual({
      apiKey: "saved-key",
      customBaseUrl: "https://api.deepseek.com",
    });
    expect(reloaded.model.apiKey).toBe("saved-key");
    expect(reloaded.model.customBaseUrl).toBe("https://api.deepseek.com");
  });

  test("starts with an empty custom provider configuration", () => {
    expect(normalizeDesktopConfig({}, "zh-CN").customProvider).toEqual({
      name: "",
      baseUrl: "",
      apiKey: "",
      protocol: "openai-compatible",
      models: [],
    });
  });

  test("normalizes custom provider models and removes duplicate call names", () => {
    expect(normalizeCustomProviderConfig({
      name: " Local AI ",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "local-key",
      protocol: "anthropic",
      models: [
        { name: "Primary", callName: "local-main", supportsImages: true },
        { name: "Duplicate", callName: "local-main", supportsImages: false },
        { name: "Incomplete", callName: "" },
      ],
    })).toEqual({
      name: " Local AI ",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "local-key",
      protocol: "anthropic",
      models: [{ name: "Primary", callName: "local-main", supportsImages: true }],
    });
  });
});
