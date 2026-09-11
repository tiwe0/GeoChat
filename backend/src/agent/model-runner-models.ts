import { createAlibaba } from "@ai-sdk/alibaba";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, stepCountIs, streamText, type LanguageModel, type ModelMessage, type SystemModelMessage } from "ai";

/** Re-derived from the SDK so this file needs no extra dependency. */
type ProviderOptions = NonNullable<SystemModelMessage["providerOptions"]>;
import type { AgentModelConfig } from "@geochat-ai/app";
import type { createBackendPlanningTools } from "./model-runner-planning-tools";
import type { ModelResultLike } from "./model-runner-toolcalls";

/**
 * Marks the system prompt as a cache breakpoint for providers that require an
 * explicit one.
 *
 * The system prompt is several thousand tokens and is resent on every step of a
 * run, so caching it is the difference between paying for it once and paying
 * for it twenty times. Providers differ: OpenAI, DeepSeek and Alibaba cache
 * long prefixes automatically and need no annotation; Anthropic requires an
 * explicit `cacheControl` breakpoint. Only the explicit case is handled here.
 *
 * This works because systemPromptForRun puts the stable base prompt first and
 * the per-run skill/command packets after it — the prefix is byte-stable across
 * the steps of a run.
 */
export function systemCacheProviderOptions(config: AgentModelConfig): ProviderOptions | undefined {
  if (config.provider === "anthropic") {
    return { anthropic: { cacheControl: { type: "ephemeral" } } };
  }
  return undefined;
}


function instructionsFor(input: {
  system: string;
  systemProviderOptions?: ProviderOptions;
}): SystemModelMessage {
  return { role: "system", content: input.system, providerOptions: input.systemProviderOptions };
}

export async function runBackendModelStep(input: {
  model: LanguageModel;
  system: string;
  systemProviderOptions?: ProviderOptions;
  messages: ModelMessage[];
  tools: ReturnType<typeof createBackendPlanningTools>;
  toolChoice: "auto";
  stopWhen: ReturnType<typeof stepCountIs>;
  maxRetries: number;
  temperature: number | undefined;
  timeout: number;
  onTextDelta?: (text: string) => void | Promise<void>;
}): Promise<ModelResultLike> {
  if (!input.onTextDelta) {
    return generateText({
      model: input.model,
      instructions: instructionsFor(input),
      messages: input.messages,
      tools: input.tools,
      toolChoice: input.toolChoice,
      stopWhen: input.stopWhen,
      maxRetries: input.maxRetries,
      temperature: input.temperature,
      timeout: input.timeout
    });
  }

  const result = streamText({
    model: input.model,
    instructions: instructionsFor(input),
    messages: input.messages,
    tools: input.tools,
    toolChoice: input.toolChoice,
    stopWhen: input.stopWhen,
    maxRetries: input.maxRetries,
    temperature: input.temperature,
    timeout: input.timeout
  });
  for await (const part of result.fullStream) {
    if (part.type === "text-delta" && part.text) await input.onTextDelta(part.text);
  }
  return {
    toolCalls: await result.toolCalls,
    text: await result.text,
    totalUsage: await result.totalUsage
  };
}

export function createBackendLanguageModel(config: AgentModelConfig): LanguageModel {
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
  throw new Error(`Unsupported model provider: ${config.provider}`);
}
