import { describe, expect, test } from "bun:test";
import {
  createAgentModelRegistrySchema,
  getAgentModelPolicy,
  getAgentModelOptionsForSchema,
  getAgentModelPolicyForSchema,
  getAgentProviderOptionsForSchema,
  isAgentModelRegistrySchema,
  normalizeAgentModelRegistrySchema,
  normalizeAgentModelConfig,
  type AgentModelRegistrySchema
} from "@geochat-ai/app";

describe("agent model registry schema", () => {
  test("exports the bundled registry as a valid schema", () => {
    const schema = createAgentModelRegistrySchema();
    expect(isAgentModelRegistrySchema(schema)).toBe(true);
    expect(schema.providers.some((provider) => provider.id === "deepseek")).toBe(true);
    expect(schema.models.some((model) => model.provider === "openai" && model.id === "gpt-5.6-terra")).toBe(true);
  });

  test("offers current models while retaining older saved model policies", () => {
    const options = getAgentModelOptionsForSchema("openai");
    expect(options[0]?.value).toBe("gpt-5.6-terra");
    expect(options.some((model) => model.value === "gpt-5.5")).toBe(false);
    expect(getAgentModelPolicyForSchema({ provider: "openai", model: "gpt-5.5" })).toMatchObject({
      isKnownModel: true,
      isCustomModel: false,
      supportsImages: true,
      supportsTools: true
    });
  });

  test("drives provider options and model policy from a remote schema", () => {
    const schema: AgentModelRegistrySchema = {
      kind: "geochat-model-registry-schema",
      version: 1,
      providers: [
        {
          id: "futureai",
          label: "Future AI",
          defaultBaseUrl: "https://api.future.test",
          allowedHosts: ["api.future.test"]
        }
      ],
      models: [
        {
          provider: "futureai",
          id: "future-vision",
          label: "Future Vision",
          capabilities: ["text", "imageInput", "toolCalling"],
          maxToolSteps: 10,
          defaultTemperature: 0.4
        }
      ]
    };

    expect(isAgentModelRegistrySchema(schema)).toBe(true);
    expect(getAgentProviderOptionsForSchema(schema)).toEqual([{ value: "futureai", label: "Future AI" }]);
    expect(getAgentModelOptionsForSchema("futureai", schema)).toMatchObject([
      { value: "future-vision", label: "Future Vision", supportsImages: true, supportsTools: true }
    ]);
    expect(getAgentModelPolicyForSchema({ provider: "futureai", model: "future-vision" }, schema)).toMatchObject({
      supportsImages: true,
      supportsTools: true,
      maxToolSteps: 10,
      defaultTemperature: 0.4,
      isKnownModel: true
    });
  });

  test("rejects models that reference missing providers", () => {
    expect(isAgentModelRegistrySchema({
      kind: "geochat-model-registry-schema",
      version: 1,
      providers: [
        {
          id: "futureai",
          label: "Future AI",
          defaultBaseUrl: "https://api.future.test",
          allowedHosts: ["api.future.test"]
        }
      ],
      models: [
        {
          provider: "missing",
          id: "future-vision",
          label: "Future Vision",
          capabilities: ["text"],
          maxToolSteps: 1,
          defaultTemperature: 0.2
        }
      ]
    })).toBe(false);
  });

  test("normalizes remote schemas to providers this client can run", () => {
    const schema: AgentModelRegistrySchema = {
      kind: "geochat-model-registry-schema",
      version: 1,
      providers: [
        {
          id: "openai",
          label: "OpenAI Updated",
          defaultBaseUrl: "https://api.openai.com",
          allowedHosts: ["api.openai.com"]
        },
        {
          id: "futureai",
          label: "Future AI",
          defaultBaseUrl: "https://api.future.test",
          allowedHosts: ["api.future.test"]
        }
      ],
      models: [
        {
          provider: "openai",
          id: "gpt-future",
          label: "GPT Future",
          capabilities: ["text", "imageInput", "toolCalling"],
          maxToolSteps: 12,
          defaultTemperature: 0.2
        },
        {
          provider: "futureai",
          id: "future-vision",
          label: "Future Vision",
          capabilities: ["text", "imageInput", "toolCalling"],
          maxToolSteps: 10,
          defaultTemperature: 0.4
        }
      ]
    };

    const normalized = normalizeAgentModelRegistrySchema(schema);
    expect(normalized?.providers.map((provider) => provider.id)).toEqual(["openai"]);
    expect(normalized?.models.map((model) => model.id)).toEqual(["gpt-future"]);
    expect(normalized?.models[0]).toMatchObject({
      capabilities: ["text", "toolCalling"],
      maxToolSteps: 8,
      defaultTemperature: 0.2
    });
  });

  test("preserves custom model transport settings and treats configured capabilities explicitly", () => {
    expect(normalizeAgentModelConfig({
      provider: "custom",
      model: "local-vision",
      apiKey: "key",
      customBaseUrl: "http://127.0.0.1:11434/v1",
      protocol: "openai-compatible",
      supportsImages: true,
    })).toMatchObject({
      provider: "custom",
      model: "local-vision",
      protocol: "openai-compatible",
      supportsImages: true,
    });
    expect(getAgentModelPolicy({
      provider: "custom",
      model: "local-vision",
      supportsImages: true,
    })).toMatchObject({
      supportsImages: true,
      supportsTools: true,
      toolCallingMode: "assumed",
      isCustomModel: true,
    });
  });
});
