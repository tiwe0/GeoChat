import {
  getAgentModelOptionsForSchema,
  type AgentModelOption,
  type AgentModelRegistrySchema
} from "@geochat-ai/app";
import {
  DEFAULT_MODEL_CONFIG,
  DEFAULT_VISION_MODEL_CONFIG,
  credentialsForProvider,
  normalizeDesktopConfig,
  normalizeModelStepTimeoutMs
} from "../desktop-config";
import { interpolate, type Locale, type RendererI18n } from "../i18n";
import type {
  DesktopConfig,
  ProviderCredentialConfig,
  RendererAppBundleUpdateState,
  RendererUnifiedUpdateState,
  RendererUpdateState,
  VisualProfileName
} from "../workbench-types";

export type ConfigPrimaryUpdateAction = "install_shell" | "download_shell" | "install_app_bundle" | "check";

export type ConfigProviderFormState = {
  provider: string;
  apiKey: string;
  customBaseUrl: string;
  visionProvider: string;
  visionApiKey: string;
  visionCustomBaseUrl: string;
  providerCredentials: Record<string, ProviderCredentialConfig>;
};

export type ConfigSaveFormState = ConfigProviderFormState & {
  baseConfig: DesktopConfig;
  model: string;
  maxToolSteps: number | null;
  visionModel: string;
  skillsEnabled: boolean;
  skillAutoActivate: boolean;
  enabledSkillNames: string[];
  visualProfile: VisualProfileName;
  modelStepTimeoutSeconds: string;
};

export function modelOptionsWithCustom(
  options: AgentModelOption[],
  model: string,
  copy: RendererI18n
) {
  if (!model.trim() || options.some((option) => option.value === model)) return options;
  return [
    {
      value: model,
      label: interpolate(copy.config.customModelPrefix, { model }),
      supportsImages: false,
      supportsTools: true,
      toolCallingMode: "assumed" as const
    },
    ...options
  ];
}

export function maxToolStepsInputValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

export function modelStepTimeoutSecondsToMs(value: string) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return normalizeModelStepTimeoutMs(undefined);
  return normalizeModelStepTimeoutMs(seconds * 1000);
}

export function providerCredentialsSnapshot(input: ConfigProviderFormState) {
  const nextCredentials = { ...input.providerCredentials };
  nextCredentials[input.provider] = {
    apiKey: input.apiKey,
    customBaseUrl: input.customBaseUrl
  };
  nextCredentials[input.visionProvider] = input.visionProvider === input.provider
    ? {
        apiKey: input.apiKey,
        customBaseUrl: input.customBaseUrl
      }
    : {
        apiKey: input.visionApiKey,
        customBaseUrl: input.visionCustomBaseUrl
      };
  return nextCredentials;
}

export function deriveProviderChange(input: ConfigProviderFormState & {
  nextProvider: string;
  modelRegistrySchema?: AgentModelRegistrySchema;
}) {
  const providerCredentials = providerCredentialsSnapshot(input);
  const credentials = credentialsForProvider(providerCredentials, input.nextProvider);
  return {
    providerCredentials,
    provider: input.nextProvider,
    model: getAgentModelOptionsForSchema(input.nextProvider, input.modelRegistrySchema)[0]?.value ?? DEFAULT_MODEL_CONFIG.model,
    apiKey: credentials.apiKey,
    customBaseUrl: credentials.customBaseUrl
  };
}

export function deriveVisionProviderChange(input: ConfigProviderFormState & {
  nextProvider: string;
  modelRegistrySchema?: AgentModelRegistrySchema;
}) {
  const providerCredentials = providerCredentialsSnapshot(input);
  const credentials = input.nextProvider === input.provider
    ? { apiKey: input.apiKey, customBaseUrl: input.customBaseUrl }
    : credentialsForProvider(providerCredentials, input.nextProvider);
  const nextModelOptions = getAgentModelOptionsForSchema(input.nextProvider, input.modelRegistrySchema);
  return {
    providerCredentials,
    visionProvider: input.nextProvider,
    visionModel: nextModelOptions.find((option) => option.supportsImages)?.value ?? nextModelOptions[0]?.value ?? DEFAULT_VISION_MODEL_CONFIG.model,
    visionApiKey: credentials.apiKey,
    visionCustomBaseUrl: credentials.customBaseUrl
  };
}

