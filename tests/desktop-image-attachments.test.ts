import { describe, expect, test } from "bun:test";
import {
  configHasImageCapableModel,
  configSupportsImageAttachments,
  imageAttachmentModelConfig,
  modelCapabilityOverviewFor,
  modelConfigForRun,
  normalizeDesktopConfig
} from "../src/renderer/src/desktop-config";

describe("desktop image attachment model selection", () => {
  test("enables image input for a configured multimodal primary model", () => {
    const config = normalizeDesktopConfig({
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "primary-key",
        customBaseUrl: ""
      }
    });

    expect(configHasImageCapableModel(config)).toBe(true);
    expect(configSupportsImageAttachments(config)).toBe(true);
    expect(imageAttachmentModelConfig(config)?.provider).toBe("openai");
    expect(modelConfigForRun(config, 1).provider).toBe("openai");
    expect(modelCapabilityOverviewFor(config)).toEqual({
      solving: true,
      vision: true,
      fileParsing: true
    });
  });

  test("uses a configured vision model when the primary model is text only", () => {
    const config = normalizeDesktopConfig({
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "primary-key",
        customBaseUrl: "",
        maxToolSteps: 9
      },
      visionModel: {
        provider: "openrouter",
        model: "openai/gpt-5.5",
        apiKey: "vision-key",
        customBaseUrl: ""
      }
    });

    expect(configSupportsImageAttachments(config)).toBe(true);
    expect(imageAttachmentModelConfig(config)?.provider).toBe("openrouter");
    expect(modelConfigForRun(config, 1).provider).toBe("openrouter");
    expect(modelConfigForRun(config, 1).maxToolSteps).toBe(9);
    expect(modelConfigForRun(config, 0).provider).toBe("deepseek");
    expect(modelConfigForRun(config, 0).maxToolSteps).toBe(9);
    expect(modelCapabilityOverviewFor(config)).toEqual({
      solving: true,
      vision: true,
      fileParsing: false
    });
  });

  test("keeps image and file capabilities off for a configured text-only primary model", () => {
    const config = normalizeDesktopConfig({
      model: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        apiKey: "primary-key",
        customBaseUrl: ""
      },
      visionModel: {
        provider: "openrouter",
        model: "openai/gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      }
    });

    expect(configSupportsImageAttachments(config)).toBe(false);
    expect(modelCapabilityOverviewFor(config)).toEqual({
      solving: true,
      vision: false,
      fileParsing: false
    });
  });

  test("does not enable image input for image-capable models without keys", () => {
    const config = normalizeDesktopConfig({
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      visionModel: {
        provider: "openrouter",
        model: "openai/gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      }
    });

    expect(configHasImageCapableModel(config)).toBe(true);
    expect(configSupportsImageAttachments(config)).toBe(false);
    expect(imageAttachmentModelConfig(config)).toBeNull();
    expect(modelCapabilityOverviewFor(config)).toEqual({
      solving: false,
      vision: false,
      fileParsing: false
    });
  });

  test("falls back to configured vision model when primary multimodal has no key", () => {
    const config = normalizeDesktopConfig({
      model: {
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        customBaseUrl: ""
      },
      visionModel: {
        provider: "openrouter",
        model: "openai/gpt-5.5",
        apiKey: "vision-key",
        customBaseUrl: ""
      }
    });

    expect(configSupportsImageAttachments(config)).toBe(true);
    expect(imageAttachmentModelConfig(config)?.provider).toBe("openrouter");
    expect(modelConfigForRun(config, 1).provider).toBe("openrouter");
    expect(modelCapabilityOverviewFor(config)).toEqual({
      solving: false,
      vision: true,
      fileParsing: false
    });
  });
});
