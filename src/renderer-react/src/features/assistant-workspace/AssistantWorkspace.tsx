import type { Step } from "react-joyride";
import {
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "motion/react";
import { AssistantRuntimeProvider, type AssistantRuntime } from "@assistant-ui/react";
import { useAgentRunChat } from "../../hooks/useAgentRunChat";
import { formatAgentRunError } from "../agent-run/errorMessage";
import { useLocalSession } from "../local-session/useLocalSession";
import { SettingsPanel } from "../desktop/SettingsPanel";
import { useConversations } from "../conversations/useConversations";
import { useConversationBlackboard } from "../conversations/useConversationBlackboard";
import { usePanelWindow } from "../panel-window/usePanelWindow";
import { LanguageButton } from "../../components/LanguageButton";
import { ModelMenu } from "../../components/ModelMenu";
import { backendAuthToken, backendOrigin } from "../desktop/runtime";
import type { GeoGebraSelectionContext, GeoGebraSelectionRefreshReason } from "../../geogebra/selection-context";
import {
  useFusionModeController,
  useInteractionMode,
  useInteractionModeTransition,
} from "../fusion-mode";
import { useOnboardingState } from "./useOnboardingState";
import { useAssistantModelState } from "./useAssistantModelState";
import { AssistantFusionSurface } from "./AssistantFusionSurface";
import { AssistantWindowSurface } from "./AssistantWindowSurface";
import { useProblemBankPanel } from "./useProblemBankPanel";
import { useAssistantSubmission } from "./useAssistantSubmission";
import { useAssistantSessionState } from "./useAssistantSessionState";
import { useAssistantFusionPanel } from "./useAssistantFusionPanel";
import { useAssistantRuntimeBridge } from "./useAssistantRuntimeBridge";
import { useAssistantDebugMcp } from "./useAssistantDebugMcp";
import { useAssistantLanguageTransition } from "./useAssistantLanguageTransition";

export function AssistantWorkspace({
  canvasReady = true,
  selectionContext = { status: "unavailable", objectNames: [] },
  onRefreshSelection,
  onConversationStarted,
}: {
  canvasReady?: boolean;
  selectionContext?: GeoGebraSelectionContext;
  onRefreshSelection?: (reason: GeoGebraSelectionRefreshReason) => GeoGebraSelectionContext | undefined;
  onConversationStarted?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const interaction = useInteractionMode();
  const modeTransition = useInteractionModeTransition(interaction);
  const fusionController = useFusionModeController(interaction.mode === "fusion");
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [panelView, setPanelView] = useState<"chat" | "user">("chat");
  const {
    controller: assistantSessionController,
    snapshot: assistantSession,
  } = useAssistantSessionState();
  const {
    conversationId: currentConversationId,
    title: currentConversationTitle,
    threadId: assistantThreadId,
    model: selectedModel,
    thinkingEnabled,
    thinkingEffort,
  } = assistantSession;
  const [conversationDrawerOpen, setConversationDrawerOpen] = useState(false);
  const [blackboardOpen, setBlackboardOpen] = useState(false);
  const onboarding = useOnboardingState();
  const suppressBlackboardToggleRef = useRef(false);
  const assistantRuntimeRef = useRef<AssistantRuntime | null>(null);
  const pendingFusionSelectionRef = useRef<readonly string[] | null>(null);

  const modelState = useAssistantModelState({
    controller: assistantSessionController,
    selectedModel,
    thinkingEnabled,
  });
  const {
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
  } = modelState;
  // Resolved during bootstrap, so this is stable for the life of the renderer.
  const API_ORIGIN = backendOrigin();
  const { authSessionRef } = useLocalSession({
    localAuthToken: backendAuthToken()
  });
  const blackboard = useConversationBlackboard({
    apiOrigin: API_ORIGIN,
    authSessionRef,
    conversationId: currentConversationId,
    loadFailedMessage: t("blackboard.loadFailed"),
  });
  const panelWindow = usePanelWindow(panelView, interaction.mode === "window");
  const { panelRef, collapsed, setCollapsed } = panelWindow;
  const transitionLanguage = useAssistantLanguageTransition(panelRef, Boolean(reduceMotion));
  const problemBank = useProblemBankPanel({
    panelRef,
    reduceMotion: Boolean(reduceMotion),
    moveDragging: panelWindow.moveDragging,
    prepareOpen: () => {
      setCollapsed(false);
      setConversationDrawerOpen(false);
      setBlackboardOpen(false);
    },
    onRestoreComposerFocus: () => setComposerFocusSignal((signal) => signal + 1),
  });
  const {
    closeForComposer: closeProblemBankForComposer,
    closePanel: closeProblemBank,
    movePanel,
    open: problemBankOpen,
    openPanel: openProblemBank,
    restoreAfterClose: restorePanelAfterProblemBankClose,
    setOpen: setProblemBankOpen,
    triggerRef: problemBankTriggerRef,
  } = problemBank;
  const { messages, setMessages, sendMessage, retry, canRetry, stop, status, error } = useAgentRunChat({
    apiOrigin: API_ORIGIN,
    getAuthToken: () => authSessionRef.current.token,
    getModel: () => assistantSessionController.getSnapshot().model,
    getModelConfig: getSelectedModelConfig,
    getModelProvider: (model) => modelOptionsRef.current.find((option) => option.id === model)?.provider ?? "deepseek",
    // Auto and Thinking both request provider reasoning so the streamed
    // reasoning deltas can be shown in the transcript. Instant is the only
    // mode that explicitly suppresses the provider's reasoning channel.
    getThinking: () => assistantSessionController.getSnapshot().thinkingEnabled,
    getThinkingEffort: () => assistantSessionController.getSnapshot().thinkingEffort,
    onRendererToolSettled: () => onRefreshSelection?.("tool-complete"),
    locale: i18n.language.startsWith("en") ? "en-US" : "zh-CN",
    onFinish: () => {
      pendingFusionSelectionRef.current = null;
      fusionController.completeActiveTurn();
      void conversationHistory.load(true);
      if (blackboardOpen) void blackboard.load();
    },
    onRestore: (run) => {
      const restoredModel = modelOptionsRef.current.find((option) => (
        option.id === run.modelId && option.provider === run.modelProvider
      ));
      assistantSessionController.restore({
        conversationId: run.conversationId,
        title: run.prompt.replace(/\s+/g, " ").trim().slice(0, 80),
        model: restoredModel?.id,
        thinkingEnabled: run.thinking === true,
        thinkingEffort: run.thinkingEffort ?? undefined,
      });
      if (restoredModel) restoreModel(restoredModel.id);
      assistantRuntimeRef.current?.thread.composer.setText(run.prompt);
    },
  });
  const isStreaming = status === "streaming" || status === "submitted";
  const submission = useAssistantSubmission({
    controller: assistantSessionController,
    assistantThreadId,
    currentConversationId,
    isStreaming,
    t,
    send: async (nextSubmission, conversationId) => {
      const text = nextSubmission.text?.trim() ?? "";
      const files = nextSubmission.files ?? [];
      if (text) {
        await sendMessage({ text, files }, { body: { conversationId } });
      } else {
        await sendMessage({ files }, { body: { conversationId } });
      }
    },
    retry,
    setError: setSubmissionError,
    onConversationStarted,
  });
  const {
    retryFailedRun,
    submit: submitAssistantSubmission,
    submitPrompt,
  } = submission;
  const assistantRuntime = useAssistantRuntimeBridge({
    threadId: assistantThreadId,
    messages,
    status,
    error,
    isStreaming,
    stop,
    submit: submitAssistantSubmission,
    fusionController,
    t,
    runtimeRef: assistantRuntimeRef,
    pendingFusionSelectionRef,
  });

  const { mcp, restoreConversationRef: restoreDebugConversationRef } = useAssistantDebugMcp({
    authToken: () => authSessionRef.current.token ?? undefined,
    conversationId: currentConversationId,
    assistantThreadId,
    panelView,
    isStreaming,
    getModelConfig: getSelectedModelConfig,
    submitPrompt,
    setMessages,
    controller: assistantSessionController,
    refreshCatalog,
    showChat: () => setPanelView("chat"),
  });

  function restartOnboardingTour() {
    setPanelView("chat");
    closeProblemBank();
    setConversationDrawerOpen(false);
    setBlackboardOpen(false);
    onboarding.restart();
  }

  const onboardingSteps: Step[] = [
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="history"]') ?? null, title: t("tour.historyTitle"), content: t("tour.historyDescription"), placement: "bottom", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="new-conversation"]') ?? null, title: t("tour.newConversationTitle"), content: t("tour.newConversationDescription"), placement: "bottom", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="blackboard"]') ?? null, title: t("tour.blackboardTitle"), content: t("tour.blackboardDescription"), placement: "bottom", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="problem-bank"]') ?? null, title: t("tour.problemBankTitle"), content: t("tour.problemBankDescription"), placement: "bottom", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="language"]') ?? null, title: t("tour.languageTitle"), content: t("tour.languageDescription"), placement: "bottom", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="settings"]') ?? null, title: t("tour.settingsTitle"), content: t("tour.settingsDescription"), placement: "bottom-end", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="model"]') ?? null, title: t("tour.modelTitle"), content: t("tour.modelDescription"), placement: "top", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="attachments"]') ?? null, title: t("tour.attachmentsTitle"), content: t("tour.attachmentsDescription"), placement: "top", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-thinking-tour="thinking"]') ?? null, title: t("tour.thinkingTitle"), content: t("tour.thinkingDescription"), placement: "top", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="send"]') ?? null, title: t("tour.sendTitle"), content: t("tour.sendDescription"), placement: "top", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="minimize"]') ?? null, title: t("tour.minimizeTitle"), content: t("tour.minimizeDescription"), placement: "bottom-end", skipBeacon: true, buttons: ["back", "skip", "primary"] },
  ];
  const conversationHistory = useConversations({
    apiOrigin: API_ORIGIN,
    authSessionRef,
    isStreaming,
    setMessages,
    sessionController: assistantSessionController,
    // The assistant-ui ThreadPrimitive.Viewport owns auto-scroll. Conversation
    // switches also remount the viewport through its conversation key below.
    followLatest: () => undefined,
    onSelect: () => {
      fusionController.resetTurns();
      setConversationDrawerOpen(false);
      setBlackboardOpen(false);
    },
    onDelete: (conversation) => {
      if (assistantSessionController.deleteConversation(conversation.id) !== "current") return;
      setMessages([]);
      void assistantRuntime.thread.composer.reset();
      setBlackboardOpen(false);
      fusionController.resetTurns();
    },
    messages,
    conversationId: currentConversationId,
    model: selectedModel,
    title: currentConversationTitle,
    t,
  });
  const {
    conversations,
    loading: conversationHistoryLoading,
    error: conversationHistoryError,
    selectingId: selectingConversationId,
    deletingId: deletingConversationId,
  } = conversationHistory;
  restoreDebugConversationRef.current = conversationHistory.restore;
  const fusionPanelState = useAssistantFusionPanel({
    mode: interaction.mode,
    reduceMotion: Boolean(reduceMotion),
    panelView,
    conversationDrawerOpen,
    blackboardOpen,
    problemBankOpen,
    onLoadHistory: () => { void conversationHistory.load(); },
    onLoadBlackboard: () => { void blackboard.load(); },
    onOpenProblemBank: openProblemBank,
    onApplyWindowState: (windowState) => {
      setCollapsed(false);
      setPanelView(windowState.panelView);
      setConversationDrawerOpen(windowState.conversationDrawerOpen);
      setBlackboardOpen(windowState.blackboardOpen);
      setProblemBankOpen(windowState.problemBankOpen);
    },
    onModeChanged: () => { pendingFusionSelectionRef.current = null; },
  });
  const {
    activePanel: fusionPanel,
    close: closeFusionPanel,
    toggle: toggleFusionPanel,
  } = fusionPanelState;
  const panelTitle = panelView === "chat"
    ? currentConversationTitle || (currentConversationId ? t("history.untitled") : t("history.newConversation"))
    : t("settings.title");
  const toastError = error
    ? formatAgentRunError(error, t)
    : submissionError ?? conversationHistoryError ?? blackboard.error;
  function openConversationHistory() {
    setBlackboardOpen(false);
    setConversationDrawerOpen(true);
    void conversationHistory.load();
  }

  function startNewConversation() {
    if (isStreaming) return;
    const transition = assistantSessionController.beginNewConversation();
    assistantSessionController.commitNewConversation(transition);
    setMessages([]);
    void assistantRuntime.thread.composer.reset();
    setConversationDrawerOpen(false);
    setBlackboardOpen(false);
    fusionController.resetTurns();
  }

  function toggleBlackboard() {
    if (suppressBlackboardToggleRef.current) {
      suppressBlackboardToggleRef.current = false;
      return;
    }
    if (blackboardOpen) {
      setBlackboardOpen(false);
      return;
    }
    setConversationDrawerOpen(false);
    setBlackboardOpen(true);
    void blackboard.load();
  }

  function togglePanelView() {
    closeProblemBank();
    setCollapsed(false);
    setConversationDrawerOpen(false);
    setBlackboardOpen(false);
    setPanelView((view) => view === "chat" ? "user" : "chat");
  }

  function useProblemInComposer(problem: string) {
    setSubmissionError(null);
    assistantRuntime.thread.composer.setText(problem);
    if (interaction.mode === "fusion") {
      closeFusionPanel({ restoreFocus: false });
      fusionController.summonAt(fusionController.composerPoint);
      return;
    }
    closeProblemBankForComposer();
  }

  if (interaction.mode === "fusion") {
    return (
      <AssistantRuntimeProvider runtime={assistantRuntime}>
      <AssistantFusionSurface
        transition={modeTransition.transition}
        surface={{
          controller: fusionController,
          messages,
          status,
          error: toastError,
          canvasReady,
          modelLabel: selectedModelOption?.label ?? selectedModel,
          modelControl: (
            <ModelMenu
              value={selectedModel}
              models={modelOptions}
              disabled={isStreaming}
              thinkingEnabled={thinkingEnabled}
              thinkingSupported={thinkingSupported}
              thinkingEffort={thinkingEffort}
              portalContainer={() => document.body}
              onChange={changeModel}
              onThinkingEnabledChange={changeThinkingEnabled}
              onThinkingEffortChange={changeThinkingEffort}
              tourId="fusion-model"
              compact
            />
          ),
          selectionContext,
          onRefreshSelection,
          activePanel: fusionPanel,
          languageControl: <LanguageButton />,
          onPrepareSubmit: (selectionObjectNames) => { pendingFusionSelectionRef.current = selectionObjectNames; },
          onAttachmentError: (message) => {
            pendingFusionSelectionRef.current = null;
            setSubmissionError(message);
          },
          canRetry,
          onRetry: retryFailedRun,
          onOpenHistory: (trigger) => toggleFusionPanel("history", trigger, () => { void conversationHistory.load(); }),
          onOpenTranscript: (trigger) => toggleFusionPanel("transcript", trigger),
          onNewConversation: () => {
            closeFusionPanel({ restoreFocus: false });
            startNewConversation();
          },
          onOpenBlackboard: (trigger) => toggleFusionPanel("blackboard", trigger, () => { void blackboard.load(); }),
          onOpenProblemBank: (trigger) => toggleFusionPanel("problem-bank", trigger),
          onOpenSettings: (trigger) => toggleFusionPanel("settings", trigger),
          onSwitchToWindow: (origin) => { modeTransition.requestMode("window", origin); },
        }}
        overlays={{
          activePanel: fusionPanel,
          panelTitle,
          isStreaming,
          conversationHistory: {
            conversations,
            loading: conversationHistoryLoading,
            selectingId: selectingConversationId,
            deletingId: deletingConversationId,
            error: conversationHistoryError,
            migrationRecoveryAvailable: conversationHistory.migrationRecoveryAvailable,
            exportMigrationRecovery: conversationHistory.exportMigrationRecovery,
            select: conversationHistory.select,
            remove: conversationHistory.remove,
          },
          currentConversationId,
          blackboard,
          onClose: closeFusionPanel,
          onUseProblem: useProblemInComposer,
          settings: (
            <SettingsPanel
              mcp={mcp}
              onRestartTour={restartOnboardingTour}
              thinkingEnabled={thinkingEnabled}
              thinkingSupported={thinkingSupported}
              thinkingEffort={thinkingEffort}
              modelLabel={selectedModelOption?.label ?? selectedModel}
            />
          ),
          onboardingReady: onboarding.ready === true,
          onCompleteOnboarding: onboarding.complete,
        }}
      />
      </AssistantRuntimeProvider>
    );
  }

  return (
    <AssistantRuntimeProvider runtime={assistantRuntime}>
      <AssistantWindowSurface
        transition={modeTransition.transition}
        panelWindow={panelWindow}
        panelView={panelView}
        language={i18n.resolvedLanguage ?? i18n.language}
        panelTitle={panelTitle}
        collapsed={collapsed}
        isStreaming={isStreaming}
        blackboardOpen={blackboardOpen}
        problemBankOpen={problemBankOpen}
        reduceMotion={Boolean(reduceMotion)}
        assistantThreadId={assistantThreadId}
        canvasReady={canvasReady}
        composerFocusSignal={composerFocusSignal}
        submissionError={submissionError}
        toastError={toastError}
        conversationDrawer={{
          open: conversationDrawerOpen,
          interactionDisabled: isStreaming,
          loading: conversationHistoryLoading,
          selectingId: selectingConversationId,
          deletingId: deletingConversationId,
          error: conversationHistoryError,
          onExportRecovery: conversationHistory.migrationRecoveryAvailable
            ? conversationHistory.exportMigrationRecovery
            : undefined,
          conversations,
          currentConversationId,
          onClose: () => setConversationDrawerOpen(false),
          onSelect: (conversation) => void conversationHistory.select(conversation),
          onDelete: conversationHistory.remove,
        }}
        blackboardDrawer={{
          open: blackboardOpen,
          conversationId: currentConversationId,
          loading: blackboard.loading,
          error: blackboard.error,
          entries: blackboard.entries,
          onClose: () => setBlackboardOpen(false),
          onRefresh: () => void blackboard.load(),
        }}
        settings={{
          mcp,
          onRestartTour: restartOnboardingTour,
          thinkingEnabled,
          thinkingSupported,
          thinkingEffort,
          modelLabel: selectedModelOption?.label ?? selectedModel,
        }}
        modelMenu={{
          value: selectedModel,
          models: modelOptions,
          disabled: isStreaming,
          thinkingEnabled,
          thinkingSupported,
          thinkingEffort,
          portalContainer: () => panelRef.current?.parentElement ?? null,
          onChange: changeModel,
          onThinkingEnabledChange: changeThinkingEnabled,
          onThinkingEffortChange: changeThinkingEffort,
          tourId: "model",
        }}
        onboarding={{
          ready: onboarding.ready === true,
          steps: onboardingSteps,
          complete: onboarding.complete,
        }}
        problemBank={{
          triggerRef: problemBankTriggerRef,
          preload: problemBank.preload,
          open: openProblemBank,
          close: closeProblemBank,
          restoreAfterClose: restorePanelAfterProblemBankClose,
          useProblem: useProblemInComposer,
        }}
        onHeaderPointerMove={movePanel}
        onPointerDownCapture={(event) => {
          if (!blackboardOpen || !(event.target instanceof Element)) return;
          if (event.target.closest("#copilot-blackboard-drawer")) return;
          if (event.target.closest("[data-copilot-blackboard-trigger]")) {
            suppressBlackboardToggleRef.current = true;
          }
          setBlackboardOpen(false);
        }}
        onOpenHistory={openConversationHistory}
        onNewConversation={startNewConversation}
        onToggleBlackboard={toggleBlackboard}
        onBlackboardPointerCancel={() => { suppressBlackboardToggleRef.current = false; }}
        onSwitchToFusion={(origin) => modeTransition.requestMode("fusion", origin)}
        onTransitionLanguage={transitionLanguage}
        onTogglePanelView={togglePanelView}
        onToggleCollapsed={() => {
          closeProblemBank();
          setConversationDrawerOpen(false);
          setBlackboardOpen(false);
          panelWindow.toggleCollapsed();
        }}
        onSubmitExample={(prompt) => { void submitPrompt(prompt); }}
        onClearSubmissionError={() => setSubmissionError(null)}
        onAttachmentError={setSubmissionError}
      />
    </AssistantRuntimeProvider>
  );
}
