import {
  DEFAULT_AGENT_MODEL_STEP_TIMEOUT_MS,
  MAX_AGENT_MODEL_STEP_TIMEOUT_MS,
  MIN_AGENT_MODEL_STEP_TIMEOUT_MS
} from "@geochat-ai/app/agent-run-config";
import {
  CUSTOM_AGENT_PROVIDER_ID,
  agentModelSupportsImagesForSchema,
  getAgentModelPolicyForSchema,
  normalizeAgentModelConfig,
  type AgentModelConfig,
  type AgentModelRegistrySchema
} from "@geochat-ai/app/model-registry";
import type {
  DesktopConfig,
  DebugConfig,
  CustomProviderConfig,
  ModelConfig,
  ProviderCredentialConfig,
  SkillConfig,
  InteractionConfig,
  VisualProfileName
} from "./workbench-types";
import {
  hasPlaintextCredentials,
  parseRawDesktopConfig
} from "./desktop-credentials";
import { detectPreferredLocale, type Locale } from "./locale";

export const CONFIG_STORAGE_KEY = "geochat-desktop-ui-config";
export const DESKTOP_CONFIG_SCHEMA_VERSION = 1 as const;
export const DESKTOP_CONFIG_CHANGED_EVENT = "geochat:desktop-config-changed";

export type DesktopConfigStorage = Pick<Storage, "getItem" | "setItem"> & {
  setItemDurable?(key: string, value: string): Promise<void>;
  acceptNativeValue?(key: string, value: string): void;
};

let installedConfigStorage: DesktopConfigStorage | null = null;
let flushInstalledConfigWrites: () => Promise<void> = async () => {};
let configMutationQueue: Promise<void> = Promise.resolve();

/**
 * Binds the synchronously readable startup mirror to the desktop config API.
 * The mirror must already be hydrated from native persistence before install.
 */
export function installDesktopConfigStorage(
  storage: DesktopConfigStorage,
  flushWrites: () => Promise<void> = async () => {},
) {
  installedConfigStorage = storage;
  flushInstalledConfigWrites = flushWrites;
  configMutationQueue = Promise.resolve();
}

/** Waits until writes queued by the native-backed storage facade are durable. */
export function flushDesktopConfigWrites() {
  return configMutationQueue.then(() => flushInstalledConfigWrites());
}

/** Returns the hydrated native-backed storage facade after desktop bootstrap. */
export function installedDesktopConfigStorage() {
  return installedConfigStorage;
}

/** Updates only the hydrated renderer mirror after a native credential CAS. */
export function acceptNativeDesktopConfigCommit(rawJson: string) {
  if (!installedConfigStorage?.acceptNativeValue) {
    throw new Error("Desktop config storage does not support native credential commits");
  }
  normalizeDesktopConfigJson(rawJson);
  installedConfigStorage.acceptNativeValue(CONFIG_STORAGE_KEY, rawJson);
  if (typeof globalThis.dispatchEvent === "function" && typeof Event !== "undefined") {
    globalThis.dispatchEvent(new Event(DESKTOP_CONFIG_CHANGED_EVENT));
  }
}

export const DEFAULT_CUSTOM_PROVIDER_CONFIG: CustomProviderConfig = {
  name: "",
  baseUrl: "",
  credentialRef: "",
  protocol: "openai-compatible",
  models: []
};

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: "deepseek",
  model: "deepseek-flash",
  credentialRef: ""
};

export const DEFAULT_VISION_MODEL_CONFIG: ModelConfig = {
  provider: "openrouter",
  model: "google/gemini-3.8-flash",
  credentialRef: ""
};

