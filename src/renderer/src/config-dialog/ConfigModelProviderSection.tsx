import { Bot, Check, ChevronDown, FileSearch, ImagePlus, Terminal, X } from "lucide-solid";
import { Show } from "solid-js";
import {
  getAgentModelPolicyForSchema,
  MAX_AGENT_RUNNER_MAX_TOOL_STEPS,
  MIN_AGENT_RUNNER_MAX_TOOL_STEPS,
  type AgentModelOption
} from "@geochat-ai/app";
import { DEFAULT_VISION_MODEL_CONFIG } from "../desktop-config";
import type { RendererI18n } from "../i18n";
import { interpolate } from "../i18n";
import { SectionCard, SelectField } from "../workbench-ui";

type ModelPolicy = ReturnType<typeof getAgentModelPolicyForSchema>;
type SelectOption = { value: string; label: string };

export function ConfigCapabilityOverviewSection(props: {
  copy: RendererI18n;
  solvingAbilityReady: boolean;
  visionAbilityReady: boolean;
  fileParsingAbilityReady: boolean;
}) {
  return (
    <SectionCard class="config-capability-overview config-card-wide">
      <div class="config-section-heading">
        <strong><Bot size={16} />{props.copy.config.capabilityOverviewTitle}</strong>
        <p>{props.copy.config.capabilityOverviewBody}</p>
      </div>
      <div class="config-capability-status-grid">
        <div classList={{ "config-capability-status": true, ready: props.solvingAbilityReady }}>
          <span class="config-capability-status-icon">
            <Show when={props.solvingAbilityReady} fallback={<X size={15} />}>
              <Check size={15} />
            </Show>
          </span>
          <div>
            <strong><Bot size={15} />{props.copy.config.solvingAbilityTitle}</strong>
            <p>{props.solvingAbilityReady ? props.copy.config.solvingAbilityReady : props.copy.config.solvingAbilityBlocked}</p>
          </div>
        </div>
        <div classList={{ "config-capability-status": true, ready: props.visionAbilityReady }}>
          <span class="config-capability-status-icon">
            <Show when={props.visionAbilityReady} fallback={<X size={15} />}>
              <Check size={15} />
            </Show>
          </span>
          <div>
            <strong><ImagePlus size={15} />{props.copy.config.visionAbilityTitle}</strong>
            <p>{props.visionAbilityReady ? props.copy.config.visionAbilityReady : props.copy.config.visionAbilityBlocked}</p>
          </div>
        </div>
        <div classList={{ "config-capability-status": true, ready: props.fileParsingAbilityReady }}>
          <span class="config-capability-status-icon">
            <Show when={props.fileParsingAbilityReady} fallback={<X size={15} />}>
              <Check size={15} />
            </Show>
          </span>
          <div>
            <strong><FileSearch size={15} />{props.copy.config.fileParsingAbilityTitle}</strong>
            <p>{props.fileParsingAbilityReady ? props.copy.config.fileParsingAbilityReady : props.copy.config.fileParsingAbilityBlocked}</p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

export function ConfigModelProviderSection(props: {
  copy: RendererI18n;
  provider: string;
  providerOptions: SelectOption[];
  model: string;
  modelSelectOptions: AgentModelOption[];
  maxToolSteps: string;
  selectedModelPolicy: ModelPolicy;
  selectedModelSupportsImages: boolean;
  apiKey: string;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onMaxToolStepsChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
}) {
  return (
    <SectionCard class="config-collapsible-card config-card-wide">
      <details class="config-collapsible" open>
        <summary>
          <span>
            <strong><Bot size={16} />{props.copy.config.textModelTitle}</strong>
            <small>{props.copy.config.textModelBody}</small>
          </span>
          <ChevronDown size={16} />
        </summary>
        <div class="config-grid">
          <label>
            <span>{props.copy.config.modelProvider}</span>
            <SelectField
              id="provider"
              value={props.provider}
              options={props.providerOptions}
              onChange={props.onProviderChange}
            />
          </label>
          <label>
            <span>{props.copy.config.model}</span>
            <SelectField id="model" value={props.model} options={props.modelSelectOptions} onChange={props.onModelChange} />
          </label>
          <label>
            <span>{props.copy.config.maxToolStepsLabel}</span>
            <small class="config-field-note">
              {interpolate(props.copy.config.maxToolStepsNote, {
                count: props.selectedModelPolicy.maxToolSteps
              })}
            </small>
            <input
              type="number"
              min={MIN_AGENT_RUNNER_MAX_TOOL_STEPS}
              max={MAX_AGENT_RUNNER_MAX_TOOL_STEPS}
              step="1"
              value={props.maxToolSteps}
              placeholder={String(props.selectedModelPolicy.definition?.maxToolSteps ?? props.selectedModelPolicy.maxToolSteps)}
              onInput={(event) => props.onMaxToolStepsChange(event.currentTarget.value)}
            />
          </label>
          <div classList={{ "model-capability": true, multimodal: props.selectedModelSupportsImages }}>
            <ImagePlus size={16} />
            <div>
              <strong>
                {props.selectedModelPolicy.isCustomModel
                  ? props.copy.config.toolCallingUnverified
                  : props.selectedModelSupportsImages
                    ? props.copy.config.supportsImages
                    : props.copy.config.textOnly}
              </strong>
              <p>
                {props.selectedModelPolicy.isCustomModel
                  ? props.copy.config.customModelDescription
                  : props.selectedModelSupportsImages
                    ? props.copy.config.imageModelDescription
                    : props.copy.config.textModelDescription}
              </p>
            </div>
          </div>
          <label class="wide">
            <span>{props.copy.config.apiKeyLabel}</span>
            <small class="config-field-note">{props.copy.config.localKeyNote}</small>
            <input
              type="password"
              value={props.apiKey}
              placeholder={props.copy.config.apiKeyPlaceholder}
              onInput={(event) => props.onApiKeyChange(event.currentTarget.value)}
            />
          </label>
        </div>
      </details>
    </SectionCard>
  );
}

export function ConfigAdvancedEndpointSection(props: {
  copy: RendererI18n;
  model: string;
  modelPlaceholder: string;
  customBaseUrl: string;
  selectedModelSupportsImages: boolean;
  visionModel: string;
  visionModelOptions: AgentModelOption[];
  visionProviderUsesPrimary: boolean;
  visionCustomBaseUrl: string;
  onModelChange: (value: string) => void;
  onCustomBaseUrlChange: (value: string) => void;
  onVisionModelChange: (value: string) => void;
  onVisionCustomBaseUrlChange: (value: string) => void;
}) {
  return (
    <SectionCard class="config-collapsible-card config-card-wide">
      <details class="config-collapsible config-collapsible-compact">
        <summary>
          <span>
            <strong><Terminal size={16} />{props.copy.config.advancedEndpointTitle}</strong>
            <small>{props.copy.config.advancedEndpointBody}</small>
          </span>
          <ChevronDown size={16} />
        </summary>
        <div class="config-grid">
          <label class="wide">
            <span>{props.copy.config.customModelId}</span>
            <input
              value={props.model}
              placeholder={props.modelPlaceholder}
              onInput={(event) => props.onModelChange(event.currentTarget.value)}
            />
          </label>
          <label class="wide">
            <span>{props.copy.config.customBaseUrl}</span>
            <input
              value={props.customBaseUrl}
              placeholder="https://api.example.com/v1"
              onInput={(event) => props.onCustomBaseUrlChange(event.currentTarget.value)}
            />
          </label>
          <Show when={!props.selectedModelSupportsImages}>
            <label class="wide">
              <span>{props.copy.config.visionCustomModelId}</span>
              <input
                value={props.visionModel}
                placeholder={props.visionModelOptions.find((option) => option.supportsImages)?.value ?? DEFAULT_VISION_MODEL_CONFIG.model}
                onInput={(event) => props.onVisionModelChange(event.currentTarget.value)}
              />
            </label>
            <label class="wide">
              <span>{props.copy.config.visionCustomBaseUrl}</span>
              <input
                value={props.visionCustomBaseUrl}
                placeholder={props.visionProviderUsesPrimary ? props.copy.config.visionUsesPrimaryEndpoint : "https://api.example.com/v1"}
                disabled={props.visionProviderUsesPrimary}
                onInput={(event) => props.onVisionCustomBaseUrlChange(event.currentTarget.value)}
              />
            </label>
          </Show>
        </div>
      </details>
    </SectionCard>
  );
}
