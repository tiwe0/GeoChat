import { createEffect, createMemo, createSignal, Show } from "solid-js";
import {
  findForbiddenTwoDimensionalStyleCommands,
  twoDimensionalStylePolicyMessage
} from "@geochat-ai/app";
import { createGeoGebraController } from "./geogebra";
import { AppChrome } from "./AppChrome";
import { LatexText } from "./LatexText";
import ProblemBankPage from "./ProblemBankPage";
import { ConfigDialog } from "./ConfigDialog";
import { FloatingChatPanel, type ChoiceScenarioPreviewInput, type ChoiceScenarioPreviewResult } from "./ChatPanel";
import { GeoGebraStage } from "./GeoGebraStage";
import { createProblemBankState } from "./workbench-problem-bank";
import { createImageAttachmentState } from "./workbench-image-attachments";
import { createBlackboardState } from "./workbench-blackboard-state";
import { createConversationHistoryState } from "./workbench-history-state";
import { createMcpState } from "./workbench-mcp-state";
import { createDesktopConfigState } from "./workbench-desktop-config-state";
import { createWorkbenchShellState } from "./workbench-shell-state";
import { createWorkbenchConversationState } from "./workbench-conversation-state";
import { createDesktopDebugActionExecutor } from "./workbench-debug-actions";
import { createWorkbenchUpdateState } from "./workbench-update-state";
import { createWorkbenchImprovementState } from "./workbench-improvement-state";
import { createWorkbenchAccessState } from "./workbench-access-state";
import { createWorkbenchRuntimeState } from "./workbench-runtime-state";
import {
  recoverPendingBackendRunner
} from "./workbench-backend-runner";
import { createWorkbenchChatWorkflow } from "./workbench-chat-workflow";
import { createWorkbenchActions } from "./workbench-actions";
import { rendererI18n } from "./i18n";
import type {
  DesktopChatMessage,
  RendererMcpStatus
} from "./workbench-types";
import "./styles.css";