export function deriveSavedDesktopConfig(input: ConfigSaveFormState) {
  const providerCredentials = providerCredentialsSnapshot(input);
  return normalizeDesktopConfig({
    ...input.baseConfig,
    model: {
      provider: input.provider,
      model: input.model,
      apiKey: input.apiKey,
      customBaseUrl: input.customBaseUrl,
      maxToolSteps: input.maxToolSteps
    },
    visionModel: {
      provider: input.visionProvider,
      model: input.visionModel,
      apiKey: input.visionProvider === input.provider ? input.apiKey : input.visionApiKey,
      customBaseUrl: input.visionProvider === input.provider ? input.customBaseUrl : input.visionCustomBaseUrl
    },
    skills: {
      enabled: input.skillsEnabled,
      autoActivate: input.skillAutoActivate,
      enabledSkillNames: input.enabledSkillNames,
      visualProfile: input.visualProfile
    },
    debug: {
      modelStepTimeoutMs: modelStepTimeoutSecondsToMs(input.modelStepTimeoutSeconds)
    },
    providerCredentials
  });
}

export function formatConfigIsoTime(value?: string | null, locale: Locale = "zh-CN") {
  if (!value) return "--";
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export function unifiedUpdateStatusBody(state: RendererUnifiedUpdateState, copy: RendererI18n) {
  const friendly = state.errorCode ? copy.config.updateErrorMessages[state.errorCode] : null;
  if (state.recommendation === "app_bundle") return copy.config.updateRecommendations.appBundle;
  if (state.recommendation === "shell") return copy.config.updateRecommendations.shell;
  if (state.recommendation === "both_shell_first") return copy.config.updateRecommendations.bothShellFirst;
  if (state.recommendation === "shell_required_for_app_bundle") {
    return friendly ?? state.message ?? copy.config.updateRecommendations.shellRequiredForAppBundle;
  }
  if (state.recommendation === "error") return friendly ?? state.error ?? copy.config.updateRecommendations.error;
  return copy.config.updateRecommendations.none;
}

export function updateCanDownload(state: RendererUpdateState) {
  return state.status === "available" && !state.downloaded;
}

export function primaryUpdateAction(input: {
  updateState: RendererUpdateState;
  appBundleUpdateState: RendererAppBundleUpdateState;
}): ConfigPrimaryUpdateAction {
  if (input.updateState.status === "downloaded") return "install_shell";
  if (updateCanDownload(input.updateState)) return "download_shell";
  if (input.appBundleUpdateState.updateAvailable) return "install_app_bundle";
  return "check";
}

export function primaryUpdateActionBusy(input: {
  unifiedUpdateBusy: boolean;
  updateBusy: boolean;
  appBundleUpdateBusy: boolean;
  unifiedUpdateState: RendererUnifiedUpdateState;
  updateState: RendererUpdateState;
  appBundleUpdateState: RendererAppBundleUpdateState;
}) {
  return (
    input.unifiedUpdateBusy ||
    input.updateBusy ||
    input.appBundleUpdateBusy ||
    input.unifiedUpdateState.status === "checking" ||
    input.updateState.status === "checking" ||
    input.updateState.status === "downloading" ||
    input.appBundleUpdateState.status === "checking" ||
    input.appBundleUpdateState.status === "downloading"
  );
}

export function primaryUpdateActionLabel(input: {
  busy: boolean;
  updateState: RendererUpdateState;
  appBundleUpdateState: RendererAppBundleUpdateState;
  copy: RendererI18n;
}) {
  if (input.busy) return input.copy.config.updateChecking;
  const action = primaryUpdateAction(input);
  if (action === "install_shell") return input.copy.config.updateInstall;
  if (action === "download_shell") return input.copy.config.updateDownload;
  if (action === "install_app_bundle") return input.copy.config.appBundleUpdateInstall;
  return input.copy.config.updateRecommendationCheck;
}
