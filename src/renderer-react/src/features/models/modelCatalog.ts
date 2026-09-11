import { AGENT_MODEL_REGISTRY, type AgentModelCapability, type AgentModelDefinition } from "@geochat-ai/app/model-registry";

/**
 * The desktop build has no hosted model catalog.
 *
 * The web build fetched /api/models with a bearer token and filtered it by
 * market policy. Here the catalog is the local registry that the settings UI
 * also reads, and what a user can actually run is decided by which provider
 * keys they have configured — not by a tier.
 */
export type RuntimeModelOption = Pick<
  AgentModelDefinition,
  "provider" | "id" | "label" | "capabilities" | "maxToolSteps" | "defaultTemperature"
>;

export const LOCAL_MODEL_OPTIONS: RuntimeModelOption[] = AGENT_MODEL_REGISTRY.map((model) => ({
  provider: model.provider,
  id: model.id,
  label: model.label,
  capabilities: [...model.capabilities],
  maxToolSteps: model.maxToolSteps,
  defaultTemperature: model.defaultTemperature
}));

export function loadModelCatalog(): RuntimeModelOption[] {
  return LOCAL_MODEL_OPTIONS;
}

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
    defaultTemperature: value.defaultTemperature
  };
}

/**
 * Retained because a user can supply a custom model registry through desktop
 * settings, and that payload has to be validated before it is trusted.
 */
export function parseModelCatalog(value: unknown): RuntimeModelOption[] | undefined {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.models)) return undefined;
  const models = value.models.map(parseModel).filter((model): model is RuntimeModelOption => Boolean(model));
  return models.length > 0 ? models : undefined;
}
