import { Dialog } from "@kobalte/core/dialog";
import { Save, X } from "lucide-solid";
import { Show } from "solid-js";
import {
  getAgentModelPolicyForSchema,
  type AgentModelOption,
  type AgentRunRunnerSnapshot
} from "@geochat-ai/app";
import type { Locale, RendererI18n } from "../i18n";
import type { BUILTIN_AGENT_SKILL_NAMES } from "../desktop-config";
import type {
  ConfigTab,
  RendererAppBundleUpdateState,
  RendererImprovementPlanState,
  RendererMcpStatus,
  RendererUnifiedUpdateState,
  RendererUpdateState,
  VisualProfileName
} from "../workbench-types";
import { ConfigCreditsSection } from "./ConfigAboutSection";
import { ConfigAboutTab } from "./ConfigAboutTab";
import { ConfigDebugSection, ConfigExternalMcpSection, ConfigMemorySection } from "./ConfigMcpSection";
import { ConfigModelTab } from "./ConfigModelTab";
import { ConfigRunsSection } from "./ConfigRunsSection";
import { ConfigSkillsSection } from "./ConfigSkillsSection";
import { ConfigTabs } from "./ConfigTabs";

type BuiltinAgentSkillName = (typeof BUILTIN_AGENT_SKILL_NAMES)[number];
type ModelPolicy = ReturnType<typeof getAgentModelPolicyForSchema>;
type SelectOption = { value: string; label: string };

