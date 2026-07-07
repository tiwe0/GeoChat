export type AgentModelProvider = "deepseek" | "openai" | "anthropic" | "google" | "openrouter" | "qwen";

export type AgentModelCapability = "text" | "imageInput" | "toolCalling";
export type AgentToolCallingMode = "native" | "assumed" | "unsupported";

export type AgentModelConfig = {
  provider: string;
  model: string;
  apiKey: string;
  customBaseUrl: string;
  maxToolSteps?: number | null;
};

export type AgentProviderDefinition = {
  id: string;
  label: string;
  defaultBaseUrl: string;
  allowedHosts: readonly string[];
};

export type AgentModelDefinition = {
  provider: string;
  id: string;
  label: string;
  capabilities: readonly AgentModelCapability[];
  maxToolSteps: number;
  defaultTemperature: number;
};

export type AgentModelOption = {
  value: string;
  label: string;
  supportsImages: boolean;
  supportsTools: boolean;
  toolCallingMode: AgentToolCallingMode;
};

export type AgentModelPolicy = {
  definition?: AgentModelDefinition;
  supportsImages: boolean;
  supportsTools: boolean;
  toolCallingMode: AgentToolCallingMode;
  maxToolSteps: number;
  defaultTemperature: number;
  isKnownModel: boolean;
  isCustomModel: boolean;
};

export type AgentModelPolicySnapshot = {
  provider: string;
  model: string;
  label: string | null;
  supportsImages: boolean;
  supportsTools: boolean;
  toolCallingMode: AgentToolCallingMode;
  maxToolSteps: number;
  defaultTemperature: number;
  isKnownModel: boolean;
  isCustomModel: boolean;
};

export type AgentModelRegistrySchema = {
  kind: "geochat-model-registry-schema";
  version: 1;
  providers: readonly AgentProviderDefinition[];
  models: readonly AgentModelDefinition[];
};

const CUSTOM_MODEL_MAX_TOOL_STEPS = 8;
export const MIN_AGENT_RUNNER_MAX_TOOL_STEPS = 1;
export const MAX_AGENT_RUNNER_MAX_TOOL_STEPS = 64;

export const AGENT_PROVIDER_REGISTRY = [
  {
    id: "deepseek",
    label: "DeepSeek（深度求索）",
    defaultBaseUrl: "https://api.deepseek.com",
    allowedHosts: ["api.deepseek.com"]
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com",
    allowedHosts: ["api.openai.com"]
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    defaultBaseUrl: "https://api.anthropic.com",
    allowedHosts: ["api.anthropic.com"]
  },
  {
    id: "google",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    allowedHosts: ["generativelanguage.googleapis.com"]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    allowedHosts: ["openrouter.ai"]
  },
  {
    id: "qwen",
    label: "通义千问（阿里云百炼）",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    allowedHosts: ["dashscope.aliyuncs.com", "dashscope-us.aliyuncs.com"]
  }
] as const satisfies readonly AgentProviderDefinition[];

