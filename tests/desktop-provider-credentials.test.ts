import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL_CONFIG,
  DEFAULT_VISION_MODEL_CONFIG,
  normalizeCustomProviderConfig,
  normalizeDesktopConfig,
  normalizeDesktopConfigJson,
  updateProviderCredentials,
} from "../src/shared/desktop/desktop-config";
import {
  isAgentModelConfig,
  normalizeAgentModelConfig,
} from "@geochat-ai/app/model-registry";

describe("desktop provider credential references", () => {
  test("freezes normalized model DTOs and rejects plaintext secret-bearing DTOs", () => {
    const normalized = normalizeAgentModelConfig({
      provider: "openai",
      model: "gpt-5.6-sol",
      credentialRef: "credential-ref",
      protocol: "openai-compatible",
    });

    expect(Object.isFrozen(normalized)).toBe(true);
    expect(isAgentModelConfig(normalized)).toBe(true);
    expect(isAgentModelConfig({
      ...normalized,
      apiKey: "secret",
    })).toBe(false);
    expect(isAgentModelConfig({
      ...normalized,
      customBaseUrl: "https://untrusted.invalid",
    })).toBe(false);
  });

  test("refuses to normalize plaintext configuration", () => {
    expect(() => normalizeDesktopConfigJson(JSON.stringify({
      locale: "en-US",
      model: { provider: "openai", model: "gpt", apiKey: "legacy-secret" },
    }), "en-US")).toThrow("plaintext credentials");
  });

  test("keeps only opaque references and display-safe transport metadata", () => {
    const config = normalizeDesktopConfig({
      model: { ...DEFAULT_MODEL_CONFIG, credentialRef: "model-ref" },
      visionModel: DEFAULT_VISION_MODEL_CONFIG,
      providerCredentials: {
        deepseek: {
          credentialRef: "provider-ref",
          baseUrl: "https://api.deepseek.com",
          protocol: "openai-compatible",
        },
      },
    }, "zh-CN");

    expect(config.providerCredentials.deepseek).toEqual({
      credentialRef: "provider-ref",
      baseUrl: "https://api.deepseek.com",
      protocol: "openai-compatible",
    });
    expect(config.model.credentialRef).toBe("model-ref");
    expect(config.model).not.toHaveProperty("apiKey");
    expect(config.model).not.toHaveProperty("customBaseUrl");
  });

  test("updates provider references and matching model references", () => {
    const initial = normalizeDesktopConfig({}, "zh-CN");
    const updated = updateProviderCredentials(initial, "deepseek", {
      credentialRef: "saved-ref",
      baseUrl: "https://api.deepseek.com",
      protocol: "openai-compatible",
    });
    const reloaded = normalizeDesktopConfig(updated, "zh-CN");

    expect(reloaded.providerCredentials.deepseek?.credentialRef).toBe("saved-ref");
    expect(reloaded.model.credentialRef).toBe("saved-ref");
  });

  test("starts with an empty custom provider credential reference", () => {
    expect(normalizeDesktopConfig({}, "zh-CN").customProvider).toEqual({
      name: "",
      baseUrl: "",
      credentialRef: "",
      protocol: "openai-compatible",
      models: [],
    });
  });

  test("normalizes custom provider models without accepting plaintext keys", () => {
    expect(normalizeCustomProviderConfig({
      name: " Local AI ",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "must-not-survive",
      credentialRef: "local-ref",
      protocol: "anthropic",
      models: [
        { name: "Primary", callName: "local-main", supportsImages: true },
        { name: "Duplicate", callName: "local-main", supportsImages: false },
        { name: "Incomplete", callName: "" },
      ],
    })).toEqual({
      name: " Local AI ",
      baseUrl: "http://127.0.0.1:11434/v1",
      credentialRef: "local-ref",
      protocol: "anthropic",
      models: [{ name: "Primary", callName: "local-main", supportsImages: true }],
    });
  });
});
