import type { AgentModelProvider } from "./model-registry";
import type { AgentRunThinkingEffort } from "./run-ledger";

/**
 * Turn one product-level choice into each provider's own reasoning dial.
 *
 * The UI offers three levels because that is as much as a user can meaningfully
 * decide. Providers disagree on both the vocabulary and the unit — Anthropic
 * and Qwen want a token budget, OpenAI and OpenRouter want a named effort,
 * Google takes either, DeepSeek takes a mode plus an effort. Mapping in one
 * place keeps that disagreement out of the native agent.
 *
 * Shapes here are written against the installed provider packages, not from
 * memory: an unrecognised key is silently dropped by the SDK, so a plausible
 * guess would look exactly like a working feature while changing nothing.
 */
/**
 * Structurally the same JSON shape the AI SDK accepts for provider options.
 * Declared here rather than imported so the shared package keeps no dependency
 * on the SDK, and kept exact rather than `unknown` so a non-serialisable value
 * is a compile error instead of a runtime surprise.
 */
export type AgentThinkingJsonValue =
  | null
  | boolean
  | number
  | string
  | AgentThinkingJsonValue[]
  | { [key: string]: AgentThinkingJsonValue };

export type AgentThinkingProviderOptions = Record<string, Record<string, AgentThinkingJsonValue>>;

export type AgentThinkingRequest = {
  provider: string;
  enabled: boolean;
  effort: AgentRunThinkingEffort;
};

/** Anthropic requires at least 1024 and recommends starting at 2048. */
const ANTHROPIC_BUDGET: Record<AgentRunThinkingEffort, number> = {
  light: 2048,
  standard: 8192,
  extended: 24576
};

const QWEN_BUDGET: Record<AgentRunThinkingEffort, number> = {
  light: 1024,
  standard: 4096,
  extended: 16384
};

const GOOGLE_BUDGET: Record<AgentRunThinkingEffort, number> = {
  light: 2048,
  standard: 8192,
  extended: 24576
};

/** OpenAI, OpenRouter and DeepSeek all name their levels; the names differ. */
const NAMED_EFFORT: Record<AgentRunThinkingEffort, "low" | "medium" | "high"> = {
  light: "low",
  standard: "medium",
  extended: "high"
};

/** DeepSeek V4 documents low / high / max, with no medium. */
const DEEPSEEK_EFFORT: Record<AgentRunThinkingEffort, "low" | "high" | "max"> = {
  light: "low",
  standard: "high",
  extended: "max"
};

export function agentThinkingProviderOptions(
  request: AgentThinkingRequest
): AgentThinkingProviderOptions | undefined {
  const provider = request.provider as AgentModelProvider;
  const effort = request.effort;

  if (provider === "anthropic") {
    return {
      anthropic: request.enabled
        ? { thinking: { type: "enabled", budgetTokens: ANTHROPIC_BUDGET[effort] } }
        : { thinking: { type: "disabled" } }
    };
  }

  if (provider === "openai") {
    // "none" is a real value for OpenAI, so disabling is expressible rather
    // than merely omitted.
    return { openai: { reasoningEffort: request.enabled ? NAMED_EFFORT[effort] : "none" } };
  }

  if (provider === "google") {
    return {
      google: request.enabled
        ? { thinkingConfig: { thinkingBudget: GOOGLE_BUDGET[effort], includeThoughts: true } }
        : { thinkingConfig: { thinkingBudget: 0 } }
    };
  }

  if (provider === "deepseek") {
    // V4 models think by default, so switching it off has to be explicit —
    // omitting the option would leave thinking on for a user who turned it off.
    return request.enabled
      ? { deepseek: { thinking: { type: "enabled" }, reasoningEffort: DEEPSEEK_EFFORT[effort] } }
      : { deepseek: { thinking: { type: "disabled" } } };
  }

  if (provider === "openrouter") {
    return {
      openrouter: request.enabled
        ? { reasoning: { enabled: true, effort: NAMED_EFFORT[effort] } }
        : { reasoning: { enabled: false, exclude: true, effort: "none" } }
    };
  }

  if (provider === "qwen") {
    return {
      alibaba: request.enabled
        ? { enableThinking: true, thinkingBudget: QWEN_BUDGET[effort] }
        : { enableThinking: false }
    };
  }

  return undefined;
}

/** Return a bounded, user-facing summary for collapsed reasoning previews. */
export function summarizeAgentReasoning(text: string, maxLength = 180): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  const first = lines[0];
  const latest = lines.at(-1) ?? first;
  const candidate = latest !== first && latest.length < 100 ? `${first} · ${latest}` : first;
  if (candidate.length <= maxLength) return candidate;
  return `${candidate.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}