export function ConfigMainDialog(props: {
  open: boolean;
  copy: RendererI18n;
  locale: Locale;
  activeTab: ConfigTab;
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
  solvingAbilityReady: boolean;
  visionAbilityReady: boolean;
  fileParsingAbilityReady: boolean;
  skillsEnabled: boolean;
  skillAutoActivate: boolean;
  visualProfile: VisualProfileName;
  enabledSkillNameSet: Set<string>;
  enabledBuiltinSkillCount: number;
  enabledSkillCountFor: (skills: readonly BuiltinAgentSkillName[]) => number;
  runSnapshots: AgentRunRunnerSnapshot[] | undefined;
  runsLoading: boolean;
  runsError: unknown;
  mcpStatus: RendererMcpStatus;
  mcpEnabled: boolean;
  mcpBusy: boolean;
  wechatCopied: boolean;
  updateState: RendererUpdateState;
  unifiedUpdateState: RendererUnifiedUpdateState;
  appBundleUpdateState: RendererAppBundleUpdateState;
  updateStatusBody: string;
  primaryUpdateActionBusy: boolean;
  primaryUpdateActionLabel: string;
  improvementPlanState: RendererImprovementPlanState;
  improvementPlanBusy: boolean;
  modelStepTimeoutSeconds: string;
  selectedModelStepTimeoutMs: number;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: ConfigTab) => void;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onMaxToolStepsChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onVisionProviderChange: (value: string) => void;
  onVisionModelChange: (value: string) => void;
  onVisionApiKeyChange: (value: string) => void;
  onCustomBaseUrlChange: (value: string) => void;
  onVisionCustomBaseUrlChange: (value: string) => void;
  onSkillsEnabledChange: (value: boolean) => void;
  onSkillAutoActivateChange: (value: boolean) => void;
  onVisualProfileChange: (value: VisualProfileName) => void;
  onSkillEnabledChange: (name: string, enabled: boolean) => void;
  onResetBuiltinSkills: () => void;
  onRefreshRuns: () => void;
  onModelStepTimeoutSecondsChange: (value: string) => void;
  onMcpEnabledChange: (value: boolean) => void;
  onCopyWechat: () => void;
  onPrimaryUpdateAction: () => void;
  onImprovementPlanEnabledChange: (enabled: boolean) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class="dialog-scrim" />
        <Dialog.Content
          class="config-dialog"
          onPointerDownOutside={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest(".select-field-menu")) {
              event.preventDefault();
            }
          }}
        >
          <header class="config-header">
            <span>{props.copy.config.eyebrow}</span>
            <Dialog.Title class="config-title">{props.copy.config.title}</Dialog.Title>
            <Dialog.CloseButton class="icon-button" title={props.copy.config.close} data-tooltip={props.copy.config.close} aria-label={props.copy.config.close}>
              <X size={16} />
            </Dialog.CloseButton>
          </header>
          <div class="config-body">
            <ConfigTabs copy={props.copy} activeTab={props.activeTab} onTabChange={props.onTabChange} />
            <div class="config-content">
              <Show when={props.activeTab === "model"}>
                <ConfigModelTab
                  copy={props.copy}
                  solvingAbilityReady={props.solvingAbilityReady}
                  visionAbilityReady={props.visionAbilityReady}
                  fileParsingAbilityReady={props.fileParsingAbilityReady}
                  provider={props.provider}
                  providerOptions={props.providerOptions}
                  model={props.model}
                  modelSelectOptions={props.modelSelectOptions}
                  modelOptions={props.modelOptions}
                  maxToolSteps={props.maxToolSteps}
                  selectedModelPolicy={props.selectedModelPolicy}
                  selectedModelSupportsImages={props.selectedModelSupportsImages}
                  apiKey={props.apiKey}
                  visionProvider={props.visionProvider}
                  visionModel={props.visionModel}
                  visionModelOptions={props.visionModelOptions}
                  visionModelSelectOptions={props.visionModelSelectOptions}
                  visionApiKey={props.visionApiKey}
                  selectedVisionModelPolicy={props.selectedVisionModelPolicy}
                  selectedVisionModelSupportsImages={props.selectedVisionModelSupportsImages}
                  customBaseUrl={props.customBaseUrl}
                  visionCustomBaseUrl={props.visionCustomBaseUrl}
                  onProviderChange={props.onProviderChange}
                  onModelChange={props.onModelChange}
                  onMaxToolStepsChange={props.onMaxToolStepsChange}
                  onApiKeyChange={props.onApiKeyChange}
                  onVisionProviderChange={props.onVisionProviderChange}
                  onVisionModelChange={props.onVisionModelChange}
                  onVisionApiKeyChange={props.onVisionApiKeyChange}
                  onCustomBaseUrlChange={props.onCustomBaseUrlChange}
                  onVisionCustomBaseUrlChange={props.onVisionCustomBaseUrlChange}
                />
              </Show>
              <Show when={props.activeTab === "skills"}>
                <ConfigSkillsSection
                  copy={props.copy}
                  skillsEnabled={props.skillsEnabled}
                  skillAutoActivate={props.skillAutoActivate}
                  visualProfile={props.visualProfile}
                  enabledSkillNameSet={props.enabledSkillNameSet}
                  enabledBuiltinSkillCount={props.enabledBuiltinSkillCount}
                  enabledSkillCountFor={props.enabledSkillCountFor}
                  onSkillsEnabledChange={props.onSkillsEnabledChange}
                  onSkillAutoActivateChange={props.onSkillAutoActivateChange}
                  onVisualProfileChange={props.onVisualProfileChange}
                  onSkillEnabledChange={props.onSkillEnabledChange}
                  onResetBuiltinSkills={props.onResetBuiltinSkills}
                />
              </Show>
              <Show when={props.activeTab === "externalMcp"}>
                <ConfigExternalMcpSection copy={props.copy} />
              </Show>
              <Show when={props.activeTab === "memory"}>
                <ConfigMemorySection copy={props.copy} />
              </Show>
              <Show when={props.activeTab === "runs"}>
                <ConfigRunsSection
                  copy={props.copy}
                  locale={props.locale}
                  snapshots={props.runSnapshots}
                  loading={props.runsLoading}
                  error={props.runsError}
                  onRefresh={props.onRefreshRuns}
                />
              </Show>
              <Show when={props.activeTab === "debug"}>
                <ConfigDebugSection
                  copy={props.copy}
                  locale={props.locale}
                  snapshots={props.runSnapshots}
                  snapshotsLoading={props.runsLoading}
                  snapshotsError={props.runsError}
                  modelStepTimeoutSeconds={props.modelStepTimeoutSeconds}
                  selectedModelStepTimeoutMs={props.selectedModelStepTimeoutMs}
                  status={props.mcpStatus}
                  enabled={props.mcpEnabled}
                  busy={props.mcpBusy}
                  onRefreshRuns={props.onRefreshRuns}
                  onModelStepTimeoutSecondsChange={props.onModelStepTimeoutSecondsChange}
                  onEnabledChange={props.onMcpEnabledChange}
                />
              </Show>
              <Show when={props.activeTab === "about"}>
                <ConfigAboutTab
                  copy={props.copy}
                  wechatCopied={props.wechatCopied}
                  updateState={props.updateState}
                  unifiedUpdateState={props.unifiedUpdateState}
                  appBundleUpdateState={props.appBundleUpdateState}
                  updateStatusBody={props.updateStatusBody}
                  primaryUpdateActionBusy={props.primaryUpdateActionBusy}
                  primaryUpdateActionLabel={props.primaryUpdateActionLabel}
                  improvementPlanState={props.improvementPlanState}
                  improvementPlanBusy={props.improvementPlanBusy}
                  onCopyWechat={props.onCopyWechat}
                  onPrimaryUpdateAction={props.onPrimaryUpdateAction}
                  onImprovementPlanEnabledChange={props.onImprovementPlanEnabledChange}
                />
              </Show>
              <Show when={props.activeTab === "credits"}>
                <ConfigCreditsSection copy={props.copy} />
              </Show>
            </div>
          </div>
          <footer class="config-footer">
            <button class="app-button secondary" type="button" onClick={() => props.onOpenChange(false)}>
              {props.copy.config.cancel}
            </button>
            <button class="app-button" type="button" onClick={props.onSave}>
              <Save size={16} />{props.copy.config.save}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
