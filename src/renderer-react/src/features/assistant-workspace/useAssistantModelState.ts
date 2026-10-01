import { useCallback, useEffect, useRef, useState } from "react";
import { agentModelSupportsReasoning } from "@geochat-ai/app/model-registry";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import {
  credentialsForProvider,
  DESKTOP_CONFIG_CHANGED_EVENT,
  readDesktopConfig,
} from "../../../../shared/desktop/desktop-config";
import type { ThinkingEffort } from "../../components/ModelMenu";
import { saveStoredModel } from "../local-session/storage";
import { loadModelCatalog, type RuntimeModelOption } from "../models/modelCatalog";
import type { AssistantSessionController } from "../session/assistantSessionController";
import { nativePreferences } from "../../lib/nativePreferences";
import type { NativePreferenceSchema } from "../../lib/nativePreferences";

const logger = createStructuredLogger("assistant.model-state");
const THINKING_ENABLED_STORAGE_KEY = "geogebraCopilotThinkingEnabled";
const THINKING_EFFORT_STORAGE_KEY = "geogebraCopilotThinkingEffort";

function persistPreference<Key extends keyof NativePreferenceSchema>(key: Key, value: NativePreferenceSchema[Key]) {
  void nativePreferences().set(key, value).catch((error) => {
    logger.warn("preference_write_failed", "ASSISTANT_PREFERENCE_WRITE_FAILED", { error });
  });
}

type ModelStateInput = {
  controller: AssistantSessionController;
  selectedModel: string;
  thinkingEnabled: boolean;
};

export function useAssistantModelState(input: ModelStateInput) {
  const [modelOptions, setModelOptions] = useState<RuntimeModelOption[]>(loadModelCatalog());
  const modelOptionsRef = useRef<RuntimeModelOption[]>(modelOptions);
  modelOptionsRef.current = modelOptions;

  const selectedModelOption = modelOptions.find((option) => option.id === input.selectedModel);
  const thinkingSupported = selectedModelOption
    ? agentModelSupportsReasoning(selectedModelOption.provider, selectedModelOption.id)
    : true;

  const refreshCatalog = useCallback((preferredModel?: string) => {
    const models = loadModelCatalog();
    modelOptionsRef.current = models;
    setModelOptions(models);
    const configured = readDesktopConfig().model;
    const current = input.controller.getSnapshot().model;
    const selected = models.find((model) => model.id === preferredModel)
      ?? models.find((model) => model.id === current)
      ?? models.find((model) => model.id === configured.model && model.provider === configured.provider)
      ?? models[0];
    if (selected) input.controller.setModel(selected.id);
    return models;
  }, [input.controller]);

  const getSelectedModelConfig = useCallback(() => {
    const config = readDesktopConfig();
    const selected = modelOptionsRef.current.find((option) => (
      option.id === input.controller.getSnapshot().model
    ));
    if (!selected) return config.model;
    const credentials = credentialsForProvider(config.providerCredentials, selected.provider);
    if (selected.provider === "custom") {
      return {
        provider: "custom" as const,
        model: selected.id,
        credentialRef: config.customProvider.credentialRef,
        protocol: config.customProvider.protocol,
        supportsImages: selected.capabilities.includes("imageInput"),
      };
    }
    return {
      ...config.model,
      provider: selected.provider,
      model: selected.id,
      credentialRef: credentials.credentialRef,
      protocol: credentials.protocol,
    };
  }, [input.controller]);

  const changeModel = useCallback((value: string, provider?: string) => {
    const selected = modelOptionsRef.current.find((option) => (
      option.id === value && (!provider || option.provider === provider)
    ));
    if (!selected) return;
    input.controller.setModel(selected.id);
    if (!agentModelSupportsReasoning(selected.provider, selected.id)) {
      input.controller.setThinkingEnabled(false);
      persistPreference(THINKING_ENABLED_STORAGE_KEY, false);
    }
    void saveStoredModel(value).catch((error) => logger.warn("model_write_failed", "ASSISTANT_MODEL_WRITE_FAILED", { error }));
  }, [input.controller]);

  const changeThinkingEnabled = useCallback((enabled: boolean) => {
    input.controller.setThinkingEnabled(enabled);
    persistPreference(THINKING_ENABLED_STORAGE_KEY, enabled);
  }, [input.controller]);

  const changeThinkingEffort = useCallback((effort: ThinkingEffort) => {
    input.controller.setThinkingEffort(effort);
    persistPreference(THINKING_EFFORT_STORAGE_KEY, effort);
  }, [input.controller]);

  const restoreModel = useCallback((model: string) => {
    input.controller.setModel(model);
    void saveStoredModel(model).catch((error) => logger.warn("model_write_failed", "ASSISTANT_MODEL_WRITE_FAILED", { error }));
  }, [input.controller]);

  useEffect(() => {
    refreshCatalog();
    const handleConfigChanged = () => { refreshCatalog(); };
    globalThis.addEventListener(DESKTOP_CONFIG_CHANGED_EVENT, handleConfigChanged);
    return () => globalThis.removeEventListener(DESKTOP_CONFIG_CHANGED_EVENT, handleConfigChanged);
  }, [refreshCatalog]);

  useEffect(() => {
    if (!input.selectedModel || thinkingSupported || !input.thinkingEnabled) return;
    input.controller.setThinkingEnabled(false);
    persistPreference(THINKING_ENABLED_STORAGE_KEY, false);
  }, [input.controller, input.selectedModel, input.thinkingEnabled, thinkingSupported]);

  useEffect(() => {
    try {
      const storedThinking = nativePreferences().get(THINKING_ENABLED_STORAGE_KEY);
      if (typeof storedThinking === "boolean") input.controller.setThinkingEnabled(storedThinking);
      const effort = nativePreferences().get(THINKING_EFFORT_STORAGE_KEY);
      if (effort === "light" || effort === "standard" || effort === "extended") {
        input.controller.setThinkingEffort(effort);
      }
    } catch (error) {
      logger.debug("thinking_preferences_read_failed", "THINKING_PREFERENCES_READ_FAILED", { error });
    }
  }, [input.controller]);

  return {
    changeModel,
    changeThinkingEffort,
    changeThinkingEnabled,
    getSelectedModelConfig,
    modelOptions,
    modelOptionsRef,
    refreshCatalog,
    restoreModel,
    selectedModelOption,
    thinkingSupported,
  };
}