export const BUILTIN_AGENT_SKILL_NAMES = [
  "number-expression",
  "factorization-formulas",
  "equations-inequalities",
  "quadratic-equation",
  "inequality-interval",
  "function-graph",
  "piecewise-domain-function",
  "dynamic-parameter-exploration",
  "plane-geometry",
  "triangle-circle-geometry",
  "geometric-transformations",
  "geometric-construction",
  "dynamic-construction-validation",
  "solid-geometry",
  "solid-section",
  "parametric-surface-revolution",
  "prism",
  "sphere",
  "pyramid-circumsphere",
  "polynomial-function",
  "quadratic-function",
  "exponential-logarithmic-function",
  "exponential-log-transform",
  "linear-programming",
  "linear-programming-feasible-region",
  "trigonometric-function",
  "trigonometric-unit-circle",
  "sequence",
  "list-driven-construction",
  "vector",
  "analytic-geometry-conic",
  "parametric-polar-curves",
  "locus-envelope",
  "conic-focus-directrix",
  "derivative-application",
  "derivative-tangent",
  "probability-statistics",
  "regression-model-diagnostics",
  "classical-probability",
  "statistical-distribution",
  "geometric-theorem-verification",
  "multi-view-coordination",
  "cas-graphics-workflow",
  "spreadsheet-data-workflow",
  "construction-protocol-presentation",
  "interactive-controls-workflow",
  "object-view-layer-management",
  "dynamic-worksheet-authoring",
  "dynamic-text-feedback",
  "visual-style-system",
  "mathematical-animation-design",
  "visual-post-processing",
  "camera-framing",
  "viewport-scale-composition"
] as const;

export const DEFAULT_BUSINESS_AGENT_SKILL_NAMES = [
  "number-expression",
  "factorization-formulas",
  "equations-inequalities",
  "quadratic-equation",
  "inequality-interval",
  "function-graph",
  "piecewise-domain-function",
  "dynamic-parameter-exploration",
  "plane-geometry",
  "triangle-circle-geometry",
  "geometric-transformations",
  "geometric-construction",
  "dynamic-construction-validation",
  "solid-geometry",
  "solid-section",
  "parametric-surface-revolution",
  "prism",
  "sphere",
  "pyramid-circumsphere",
  "polynomial-function",
  "quadratic-function",
  "exponential-logarithmic-function",
  "exponential-log-transform",
  "linear-programming",
  "linear-programming-feasible-region",
  "trigonometric-function",
  "trigonometric-unit-circle",
  "sequence",
  "list-driven-construction",
  "vector",
  "analytic-geometry-conic",
  "parametric-polar-curves",
  "locus-envelope",
  "conic-focus-directrix",
  "derivative-application",
  "derivative-tangent",
  "probability-statistics",
  "regression-model-diagnostics",
  "classical-probability",
  "statistical-distribution",
  "geometric-theorem-verification",
  "multi-view-coordination",
  "cas-graphics-workflow",
  "spreadsheet-data-workflow",
  "construction-protocol-presentation",
  "interactive-controls-workflow",
  "object-view-layer-management",
  "dynamic-worksheet-authoring",
  "dynamic-text-feedback",
  "visual-style-system",
  "mathematical-animation-design"
] as const;

export const VISUAL_PROFILE_NAMES = [
  "exam-clean",
  "teaching-demo",
  "choice-comparison",
  "dynamic-exploration",
  "proof-highlight",
  "spatial-3d"
] as const satisfies readonly VisualProfileName[];

export const DEFAULT_VISUAL_PROFILE: VisualProfileName = "choice-comparison";

export const DEFAULT_SKILL_CONFIG: SkillConfig = {
  enabled: true,
  autoActivate: true,
  enabledSkillNames: [...DEFAULT_BUSINESS_AGENT_SKILL_NAMES],
  visualProfile: DEFAULT_VISUAL_PROFILE
};

export const DEFAULT_DEBUG_CONFIG: DebugConfig = {
  modelStepTimeoutMs: DEFAULT_AGENT_MODEL_STEP_TIMEOUT_MS
};

export const DEFAULT_INTERACTION_CONFIG: InteractionConfig = {
  mode: "fusion"
};

function createDefaultSkillConfig(): SkillConfig {
  return {
    ...DEFAULT_SKILL_CONFIG,
    enabledSkillNames: [...DEFAULT_SKILL_CONFIG.enabledSkillNames]
  };
}

