import { describe, expect, test } from "bun:test";
import {
  agentModelListRequest,
  mergeDiscoveredAgentModels,
  parseAgentModelListResponse,
  DISCOVERABLE_AGENT_PROVIDERS
} from "../packages/app/src/model-discovery";
import { AGENT_PROVIDER_REGISTRY } from "../packages/app/src/model-registry";

describe("agent model discovery requests", () => {
  test("every registered provider is discoverable", () => {
    expect([...DISCOVERABLE_AGENT_PROVIDERS].sort())
      .toEqual(AGENT_PROVIDER_REGISTRY.map((provider) => provider.id).sort());
  });

  test("appends the version segment only for providers whose base URL lacks one", () => {
    // Base URLs differ in shape across providers, and getting this wrong is a
    // 404 rather than a type error, so each one is pinned.
    expect(agentModelListRequest({ provider: "deepseek", apiKey: "k" })?.url)
      .toBe("https://api.deepseek.com/models");
    expect(agentModelListRequest({ provider: "openai", apiKey: "k" })?.url)
      .toBe("https://api.openai.com/v1/models");
    expect(agentModelListRequest({ provider: "anthropic", apiKey: "k" })?.url)
      .toBe("https://api.anthropic.com/v1/models");
    expect(agentModelListRequest({ provider: "openrouter", apiKey: "k" })?.url)
      .toBe("https://openrouter.ai/api/v1/models");
    expect(agentModelListRequest({ provider: "qwen", apiKey: "k" })?.url)
      .toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/models");
  });

  test("carries the key the way each provider expects it", () => {
    expect(agentModelListRequest({ provider: "deepseek", apiKey: "k" })?.headers.authorization).toBe("Bearer k");
    const anthropic = agentModelListRequest({ provider: "anthropic", apiKey: "k" })?.headers;
    expect(anthropic?.["x-api-key"]).toBe("k");
    expect(anthropic?.["anthropic-version"]).toBe("2023-06-01");
    // Gemini takes the key as a query parameter and no auth header.
    const google = agentModelListRequest({ provider: "google", apiKey: "k" });
    expect(google?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models?key=k");
    expect(google?.headers.authorization).toBeUndefined();
  });

  test("honours a custom base URL and trims its trailing slash", () => {
    expect(agentModelListRequest({ provider: "openai", apiKey: "k", customBaseUrl: "https://llm.local/v1/" })?.url)
      .toBe("https://llm.local/v1/v1/models");
    expect(agentModelListRequest({ provider: "deepseek", apiKey: "k", customBaseUrl: "https://mirror.test/" })?.url)
      .toBe("https://mirror.test/models");
  });

  test("declines without a key or for an unknown provider", () => {
    expect(agentModelListRequest({ provider: "deepseek", apiKey: "   " })).toBeNull();
    expect(agentModelListRequest({ provider: "nope", apiKey: "k" })).toBeNull();
  });
});

describe("agent model discovery responses", () => {
  test("reads OpenAI-shaped catalogs", () => {
    expect(parseAgentModelListResponse("deepseek", {
      object: "list",
      data: [{ id: "deepseek-flash" }, { id: "deepseek-v4-pro" }]
    })).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
  });

  test("strips Gemini's resource prefix", () => {
    expect(parseAgentModelListResponse("google", {
      models: [{ name: "models/gemini-3-pro" }, { name: "models/gemini-3-flash" }]
    })).toEqual(["gemini-3-pro", "gemini-3-flash"]);
  });

  test("survives shapes it does not recognise", () => {
    for (const payload of [null, undefined, {}, { data: "nope" }, { data: [null, 5, {}] }, "text"]) {
      expect(parseAgentModelListResponse("openai", payload)).toEqual([]);
    }
  });

  test("drops duplicates", () => {
    expect(parseAgentModelListResponse("openai", { data: [{ id: "a" }, { id: "a" }, { id: "b" }] }))
      .toEqual(["a", "b"]);
  });
});

describe("merging discovery into the registry", () => {
  const registered = [{ id: "deepseek-flash", label: "DeepSeek V4.1 Flash" }, { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" }];

  test("marks a registry entry the provider no longer offers as retired", () => {
    const merged = mergeDiscoveredAgentModels({
      provider: "deepseek",
      registered,
      discoveredIds: ["deepseek-flash"]
    });
    expect(merged.find((entry) => entry.id === "deepseek-flash")?.availability).toBe("registered");
    expect(merged.find((entry) => entry.id === "deepseek-v4-pro")?.availability).toBe("retired");
  });

  test("keeps a retired entry visible rather than dropping it", () => {
    // Dropping the model a user already selected leaves them with a run that
    // fails for no stated reason.
    const merged = mergeDiscoveredAgentModels({ provider: "deepseek", registered, discoveredIds: [] });
    expect(merged).toHaveLength(2);
    expect(merged.every((entry) => entry.availability === "retired")).toBe(true);
  });

  test("adds models the provider offers that the registry does not know", () => {
    const merged = mergeDiscoveredAgentModels({
      provider: "deepseek",
      registered,
      discoveredIds: ["deepseek-flash", "deepseek-v4-pro", "deepseek-v5-preview"]
    });
    const discovered = merged.find((entry) => entry.id === "deepseek-v5-preview");
    expect(discovered?.availability).toBe("discovered");
    expect(discovered?.label).toBe("deepseek-v5-preview");
  });

  test("a failed discovery changes nothing, and never retires the whole catalog", () => {
    // null means "the provider did not answer", which is not the same as
    // "the provider offers nothing".
    const merged = mergeDiscoveredAgentModels({ provider: "deepseek", registered, discoveredIds: null });
    expect(merged.every((entry) => entry.availability === "registered")).toBe(true);
  });
});
