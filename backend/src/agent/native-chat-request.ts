import {
  agentModelSupportsReasoning,
  getAgentModelPolicy,
  isAgentModelConfig,
  normalizeAgentRunThinkingEffort,
  type AgentModelConfig,
} from "@geochat-ai/app";
import type { UIMessage } from "ai";

export type NativeChatRequest = Readonly<{
  messages: UIMessage[];
  runId: string;
  conversationId: string;
  model: AgentModelConfig;
  locale: "zh-CN" | "en-US";
  thinking: boolean;
  thinkingEffort?: "light" | "standard" | "extended" | null;
}>;

export function isNativeChatRequest(value: unknown): value is NativeChatRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const model = payload.model && typeof payload.model === "object" && !Array.isArray(payload.model)
    ? payload.model as Record<string, unknown>
    : undefined;
  if (!model || hasForbiddenTransportFields(payload) || hasForbiddenTransportFields(model)) return false;
  return (
    Array.isArray(payload.messages) &&
    typeof payload.runId === "string" && Boolean(payload.runId.trim()) &&
    typeof payload.conversationId === "string" && Boolean(payload.conversationId.trim()) &&
    isAgentModelConfig(payload.model) &&
    (payload.locale === "zh-CN" || payload.locale === "en-US") &&
    typeof payload.thinking === "boolean" &&
    (payload.thinkingEffort === undefined || payload.thinkingEffort === null || normalizeAgentRunThinkingEffort(payload.thinkingEffort) !== null)
  );
}

export function validateNativeChatModelPolicy(input: NativeChatRequest) {
  const policy = getAgentModelPolicy(input.model);
  if (!policy.supportsTools) return `The current model is not declared as tool-calling capable: ${input.model.provider}/${input.model.model}`;
  if (input.thinking && !agentModelSupportsReasoning(input.model.provider, input.model.model)) {
    return `Reasoning mode is not supported by the configured model: ${input.model.provider}/${input.model.model}`;
  }
  return undefined;
}

export function nativeMessageText(message: UIMessage) {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function nativeUserMessageFingerprint(message: UIMessage) {
  const serialized = JSON.stringify(message.parts.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "file") return { type: "file", mediaType: part.mediaType, url: part.url, filename: part.filename ?? null };
    return { type: part.type };
  }));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function hasForbiddenTransportFields(payload: Record<string, unknown>) {
  return ["apiKey", "customBaseUrl", "url", "headers"].some((field) => field in payload);
}
