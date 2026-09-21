import {
  AGENT_PROVIDER_REGISTRY,
  getAgentProviderDefinition,
  type AgentModelProtocol,
  type AgentModelProvider
} from "./model-registry";

/**
 * Ask a provider which models it currently serves.
 *
 * A hand-maintained registry goes stale silently, and the failure is invisible
 * until a run errors: DeepSeek retired `deepseek-v4-flash` and began winding
 * down `deepseek-v4-pro` while both were still listed here as current.
 *
 * Discovery **supplements** the registry, it does not replace it. None of these
 * endpoints report whether a model can read images or call tools, and those
 * are what decide whether this app can use a model at all. So the registry
 * stays the source of truth for capability, and discovery answers a different
 * question: what is still on offer, and what is new.
 */
export type AgentModelListRequest = {
  url: string;
  method: "GET";
  headers: Record<string, string>;
};

/** How a provider exposes its catalog, relative to the base URL it is configured with. */
type ProviderDiscovery = {
  /** Appended to the base URL. Providers whose base already ends in a version segment use "/models". */
  path: string;
  /** The key is sent in a header, or as a query parameter for providers that want it there. */
  auth: (apiKey: string) => { headers?: Record<string, string>; query?: Record<string, string> };
  /** Pull model ids out of whatever shape the provider answers with. */
  parse: (payload: unknown) => string[];
};

const OPENAI_COMPATIBLE: Pick<ProviderDiscovery, "auth" | "parse"> = {
  auth: (apiKey) => ({ headers: { authorization: `Bearer ${apiKey}` } }),
  parse: (payload) => readIds(payload, "data", (entry) => stringField(entry, "id"))
};

const PROVIDER_DISCOVERY: Record<AgentModelProvider, ProviderDiscovery> = {
  // Base is the bare origin; DeepSeek serves the catalog off the root.
  deepseek: { path: "/models", ...OPENAI_COMPATIBLE },
  openai: { path: "/v1/models", ...OPENAI_COMPATIBLE },
  // Base already carries /api/v1.
  openrouter: { path: "/models", ...OPENAI_COMPATIBLE },
  // Base already carries /compatible-mode/v1.
  qwen: { path: "/models", ...OPENAI_COMPATIBLE },
  anthropic: {
    path: "/v1/models",
    auth: (apiKey) => ({ headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } }),
    parse: (payload) => readIds(payload, "data", (entry) => stringField(entry, "id"))
  },
  google: {
    path: "/v1beta/models",
    auth: (apiKey) => ({ query: { key: apiKey } }),
    // Gemini returns fully-qualified resource names; the model id is the leaf.
    parse: (payload) => readIds(payload, "models", (entry) => {
      const name = stringField(entry, "name");
      return name ? name.replace(/^models\//, "") : null;
    })
  }
};

const CUSTOM_PROVIDER_DISCOVERY: Record<AgentModelProtocol, ProviderDiscovery> = {
  "openai-compatible": { path: "/models", ...OPENAI_COMPATIBLE },
  anthropic: {
    path: "/v1/models",
    auth: (apiKey) => ({ headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } }),
    parse: (payload) => readIds(payload, "data", (entry) => stringField(entry, "id"))
  },
  google: {
    path: "/v1beta/models",
    auth: (apiKey) => ({ query: { key: apiKey } }),
    parse: (payload) => readIds(payload, "models", (entry) => {
      const name = stringField(entry, "name");
      return name ? name.replace(/^models\//, "") : null;
    })
  }
};

export function agentModelListRequest(input: {
  provider: string;
  apiKey: string;
  customBaseUrl?: string;
  protocol?: AgentModelProtocol;
}): AgentModelListRequest | null {
  const definition = getAgentProviderDefinition(input.provider);
  const discovery = input.provider === "custom" && input.protocol
    ? CUSTOM_PROVIDER_DISCOVERY[input.protocol]
    : PROVIDER_DISCOVERY[input.provider as AgentModelProvider];
  if (!discovery || (!definition && input.provider !== "custom")) return null;
  const apiKey = input.apiKey.trim();
  if (!apiKey) return null;
  const base = (input.customBaseUrl?.trim() || definition?.defaultBaseUrl || "").replace(/\/+$/, "");
  if (!base) return null;
  const { headers = {}, query } = discovery.auth(apiKey);
  const url = appendProviderPath(base, discovery.path);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return { url: url.toString(), method: "GET", headers: { accept: "application/json", ...headers } };
}

