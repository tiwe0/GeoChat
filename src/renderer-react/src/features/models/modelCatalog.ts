import { PLATFORM_MODEL_CATALOG, type AgentModelCapability } from "@geogebra-copilot/shared/contracts";
import type { AgentModelDefinition } from "@geogebra-copilot/shared/model-registry";

export type RuntimeModelOption = Pick<AgentModelDefinition, "provider" | "id" | "label" | "capabilities" | "maxToolSteps" | "defaultTemperature">;

const ALL_FALLBACK_MODEL_OPTIONS: RuntimeModelOption[] = PLATFORM_MODEL_CATALOG.map((model) => ({
  provider: model.provider,
  id: model.id,
  label: model.label,
  capabilities: [...model.capabilities],
  maxToolSteps: model.maxToolSteps,
  defaultTemperature: model.defaultTemperature,
}));

/**
 * Keep the offline catalog aligned with the Web product's market policy.
 * The server remains authoritative, but a failed catalog request must not
 * make the China Web UI offer models that only belong to the overseas tier.
 */
export function fallbackModelOptionsForMarket(market: "global" | "cn"): RuntimeModelOption[] {
  const allowedIds = market === "cn"
    ? new Set(["deepseek-v4-flash-vision-exp"])
    : new Set(["deepseek-v4-flash-vision-exp", "gpt-5.6-terra"]);
  return ALL_FALLBACK_MODEL_OPTIONS.filter((model) => allowedIds.has(model.id));
}

// Retain the full catalog export for consumers that use it as a parser fixture.
export const FALLBACK_MODEL_OPTIONS: RuntimeModelOption[] = ALL_FALLBACK_MODEL_OPTIONS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCapability(value: unknown): value is AgentModelCapability {
  return value === "text" || value === "imageInput" || value === "toolCalling";
}

function parseModel(value: unknown): RuntimeModelOption | undefined {
  if (!isRecord(value)) return undefined;
  const capabilities = value.capabilities;
  if (
    typeof value.provider !== "string" || !value.provider.trim() ||
    typeof value.id !== "string" || !value.id.trim() ||
    typeof value.label !== "string" || !value.label.trim() ||
    !Array.isArray(capabilities) || capabilities.length === 0 || !capabilities.every(isCapability) ||
    typeof value.maxToolSteps !== "number" || !Number.isFinite(value.maxToolSteps) ||
    typeof value.defaultTemperature !== "number" || !Number.isFinite(value.defaultTemperature)
  ) return undefined;
  return {
    provider: value.provider,
    id: value.id,
    label: value.label,
    capabilities: [...capabilities],
    maxToolSteps: value.maxToolSteps,
    defaultTemperature: value.defaultTemperature,
  };
}

export function parseModelCatalog(value: unknown): RuntimeModelOption[] | undefined {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.models)) return undefined;
  const models = value.models.map(parseModel).filter((model): model is RuntimeModelOption => Boolean(model));
  return models.length > 0 ? models : undefined;
}

export async function fetchModelCatalog(apiOrigin: string, token?: string | null, signal?: AbortSignal): Promise<RuntimeModelOption[]> {
  const market = import.meta.env.VITE_PRODUCT_MARKET === "cn" ? "cn" : "global";
  const response = await fetch(new URL("/api/models", apiOrigin), {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-client-channel": "web-geochatpro",
      "x-product-market": market,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });
  if (!response.ok) throw new Error(`Model catalog request failed (${response.status}).`);
  const parsed = parseModelCatalog(await response.json());
  if (!parsed) throw new Error("Model catalog response was invalid.");
  return parsed;
}