export function createDefaultDesktopConfig(locale: Locale = detectPreferredLocale()): DesktopConfig {
  return {
    schemaVersion: DESKTOP_CONFIG_SCHEMA_VERSION,
    model: DEFAULT_MODEL_CONFIG,
    visionModel: DEFAULT_VISION_MODEL_CONFIG,
    providerCredentials: {
      [DEFAULT_MODEL_CONFIG.provider]: {
        credentialRef: DEFAULT_MODEL_CONFIG.credentialRef,
        baseUrl: "https://api.deepseek.com",
        protocol: "openai-compatible"
      },
      [DEFAULT_VISION_MODEL_CONFIG.provider]: {
        credentialRef: DEFAULT_VISION_MODEL_CONFIG.credentialRef,
        baseUrl: "https://openrouter.ai/api/v1",
        protocol: "openai-compatible"
      }
    },
    customProvider: { ...DEFAULT_CUSTOM_PROVIDER_CONFIG, models: [] },
    skills: createDefaultSkillConfig(),
    interaction: DEFAULT_INTERACTION_CONFIG,
    debug: DEFAULT_DEBUG_CONFIG,
    locale
  };
}

export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = createDefaultDesktopConfig();

export class DesktopConfigPlaintextCredentialError extends Error {
  constructor() {
    super("Desktop config must not contain plaintext credentials");
    this.name = "DesktopConfigPlaintextCredentialError";
  }
}

export class DesktopConfigUnsupportedVersionError extends Error {
  constructor() {
    super("Desktop config schema version is not supported by this application version");
    this.name = "DesktopConfigUnsupportedVersionError";
  }
}

export function normalizeProviderCredentials(value: unknown, ...models: ModelConfig[]): Record<string, ProviderCredentialConfig> {
  const credentials: Record<string, ProviderCredentialConfig> = {};
  if (value && typeof value === "object") {
    for (const [provider, entry] of Object.entries(value as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const payload = entry as Record<string, unknown>;
      credentials[provider] = {
        credentialRef: typeof payload.credentialRef === "string" ? payload.credentialRef : "",
        baseUrl: typeof payload.baseUrl === "string" ? payload.baseUrl : "",
        protocol: payload.protocol === "anthropic" || payload.protocol === "google" ? payload.protocol : "openai-compatible"
      };
    }
  }
  for (const model of models) {
    if (model.provider === CUSTOM_AGENT_PROVIDER_ID) continue;
    if (!credentials[model.provider]) {
      credentials[model.provider] = {
        credentialRef: model.credentialRef,
        baseUrl: "",
        protocol: model.protocol ?? "openai-compatible"
      };
    }
  }
  return credentials;
}

export function normalizeCustomProviderConfig(value: unknown): CustomProviderConfig {
  const payload = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const protocol = payload.protocol === "anthropic" || payload.protocol === "google"
    ? payload.protocol
    : "openai-compatible";
  const models = Array.isArray(payload.models) ? payload.models : [];
  const seen = new Set<string>();
  return {
    name: typeof payload.name === "string" ? payload.name : "",
    baseUrl: typeof payload.baseUrl === "string" ? payload.baseUrl : "",
    credentialRef: typeof payload.credentialRef === "string" ? payload.credentialRef : "",
    protocol,
    models: models.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const model = entry as Record<string, unknown>;
      const name = typeof model.name === "string" ? model.name.trim() : "";
      const callName = typeof model.callName === "string" ? model.callName.trim() : "";
      if (!name || !callName || seen.has(callName)) return [];
      seen.add(callName);
      return [{
        name,
        callName,
        supportsImages: model.supportsImages === true
      }];
    }).slice(0, 50)
  };
}

export function credentialsForProvider(credentials: Record<string, ProviderCredentialConfig>, provider: string): ProviderCredentialConfig {
  return credentials[provider] ?? { credentialRef: "", baseUrl: "", protocol: "openai-compatible" };
}

export function updateProviderCredentials(
  config: DesktopConfig,
  provider: string,
  credentials: ProviderCredentialConfig,
): DesktopConfig {
  return {
    ...config,
    model: config.model.provider === provider
      ? { ...config.model, credentialRef: credentials.credentialRef, protocol: credentials.protocol }
      : config.model,
    visionModel: config.visionModel.provider === provider
      ? { ...config.visionModel, credentialRef: credentials.credentialRef, protocol: credentials.protocol }
      : config.visionModel,
    providerCredentials: {
      ...config.providerCredentials,
      [provider]: credentials,
    },
  };
}

