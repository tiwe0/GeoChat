import { ChevronDown, ImagePlus } from "lucide-solid";
import { getAgentModelPolicyForSchema, type AgentModelOption } from "@geochat-ai/app";
import type { RendererI18n } from "../i18n";
import { SectionCard, SelectField } from "../workbench-ui";

type ModelPolicy = ReturnType<typeof getAgentModelPolicyForSchema>;
type SelectOption = { value: string; label: string };

export function ConfigVisionProviderSection(props: {
  copy: RendererI18n;
  provider: string;
  providerOptions: SelectOption[];
  model: string;
  modelSelectOptions: AgentModelOption[];
  apiKey: string;
  usesPrimaryProvider: boolean;
  selectedVisionModelPolicy: ModelPolicy;
  selectedVisionModelSupportsImages: boolean;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
}) {
  return (
    <SectionCard class="config-collapsible-card config-card-wide">
      <details class="config-collapsible" open>
        <summary>
          <span>
            <strong><ImagePlus size={16} />{props.copy.config.imageUnderstandingTitle}</strong>
            <small>{props.copy.config.imageUnderstandingBody}</small>
          </span>
          <ChevronDown size={16} />
        </summary>
        <div class="config-grid">
          <label>
            <span>{props.copy.config.visionModelProvider}</span>
            <SelectField
              id="vision-provider"
              value={props.provider}
              options={props.providerOptions}
              onChange={props.onProviderChange}
            />
          </label>
          <label>
            <span>{props.copy.config.visionModel}</span>
            <SelectField id="vision-model" value={props.model} options={props.modelSelectOptions} onChange={props.onModelChange} />
          </label>
          <label class="wide">
            <span>{props.copy.config.visionApiKeyLabel}</span>
            <small class="config-field-note">{props.copy.config.localKeyNote}</small>
            <input
              type="password"
              value={props.apiKey}
              placeholder={props.usesPrimaryProvider ? props.copy.config.visionUsesPrimaryKey : props.copy.config.apiKeyPlaceholder}
              disabled={props.usesPrimaryProvider}
              onInput={(event) => props.onApiKeyChange(event.currentTarget.value)}
            />
          </label>
          <div classList={{ "model-capability": true, multimodal: props.selectedVisionModelSupportsImages }}>
            <ImagePlus size={16} />
            <div>
              <strong>
                {props.selectedVisionModelPolicy.isCustomModel
                  ? props.copy.config.toolCallingUnverified
                  : props.selectedVisionModelSupportsImages
                    ? props.copy.config.supportsImages
                    : props.copy.config.textOnly}
              </strong>
              <p>
                {props.selectedVisionModelPolicy.isCustomModel
                  ? props.copy.config.visionCustomModelDescription
                  : props.selectedVisionModelSupportsImages
                    ? props.copy.config.visionImageModelDescription
                    : props.copy.config.visionTextModelDescription}
              </p>
            </div>
          </div>
        </div>
      </details>
    </SectionCard>
  );
}
