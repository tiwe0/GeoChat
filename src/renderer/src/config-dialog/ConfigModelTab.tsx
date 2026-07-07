import { Show } from "solid-js";
import {
  getAgentModelPolicyForSchema,
  type AgentModelOption
} from "@geochat-ai/app";
import type { RendererI18n } from "../i18n";
import {
  ConfigAdvancedEndpointSection,
  ConfigCapabilityOverviewSection,
  ConfigModelProviderSection
} from "./ConfigModelProviderSection";
import { ConfigVisionProviderSection } from "./ConfigVisionProviderSection";

type ModelPolicy = ReturnType<typeof getAgentModelPolicyForSchema>;
type SelectOption = { value: string; label: string };

export function ConfigModelTab(props: {
  copy: RendererI18n;
  solvingAbilityReady: boolean;
  visionAbilityReady: boolean;
  fileParsingAbilityReady: boolean;
  provider: string;
  providerOptions: SelectOption[];
  model: string;
  modelSelectOptions: AgentModelOption[];
  modelOptions: AgentModelOption[];
  maxToolSteps: string;
  selectedModelPolicy: ModelPolicy;
  selectedModelSupportsImages: boolean;
  apiKey: string;
  visionProvider: string;
  visionModel: string;
  visionModelOptions: AgentModelOption[];
  visionModelSelectOptions: AgentModelOption[];
  visionApiKey: string;
  selectedVisionModelPolicy: ModelPolicy;
  selectedVisionModelSupportsImages: boolean;
  customBaseUrl: string;
  visionCustomBaseUrl: string;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onMaxToolStepsChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onVisionProviderChange: (value: string) => void;
  onVisionModelChange: (value: string) => void;
  onVisionApiKeyChange: (value: string) => void;
  onCustomBaseUrlChange: (value: string) => void;
  onVisionCustomBaseUrlChange: (value: string) => void;
}) {
  const visionProviderUsesPrimary = () => props.visionProvider === props.provider;
  return (
    <>
      <ConfigCapabilityOverviewSection
        copy={props.copy}
        solvingAbilityReady={props.solvingAbilityReady}
        visionAbilityReady={props.visionAbilityReady}
        fileParsingAbilityReady={props.fileParsingAbilityReady}
      />
      <ConfigModelProviderSection
        copy={props.copy}
        provider={props.provider}
        providerOptions={props.providerOptions}
        model={props.model}
        modelSelectOptions={props.modelSelectOptions}
        maxToolSteps={props.maxToolSteps}
        selectedModelPolicy={props.selectedModelPolicy}
        selectedModelSupportsImages={props.selectedModelSupportsImages}
        apiKey={props.apiKey}
        onProviderChange={props.onProviderChange}
        onModelChange={props.onModelChange}
        onMaxToolStepsChange={props.onMaxToolStepsChange}
        onApiKeyChange={props.onApiKeyChange}
      />
      <Show when={!props.selectedModelSupportsImages}>
        <ConfigVisionProviderSection
          copy={props.copy}
          provider={props.visionProvider}
          providerOptions={props.providerOptions}
          model={props.visionModel}
          modelSelectOptions={props.visionModelSelectOptions}
          apiKey={visionProviderUsesPrimary() ? props.apiKey : props.visionApiKey}
          usesPrimaryProvider={visionProviderUsesPrimary()}
          selectedVisionModelPolicy={props.selectedVisionModelPolicy}
          selectedVisionModelSupportsImages={props.selectedVisionModelSupportsImages}
          onProviderChange={props.onVisionProviderChange}
          onModelChange={props.onVisionModelChange}
          onApiKeyChange={props.onVisionApiKeyChange}
        />
      </Show>
      <ConfigAdvancedEndpointSection
        copy={props.copy}
        model={props.model}
        modelPlaceholder={props.modelOptions[0]?.value ?? "model-id"}
        customBaseUrl={props.customBaseUrl}
        selectedModelSupportsImages={props.selectedModelSupportsImages}
        visionModel={props.visionModel}
        visionModelOptions={props.visionModelOptions}
        visionProviderUsesPrimary={visionProviderUsesPrimary()}
        visionCustomBaseUrl={visionProviderUsesPrimary() ? props.customBaseUrl : props.visionCustomBaseUrl}
        onModelChange={props.onModelChange}
        onCustomBaseUrlChange={props.onCustomBaseUrlChange}
        onVisionModelChange={props.onVisionModelChange}
        onVisionCustomBaseUrlChange={props.onVisionCustomBaseUrlChange}
      />
    </>
  );
}