function normalizeLocale(value: Partial<DesktopConfig> | undefined, fallbackLocale: Locale): Locale {
  if (value?.locale === "zh-CN" || value?.locale === "en-US") return value.locale;
  return fallbackLocale;
}

function normalizeSkillNames(value: unknown) {
  if (!Array.isArray(value)) return [...DEFAULT_SKILL_CONFIG.enabledSkillNames];
  const names = value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
  const uniqueNames = Array.from(new Set(names));
  return uniqueNames;
}

export function normalizeSkillConfig(value: Partial<SkillConfig> | undefined): SkillConfig {
  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : DEFAULT_SKILL_CONFIG.enabled,
    autoActivate: typeof value?.autoActivate === "boolean" ? value.autoActivate : DEFAULT_SKILL_CONFIG.autoActivate,
    enabledSkillNames: normalizeSkillNames(value?.enabledSkillNames),
    visualProfile: normalizeVisualProfileName(value?.visualProfile)
  };
}

export function normalizeDebugConfig(value: Partial<DebugConfig> | undefined): DebugConfig {
  return {
    modelStepTimeoutMs: normalizeModelStepTimeoutMs(value?.modelStepTimeoutMs)
  };
}

export function normalizeModelStepTimeoutMs(value: unknown) {
  if (value === undefined || value === null || value === "") return DEFAULT_AGENT_MODEL_STEP_TIMEOUT_MS;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_AGENT_MODEL_STEP_TIMEOUT_MS;
  const integer = Math.round(numeric);
  if (integer < MIN_AGENT_MODEL_STEP_TIMEOUT_MS || integer > MAX_AGENT_MODEL_STEP_TIMEOUT_MS) {
    return DEFAULT_AGENT_MODEL_STEP_TIMEOUT_MS;
  }
  return integer;
}

export function modelStepTimeoutSecondsInputValue(value: number | null | undefined) {
  const normalized = normalizeModelStepTimeoutMs(value);
  return String(Math.round(normalized / 1000));
}

function normalizeVisualProfileName(value: unknown): VisualProfileName {
  return typeof value === "string" && VISUAL_PROFILE_NAMES.includes(value as VisualProfileName)
    ? (value as VisualProfileName)
    : DEFAULT_VISUAL_PROFILE;
}

export function normalizeInteractionConfig(value: unknown): InteractionConfig {
  const payload = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { mode: payload.mode === "window" ? "window" : "fusion" };
}

export function normalizeDesktopConfig(value: Partial<DesktopConfig> | undefined, fallbackLocale: Locale = detectPreferredLocale()): DesktopConfig {
  if (hasPlaintextCredentials(value)) throw new DesktopConfigPlaintextCredentialError();
  const model = normalizeAgentModelConfig(value?.model ?? DEFAULT_MODEL_CONFIG);
  const visionModel = normalizeAgentModelConfig(value?.visionModel ?? DEFAULT_VISION_MODEL_CONFIG);
  const providerCredentials = normalizeProviderCredentials(value?.providerCredentials, model, visionModel);
  const activeCredentials = credentialsForProvider(providerCredentials, model.provider);
  const visionCredentials = credentialsForProvider(providerCredentials, visionModel.provider);
  return {
    schemaVersion: DESKTOP_CONFIG_SCHEMA_VERSION,
    model: {
      ...model,
      credentialRef: model.credentialRef || activeCredentials.credentialRef,
      protocol: model.protocol ?? activeCredentials.protocol
    },
    visionModel: {
      ...visionModel,
      credentialRef: visionModel.credentialRef || visionCredentials.credentialRef,
      protocol: visionModel.protocol ?? visionCredentials.protocol
    },
    providerCredentials,
    customProvider: normalizeCustomProviderConfig(value?.customProvider),
    skills: normalizeSkillConfig(value?.skills),
    interaction: normalizeInteractionConfig(value?.interaction),
    debug: normalizeDebugConfig(value?.debug),
    locale: normalizeLocale(value, fallbackLocale)
  };
}