function defaultAssistantMessageKind(content: string) {
  const copies = [rendererI18n("zh-CN"), rendererI18n("en-US")];
  if (copies.some((item) => item.chat.initialAssistant === content)) return "initial";
  if (copies.some((item) => item.chat.newConversationCreated === content)) return "new-conversation";
  return null;
}
export default function WorkbenchApp() {
  const desktop = createDesktopConfigState();
  const desktopConfig = desktop.config;
  const copy = desktop.copy;
  const locale = desktop.locale;
  const minimized = desktop.minimized;
  const [draft, setDraft] = createSignal("");
  const [isRunning, setIsRunning] = createSignal(false);
  const shell = createWorkbenchShellState();
  const view = shell.view;
  const runtimeState = createWorkbenchRuntimeState();
  const runtime = runtimeState.runtime;
  const access = createWorkbenchAccessState({
    refetchRuntime: () => void runtimeState.refetchRuntime()
  });
  const updates = createWorkbenchUpdateState({ runtime });
  const improvement = createWorkbenchImprovementState({
    runtime,
    accessState: access.accessState,
    config: desktopConfig,
    locale
  });
  const problemBankRuntime = createMemo(() => (access.accessState().features.problemBank ? runtime() : undefined));
  const problemBank = createProblemBankState(problemBankRuntime, locale);
  const geogebra = createGeoGebraController(runtime, locale);
  const choiceScenarioBaseXmlByCard = new Map<string, string>();
  const conversation = createWorkbenchConversationState({
    initialAssistantContent: desktop.copy().chat.initialAssistant,
    initialLocale: desktop.initial.locale
  });
  const conversationId = conversation.id;
  const messages = conversation.messages;
  const blackboard = createBlackboardState({ runtime, conversationId });
  const history = createConversationHistoryState({
    runtime,
    onMessagePersisted: (conversationIdValue) => void blackboard.refresh(conversationIdValue)
  });
  const imageAttachmentState = createImageAttachmentState({
    config: desktopConfig,
    modelRegistrySchema: runtimeState.modelRegistrySchema,
    copy,
    createAssistantMessage: (content) => conversation.createAssistantMessage(content, locale()),
    appendMessage: conversation.appendMessage
  });
  const expandPanel = () => {
    if (minimized()) desktop.updateMinimized(false);
  };
  createEffect(() => {
    conversationId();
    choiceScenarioBaseXmlByCard.clear();
  });
  createEffect(() => {
    const currentMessages = messages();
    const firstMessage = currentMessages[0];
    if (currentMessages.length !== 1 || firstMessage?.role !== "assistant") return;
    const defaultKind = defaultAssistantMessageKind(firstMessage.content);
    if (!defaultKind) return;
    const nextContent = defaultKind === "initial" ? copy().chat.initialAssistant : copy().chat.newConversationCreated;
    if (firstMessage.content === nextContent) return;
    conversation.updateMessage(firstMessage.id, (message) => ({ ...message, content: nextContent }));
  });
  async function previewChoiceScenario(input: ChoiceScenarioPreviewInput): Promise<ChoiceScenarioPreviewResult> {
    const commands = input.commands.map((command) => command.trim()).filter(Boolean);
    const baseXml = choiceScenarioBaseXmlByCard.get(input.cardKey) || geogebra.getCanvasXml();
    if (baseXml && !choiceScenarioBaseXmlByCard.has(input.cardKey)) {
      choiceScenarioBaseXmlByCard.set(input.cardKey, baseXml);
    }
    if (!commands.length && !baseXml) return { ok: true };
    const styleViolations = findForbiddenTwoDimensionalStyleCommands({ commands });
    if (styleViolations.length) {
      return {
        ok: false,
        error: twoDimensionalStylePolicyMessage(styleViolations, locale())
      };
    }
    const result = await geogebra.executeCommands(commands, {
      restoreBeforeXml: baseXml,
      restoreOnError: true,
      normalizeFreeParameters: true
    });
    return {
      ok: result.ok,
      error: result.error ?? null
    };
  }
  const chat = createWorkbenchChatWorkflow({
    draft,
    setDraft,
    isRunning,
    setIsRunning,
    config: desktopConfig,
    modelRegistrySchema: runtimeState.modelRegistrySchema,
    runtime,
    geogebra,
    conversation,
    blackboard,
    history,
    imageAttachments: imageAttachmentState,
    copy,
    locale,
    startIntroDissolve: shell.startIntroDissolve,
    expandPanel,
    persistChatMessage
  });
  const actions = createWorkbenchActions({
    isRunning,
    setDraft,
    conversation,
    history,
    blackboard,
    shell,
    geogebra,
    copy,
    locale,
    expandPanel,
    togglePanelMinimized: () => desktop.updateMinimized(!minimized()),
    sendMessage: chat.sendMessage
  });
  let mcpStatus: () => RendererMcpStatus = () => ({
    available: false,
    enabled: false,
    running: false,
    endpoint: null,
    healthUrl: null,
    port: 17369,
    pid: null,
    error: null
  });
  const executeDesktopDebugAction = createDesktopDebugActionExecutor({
    runtime,
    isRunning,
    conversationId,
    view,
    modelConfig: () => desktopConfig().model,
    mcpStatus: () => mcpStatus(),
    geogebra,
    activateConversation: actions.activateDebugConversation,
    sendMessage: chat.sendMessage,
    showChat: shell.showChat,
    showProblemBank: shell.showProblemBank,
    expandPanel,
    cacheProblemDetail: problemBank.cacheProblemDetail,
    selectProblem: problemBank.setSelectedProblemId,
    useProblem: actions.useProblem
  });
  const mcp = createMcpState({
    authToken: runtimeState.backendAuthToken,
    executeDebugAction: executeDesktopDebugAction
  });
  mcpStatus = mcp.status;

  function changeConfigOpen(open: boolean) {
    shell.setConfigOpen(open);
  }

  let runnerRecoveryAttempted = false;
  createEffect(() => {
    const info = runtime();
    if (!info || runnerRecoveryAttempted) return;
    runnerRecoveryAttempted = true;
    void recoverPendingBackendRunner({
      info,
      conversation,
      conversationId,
      copy,
      locale,
      modelConfig: () => desktopConfig().model,
      runtime,
      geogebra,
      isRunning,
      setIsRunning,
      expandPanel,
      setActiveHistoryId: history.setActiveId,
      refreshBlackboard: blackboard.refresh,
      persistChatMessage
    });
  });

  async function persistChatMessage(conversationIdValue: string, message: DesktopChatMessage) {
    await history.persistMessage(conversationIdValue, message);
    improvement.enqueueMessage({ conversationId: conversationIdValue, message });
  }

  return (
    <main class="chat-workbench">
      <AppChrome
        copy={copy()}
        locale={locale()}
        minimized={minimized()}
        view={view()}
        historyOpen={history.open()}
        moreOpen={shell.moreOpen()}
        isRunning={isRunning()}
        canvasRebuildBusy={actions.canvasRebuildBusy()}
        exportBusy={actions.exportBusy()}
        geogebraReady={geogebra.isReady()}
        geogebraLoading={geogebra.isLoading()}
        onLocaleChange={desktop.updateLocale}
        onToggleChatPanel={actions.toggleChatPanel}
        onCreateConversation={actions.createConversation}
        onOpenHistory={actions.openHistoryFromChrome}
        onRebuildCanvas={() => void actions.rebuildCanvas()}
        onDownloadGgb={() => void actions.downloadGgb()}
        onToggleProblemBank={shell.toggleProblemBankView}
        onToggleMore={shell.toggleMore}
        onOpenSettings={shell.openSettings}
        onBackToWorkbench={shell.backToWorkbenchFromMenu}
      />

      <GeoGebraStage
        containerId={geogebra.containerId}
        setContainer={geogebra.setContainer}
        isReady={geogebra.isReady()}
        isRunning={isRunning()}
        view={view()}
        introVisible={shell.introVisible()}
        introDissolving={shell.introDissolving()}
        loadError={geogebra.loadError()}
        loadMessages={geogebra.loadMessages()}
        healthStatus={runtimeState.health()?.status}
        modelProvider={desktopConfig().model.provider}
        modelId={desktopConfig().model.model}
        selectedObjects={geogebra.selectedObjects()}
        copy={copy()}
      />

      <div class="workbench-view-layer" classList={{ active: view() === "chat" }}>
        <FloatingChatPanel
          messages={messages()}
          blackboardEntries={blackboard.entries()}
          blackboardError={blackboard.error()}
          LatexText={LatexText}
          blackboardOpen={blackboard.open()}
          draft={draft()}
          isRunning={isRunning()}
          imageUploadEnabled={imageAttachmentState.enabled()}
          imageUploadDisabledReason={imageAttachmentState.disabledReason()}
          attachments={imageAttachmentState.attachments()}
          minimized={minimized()}
          showDrawer={history.open()}
          historyItems={history.items()}
          activeHistoryId={history.activeId()}
          historyQuery={history.query()}
          replayingCallId={actions.commandReplayBusyId()}
          copy={copy()}
          locale={locale()}
          onToggleBlackboard={blackboard.toggleOpen}
          onDraft={setDraft}
          onSend={() => void chat.sendMessage()}
          onStop={chat.stopCurrentRun}
          onAddImages={(files) => void imageAttachmentState.add(files)}
          onRemoveImage={imageAttachmentState.remove}
          onUploadBlocked={imageAttachmentState.notifyBlocked}
          onToggleMinimized={() => desktop.updateMinimized(!minimized())}
          onToggleDrawer={history.toggleOpen}
          onCreateConversation={actions.createConversation}
          onHistoryQueryChange={history.setQuery}
          onSelectHistory={(id) => void actions.selectHistoryConversation(id)}
          onDeleteHistory={(id) => void actions.deleteHistoryConversation(id)}
          onPreviewChoiceScenario={previewChoiceScenario}
          onReplayCommands={(call) => void actions.replayToolCommands(call)}
        />
      </div>

      <div class="workbench-view-layer" classList={{ active: view() === "problem-bank" }}>
        <ProblemBankPage
          locked={!access.accessState().features.problemBank}
          sets={access.accessState().features.problemBank ? problemBank.problemSets.latest ?? [] : []}
          setsLoading={access.accessState().features.problemBank && problemBank.problemSets.loading}
          setsError={problemBank.problemSets.error}
          problems={problemBank.displayProblemList()?.problems ?? []}
          total={problemBank.displayProblemList()?.total ?? 0}
          problemsLoading={problemBank.problemList.loading}
          problemsError={problemBank.problemList.error}
          problemsLoadingMore={problemBank.problemListLoadingMore()}
          problemsLoadMoreError={problemBank.problemListLoadMoreError()}
          hasMoreProblems={Boolean(problemBank.displayProblemList()?.nextCursor)}
          activeSetId={problemBank.activeProblemSetId()}
          selectedProblemId={problemBank.selectedProblemId()}
          selectedProblem={problemBank.selectedProblemForDisplay()}
          selectedProblemLoading={problemBank.selectedProblem.loading}
          filters={problemBank.problemFilters()}
          copy={copy()}
          locale={locale()}
          LatexText={LatexText}
          onBack={shell.showChat}
          onSelectSet={problemBank.selectProblemSet}
          onSelectProblem={problemBank.setSelectedProblemId}
          onFiltersChange={problemBank.setProblemFilters}
          onLoadMoreProblems={() => void problemBank.loadMoreProblems()}
          onUseProblem={actions.useProblem}
        />
      </div>

      <ConfigDialog
        open={shell.configOpen()}
        initialTab={shell.configInitialTab()}
        config={desktopConfig()}
        modelRegistrySchema={runtimeState.modelRegistrySchema()}
        runtime={runtime()}
        mcpStatus={mcp.status()}
        accessState={access.accessState()}
        updateState={updates.updateState()}
        unifiedUpdateState={updates.unifiedUpdateState()}
        appBundleUpdateState={updates.appBundleUpdateState()}
        improvementPlanState={improvement.improvementPlanState()}
        accessBusy={access.accessBusy()}
        copy={copy()}
        locale={locale()}
        onConfigChange={desktop.commit}
        onLocaleChange={desktop.updateLocale}
        onMcpEnabledChange={mcp.setEnabled}
        onUpdateCheck={updates.checkForUpdates}
        onUnifiedUpdateCheck={updates.checkAllUpdates}
        onUpdateDownload={updates.downloadUpdate}
        onUpdatePreferencesChange={updates.changeUpdatePreferences}
        onUpdateInstall={updates.installUpdate}
        onAppBundleUpdateCheck={updates.checkAppBundleUpdate}
        onAppBundleUpdateInstall={updates.installAppBundleUpdate}
        onAppBundleUpdateRollback={updates.rollbackAppBundleUpdate}
        onImprovementPlanChange={improvement.changeImprovementPlanPreferences}
        onOpenChange={changeConfigOpen}
      />
      <div class="workbench-toast-stack" aria-live="polite">
        <Show when={imageAttachmentState.notice()}>
          <div class="upload-toast" role="status">{imageAttachmentState.notice()}</div>
        </Show>
        <Show when={actions.exportNotice()}>
          <div class="upload-toast" role="status">{actions.exportNotice()}</div>
        </Show>
        <Show when={actions.canvasRebuildNotice()}>
          <div class="upload-toast" role="status">{actions.canvasRebuildNotice()}</div>
        </Show>
        <Show when={actions.commandReplayNotice()}>
          <div class="upload-toast" role="status">{actions.commandReplayNotice()}</div>
        </Show>
      </div>
    </main>
  );
}
