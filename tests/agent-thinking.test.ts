import { describe, expect, test } from "bun:test";
import { agentThinkingProviderOptions } from "../packages/app/src/agent-thinking";
import {
  createAgentRunLedger,
  isAgentRunLedgerRecord,
  normalizeAgentRunThinkingEffort
} from "../packages/app/src/run-ledger";
import { AGENT_PROVIDER_REGISTRY } from "../packages/app/src/model-registry";

describe("thinking effort normalization", () => {
  test("accepts the three levels and rejects everything else", () => {
    expect(normalizeAgentRunThinkingEffort("light")).toBe("light");
    expect(normalizeAgentRunThinkingEffort("standard")).toBe("standard");
    expect(normalizeAgentRunThinkingEffort("extended")).toBe("extended");
    for (const value of ["medium", "max", "", null, undefined, 3, {}]) {
      expect(normalizeAgentRunThinkingEffort(value)).toBeNull();
    }
  });
});

describe("thinking provider options", () => {
  test("every registered provider has a mapping", () => {
    // A provider with no mapping silently ignores the setting, which is the
    // failure mode this whole module exists to prevent.
    for (const provider of AGENT_PROVIDER_REGISTRY) {
      expect(agentThinkingProviderOptions({ provider: provider.id, enabled: true, effort: "standard" }))
        .toBeDefined();
    }
  });

  test("maps each provider onto its own dial", () => {
    expect(agentThinkingProviderOptions({ provider: "anthropic", enabled: true, effort: "light" }))
      .toEqual({ anthropic: { thinking: { type: "enabled", budgetTokens: 2048 } } });
    expect(agentThinkingProviderOptions({ provider: "openai", enabled: true, effort: "extended" }))
      .toEqual({ openai: { reasoningEffort: "high" } });
    expect(agentThinkingProviderOptions({ provider: "google", enabled: true, effort: "standard" }))
      .toEqual({ google: { thinkingConfig: { thinkingBudget: 8192, includeThoughts: true } } });
    expect(agentThinkingProviderOptions({ provider: "openrouter", enabled: true, effort: "standard" }))
      .toEqual({ openrouter: { reasoning: { enabled: true, effort: "medium" } } });
    expect(agentThinkingProviderOptions({ provider: "qwen", enabled: true, effort: "extended" }))
      .toEqual({ alibaba: { enableThinking: true, thinkingBudget: 16384 } });
  });

  test("DeepSeek uses its own three levels, which skip medium", () => {
    expect(agentThinkingProviderOptions({ provider: "deepseek", enabled: true, effort: "light" }))
      .toEqual({ deepseek: { thinking: { type: "enabled" }, reasoningEffort: "low" } });
    expect(agentThinkingProviderOptions({ provider: "deepseek", enabled: true, effort: "standard" }))
      .toEqual({ deepseek: { thinking: { type: "enabled" }, reasoningEffort: "high" } });
    expect(agentThinkingProviderOptions({ provider: "deepseek", enabled: true, effort: "extended" }))
      .toEqual({ deepseek: { thinking: { type: "enabled" }, reasoningEffort: "max" } });
  });

  test("disabling is stated, never merely omitted", () => {
    // DeepSeek V4 and several others think by default. Leaving the option out
    // would leave reasoning on for a user who switched it off.
    for (const provider of AGENT_PROVIDER_REGISTRY) {
      const options = agentThinkingProviderOptions({ provider: provider.id, enabled: false, effort: "standard" });
      expect(options).toBeDefined();
      expect(JSON.stringify(options)).not.toBe("{}");
    }
    expect(agentThinkingProviderOptions({ provider: "deepseek", enabled: false, effort: "standard" }))
      .toEqual({ deepseek: { thinking: { type: "disabled" } } });
    expect(agentThinkingProviderOptions({ provider: "anthropic", enabled: false, effort: "standard" }))
      .toEqual({ anthropic: { thinking: { type: "disabled" } } });
    expect(agentThinkingProviderOptions({ provider: "google", enabled: false, effort: "standard" }))
      .toEqual({ google: { thinkingConfig: { thinkingBudget: 0 } } });
  });

  test("anthropic never drops below its documented 1024 minimum", () => {
    for (const effort of ["light", "standard", "extended"] as const) {
      const options = agentThinkingProviderOptions({ provider: "anthropic", enabled: true, effort });
      const thinking = options?.anthropic?.thinking as { budgetTokens: number };
      expect(thinking.budgetTokens).toBeGreaterThanOrEqual(1024);
    }
  });

  test("an unknown provider yields nothing rather than a wrong guess", () => {
    expect(agentThinkingProviderOptions({ provider: "nope", enabled: true, effort: "standard" })).toBeUndefined();
  });
});

describe("thinking on the run ledger", () => {
  const base = {
    runId: "run_abc",
    conversationId: "conv_abc",
    prompt: "draw a square",
    attachmentCount: 0
  };

  test("records what the run started with", () => {
    const record = createAgentRunLedger({
      ...base,
      model: { provider: "deepseek", model: "deepseek-flash", apiKey: "k", customBaseUrl: "" },
      thinking: true,
      thinkingEffort: "extended"
    });
    expect(record.thinking).toBe(true);
    expect(record.thinkingEffort).toBe("extended");
    expect(isAgentRunLedgerRecord(record)).toBe(true);
  });

  test("defaults to off, and drops an effort it does not recognise", () => {
    const record = createAgentRunLedger({
      ...base,
      model: { provider: "deepseek", model: "deepseek-flash", apiKey: "k", customBaseUrl: "" },
      thinkingEffort: "medium" as never
    });
    expect(record.thinking).toBeNull();
    expect(record.thinkingEffort).toBeNull();
  });

});