/** Parse the original JSON first so normalization cannot hide forbidden plaintext credentials. */
export function normalizeDesktopConfigJson(rawJson: string, fallbackLocale: Locale = detectPreferredLocale()): DesktopConfig {
  const rawConfig = parseRawDesktopConfig(rawJson);
  if (hasPlaintextCredentials(rawConfig)) throw new DesktopConfigPlaintextCredentialError();
  if (rawConfig.schemaVersion !== DESKTOP_CONFIG_SCHEMA_VERSION) throw new DesktopConfigUnsupportedVersionError();
  return normalizeDesktopConfig(rawConfig as Partial<DesktopConfig>, fallbackLocale);
}

export function readDesktopConfig(): DesktopConfig {
  if (!installedConfigStorage) return createDefaultDesktopConfig();
  const rawJson = installedConfigStorage.getItem(CONFIG_STORAGE_KEY);
  return rawJson === null ? createDefaultDesktopConfig() : normalizeDesktopConfigJson(rawJson);
}

function assertStoredConfigCanBeReplaced(storage: DesktopConfigStorage) {
  const rawJson = storage.getItem(CONFIG_STORAGE_KEY);
  if (rawJson === null) return;
  const rawConfig = parseRawDesktopConfig(rawJson);
  if (hasPlaintextCredentials(rawConfig)) throw new DesktopConfigPlaintextCredentialError();
  if (rawConfig.schemaVersion !== DESKTOP_CONFIG_SCHEMA_VERSION) {
    throw new DesktopConfigUnsupportedVersionError();
  }
}

async function commitDesktopConfig(config: DesktopConfig, storage: DesktopConfigStorage) {
  if (hasPlaintextCredentials(config)) throw new DesktopConfigPlaintextCredentialError();
  assertStoredConfigCanBeReplaced(storage);
  const serialized = JSON.stringify({
    ...config,
    schemaVersion: DESKTOP_CONFIG_SCHEMA_VERSION,
  });
  if (storage.setItemDurable) await storage.setItemDurable(CONFIG_STORAGE_KEY, serialized);
  else {
    storage.setItem(CONFIG_STORAGE_KEY, serialized);
    if (storage === installedConfigStorage) await flushInstalledConfigWrites();
  }
  if (typeof globalThis.dispatchEvent === "function" && typeof Event !== "undefined") {
    globalThis.dispatchEvent(new Event(DESKTOP_CONFIG_CHANGED_EVENT));
  }
}

function enqueueConfigMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = configMutationQueue.catch(() => {}).then(operation);
  configMutationQueue = result.then(() => {}, () => {});
  return result;
}

export function persistDesktopConfig(config: DesktopConfig, storage: DesktopConfigStorage | null = installedConfigStorage): Promise<void> {
  if (!storage) throw new Error("Desktop config storage has not been installed");
  if (hasPlaintextCredentials(config)) throw new DesktopConfigPlaintextCredentialError();
  assertStoredConfigCanBeReplaced(storage);
  return enqueueConfigMutation(() => commitDesktopConfig(config, storage));
}

/** Serializes read-modify-write operations against the last durable config snapshot. */
export function updateDesktopConfig(update: (current: DesktopConfig) => DesktopConfig): Promise<DesktopConfig> {
  const storage = installedConfigStorage;
  if (!storage) throw new Error("Desktop config storage has not been installed");
  return enqueueConfigMutation(async () => {
    const next = update(readDesktopConfig());
    await commitDesktopConfig(next, storage);
    return next;
  });
}

export function hasConfiguredCredential(config: AgentModelConfig) {
  return Boolean(config.credentialRef.trim());
}

export function modelCanRunImageAttachments(config: AgentModelConfig, schema?: AgentModelRegistrySchema) {
  return hasConfiguredCredential(config) && agentModelSupportsImagesForSchema(config.provider, config.model, schema);
}

export function modelCapabilityOverviewFor(input: {
  model: AgentModelConfig;
  visionModel: AgentModelConfig;
  schema?: AgentModelRegistrySchema;
}) {
  const agentPolicy = getAgentModelPolicyForSchema(input.model, input.schema);
  const agentCanRunImages = modelCanRunImageAttachments(input.model, input.schema);
  const visionCanRunImages = modelCanRunImageAttachments(input.visionModel, input.schema);
  return {
    solving: hasConfiguredCredential(input.model) && agentPolicy.supportsTools,
    vision: agentCanRunImages || visionCanRunImages,
    fileParsing: agentCanRunImages
  };
}

