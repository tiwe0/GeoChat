import { createEffect, createMemo, createResource, createSignal } from "solid-js";
import {
  agentModelSupportsImagesForSchema,
  createAgentRunCoordinator,
  getAgentModelOptionsForSchema,
  getAgentModelPolicyForSchema,
  getAgentProviderOptionsForSchema,
  normalizeAgentRunnerMaxToolSteps,
  type AgentModelRegistrySchema,
  type AgentRunRunnerSnapshot,
  type RuntimeInfo
} from "@geochat-ai/app";
import {
  BUILTIN_AGENT_SKILL_NAMES,
  DEFAULT_SKILL_CONFIG,
  modelCapabilityOverviewFor,
  modelStepTimeoutSecondsInputValue
} from "./desktop-config";
import { ConfigMainDialog } from "./config-dialog/ConfigMainDialog";
import { createConfigAboutController } from "./config-dialog/config-dialog-about-controller";
import {
  deriveProviderChange,
  deriveSavedDesktopConfig,
  deriveVisionProviderChange,
  maxToolStepsInputValue,
  modelStepTimeoutSecondsToMs,
  modelOptionsWithCustom
} from "./config-dialog/config-dialog-state";
import { type Locale, type RendererI18n } from "./i18n";
import type {
  ConfigTab,
  DesktopConfig,
  ProviderCredentialConfig,
  RendererAppBundleUpdateState,
  RendererImprovementPlanState,
  RendererAccessState,
  RendererMcpStatus,
  RendererUnifiedUpdateState,
  RendererUpdateState,
  VisualProfileName
} from "./workbench-types";

type BuiltinAgentSkillName = (typeof BUILTIN_AGENT_SKILL_NAMES)[number];

function desktopHeaders(runtime?: RuntimeInfo): HeadersInit {
  return runtime?.backendAuthToken ? { authorization: `Bearer ${runtime.backendAuthToken}` } : {};
}

async function fetchAgentRunSnapshots(runtime: RuntimeInfo | undefined) {
  const coordinator = createAgentRunCoordinator({ backendBaseUrl: runtime?.backendBaseUrl, headers: () => desktopHeaders(runtime) });
  const runs = await coordinator.list();
  const snapshots = await Promise.all(runs.map((run) => coordinator.runnerSnapshot(run.runId).catch(() => undefined)));
  return snapshots.filter((snapshot): snapshot is AgentRunRunnerSnapshot => Boolean(snapshot));
}

