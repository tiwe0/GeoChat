import {
  DEFAULT_AGENT_MODEL_STEP_TIMEOUT_MS,
  MAX_AGENT_MODEL_STEP_TIMEOUT_MS,
  MIN_AGENT_MODEL_STEP_TIMEOUT_MS,
  agentModelSupportsImagesForSchema,
  getAgentModelPolicyForSchema,
  normalizeAgentModelConfig,
  type AgentModelConfig,
  type AgentModelRegistrySchema
} from "@geochat-ai/app";
import type {
  DesktopConfig,
  DebugConfig,
  ModelConfig,
  ProviderCredentialConfig,
  SkillConfig,
  VisualProfileName
} from "./workbench-types";
import { detectPreferredLocale, type Locale } from "./i18n";

export const CONFIG_STORAGE_KEY = "geochat-desktop-ui-config";

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: "deepseek",
  model: "deepseek-v4-flash",
  apiKey: "",
  customBaseUrl: ""
};

export const DEFAULT_VISION_MODEL_CONFIG: ModelConfig = {
  provider: "openrouter",
  model: "openai/gpt-5.5",
  apiKey: "",
  customBaseUrl: ""
};

export const BUILTIN_AGENT_SKILL_NAMES = [
  "number-expression",
  "factorization-formulas",
  "equations-inequalities",
  "quadratic-equation",
  "inequality-interval",
  "function-graph",
  "plane-geometry",
  "triangle-circle-geometry",
  "geometric-transformations",
  "geometric-construction",
  "solid-geometry",
  "solid-section",
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
  "vector",
  "analytic-geometry-conic",
  "conic-focus-directrix",
  "derivative-application",
  "derivative-tangent",
  "probability-statistics",
  "classical-probability",
  "statistical-distribution",
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
  "plane-geometry",
  "triangle-circle-geometry",
  "geometric-transformations",
  "geometric-construction",
  "solid-geometry",
  "solid-section",
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
  "vector",
  "analytic-geometry-conic",
  "conic-focus-directrix",
  "derivative-application",
  "derivative-tangent",
  "probability-statistics",
  "classical-probability",
  "statistical-distribution"
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

function createDefaultSkillConfig(): SkillConfig {
  return {
    ...DEFAULT_SKILL_CONFIG,
    enabledSkillNames: [...DEFAULT_SKILL_CONFIG.enabledSkillNames]
  };
}

export function createDefaultDesktopConfig(locale: Locale = detectPreferredLocale()): DesktopConfig {
  return {
    model: DEFAULT_MODEL_CONFIG,
    visionModel: DEFAULT_VISION_MODEL_CONFIG,
    providerCredentials: {
      [DEFAULT_MODEL_CONFIG.provider]: {
        apiKey: DEFAULT_MODEL_CONFIG.apiKey,
        customBaseUrl: DEFAULT_MODEL_CONFIG.customBaseUrl
      },
      [DEFAULT_VISION_MODEL_CONFIG.provider]: {
        apiKey: DEFAULT_VISION_MODEL_CONFIG.apiKey,
        customBaseUrl: DEFAULT_VISION_MODEL_CONFIG.customBaseUrl
      }
    },
    skills: createDefaultSkillConfig(),
    debug: DEFAULT_DEBUG_CONFIG,
    locale
  };
}

export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = createDefaultDesktopConfig();

export function normalizeProviderCredentials(value: unknown, ...models: ModelConfig[]): Record<string, ProviderCredentialConfig> {
  const credentials: Record<string, ProviderCredentialConfig> = {};
  if (value && typeof value === "object") {
    for (const [provider, entry] of Object.entries(value as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const payload = entry as Record<string, unknown>;
      credentials[provider] = {
        apiKey: typeof payload.apiKey === "string" ? payload.apiKey : "",
        customBaseUrl: typeof payload.customBaseUrl === "string" ? payload.customBaseUrl : ""
      };
    }
  }
  for (const model of models) {
    if (model.apiKey.trim() || model.customBaseUrl.trim() || !credentials[model.provider]) {
      credentials[model.provider] = {
        apiKey: model.apiKey,
        customBaseUrl: model.customBaseUrl
      };
    }
  }
  return credentials;
}

export function credentialsForProvider(credentials: Record<string, ProviderCredentialConfig>, provider: string): ProviderCredentialConfig {
  return credentials[provider] ?? { apiKey: "", customBaseUrl: "" };
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
  return Array.from(new Set(names));
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

export function normalizeDesktopConfig(value: Partial<DesktopConfig> | undefined, fallbackLocale: Locale = detectPreferredLocale()): DesktopConfig {
  const model = normalizeAgentModelConfig(value?.model ?? DEFAULT_MODEL_CONFIG);
  const visionModel = normalizeAgentModelConfig(value?.visionModel ?? DEFAULT_VISION_MODEL_CONFIG);
  const providerCredentials = normalizeProviderCredentials(value?.providerCredentials, model, visionModel);
  const activeCredentials = credentialsForProvider(providerCredentials, model.provider);
  const visionCredentials = credentialsForProvider(providerCredentials, visionModel.provider);
  return {
    model: {
      ...model,
      apiKey: activeCredentials.apiKey,
      customBaseUrl: activeCredentials.customBaseUrl
    },
    visionModel: {
      ...visionModel,
      apiKey: visionCredentials.apiKey,
      customBaseUrl: visionCredentials.customBaseUrl
    },
    providerCredentials,
    skills: normalizeSkillConfig(value?.skills),
    debug: normalizeDebugConfig(value?.debug),
    locale: normalizeLocale(value, fallbackLocale)
  };
}

export function readDesktopConfig(): DesktopConfig {
  if (!globalThis.localStorage) return createDefaultDesktopConfig();
  try {
    return normalizeDesktopConfig(JSON.parse(globalThis.localStorage.getItem(CONFIG_STORAGE_KEY) ?? "{}") as Partial<DesktopConfig>);
  } catch {
    return createDefaultDesktopConfig();
  }
}

export function persistDesktopConfig(config: DesktopConfig) {
  globalThis.localStorage?.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function hasConfiguredApiKey(config: AgentModelConfig) {
  return Boolean(config.apiKey.trim());
}

export function modelCanRunImageAttachments(config: AgentModelConfig, schema?: AgentModelRegistrySchema) {
  return hasConfiguredApiKey(config) && agentModelSupportsImagesForSchema(config.provider, config.model, schema);
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
    solving: hasConfiguredApiKey(input.model) && agentPolicy.supportsTools,
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
            : "You may call listSkills or searchSkills to evaluate skills, but do not call loadSkill or activateSkill unless the user explicitly asks for a specific skill.",
          "Treat recipes as task-type strategy and the visual profile as presentation guidance only; do not let visual style decide mathematical facts.",
          "Never load or activate skills outside the allowed list."
        ].join("\n")
      : [
          "[Agent Skill policy]",
          "This per-run skill policy is authoritative.",
          "Agent Skills are disabled for this run. Do not call listSkills, searchSkills, loadSkill, or activateSkill."
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
            : "可以调用 listSkills 或 searchSkills 评估技能，但除非用户明确要求某个技能，否则不要调用 loadSkill 或 activateSkill。",
          "Recipe 只用于题型策略；可视化表达策略只决定呈现方式，不决定数学事实。",
          "不要加载或激活允许列表之外的技能。"
        ].join("\n")
      : [
          "【Agent Skill 策略】",
          "本轮技能策略优先于默认技能目录说明。",
          "本轮已关闭 Agent Skills，不要调用 listSkills、searchSkills、loadSkill 或 activateSkill。"
        ].join("\n");
  return `${content}\n\n${policy}`;
}