export function imageAttachmentModelConfig(config: DesktopConfig, schema?: AgentModelRegistrySchema): ModelConfig | null {
  if (modelCanRunImageAttachments(config.model, schema)) return config.model;
  if (modelCanRunImageAttachments(config.visionModel, schema)) return config.visionModel;
  return null;
}

export function modelConfigForRun(config: DesktopConfig, attachmentCount: number, schema?: AgentModelRegistrySchema) {
  const selectedModel = attachmentCount > 0 ? imageAttachmentModelConfig(config, schema) ?? config.model : config.model;
  return {
    ...selectedModel,
    maxToolSteps: config.model.maxToolSteps ?? null,
    modelStepTimeoutMs: config.debug.modelStepTimeoutMs
  };
}

export function configHasImageCapableModel(config: DesktopConfig, schema?: AgentModelRegistrySchema) {
  return (
    agentModelSupportsImagesForSchema(config.model.provider, config.model.model, schema) ||
    agentModelSupportsImagesForSchema(config.visionModel.provider, config.visionModel.model, schema)
  );
}

export function configSupportsImageAttachments(config: DesktopConfig, schema?: AgentModelRegistrySchema) {
  return Boolean(imageAttachmentModelConfig(config, schema));
}

export function promptWithSkillPolicy(content: string, config: DesktopConfig, locale: Locale) {
  const skills = normalizeSkillConfig(config.skills);
  const enabledSkillNames = skills.enabledSkillNames.map((name) => name.trim()).filter(Boolean);
  const policy = locale === "en-US"
    ? skills.enabled && enabledSkillNames.length
      ? [
          "[Agent Skill policy]",
          "This per-run skill policy is authoritative.",
          `Allowed skills: ${enabledSkillNames.join(", ")}.`,
          `Automatic loading: ${skills.autoActivate ? "enabled" : "disabled"}.`,
          `Visual profile: ${skills.visualProfile}.`,
          skills.autoActivate
            ? "Host skill selector: enabled. A temporary selector will evaluate listSkills, searchSkills, and loadSkill before the main agent runs, then inject a compressed skill packet. The main agent should use that packet and avoid calling skill tools again unless the packet is missing, failed, or clearly insufficient."
            : "You may call listSkills or searchSkills to evaluate skills, but do not call loadSkill unless the user explicitly asks for a specific skill.",
          "Treat recipes as task-type strategy and the visual profile as presentation guidance only; do not let visual style decide mathematical facts.",
          "Never load or activate skills outside the allowed list."
        ].join("\n")
      : [
          "[Agent Skill policy]",
          "This per-run skill policy is authoritative.",
          "Agent Skills are disabled for this run. Do not call listSkills, searchSkills, or loadSkill."
        ].join("\n")
    : skills.enabled && enabledSkillNames.length
      ? [
          "【Agent Skill 策略】",
          "本轮技能策略优先于默认技能目录说明。",
          `允许使用的技能：${enabledSkillNames.join("、")}。`,
          `自动加载：${skills.autoActivate ? "开启" : "关闭"}。`,
          `可视化表达策略：${skills.visualProfile}。`,
          skills.autoActivate
            ? "Host skill selector：开启。临时选择器会在主 agent 运行前评估 listSkills、searchSkills 和 loadSkill，并注入压缩后的 skill packet。主 agent 应优先使用该 packet；除非 packet 缺失、失败或明显不足，否则不要再次调用技能工具。"
            : "可以调用 listSkills 或 searchSkills 评估技能，但除非用户明确要求某个技能，否则不要调用 loadSkill。",
          "Recipe 只用于题型策略；可视化表达策略只决定呈现方式，不决定数学事实。",
          "不要加载或激活允许列表之外的技能。"
        ].join("\n")
      : [
          "【Agent Skill 策略】",
          "本轮技能策略优先于默认技能目录说明。",
          "本轮已关闭 Agent Skills，不要调用 listSkills、searchSkills 或 loadSkill。"
        ].join("\n");
  return `${content}\n\n${policy}`;
}