export function ConfigDialog(props: {
  open: boolean;
  initialTab: ConfigTab;
  config: DesktopConfig;
  modelRegistrySchema?: AgentModelRegistrySchema;
  runtime?: RuntimeInfo;
  mcpStatus: RendererMcpStatus;
  accessState: RendererAccessState;
  updateState: RendererUpdateState;
  unifiedUpdateState: RendererUnifiedUpdateState;
  appBundleUpdateState: RendererAppBundleUpdateState;
  improvementPlanState: RendererImprovementPlanState;
  accessBusy: boolean;
  copy: RendererI18n;
  locale: Locale;
  onConfigChange: (config: DesktopConfig) => void;
  onLocaleChange: (locale: Locale) => void;
  onMcpEnabledChange: (enabled: boolean) => Promise<RendererMcpStatus>;
  onUpdateCheck: () => Promise<RendererUpdateState>;
  onUnifiedUpdateCheck: () => Promise<RendererUnifiedUpdateState>;
  onUpdateDownload: () => Promise<RendererUpdateState>;
  onUpdatePreferencesChange: (preferences: Partial<RendererUpdateState["preferences"]>) => Promise<RendererUpdateState>;
  onUpdateInstall: () => Promise<RendererUpdateState>;
  onAppBundleUpdateCheck: () => Promise<RendererAppBundleUpdateState>;
  onAppBundleUpdateInstall: () => Promise<RendererAppBundleUpdateState>;
  onAppBundleUpdateRollback: () => Promise<RendererAppBundleUpdateState>;
  onImprovementPlanChange: (preferences: Partial<RendererImprovementPlanState>) => Promise<RendererImprovementPlanState>;
  onOpenChange: (open: boolean) => void;
}) {
  const [activeTab, setActiveTab] = createSignal<ConfigTab>(props.initialTab);
  const [provider, setProvider] = createSignal(props.config.model.provider);
  const [model, setModel] = createSignal(props.config.model.model);
  const [apiKey, setApiKey] = createSignal(props.config.model.apiKey);
  const [customBaseUrl, setCustomBaseUrl] = createSignal(props.config.model.customBaseUrl);
  const [maxToolSteps, setMaxToolSteps] = createSignal(maxToolStepsInputValue(props.config.model.maxToolSteps));
  const [visionProvider, setVisionProvider] = createSignal(props.config.visionModel.provider);
  const [visionModel, setVisionModel] = createSignal(props.config.visionModel.model);
  const [visionApiKey, setVisionApiKey] = createSignal(props.config.visionModel.apiKey);
  const [visionCustomBaseUrl, setVisionCustomBaseUrl] = createSignal(props.config.visionModel.customBaseUrl);
  const [providerCredentials, setProviderCredentials] = createSignal<Record<string, ProviderCredentialConfig>>(props.config.providerCredentials);
  const [skillsEnabled, setSkillsEnabled] = createSignal(props.config.skills.enabled);
  const [skillAutoActivate, setSkillAutoActivate] = createSignal(props.config.skills.autoActivate);
  const [enabledSkillNames, setEnabledSkillNames] = createSignal<string[]>(props.config.skills.enabledSkillNames);
  const [visualProfile, setVisualProfile] = createSignal<VisualProfileName>(props.config.skills.visualProfile);
  const [modelStepTimeoutSeconds, setModelStepTimeoutSeconds] = createSignal(modelStepTimeoutSecondsInputValue(props.config.debug.modelStepTimeoutMs));
  const [mcpEnabled, setMcpEnabled] = createSignal(props.mcpStatus.enabled);
  const [mcpBusy, setMcpBusy] = createSignal(false);
  const providerOptions = createMemo(() => getAgentProviderOptionsForSchema(props.modelRegistrySchema));
  const modelOptions = createMemo(() => getAgentModelOptionsForSchema(provider(), props.modelRegistrySchema));
  const visionModelOptions = createMemo(() => getAgentModelOptionsForSchema(visionProvider(), props.modelRegistrySchema));
  const modelSelectOptions = createMemo(() => modelOptionsWithCustom(modelOptions(), model(), props.copy));
  const visionModelSelectOptions = createMemo(() => modelOptionsWithCustom(visionModelOptions(), visionModel(), props.copy));
  const selectedModelMaxToolSteps = createMemo(() => normalizeAgentRunnerMaxToolSteps(Number(maxToolSteps())));
  const selectedModelPolicy = createMemo(() => getAgentModelPolicyForSchema({
    provider: provider(),
    model: model(),
    maxToolSteps: selectedModelMaxToolSteps()
  }, props.modelRegistrySchema));
  const selectedModelSupportsImages = createMemo(() => agentModelSupportsImagesForSchema(provider(), model(), props.modelRegistrySchema));
  const selectedVisionModelPolicy = createMemo(() => getAgentModelPolicyForSchema({ provider: visionProvider(), model: visionModel() }, props.modelRegistrySchema));
  const selectedVisionModelSupportsImages = createMemo(() => agentModelSupportsImagesForSchema(visionProvider(), visionModel(), props.modelRegistrySchema));
  const currentModelConfig = createMemo(() => ({
    provider: provider(),
    model: model(),
    apiKey: apiKey(),
    customBaseUrl: customBaseUrl(),
    maxToolSteps: selectedModelMaxToolSteps()
  }));
  const currentVisionModelConfig = createMemo(() => ({
    provider: visionProvider(),
    model: visionModel(),
    apiKey: visionProvider() === provider() ? apiKey() : visionApiKey(),
    customBaseUrl: visionProvider() === provider() ? customBaseUrl() : visionCustomBaseUrl()
  }));
  const capabilityOverview = createMemo(() => modelCapabilityOverviewFor({
    model: currentModelConfig(),
    visionModel: currentVisionModelConfig(),
    schema: props.modelRegistrySchema
  }));
  const solvingAbilityReady = createMemo(() => capabilityOverview().solving);
  const visionAbilityReady = createMemo(() => capabilityOverview().vision);
  const fileParsingAbilityReady = createMemo(() => capabilityOverview().fileParsing);
  const enabledSkillNameSet = createMemo(() => new Set(enabledSkillNames()));
  const enabledBuiltinSkillCount = createMemo(() => BUILTIN_AGENT_SKILL_NAMES.filter((name) => enabledSkillNameSet().has(name)).length);
  const enabledSkillCountFor = (skills: readonly BuiltinAgentSkillName[]) => skills.filter((name) => enabledSkillNameSet().has(name)).length;
  const runLedgerSource = createMemo(() => (props.open && (activeTab() === "runs" || activeTab() === "debug") ? props.runtime : undefined));
  const [agentRunSnapshots, { refetch: refetchAgentRuns }] = createResource(runLedgerSource, fetchAgentRunSnapshots);
  const selectedModelStepTimeoutMs = createMemo(() => modelStepTimeoutSecondsToMs(modelStepTimeoutSeconds()));
  const aboutController = createConfigAboutController({
    copy: () => props.copy,
    updateState: () => props.updateState,
    unifiedUpdateState: () => props.unifiedUpdateState,
    appBundleUpdateState: () => props.appBundleUpdateState,
    improvementPlanState: () => props.improvementPlanState,
    onUnifiedUpdateCheck: props.onUnifiedUpdateCheck,
    onUpdateDownload: props.onUpdateDownload,
    onUpdateInstall: props.onUpdateInstall,
    onAppBundleUpdateInstall: props.onAppBundleUpdateInstall,
    onImprovementPlanChange: props.onImprovementPlanChange
  });
  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
  };
  createEffect(() => {
    if (!props.open) return;
    setProvider(props.config.model.provider);
    setModel(props.config.model.model);
    setApiKey(props.config.model.apiKey);
    setCustomBaseUrl(props.config.model.customBaseUrl);
    setMaxToolSteps(maxToolStepsInputValue(props.config.model.maxToolSteps));
    setVisionProvider(props.config.visionModel.provider);
    setVisionModel(props.config.visionModel.model);
    setVisionApiKey(props.config.visionModel.apiKey);
    setVisionCustomBaseUrl(props.config.visionModel.customBaseUrl);
    setProviderCredentials(props.config.providerCredentials);
    setSkillsEnabled(props.config.skills.enabled);
    setSkillAutoActivate(props.config.skills.autoActivate);
    setEnabledSkillNames(props.config.skills.enabledSkillNames);
    setVisualProfile(props.config.skills.visualProfile);
    setModelStepTimeoutSeconds(modelStepTimeoutSecondsInputValue(props.config.debug.modelStepTimeoutMs));
    setMcpEnabled(props.mcpStatus.enabled);
  });

  let wasOpen = props.open;
  let previousInitialTab = props.initialTab;
  createEffect(() => {
    const open = props.open;
    const initialTab = props.initialTab;
    if (open && (!wasOpen || initialTab !== previousInitialTab)) {
      setActiveTab(initialTab);
    }
    wasOpen = open;
    previousInitialTab = initialTab;
  });

  async function changeMcpEnabled(nextEnabled: boolean) {
    if (!props.mcpStatus.available || mcpBusy()) return;
    setMcpBusy(true);
    setMcpEnabled(nextEnabled);
    try {
      const status = await props.onMcpEnabledChange(nextEnabled);
      setMcpEnabled(status.enabled);
    } finally {
      setMcpBusy(false);
    }
  }

  function providerFormState() {
    return {
      provider: provider(),
      apiKey: apiKey(),
      customBaseUrl: customBaseUrl(),
      visionProvider: visionProvider(),
      visionApiKey: visionApiKey(),
      visionCustomBaseUrl: visionCustomBaseUrl(),
      providerCredentials: providerCredentials()
    };
  }

  function changeProvider(value: string) {
    const next = deriveProviderChange({
      ...providerFormState(),
      nextProvider: value,
      modelRegistrySchema: props.modelRegistrySchema
    });
    setProviderCredentials(next.providerCredentials);
    setProvider(next.provider);
    setModel(next.model);
    setApiKey(next.apiKey);
    setCustomBaseUrl(next.customBaseUrl);
  }

  function changeVisionProvider(value: string) {
    const next = deriveVisionProviderChange({
      ...providerFormState(),
      nextProvider: value,
      modelRegistrySchema: props.modelRegistrySchema
    });
    setProviderCredentials(next.providerCredentials);
    setVisionProvider(next.visionProvider);
    setVisionModel(next.visionModel);
    setVisionApiKey(next.visionApiKey);
    setVisionCustomBaseUrl(next.visionCustomBaseUrl);
  }

  function changeSkillEnabled(name: string, enabled: boolean) {
    setEnabledSkillNames((current) => {
      const names = new Set(current);
      if (enabled) names.add(name);
      else names.delete(name);
      return Array.from(names);
    });
  }

  function resetBuiltinSkills() {
    setEnabledSkillNames([...DEFAULT_SKILL_CONFIG.enabledSkillNames]);
  }

  function saveConfig() {
    const nextConfig = deriveSavedDesktopConfig({
      ...providerFormState(),
      baseConfig: props.config,
      model: model(),
      maxToolSteps: selectedModelMaxToolSteps(),
      visionModel: visionModel(),
      skillsEnabled: skillsEnabled(),
      skillAutoActivate: skillAutoActivate(),
      enabledSkillNames: enabledSkillNames(),
      visualProfile: visualProfile(),
      modelStepTimeoutSeconds: modelStepTimeoutSeconds()
    });
    props.onConfigChange(nextConfig);
    props.onOpenChange(false);
  }

  return (
    <ConfigMainDialog
      open={props.open}
      copy={props.copy}
      locale={props.locale}
      activeTab={activeTab()}
      provider={provider()}
      providerOptions={providerOptions()}
      model={model()}
      modelSelectOptions={modelSelectOptions()}
      modelOptions={modelOptions()}
      maxToolSteps={maxToolSteps()}
      selectedModelPolicy={selectedModelPolicy()}
      selectedModelSupportsImages={selectedModelSupportsImages()}
      apiKey={apiKey()}
      visionProvider={visionProvider()}
      visionModel={visionModel()}
      visionModelOptions={visionModelOptions()}
      visionModelSelectOptions={visionModelSelectOptions()}
      visionApiKey={visionApiKey()}
      selectedVisionModelPolicy={selectedVisionModelPolicy()}
      selectedVisionModelSupportsImages={selectedVisionModelSupportsImages()}
      customBaseUrl={customBaseUrl()}
      visionCustomBaseUrl={visionCustomBaseUrl()}
      solvingAbilityReady={solvingAbilityReady()}
      visionAbilityReady={visionAbilityReady()}
      fileParsingAbilityReady={fileParsingAbilityReady()}
      skillsEnabled={skillsEnabled()}
      skillAutoActivate={skillAutoActivate()}
      visualProfile={visualProfile()}
      enabledSkillNameSet={enabledSkillNameSet()}
      enabledBuiltinSkillCount={enabledBuiltinSkillCount()}
      enabledSkillCountFor={enabledSkillCountFor}
      runSnapshots={agentRunSnapshots()}
      runsLoading={agentRunSnapshots.loading}
      runsError={agentRunSnapshots.error}
      mcpStatus={props.mcpStatus}
      mcpEnabled={mcpEnabled()}
      mcpBusy={mcpBusy()}
      wechatCopied={aboutController.wechatCopied()}
      updateState={props.updateState}
      unifiedUpdateState={props.unifiedUpdateState}
      appBundleUpdateState={props.appBundleUpdateState}
      updateStatusBody={aboutController.updateStatusBody()}
      primaryUpdateActionBusy={aboutController.isPrimaryUpdateActionBusy()}
      primaryUpdateActionLabel={aboutController.currentPrimaryUpdateActionLabel()}
      improvementPlanState={props.improvementPlanState}
      improvementPlanBusy={aboutController.improvementPlanBusy()}
      modelStepTimeoutSeconds={modelStepTimeoutSeconds()}
      selectedModelStepTimeoutMs={selectedModelStepTimeoutMs()}
      onOpenChange={handleOpenChange}
      onTabChange={setActiveTab}
      onProviderChange={changeProvider}
      onModelChange={setModel}
      onMaxToolStepsChange={setMaxToolSteps}
      onApiKeyChange={setApiKey}
      onVisionProviderChange={changeVisionProvider}
      onVisionModelChange={setVisionModel}
      onVisionApiKeyChange={setVisionApiKey}
      onCustomBaseUrlChange={setCustomBaseUrl}
      onVisionCustomBaseUrlChange={setVisionCustomBaseUrl}
      onSkillsEnabledChange={setSkillsEnabled}
      onSkillAutoActivateChange={setSkillAutoActivate}
      onVisualProfileChange={setVisualProfile}
      onSkillEnabledChange={changeSkillEnabled}
      onResetBuiltinSkills={resetBuiltinSkills}
      onRefreshRuns={() => void refetchAgentRuns()}
      onModelStepTimeoutSecondsChange={setModelStepTimeoutSeconds}
      onMcpEnabledChange={(value) => void changeMcpEnabled(value)}
      onCopyWechat={() => void aboutController.copyWechat()}
      onPrimaryUpdateAction={() => void aboutController.runPrimaryUpdateAction()}
      onImprovementPlanEnabledChange={(value) => void aboutController.changeImprovementPlanEnabled(value)}
      onSave={saveConfig}
    />
  );
}