export const AGENT_MODEL_REGISTRY = [
  {
    provider: "deepseek",
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    capabilities: ["text", "toolCalling"],
    maxToolSteps: 24,
    defaultTemperature: 0.2
  },
  {
    provider: "deepseek",
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    capabilities: ["text", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  },
  {
    provider: "openai",
    id: "gpt-5.5",
    label: "GPT-5.5",
    capabilities: ["text", "imageInput", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  },
  {
    provider: "openai",
    id: "gpt-5.4",
    label: "GPT-5.4",
    capabilities: ["text", "imageInput", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  },
  {
    provider: "openai",
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    capabilities: ["text", "imageInput", "toolCalling"],
    maxToolSteps: 12,
    defaultTemperature: 0.2
  },
  {
    provider: "openai",
    id: "gpt-4.1",
    label: "GPT-4.1",
    capabilities: ["text", "imageInput", "toolCalling"],
    maxToolSteps: 12,
    defaultTemperature: 0.2
  },
  {
    provider: "anthropic",
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    capabilities: ["text", "imageInput", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  },
  {
    provider: "anthropic",
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    capabilities: ["text", "imageInput", "toolCalling"],
    maxToolSteps: 12,
    defaultTemperature: 0.2
  },
  {
    provider: "anthropic",
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    capabilities: ["text", "imageInput", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  },
  {
    provider: "google",
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    capabilities: ["text", "imageInput", "toolCalling"],
    maxToolSteps: 12,
    defaultTemperature: 0.2
  },
  {
    provider: "google",
    id: "gemini-3.1-pro",
    label: "Gemini 3.1 Pro Preview",
    capabilities: ["text", "imageInput", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  },
  {
    provider: "google",
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    capabilities: ["text", "imageInput", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  },
  {
    provider: "openrouter",
    id: "openai/gpt-5.5",
    label: "OpenRouter GPT-5.5",
    capabilities: ["text", "imageInput", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  },
  {
    provider: "qwen",
    id: "qwen-plus",
    label: "Qwen Plus",
    capabilities: ["text", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  },
  {
    provider: "qwen",
    id: "qwen3.7-max",
    label: "Qwen 3.7 Max",
    capabilities: ["text", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  },
  {
    provider: "qwen",
    id: "qwen3.6-plus",
    label: "Qwen 3.6 Plus",
    capabilities: ["text", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  },
  {
    provider: "qwen",
    id: "qwen3.6-flash",
    label: "Qwen 3.6 Flash",
    capabilities: ["text", "toolCalling"],
    maxToolSteps: 12,
    defaultTemperature: 0.2
  },
  {
    provider: "qwen",
    id: "qwen-turbo",
    label: "Qwen Turbo",
    capabilities: ["text", "toolCalling"],
    maxToolSteps: 12,
    defaultTemperature: 0.2
  },
  {
    provider: "qwen",
    id: "qwen-math-plus",
    label: "Qwen Math Plus",
    capabilities: ["text", "toolCalling"],
    maxToolSteps: 16,
    defaultTemperature: 0.2
  }
] as const satisfies readonly AgentModelDefinition[];

const AGENT_MODEL_REGISTRY_SCHEMA_KIND = "geochat-model-registry-schema";
const AGENT_MODEL_REGISTRY_SCHEMA_VERSION = 1;
const AGENT_MODEL_CAPABILITIES = new Set<AgentModelCapability>(["text", "imageInput", "toolCalling"]);
const LOCAL_AGENT_PROVIDER_IDS = new Set<string>(AGENT_PROVIDER_REGISTRY.map((provider) => provider.id));

function cloneProviderDefinition(provider: AgentProviderDefinition): AgentProviderDefinition {
  return {
    id: provider.id,
    label: provider.label,
    defaultBaseUrl: provider.defaultBaseUrl,
    allowedHosts: [...provider.allowedHosts]
  };
}

function cloneModelDefinition(model: AgentModelDefinition): AgentModelDefinition {
  return {
    provider: model.provider,
    id: model.id,
    label: model.label,
    capabilities: [...model.capabilities],
    maxToolSteps: model.maxToolSteps,
    defaultTemperature: model.defaultTemperature
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isAgentModelCapabilityArray(value: unknown): value is AgentModelCapability[] {
  return isStringArray(value) && value.length > 0 && value.every((entry) => AGENT_MODEL_CAPABILITIES.has(entry as AgentModelCapability));
}

function isFiniteNumberInRange(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isAgentProviderDefinition(value: unknown): value is AgentProviderDefinition {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    Boolean(value.id.trim()) &&
    typeof value.label === "string" &&
    Boolean(value.label.trim()) &&
    typeof value.defaultBaseUrl === "string" &&
    Boolean(value.defaultBaseUrl.trim()) &&
    isStringArray(value.allowedHosts)
  );
}

function isAgentModelDefinition(value: unknown): value is AgentModelDefinition {
  if (!isRecord(value)) return false;
  return (
    typeof value.provider === "string" &&
    Boolean(value.provider.trim()) &&
    typeof value.id === "string" &&
    Boolean(value.id.trim()) &&
    typeof value.label === "string" &&
    Boolean(value.label.trim()) &&
    isAgentModelCapabilityArray(value.capabilities) &&
    isFiniteNumberInRange(value.maxToolSteps, 0, 64) &&
    isFiniteNumberInRange(value.defaultTemperature, 0, 2)
  );
}

export function createAgentModelRegistrySchema(): AgentModelRegistrySchema {
  return {
    kind: AGENT_MODEL_REGISTRY_SCHEMA_KIND,
    version: AGENT_MODEL_REGISTRY_SCHEMA_VERSION,
    providers: AGENT_PROVIDER_REGISTRY.map(cloneProviderDefinition),
    models: AGENT_MODEL_REGISTRY.map(cloneModelDefinition)
  };
}

export function isAgentModelRegistrySchema(value: unknown): value is AgentModelRegistrySchema {
  if (!isRecord(value)) return false;
  if (value.kind !== AGENT_MODEL_REGISTRY_SCHEMA_KIND || value.version !== AGENT_MODEL_REGISTRY_SCHEMA_VERSION) return false;
  if (!Array.isArray(value.providers) || !Array.isArray(value.models)) return false;
  if (!value.providers.length || !value.models.length) return false;
  if (!value.providers.every(isAgentProviderDefinition) || !value.models.every(isAgentModelDefinition)) return false;
  const providerIds = new Set(value.providers.map((provider) => provider.id));
  return value.models.every((model) => providerIds.has(model.provider));
}

export function normalizeAgentModelRegistrySchema(value: unknown): AgentModelRegistrySchema | undefined {
  if (!isAgentModelRegistrySchema(value)) return undefined;
  const providers = value.providers
    .filter((provider) => LOCAL_AGENT_PROVIDER_IDS.has(provider.id))
    .map(cloneProviderDefinition);
  const providerIds = new Set(providers.map((provider) => provider.id));
  const models = value.models
    .filter((model) => providerIds.has(model.provider))
    .map(normalizeRemoteModelDefinitionForLocalRuntime);
  if (!providers.length || !models.length) return undefined;
  return {
    kind: AGENT_MODEL_REGISTRY_SCHEMA_KIND,
    version: AGENT_MODEL_REGISTRY_SCHEMA_VERSION,
    providers,
    models
  };
}

function normalizeRemoteModelDefinitionForLocalRuntime(model: AgentModelDefinition): AgentModelDefinition {
  const localDefinition = AGENT_MODEL_REGISTRY.find((entry) => entry.provider === model.provider && entry.id === model.id);
  if (localDefinition) {
    return {
      ...cloneModelDefinition(model),
      capabilities: [...localDefinition.capabilities],
      maxToolSteps: localDefinition.maxToolSteps,
      defaultTemperature: localDefinition.defaultTemperature
    };
  }
  return {
    ...cloneModelDefinition(model),
    capabilities: ["text", "toolCalling"],
    maxToolSteps: CUSTOM_MODEL_MAX_TOOL_STEPS,
    defaultTemperature: 0.2
  };
}

function registryProviders(schema?: AgentModelRegistrySchema) {
  return schema?.providers ?? AGENT_PROVIDER_REGISTRY;
}

function registryModels(schema?: AgentModelRegistrySchema) {
  return schema?.models ?? AGENT_MODEL_REGISTRY;
}

export function getAgentProviderOptionsForSchema(schema?: AgentModelRegistrySchema) {
  return registryProviders(schema).map((provider) => ({ value: provider.id, label: provider.label }));
}

export function getAgentProviderOptions() {
  return getAgentProviderOptionsForSchema();
}

export function getAgentProviderDefinitionForSchema(provider: string, schema?: AgentModelRegistrySchema): AgentProviderDefinition | undefined {
  return registryProviders(schema).find((entry) => entry.id === provider);
}

export function getAgentProviderDefinition(provider: string): AgentProviderDefinition | undefined {
  return getAgentProviderDefinitionForSchema(provider);
}

export function getAgentProviderProxyPolicy(provider: string) {
  const definition = getAgentProviderDefinition(provider);
  return definition
    ? {
        provider: definition.id,
        defaultBaseUrl: definition.defaultBaseUrl,
        allowedHosts: definition.allowedHosts
      }
    : undefined;
}

export function getAgentModelDefinitionForSchema(provider: string, model: string, schema?: AgentModelRegistrySchema): AgentModelDefinition | undefined {
  return registryModels(schema).find((entry) => entry.provider === provider && entry.id === model);
}

export function getAgentModelDefinition(provider: string, model: string): AgentModelDefinition | undefined {
  return getAgentModelDefinitionForSchema(provider, model);
}

export function getAgentModelOptionsForSchema(provider: string, schema?: AgentModelRegistrySchema): AgentModelOption[] {
  return registryModels(schema).filter((entry) => entry.provider === provider).map((entry) => ({
    value: entry.id,
    label: entry.label,
    supportsImages: modelHasCapability(entry, "imageInput"),
    supportsTools: toolCallingModeSupportsTools(toolCallingModeForDefinition(entry)),
    toolCallingMode: toolCallingModeForDefinition(entry)
  }));
}

export function getAgentModelOptions(provider: string): AgentModelOption[] {
  return getAgentModelOptionsForSchema(provider);
}

export function getDefaultAgentModel(provider: string) {
  return getAgentModelOptions(provider)[0];
}

export function getDefaultAgentProvider() {
  return AGENT_PROVIDER_REGISTRY[0];
}

export function normalizeAgentModelConfig(value: Partial<AgentModelConfig> | undefined): AgentModelConfig {
  const defaultProvider = getDefaultAgentProvider();
  const hasKnownProvider = AGENT_PROVIDER_REGISTRY.some((entry) => entry.id === value?.provider);
  const provider = hasKnownProvider ? value!.provider! : defaultProvider.id;
  const modelOptions = getAgentModelOptions(provider);
  const defaultModel = modelOptions[0];
  const requestedModel = value?.model?.trim();
  const model = hasKnownProvider && requestedModel ? requestedModel : defaultModel.value;

  return {
    provider,
    model,
    apiKey: value?.apiKey ?? "",
    customBaseUrl: value?.customBaseUrl ?? "",
    maxToolSteps: normalizeAgentRunnerMaxToolSteps(value?.maxToolSteps)
  };
}

export function isAgentModelConfig(value: unknown): value is AgentModelConfig {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.provider === "string" &&
    typeof payload.model === "string" &&
    typeof payload.apiKey === "string" &&
    typeof payload.customBaseUrl === "string" &&
    isOptionalAgentRunnerMaxToolSteps(payload.maxToolSteps)
  );
}

export function modelHasCapability(model: AgentModelDefinition, capability: AgentModelCapability) {
  return model.capabilities.includes(capability);
}

export function agentModelSupportsImagesForSchema(provider: string, model: string, schema?: AgentModelRegistrySchema) {
  return getAgentModelPolicyForSchema({ provider, model }, schema).supportsImages;
}

export function agentModelSupportsImages(provider: string, model: string) {
  return agentModelSupportsImagesForSchema(provider, model);
}

export function agentModelSupportsTools(provider: string, model: string) {
  return getAgentModelPolicy({ provider, model }).supportsTools;
}

export function toolCallingModeSupportsTools(mode: AgentToolCallingMode) {
  return mode !== "unsupported";
}

export function toolCallingModeForDefinition(model: AgentModelDefinition): AgentToolCallingMode {
  return modelHasCapability(model, "toolCalling") ? "native" : "unsupported";
}

export function normalizeAgentRunnerMaxToolSteps(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  if (normalized < MIN_AGENT_RUNNER_MAX_TOOL_STEPS || normalized > MAX_AGENT_RUNNER_MAX_TOOL_STEPS) return null;
  return normalized;
}

function isOptionalAgentRunnerMaxToolSteps(value: unknown) {
  return value === undefined || value === null || normalizeAgentRunnerMaxToolSteps(value) === value;
}

function modelPolicyMaxToolSteps(defaultMaxToolSteps: number, config: Pick<AgentModelConfig, "maxToolSteps">) {
  return normalizeAgentRunnerMaxToolSteps(config.maxToolSteps) ?? defaultMaxToolSteps;
}

export function getAgentModelPolicyForSchema(config: Pick<AgentModelConfig, "provider" | "model"> & Partial<Pick<AgentModelConfig, "maxToolSteps">>, schema?: AgentModelRegistrySchema): AgentModelPolicy {
  const provider = getAgentProviderDefinitionForSchema(config.provider, schema);
  const definition = getAgentModelDefinitionForSchema(config.provider, config.model, schema);
  if (definition) {
    const toolCallingMode = toolCallingModeForDefinition(definition);
    return {
      definition,
      supportsImages: modelHasCapability(definition, "imageInput"),
      supportsTools: toolCallingModeSupportsTools(toolCallingMode),
      toolCallingMode,
      maxToolSteps: modelPolicyMaxToolSteps(definition.maxToolSteps, config),
      defaultTemperature: definition.defaultTemperature,
      isKnownModel: true,
      isCustomModel: false
    };
  }

  if (provider && config.model.trim()) {
    return {
      definition: undefined,
      supportsImages: false,
      supportsTools: true,
      toolCallingMode: "assumed",
      maxToolSteps: modelPolicyMaxToolSteps(CUSTOM_MODEL_MAX_TOOL_STEPS, config),
      defaultTemperature: 0.2,
      isKnownModel: false,
      isCustomModel: true
    };
  }

  return {
    definition: undefined,
    supportsImages: false,
    supportsTools: false,
    toolCallingMode: "unsupported",
    maxToolSteps: 0,
    defaultTemperature: 0.2,
    isKnownModel: false,
    isCustomModel: false
  };
}

export function getAgentModelPolicy(config: Pick<AgentModelConfig, "provider" | "model"> & Partial<Pick<AgentModelConfig, "maxToolSteps">>): AgentModelPolicy {
  return getAgentModelPolicyForSchema(config);
}

export function agentModelPolicySnapshotFor(config: Pick<AgentModelConfig, "provider" | "model"> & Partial<Pick<AgentModelConfig, "maxToolSteps">>): AgentModelPolicySnapshot {
  const policy = getAgentModelPolicy(config);
  return {
    provider: config.provider,
    model: config.model,
    label: policy.definition?.label ?? null,
    supportsImages: policy.supportsImages,
    supportsTools: policy.supportsTools,
    toolCallingMode: policy.toolCallingMode,
    maxToolSteps: policy.maxToolSteps,
    defaultTemperature: policy.defaultTemperature,
    isKnownModel: policy.isKnownModel,
    isCustomModel: policy.isCustomModel
  };
}

export function isAgentModelPolicySnapshot(value: unknown): value is AgentModelPolicySnapshot {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.provider === "string" &&
    typeof payload.model === "string" &&
    (payload.label === null || typeof payload.label === "string") &&
    typeof payload.supportsImages === "boolean" &&
    typeof payload.supportsTools === "boolean" &&
    ["native", "assumed", "unsupported"].includes(String(payload.toolCallingMode)) &&
    typeof payload.maxToolSteps === "number" &&
    typeof payload.defaultTemperature === "number" &&
    typeof payload.isKnownModel === "boolean" &&
    typeof payload.isCustomModel === "boolean"
  );
}