function appendProviderPath(base: string, path: string) {
  const baseUrl = new URL(base);
  const baseSegments = baseUrl.pathname.split("/").filter(Boolean);
  const pathSegments = path.split("/").filter(Boolean);
  let overlap = Math.min(baseSegments.length, pathSegments.length);
  while (overlap > 0) {
    const baseSuffix = baseSegments.slice(-overlap).join("/");
    const pathPrefix = pathSegments.slice(0, overlap).join("/");
    if (baseSuffix === pathPrefix) break;
    overlap -= 1;
  }
  baseUrl.pathname = `/${[...baseSegments, ...pathSegments.slice(overlap)].join("/")}`;
  return baseUrl;
}

export function parseAgentModelListResponse(provider: string, payload: unknown, protocol?: AgentModelProtocol): string[] {
  const discovery = provider === "custom" && protocol
    ? CUSTOM_PROVIDER_DISCOVERY[protocol]
    : PROVIDER_DISCOVERY[provider as AgentModelProvider];
  if (!discovery) return [];
  return discovery.parse(payload);
}

export type AgentModelAvailability = "registered" | "discovered" | "retired";

export type AgentModelCatalogEntry = {
  id: string;
  label: string;
  provider: string;
  availability: AgentModelAvailability;
};

/**
 * Fold a discovery result into the registry's entries for one provider.
 *
 * - `registered`: in both. The registry's curated metadata applies.
 * - `discovered`: the provider offers it and the registry does not know it.
 *   Usable, but nothing here knows its capabilities, so a caller must treat it
 *   conservatively rather than assume tool calling or image input.
 * - `retired`: the registry lists it and the provider no longer does. Kept
 *   visible on purpose — silently dropping the model a user has selected is
 *   how they end up staring at a run that fails for no stated reason.
 *
 * An empty or failed discovery must be passed as `null`, not as `[]`. A
 * provider that could not be reached has not told us anything, and marking the
 * whole catalog retired on a network blip would be worse than being stale.
 */
export function mergeDiscoveredAgentModels(input: {
  provider: string;
  registered: readonly { id: string; label: string }[];
  discoveredIds: readonly string[] | null;
}): AgentModelCatalogEntry[] {
  const { provider, registered } = input;
  if (!input.discoveredIds) {
    return registered.map((model) => ({ ...model, provider, availability: "registered" as const }));
  }
  const discovered = new Set(input.discoveredIds);
  const known = new Set(registered.map((model) => model.id));
  const entries: AgentModelCatalogEntry[] = registered.map((model) => ({
    ...model,
    provider,
    availability: discovered.has(model.id) ? ("registered" as const) : ("retired" as const)
  }));
  for (const id of input.discoveredIds) {
    if (known.has(id)) continue;
    entries.push({ id, label: id, provider, availability: "discovered" });
  }
  return entries;
}

export function isDiscoverableAgentProvider(provider: string) {
  return provider in PROVIDER_DISCOVERY;
}

export const DISCOVERABLE_AGENT_PROVIDERS = AGENT_PROVIDER_REGISTRY
  .map((provider) => provider.id)
  .filter((id) => id in PROVIDER_DISCOVERY);

function readIds(payload: unknown, key: string, pick: (entry: Record<string, unknown>) => string | null) {
  if (!payload || typeof payload !== "object") return [];
  const list = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(list)) return [];
  const ids: string[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const id = pick(entry as Record<string, unknown>);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function stringField(entry: Record<string, unknown>, key: string) {
  const value = entry[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
