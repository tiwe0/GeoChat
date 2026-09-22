import { createAlibaba } from "@ai-sdk/alibaba";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createProviderRegistry, customProvider, type LanguageModel } from "ai";
import type { AgentModelConfig } from "@geochat-ai/app";

export function createBackendLanguageModel(config: AgentModelConfig): LanguageModel {
  const registry = createProviderRegistry({
    configured: customProvider({
      languageModels: {
        [config.model]: configuredLanguageModel(config),
      },
    }),
  });
  return registry.languageModel(`configured:${config.model}`);
}

function configuredLanguageModel(config: AgentModelConfig): LanguageModel {
  const apiKey = config.apiKey.trim();
  const baseURL = config.customBaseUrl.trim() || undefined;
  if (config.provider === "openai") return createOpenAI({ apiKey, baseURL })(config.model as never);
  if (config.provider === "openrouter") {
    return createOpenRouter({
      apiKey,
      baseURL: baseURL ?? "https://openrouter.ai/api/v1",
      appName: "GeoChat"
    }).chat(config.model as never);
  }
  if (config.provider === "qwen") {
    return createAlibaba({
      apiKey,
      baseURL: baseURL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"
    })(config.model as never);
  }
  if (config.provider === "anthropic") return createAnthropic({ apiKey, baseURL })(config.model as never);
  if (config.provider === "google") return createGoogleGenerativeAI({ apiKey, baseURL })(config.model as never);
  if (config.provider === "deepseek") return createDeepSeek({ apiKey, baseURL })(config.model as never);
  if (config.provider === "custom") {
    if (!baseURL) throw new Error("Custom model provider requires a base URL.");
    if (config.protocol === "openai-compatible") {
      return createOpenAI({ apiKey, baseURL }).chat(config.model as never);
    }
    if (config.protocol === "anthropic") return createAnthropic({ apiKey, baseURL })(config.model as never);
    if (config.protocol === "google") return createGoogleGenerativeAI({ apiKey, baseURL })(config.model as never);
    throw new Error("Custom model provider requires a supported protocol.");
  }
  throw new Error(`Unsupported model provider: ${config.provider}`);
}
