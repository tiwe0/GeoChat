import { ArrowLeftIcon, CalculatorIcon, ChevronDownIcon, CircleHelpIcon, CirclePlusIcon, ClipboardCheckIcon, LibraryBigIcon, MessageSquarePlusIcon, MinusIcon, SettingsIcon, SquareIcon } from "lucide-react";
import {
  Box,
  ButtonBase,
  IconButton,
  Paper,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { Joyride, STATUS, type Step } from "react-joyride";
import {
  useLayoutEffect,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { agentModelSupportsReasoning } from "@geochat-ai/app/model-registry";
import { AssistantRuntimeProvider, type AssistantRuntime } from "@assistant-ui/react";
import {
  unwrapAgentRunSubmissionError,
  useAgentRunChat,
  wasAgentRunMessageAccepted,
} from "../hooks/useAgentRunChat";
import { formatAgentRunError } from "../features/agent-run/errorMessage";
import { useLocalSession } from "../features/local-session/useLocalSession";
import { SettingsPanel } from "../features/desktop/SettingsPanel";
import { saveStoredModel } from "../features/local-session/storage";
import { areSupportedAgentAttachments } from "../features/attachments/capabilities";
import { useConversations } from "../features/conversations/useConversations";
import { useConversationBlackboard } from "../features/conversations/useConversationBlackboard";
import { AssistantSessionController } from "../features/session/assistantSessionController";
import {
  resolvePanelWindowHost,
  usePanelWindow,
} from "../features/panel-window/usePanelWindow";
import { ConversationDrawer } from "./ConversationDrawer";
import { LanguageButton } from "./LanguageButton";
import { BlackboardDrawer } from "./BlackboardDrawer";
import { OnboardingTooltip } from "./OnboardingTooltip";
import { ErrorToast } from "./ErrorToast";
import { BrandIcon } from "./BrandIcon";
import { preloadProblemBankSidecar, ProblemBankSidecar } from "./ProblemBankSidecar";
import { ModelMenu, type ThinkingEffort } from "./ModelMenu";
import { createDesktopDebugActionExecutor } from "../features/desktop/mcpDebugActions";
import { useMcpState } from "../features/desktop/useMcpState";
import { DEFAULT_MCP_STATUS, type DesktopDebugAction } from "../../../shared/desktop/mcp-debug-actions";
import {
  DESKTOP_CONFIG_CHANGED_EVENT,
  credentialsForProvider,
  readDesktopConfig,
} from "../../../shared/desktop/desktop-config";
import type { RendererMcpStatus } from "../../../shared/desktop/workbench-types";
import { loadModelCatalog, type RuntimeModelOption } from "../features/models/modelCatalog";
import { backendAuthToken, backendOrigin } from "../features/desktop/runtime";
import type { GeoGebraSelectionContext, GeoGebraSelectionRefreshReason } from "../geogebra/selection-context";
import {
  FusionModeSurface,
  InteractionModeButton,
  InteractionModeTransition,
  fusionPanelFromWindowState,
  windowStateFromFusionPanel,
  type FusionPanelId,
  useFusionModeController,
  useInteractionMode,
  useInteractionModeTransition,
} from "../features/fusion-mode";
import {
  convertToAssistantUiMessage,
  cancelGeoChatAssistantTurn,
  createGeoChatAttachmentAdapter,
  GeoChatComposer,
  GeoChatThread,
  resolveGeoChatConversationId,
  submitGeoChatAssistantTurn,
  useGeoChatAssistantRuntime,
  type GeoChatAssistantSubmission,
} from "../features/assistant-ui";
import { AssistantWindowShell } from "../features/assistant-workspace/AssistantWindowShell";
import { FusionAssistantOverlays } from "../features/assistant-workspace/FusionAssistantOverlays";
import { useOnboardingState } from "../features/assistant-workspace/useOnboardingState";

const THINKING_ENABLED_STORAGE_KEY = "geogebraCopilotThinkingEnabled";
const LEGACY_REASONING_MODE_STORAGE_KEY = "geogebraCopilotReasoningMode";
const THINKING_EFFORT_STORAGE_KEY = "geogebraCopilotThinkingEffort";
const MotionPaper = motion.create(Paper);
const PROBLEM_BANK_SIDECAR_WIDTH = 380;
const PROBLEM_BANK_SIDECAR_GAP = 12;
const PANEL_VIEWPORT_GUTTER = 8;

function createAssistantRuntimeThreadId(conversationId?: string | null) {
  // New conversations use the same client-generated id for assistant-ui and
  // the backend run, so publishing the first request never switches threads.
  return conversationId ?? `conv_${crypto.randomUUID().replaceAll("-", "")}`;
}

function compactConversationTitle(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[#>*-]|•)\s+/u, "")
    .trim();
  if (!normalized) return "";
  return normalized.length > 60 ? `${normalized.slice(0, 60).trimEnd()}…` : normalized;
}

function WindowThreadEmpty({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  const { t } = useTranslation();
  return (
    <Box className="geochat-assistant-welcome">
      <Stack spacing={1.25} sx={{ width: "100%" }}>
        <Stack spacing={0.75} sx={{ alignItems: "center", textAlign: "center" }}>
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.76, rotate: -8 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
          >
            <BrandIcon size={136} />
          </motion.div>
          <Box sx={{ px: 0.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
              {t("panel.welcomeTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35, maxWidth: 520 }}>
              {t("panel.welcomeDescription")}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={0.75} sx={{ width: "100%", alignItems: "stretch" }}>
          {[
            { key: "circle", icon: <CirclePlusIcon size={18} /> },
            { key: "construction", icon: <CalculatorIcon size={18} /> },
            { key: "explain", icon: <CircleHelpIcon size={18} /> },
          ].map((example, index) => (
            <motion.div
              key={example.key}
              initial={{ opacity: 0, y: 32, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: index * 0.1, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              style={{ flex: 1, minWidth: 0 }}
            >
              <ButtonBase
                component="button"
                type="button"
                onClick={() => onSubmit(t(`panel.examples.${example.key}`))}
                sx={{
                  width: "100%",
                  minWidth: 0,
                  minHeight: 94,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "flex-start",
                  p: 1.1,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  bgcolor: "background.paper",
                  color: "text.primary",
                  textAlign: "left",
                  transition: (theme) => theme.transitions.create(["background-color", "border-color", "transform"], { duration: 150 }),
                  "&:hover": { bgcolor: "action.hover", borderColor: "primary.main", transform: "translateY(-2px)" },
                  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
                }}
              >
                <Stack spacing={0.45} sx={{ minWidth: 0 }}>
                  {example.icon}
                  <Typography variant="caption" sx={{ fontWeight: 750, lineHeight: 1.25, overflowWrap: "anywhere" }}>
                    {t(`panel.examples.${example.key}`)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2, overflowWrap: "anywhere" }}>
                    {t(`panel.exampleDescriptions.${example.key}`)}
                  </Typography>
                </Stack>
              </ButtonBase>
            </motion.div>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

export function AssistantPanel({
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
  const appTheme = useTheme();
  const reduceMotion = useReducedMotion();
  const interaction = useInteractionMode();
  const modeTransition = useInteractionModeTransition(interaction);
  const fusionController = useFusionModeController(interaction.mode === "fusion");
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [panelView, setPanelView] = useState<"chat" | "user">("chat");
  const [problemBankOpen, setProblemBankOpen] = useState(false);
  const problemBankTriggerRef = useRef<HTMLButtonElement>(null);
  const problemBankRestorePositionRef = useRef<{ left: number; top: number } | null>(null);
  const focusComposerAfterProblemBankCloseRef = useRef(false);
  const [modelOptions, setModelOptions] = useState<RuntimeModelOption[]>(loadModelCatalog());
  const modelOptionsRef = useRef<RuntimeModelOption[]>(loadModelCatalog());
  modelOptionsRef.current = modelOptions;
  const [assistantSessionController] = useState(() => new AssistantSessionController({
    threadIdFactory: createAssistantRuntimeThreadId,
  }));
  const subscribeAssistantSession = useCallback(
    (notify: () => void) => assistantSessionController.subscribe(() => notify()),
    [assistantSessionController],
  );
  const getAssistantSessionSnapshot = useCallback(
    () => assistantSessionController.getSnapshot(),
    [assistantSessionController],
  );
  const assistantSession = useSyncExternalStore(
    subscribeAssistantSession,
    getAssistantSessionSnapshot,
    getAssistantSessionSnapshot,
  );
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
  const [fusionPanel, setFusionPanel] = useState<FusionPanelId | null>(null);
  const fusionPanelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const fusionPanelFocusRestoreTimerRef = useRef<number | null>(null);
  const previousInteractionModeRef = useRef(interaction.mode);
  const onboarding = useOnboardingState();
  const suppressBlackboardToggleRef = useRef(false);
  const assistantRuntimeRef = useRef<AssistantRuntime | null>(null);
  const pendingFusionSelectionRef = useRef<readonly string[] | null>(null);

  useEffect(() => () => {
    if (fusionPanelFocusRestoreTimerRef.current !== null) {
      globalThis.clearTimeout(fusionPanelFocusRestoreTimerRef.current);
    }
  }, []);
  useEffect(() => {
    const warm = () => { void preloadProblemBankSidecar(); };
    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(warm, { timeout: 1_500 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(warm, 900);
    return () => window.clearTimeout(timer);
  }, []);
  const selectedModelOption = modelOptions.find((option) => option.id === selectedModel);
  const thinkingSupported = selectedModelOption
    ? agentModelSupportsReasoning(selectedModelOption.provider, selectedModelOption.id)
    : true;
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
      if (restoredModel) void saveStoredModel(restoredModel.id);
      assistantRuntimeRef.current?.thread.composer.setText(run.prompt);
    },
  });
  const isStreaming = status === "streaming" || status === "submitted";
  const assistantAttachmentAdapter = useMemo(() => createGeoChatAttachmentAdapter({
    duplicateFile: (name) => t("composer.duplicateFile", { name }),
    fileReadFailed: t("composer.fileReadFailed"),
    fileTooLarge: (name) => t("composer.fileTooLarge", { name }),
    tooManyFiles: (count) => t("composer.tooManyFiles", { count }),
    totalTooLarge: t("composer.totalTooLarge"),
    unsupportedFile: (name) => t("composer.unsupportedFile", { name }),
  }), [t]);
  const assistantMessageProjectionRef = useRef({ messageCount: messages.length, status, error });
  assistantMessageProjectionRef.current = { messageCount: messages.length, status, error };
  const assistantRuntimeActionsRef = useRef({
    submit: submitAssistantSubmission,
    freezeTurnAnchor: fusionController.freezeTurnAnchor,
    failTurn: fusionController.failTurn,
    completeActiveTurn: fusionController.completeActiveTurn,
    stop,
  });
  assistantRuntimeActionsRef.current = {
    submit: submitAssistantSubmission,
    freezeTurnAnchor: fusionController.freezeTurnAnchor,
    failTurn: fusionController.failTurn,
    completeActiveTurn: fusionController.completeActiveTurn,
    stop,
  };
  const convertAssistantMessage = useCallback((message: (typeof messages)[number], index: number) => {
    const projection = assistantMessageProjectionRef.current;
    return convertToAssistantUiMessage(message, {
      state: message.role === "assistant" && index === projection.messageCount - 1
        ? projection.status
        : "ready",
      error: projection.error,
    });
  }, []);
  const handleAssistantNew = useCallback(async (submission: GeoChatAssistantSubmission) => {
    const pendingSelection = pendingFusionSelectionRef.current;
    pendingFusionSelectionRef.current = null;
    await submitGeoChatAssistantTurn({
      submission,
      prepareTurn: pendingSelection
        ? () => assistantRuntimeActionsRef.current.freezeTurnAnchor(undefined, pendingSelection)
        : undefined,
      submit: assistantRuntimeActionsRef.current.submit,
      failTurn: assistantRuntimeActionsRef.current.failTurn,
    });
  }, []);
  const handleAssistantCancel = useCallback(async () => {
    pendingFusionSelectionRef.current = null;
    await cancelGeoChatAssistantTurn({
      stop: assistantRuntimeActionsRef.current.stop,
      completeTurn: assistantRuntimeActionsRef.current.completeActiveTurn,
    });
  }, []);
  const assistantRuntime = useGeoChatAssistantRuntime({
    threadId: assistantThreadId,
    messages,
    isRunning: isStreaming,
    isSendDisabled: isStreaming,
    convertMessage: convertAssistantMessage,
    onNew: handleAssistantNew,
    onCancel: handleAssistantCancel,
    attachmentAdapter: assistantAttachmentAdapter,
  });
  assistantRuntimeRef.current = assistantRuntime;

  // The MCP server queues actions and waits for the renderer to run them, so
  // the poll loop belongs here, where the app is mounted, rather than in the
  // Settings screen that merely toggles it. The executor is built once and
  // reads live state through this ref, because an MCP action can arrive on any
  // render and must see the state of that moment, not of its construction.
  const mcpStatusRef = useRef<RendererMcpStatus>(DEFAULT_MCP_STATUS);
  const debugStateRef = useRef({ conversationId: currentConversationId, assistantThreadId, view: panelView, isStreaming });
  debugStateRef.current = { conversationId: currentConversationId, assistantThreadId, view: panelView, isStreaming };
  const executeDebugActionRef = useRef<((action: DesktopDebugAction) => Promise<unknown>) | null>(null);
  if (!executeDebugActionRef.current) {
    executeDebugActionRef.current = createDesktopDebugActionExecutor({
      getConversationId: () => debugStateRef.current.conversationId,
      getView: () => debugStateRef.current.view,
      getModelConfig: getSelectedModelConfig,
      getMcpStatus: () => mcpStatusRef.current,
      isRunning: () => debugStateRef.current.isStreaming,
      sendMessage: (content, requestedConversationId) => {
        const conversationId = requestedConversationId
          ?? debugStateRef.current.conversationId
          ?? debugStateRef.current.assistantThreadId;
        void submitPrompt(content, conversationId).catch((error) => {
          console.error(`[ERROR] Desktop MCP message submission failed: ${error instanceof Error ? error.message : String(error)}`, error);
        });
        return conversationId;
      },
      activateConversation: async (conversationId) => {
        if (!conversationId || conversationId === debugStateRef.current.conversationId) return;
        // MCP E2E actions may target an isolated conversation. Never carry UI
        // messages from the previously open conversation into that run; doing
        // so can leak dangling tool calls and make AI SDK reject the prompt as
        // missing a tool result.
        setMessages([]);
        assistantSessionController.activateForSubmit({ conversationId, title: null });
      },
      showChat: () => setPanelView("chat")
    });
  }
  const mcp = useMcpState({
    authToken: () => authSessionRef.current.token ?? undefined,
    executeDebugAction: (action) => executeDebugActionRef.current!(action)
  });
  mcpStatusRef.current = mcp.status;
  useEffect(() => {
    const refreshCatalog = () => {
      const models = loadModelCatalog();
      modelOptionsRef.current = models;
      setModelOptions(models);
      const configured = readDesktopConfig().model;
      const current = assistantSessionController.getSnapshot().model;
      const selected = models.find((model) => model.id === current)
        ?? models.find((model) => model.id === configured.model && model.provider === configured.provider)
        ?? models[0];
      if (!selected) return;
      assistantSessionController.setModel(selected.id);
    };
    refreshCatalog();
    globalThis.addEventListener(DESKTOP_CONFIG_CHANGED_EVENT, refreshCatalog);
    return () => globalThis.removeEventListener(DESKTOP_CONFIG_CHANGED_EVENT, refreshCatalog);
  }, [assistantSessionController]);
  useEffect(() => {
    if (interaction.mode !== "fusion" || !fusionPanel) return;
    const focusFrame = globalThis.requestAnimationFrame(() => {
      const panel = document.querySelector<HTMLElement>(`[data-fusion-panel="${fusionPanel}"]`);
      const target = panel?.querySelector<HTMLElement>(
        "[data-fusion-panel-close], button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      target?.focus({ preventScroll: true });
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="menu"], [role="listbox"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeFusionPanel();
    };
    globalThis.addEventListener("keydown", closeOnEscape, { capture: true });
    return () => {
      globalThis.cancelAnimationFrame(focusFrame);
      globalThis.removeEventListener("keydown", closeOnEscape, { capture: true });
    };
  }, [fusionPanel, interaction.mode]);
  useEffect(() => {
    if (!selectedModel || thinkingSupported || !thinkingEnabled) return;
    assistantSessionController.setThinkingEnabled(false);
    void browser.storage.local.set({ [THINKING_ENABLED_STORAGE_KEY]: false });
  }, [assistantSessionController, selectedModel, thinkingEnabled, thinkingSupported]);
  useEffect(() => {
    void browser.storage.local.get([THINKING_ENABLED_STORAGE_KEY, LEGACY_REASONING_MODE_STORAGE_KEY, THINKING_EFFORT_STORAGE_KEY]).then((stored) => {
      const storedThinking = stored[THINKING_ENABLED_STORAGE_KEY];
      const legacyMode = stored[LEGACY_REASONING_MODE_STORAGE_KEY];
      const resolvedThinking = typeof storedThinking === "boolean"
        ? storedThinking
        : legacyMode === "thinking" || legacyMode === "auto"
          ? true
          : legacyMode === "instant"
            ? false
            : undefined;
      if (resolvedThinking !== undefined) {
        assistantSessionController.setThinkingEnabled(resolvedThinking);
      }
      const effort = stored[THINKING_EFFORT_STORAGE_KEY];
      if (effort === "light" || effort === "standard" || effort === "extended") {
        assistantSessionController.setThinkingEffort(effort);
      }
    }).catch((error) => {
      console.error("[ERROR] Failed to read stored thinking preferences", error);
    });
  }, [assistantSessionController]);

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

  async function submitAssistantSubmission(
    submission: GeoChatAssistantSubmission,
    requestedConversationId?: string,
  ): Promise<boolean> {
    const text = submission.text?.trim() ?? "";
    const files = submission.files ?? [];
    if ((!text && files.length === 0) || isStreaming) return false;
    if (!areSupportedAgentAttachments(files)) {
      const unsupported = files.find((part) => !part.mediaType?.startsWith("image/"));
      setSubmissionError(t("composer.unsupportedFile", { name: unsupported?.filename ?? t("common.attachment") }));
      return false;
    }
    const conversationId = resolveGeoChatConversationId(
      assistantThreadId,
      currentConversationId,
      requestedConversationId,
    );
    const attachmentTitle = files.find((part) => part.filename)?.filename ?? "";
    assistantSessionController.activateForSubmit({
      conversationId,
      title: conversationId === currentConversationId
        ? undefined
        : compactConversationTitle(text || attachmentTitle) || t("history.newConversation"),
    });
    setSubmissionError(null);
    onConversationStarted?.();
    try {
      if (text) {
        await sendMessage({ text, files }, { body: { conversationId } });
      } else {
        await sendMessage({ files }, { body: { conversationId } });
      }
      return true;
    } catch (caughtError) {
      const accepted = wasAgentRunMessageAccepted(caughtError);
      if (!accepted) {
        setSubmissionError(formatAgentRunError(unwrapAgentRunSubmissionError(caughtError), t));
      }
      return accepted;
    }
  }

  async function submitPrompt(text: string, requestedConversationId?: string): Promise<boolean> {
    return submitAssistantSubmission({ text: text.trim() }, requestedConversationId);
  }

  async function retryFailedRun() {
    setSubmissionError(null);
    try {
      return await retry();
    } catch (caughtError) {
      setSubmissionError(formatAgentRunError(unwrapAgentRunSubmissionError(caughtError), t));
      return false;
    }
  }

  function changeModel(value: string, provider?: string) {
    const selected = modelOptionsRef.current.find((option) => option.id === value && (!provider || option.provider === provider));
    if (!selected) return;
    assistantSessionController.setModel(selected.id);
    if (!agentModelSupportsReasoning(selected.provider, selected.id)) {
      assistantSessionController.setThinkingEnabled(false);
      void browser.storage.local.set({ [THINKING_ENABLED_STORAGE_KEY]: false });
    }
    void saveStoredModel(value);
  }

  function getSelectedModelConfig() {
    const config = readDesktopConfig();
    const selected = modelOptionsRef.current.find((option) => (
      option.id === assistantSessionController.getSnapshot().model
    ));
    if (!selected) return config.model;
    const credentials = credentialsForProvider(config.providerCredentials, selected.provider);
    if (selected.provider === "custom") {
      return {
        provider: "custom",
        model: selected.id,
        credentialRef: config.customProvider.credentialRef,
        protocol: config.customProvider.protocol,
        supportsImages: selected.capabilities.includes("imageInput"),
      };
    }
    // Model selection belongs to the conversation composer. Rebuild only the
    // transient run config with that model and its provider credentials; keep
    // Settings focused on storing credentials for each provider.
    return {
      ...config.model,
      provider: selected.provider,
      model: selected.id,
      credentialRef: credentials.credentialRef,
      protocol: credentials.protocol,
    };
  }

  function changeThinkingEnabled(enabled: boolean) {
    assistantSessionController.setThinkingEnabled(enabled);
    void browser.storage.local.set({ [THINKING_ENABLED_STORAGE_KEY]: enabled });
  }

  function changeThinkingEffort(effort: ThinkingEffort) {
    assistantSessionController.setThinkingEffort(effort);
    void browser.storage.local.set({ [THINKING_EFFORT_STORAGE_KEY]: effort });
  }

  function togglePanelView() {
    closeProblemBank();
    setCollapsed(false);
    setConversationDrawerOpen(false);
    setBlackboardOpen(false);
    setPanelView((view) => view === "chat" ? "user" : "chat");
  }

  function openProblemBank() {
    setCollapsed(false);
    setConversationDrawerOpen(false);
    setBlackboardOpen(false);
    const panel = panelRef.current;
    const host = panel ? resolvePanelWindowHost(panel) : null;
    if (panel && host && window.innerWidth > 980) {
      const bounds = panel.getBoundingClientRect();
      const targetLeft = Math.max(
        PANEL_VIEWPORT_GUTTER,
        Math.min(
          bounds.left,
          window.innerWidth
            - bounds.width
            - PROBLEM_BANK_SIDECAR_GAP
            - PROBLEM_BANK_SIDECAR_WIDTH
            - PANEL_VIEWPORT_GUTTER,
        ),
      );
      if (targetLeft < bounds.left) {
        problemBankRestorePositionRef.current = { left: bounds.left, top: bounds.top };
        host.style.inset = "auto";
        host.style.right = "auto";
        host.style.left = `${bounds.left}px`;
        host.style.top = `${bounds.top}px`;
        host.style.transition = reduceMotion
          ? "none"
          : "left 220ms cubic-bezier(0.22, 1, 0.36, 1)";
        window.requestAnimationFrame(() => {
          host.style.left = `${targetLeft}px`;
        });
      }
    }
    setProblemBankOpen(true);
  }

  function closeProblemBank() {
    setProblemBankOpen(false);
  }

  function useProblemInComposer(problem: string) {
    setSubmissionError(null);
    assistantRuntime.thread.composer.setText(problem);
    if (interaction.mode === "fusion") {
      closeFusionPanel({ restoreFocus: false });
      fusionController.summonAt(fusionController.composerPoint);
      return;
    }
    focusComposerAfterProblemBankCloseRef.current = true;
    closeProblemBank();
  }

  function movePanel(event: ReactPointerEvent<HTMLElement>) {
    const isActiveDrag = event.currentTarget.hasPointerCapture(event.pointerId);
    panelWindow.moveDragging(event);
    if (!problemBankOpen || !isActiveDrag) return;

    // Once the user moves the combined chat + problem-bank surface, that new
    // location becomes intentional. Do not snap back to the pre-open position
    // when the companion card is closed.
    problemBankRestorePositionRef.current = null;

    if (window.innerWidth <= 980) return;
    const panel = panelRef.current;
    const host = panel ? resolvePanelWindowHost(panel) : null;
    if (!panel || !host) return;
    const panelBounds = panel.getBoundingClientRect();
    const maxLeft = Math.max(
      PANEL_VIEWPORT_GUTTER,
      window.innerWidth
        - panelBounds.width
        - PROBLEM_BANK_SIDECAR_GAP
        - PROBLEM_BANK_SIDECAR_WIDTH
        - PANEL_VIEWPORT_GUTTER,
    );
    if (panelBounds.left > maxLeft) host.style.left = `${maxLeft}px`;
  }

  function restorePanelAfterProblemBankClose() {
    if (problemBankOpen) return;
    const restoreComposerFocus = () => {
      if (!focusComposerAfterProblemBankCloseRef.current) return false;
      focusComposerAfterProblemBankCloseRef.current = false;
      setComposerFocusSignal((signal) => signal + 1);
      return true;
    };
    const restore = problemBankRestorePositionRef.current;
    const panel = panelRef.current;
    const host = panel ? resolvePanelWindowHost(panel) : null;
    if (!restore || !host) {
      if (!restoreComposerFocus()) problemBankTriggerRef.current?.focus({ preventScroll: true });
      return;
    }
    host.style.transition = reduceMotion
      ? "none"
      : "left 220ms cubic-bezier(0.22, 1, 0.36, 1)";
    host.style.left = `${restore.left}px`;
    host.style.top = `${restore.top}px`;
    problemBankRestorePositionRef.current = null;
    window.setTimeout(() => {
      if (host.style.transition.includes("left 220ms")) host.style.transition = "";
    }, 240);
    if (!restoreComposerFocus()) problemBankTriggerRef.current?.focus({ preventScroll: true });
  }

  async function transitionLanguage(changeLanguage: () => Promise<void>) {
    const panel = panelRef.current;
    await changeLanguage();
    if (reduceMotion || !panel) return;

    const surfaces = panel.querySelectorAll<HTMLElement>("[data-language-transition-surface]");
    await Promise.all(Array.from(surfaces, async (surface) => {
      const animation = surface.animate(
        [{ opacity: 0.76 }, { opacity: 1 }],
        { duration: 140, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
      try {
        await animation.finished;
      } catch {
        // A new panel state may replace the surface while the brief fade runs.
      }
    }));
  }

  function restoreFusionPanelTrigger() {
    const trigger = fusionPanelTriggerRef.current;
    fusionPanelTriggerRef.current = null;
    if (!trigger?.isConnected) return;
    trigger.focus({ preventScroll: true });
  }

  function cancelFusionPanelFocusRestore() {
    if (fusionPanelFocusRestoreTimerRef.current === null) return;
    globalThis.clearTimeout(fusionPanelFocusRestoreTimerRef.current);
    fusionPanelFocusRestoreTimerRef.current = null;
  }

  function scheduleFusionPanelFocusRestore() {
    cancelFusionPanelFocusRestore();
    fusionPanelFocusRestoreTimerRef.current = globalThis.setTimeout(() => {
      fusionPanelFocusRestoreTimerRef.current = null;
      restoreFusionPanelTrigger();
    }, reduceMotion ? 0 : 400);
  }

  function closeFusionPanel(options: { restoreFocus?: boolean } = {}) {
    setFusionPanel(null);
    if (options.restoreFocus !== false) {
      scheduleFusionPanelFocusRestore();
    } else {
      cancelFusionPanelFocusRestore();
      fusionPanelTriggerRef.current = null;
    }
  }

  function toggleFusionPanel(panel: FusionPanelId, trigger: HTMLButtonElement, beforeOpen?: () => void) {
    if (fusionPanel === panel) {
      closeFusionPanel();
      return;
    }
    cancelFusionPanelFocusRestore();
    fusionPanelTriggerRef.current = trigger;
    beforeOpen?.();
    setFusionPanel(panel);
  }

  useLayoutEffect(() => {
    const previousMode = previousInteractionModeRef.current;
    if (previousMode === interaction.mode) return;
    previousInteractionModeRef.current = interaction.mode;
    cancelFusionPanelFocusRestore();
    fusionPanelTriggerRef.current = null;
    pendingFusionSelectionRef.current = null;

    if (interaction.mode === "fusion") {
      const nextPanel = fusionPanelFromWindowState({
        panelView,
        conversationDrawerOpen,
        blackboardOpen,
        problemBankOpen,
      });
      setFusionPanel(nextPanel);
      if (nextPanel === "history") void conversationHistory.load();
      if (nextPanel === "blackboard") void blackboard.load();
      return;
    }

    const returningPanel = fusionPanel;
    setFusionPanel(null);
    if (returningPanel === "problem-bank") openProblemBank();
  }, [interaction.mode]);

  useLayoutEffect(() => {
    if (interaction.mode !== "fusion") return;
    const windowState = windowStateFromFusionPanel(fusionPanel);
    setCollapsed(false);
    setPanelView(windowState.panelView);
    setConversationDrawerOpen(windowState.conversationDrawerOpen);
    setBlackboardOpen(windowState.blackboardOpen);
    setProblemBankOpen(windowState.problemBankOpen);
  }, [fusionPanel, interaction.mode, setCollapsed]);

  if (interaction.mode === "fusion") {
    return (
      <AssistantRuntimeProvider runtime={assistantRuntime}>
      <InteractionModeTransition
        transition={modeTransition.transition}
      />
      <FusionModeSurface
        controller={fusionController}
        messages={messages}
        status={status}
        error={toastError}
        canvasReady={canvasReady}
        modelLabel={selectedModelOption?.label ?? selectedModel}
        modelControl={(
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
        )}
        selectionContext={selectionContext}
        onRefreshSelection={onRefreshSelection}
        activePanel={fusionPanel}
        languageControl={<LanguageButton />}
        onPrepareSubmit={(selectionObjectNames) => {
          pendingFusionSelectionRef.current = selectionObjectNames;
        }}
        onAttachmentError={(message) => {
          pendingFusionSelectionRef.current = null;
          setSubmissionError(message);
        }}
        canRetry={canRetry}
        onRetry={retryFailedRun}
        onOpenHistory={(trigger) => toggleFusionPanel("history", trigger, () => { void conversationHistory.load(); })}
        onOpenTranscript={(trigger) => toggleFusionPanel("transcript", trigger)}
        onNewConversation={() => {
          closeFusionPanel({ restoreFocus: false });
          startNewConversation();
        }}
        onOpenBlackboard={(trigger) => toggleFusionPanel("blackboard", trigger, () => { void blackboard.load(); })}
        onOpenProblemBank={(trigger) => toggleFusionPanel("problem-bank", trigger)}
        onOpenSettings={(trigger) => toggleFusionPanel("settings", trigger)}
        onSwitchToWindow={(origin) => {
          modeTransition.requestMode("window", origin);
        }}
      />
      <FusionAssistantOverlays
        activePanel={fusionPanel}
        panelTitle={panelTitle}
        isStreaming={isStreaming}
        conversationHistory={{
          conversations,
          loading: conversationHistoryLoading,
          selectingId: selectingConversationId,
          deletingId: deletingConversationId,
          error: conversationHistoryError,
          migrationRecoveryAvailable: conversationHistory.migrationRecoveryAvailable,
          exportMigrationRecovery: conversationHistory.exportMigrationRecovery,
          select: conversationHistory.select,
          remove: conversationHistory.remove,
        }}
        currentConversationId={currentConversationId}
        blackboard={blackboard}
        onClose={closeFusionPanel}
        onUseProblem={useProblemInComposer}
        settings={(
          <SettingsPanel
            mcp={mcp}
            onRestartTour={restartOnboardingTour}
            thinkingEnabled={thinkingEnabled}
            thinkingSupported={thinkingSupported}
            thinkingEffort={thinkingEffort}
            modelLabel={selectedModelOption?.label ?? selectedModel}
          />
        )}
        onboardingReady={onboarding.ready === true}
        onCompleteOnboarding={onboarding.complete}
      />
      </AssistantRuntimeProvider>
    );
  }

  return (
    <AssistantRuntimeProvider runtime={assistantRuntime}>
    <InteractionModeTransition
      transition={modeTransition.transition}
    />
    <AssistantWindowShell
      panelWindow={panelWindow}
      panelView={panelView}
      appLabel={t("common.appName")}
      language={i18n.resolvedLanguage ?? i18n.language}
      onHeaderPointerMove={movePanel}
      onPointerDownCapture={(event) => {
        if (!blackboardOpen || !(event.target instanceof Element)) return;
        if (event.target.closest("#copilot-blackboard-drawer")) return;
        if (event.target.closest("[data-copilot-blackboard-trigger]")) {
          // Pointer-down closes first; suppress the click emitted after React rerenders.
          suppressBlackboardToggleRef.current = true;
        }
        setBlackboardOpen(false);
      }}
      header={(
        <>
        <Stack direction="row" spacing={1} sx={{ minWidth: 0, flex: 1, minHeight: 36, alignItems: "center" }}>
          {/* The brand mark is identity, not a control, in every view. */}
          <Box
            aria-hidden
            sx={{ width: 30, height: 30, flex: "0 0 auto", display: "grid", placeItems: "center" }}
          >
            <BrandIcon size={26} />
          </Box>
          {panelView === "chat" ? (
            <ButtonBase
              component="button"
              type="button"
              disabled={isStreaming}
              onClick={openConversationHistory}
              aria-label={t("history.open")}
              title={t("history.open")}
              data-copilot-tour="history"
              data-copilot-no-drag
              sx={{
                minWidth: 0,
                flex: "0 1 auto",
                maxWidth: "min(100%, 360px)",
                justifyContent: "flex-start",
                gap: 0.25,
                px: 0.5,
                py: 0.25,
                borderRadius: 1,
                color: "text.primary",
                textAlign: "left",
                "&:hover": { bgcolor: "action.hover" },
                "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
              }}
            >
              <Typography variant="subtitle2" sx={{ minWidth: 0, flex: "0 1 auto", maxWidth: "min(320px, 100%)", fontWeight: 700 }} noWrap>
                {panelTitle}
              </Typography>
              <ChevronDownIcon size={18} style={{ flex: "0 0 auto", color: "#526079" }} />
            </ButtonBase>
          ) : (
            <Typography variant="subtitle2" sx={{ minWidth: 0, flex: 1, fontWeight: 700 }} noWrap title={panelTitle}>
              {panelTitle}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ minHeight: 36, alignItems: "center", alignSelf: "center" }}>
          {panelView === "chat" && (
            <>
              <IconButton
                type="button"
                size="small"
                disabled={isStreaming}
                onClick={startNewConversation}
                aria-label={t("history.newConversation")}
                title={t("history.newConversation")}
                data-copilot-tour="new-conversation"
                data-copilot-no-drag
              >
                <MessageSquarePlusIcon size={18} />
              </IconButton>
              <IconButton
                type="button"
                size="small"
                onClick={toggleBlackboard}
                aria-label={t("blackboard.open")}
                title={t("blackboard.open")}
                aria-expanded={blackboardOpen}
                aria-controls={blackboardOpen ? "copilot-blackboard-drawer" : undefined}
                data-copilot-no-drag
                data-copilot-blackboard-trigger
                data-copilot-tour="blackboard"
                onPointerCancel={() => { suppressBlackboardToggleRef.current = false; }}
                sx={{
                  color: "#1f5a49",
                  bgcolor: blackboardOpen ? "rgba(31, 90, 73, 0.12)" : undefined,
                  "&:hover": { bgcolor: "rgba(31, 90, 73, 0.12)" },
                }}
              >
                <ClipboardCheckIcon size={18} />
              </IconButton>
              <IconButton
                ref={problemBankTriggerRef}
                type="button"
                size="small"
                onClick={() => problemBankOpen ? closeProblemBank() : openProblemBank()}
                aria-label={problemBankOpen ? t("problemBank.close") : t("problemBank.open")}
                title={problemBankOpen ? t("problemBank.close") : t("problemBank.open")}
                aria-expanded={problemBankOpen}
                aria-controls={problemBankOpen ? "copilot-problem-bank-sidecar" : undefined}
                data-copilot-no-drag
                data-copilot-tour="problem-bank"
                onPointerEnter={() => { void preloadProblemBankSidecar(); }}
                onFocus={() => { void preloadProblemBankSidecar(); }}
                sx={{
                  color: problemBankOpen ? "primary.main" : undefined,
                  bgcolor: problemBankOpen ? "action.selected" : undefined,
                }}
              >
                <LibraryBigIcon size={18} />
              </IconButton>
              <InteractionModeButton
                mode="window"
                label={t("panel.switchToFusion")}
                onToggle={(origin) => modeTransition.requestMode("fusion", origin)}
              />
              <LanguageButton tourId="language" transitionLanguage={transitionLanguage} />
              <IconButton
                type="button"
                size="small"
                onClick={togglePanelView}
                aria-label={t("panel.openSettings")}
                title={t("panel.openSettings")}
                data-copilot-no-drag
                data-copilot-tour="settings"
              >
                <SettingsIcon size={18} />
              </IconButton>
            </>
          )}
          {panelView === "user" && (
            <IconButton
              type="button"
              size="small"
              onClick={togglePanelView}
              aria-label={t("settings.back")}
              title={t("settings.back")}
              data-copilot-no-drag
            >
              <ArrowLeftIcon size={18} />
            </IconButton>
          )}
          <IconButton
            type="button"
            size="small"
            onClick={() => {
              closeProblemBank();
              setConversationDrawerOpen(false);
              setBlackboardOpen(false);
              panelWindow.toggleCollapsed();
            }}
            aria-label={collapsed ? t("panel.restoreWindow") : t("panel.minimizeWindow")}
            title={collapsed ? t("panel.restoreWindow") : t("panel.minimizeWindow")}
            data-copilot-tour="minimize"
          >
            {collapsed ? <SquareIcon size={18} /> : <MinusIcon size={18} />}
          </IconButton>
        </Stack>
        </>
      )}
    >
      {!collapsed && panelView === "chat" && (
        <>
          <ConversationDrawer
            open={conversationDrawerOpen}
            interactionDisabled={isStreaming}
            loading={conversationHistoryLoading}
            selectingId={selectingConversationId}
            deletingId={deletingConversationId}
            error={conversationHistoryError}
            onExportRecovery={conversationHistory.migrationRecoveryAvailable ? conversationHistory.exportMigrationRecovery : undefined}
            conversations={conversations}
            currentConversationId={currentConversationId}
            onClose={() => setConversationDrawerOpen(false)}
            onSelect={(conversation) => void conversationHistory.select(conversation)}
            onDelete={conversationHistory.remove}
          />
          <BlackboardDrawer
            open={blackboardOpen}
            conversationId={currentConversationId}
            loading={blackboard.loading}
            error={blackboard.error}
            entries={blackboard.entries}
            onClose={() => setBlackboardOpen(false)}
            onRefresh={() => void blackboard.load()}
          />
        </>
      )}
      {!collapsed && (
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            data-language-transition-surface
            key={panelView}
            initial={{ opacity: 0, x: panelView === "chat" ? -12 : 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: panelView === "chat" ? 12 : -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", overflow: "hidden" }}
          >
          {panelView === "user" ? (
            <SettingsPanel
              mcp={mcp}
              onRestartTour={restartOnboardingTour}
              thinkingEnabled={thinkingEnabled}
              thinkingSupported={thinkingSupported}
              thinkingEffort={thinkingEffort}
              modelLabel={selectedModelOption?.label ?? selectedModel}
            />
          ) : (
          <GeoChatThread
            key={assistantThreadId}
            surface="window"
            classNames={{
              root: "geochat-assistant-thread geochat-assistant-thread--window",
              viewport: "geochat-assistant-thread__viewport",
              footer: "geochat-assistant-thread__footer",
              userMessage: "geochat-assistant-message geochat-assistant-message--user",
              assistantMessage: "geochat-assistant-message geochat-assistant-message--assistant",
              systemMessage: "geochat-assistant-message geochat-assistant-message--system",
              messageContent: "geochat-assistant-message__content",
            }}
            empty={<WindowThreadEmpty onSubmit={(prompt) => void submitPrompt(prompt)} />}
            footer={(
              <GeoChatComposer
                variant="window"
                focusSignal={composerFocusSignal}
                disabled={!canvasReady}
                error={submissionError}
                placeholder={t("composer.placeholder")}
                attachLabel={t("composer.attachFiles")}
                removeAttachmentLabel={(name) => t("composer.removeAttachment", { name })}
                sendLabel={t("composer.sendMessage")}
                stopLabel={t("composer.stopGeneration")}
                modelControl={(
                  <ModelMenu
                    value={selectedModel}
                    models={modelOptions}
                    disabled={isStreaming}
                    thinkingEnabled={thinkingEnabled}
                    thinkingSupported={thinkingSupported}
                    thinkingEffort={thinkingEffort}
                    portalContainer={() => panelRef.current?.parentElement ?? null}
                    onChange={changeModel}
                    onThinkingEnabledChange={changeThinkingEnabled}
                    onThinkingEffortChange={changeThinkingEffort}
                  />
                )}
                onFocus={() => setSubmissionError(null)}
                onAttachmentError={setSubmissionError}
              />
            )}
          />
          )}
          </motion.div>
        </AnimatePresence>
      )}
      {onboarding.ready && !collapsed && panelView === "chat" && panelRef.current && (
        <Joyride
          steps={onboardingSteps}
          run
          continuous
          scrollToFirstStep={false}
          // Keep the overlay in Joyride's viewport-level portal. The panel is
          // fixed-positioned, so a panel-sized portal makes Joyride measure a
          // 600px canvas from the viewport origin (the mask then appears on
          // the left side of the window). The default body portal lets the
          // overlay and tooltip use the same viewport coordinate system and
          // resize with the window.
          floatingOptions={{ strategy: "fixed" }}
          locale={{
            back: t("tour.back"),
            close: t("tour.close"),
            last: t("tour.done"),
            next: t("tour.next"),
            nextWithProgress: t("tour.nextWithProgress"),
            skip: t("tour.skip"),
          }}
          options={{
            primaryColor: appTheme.palette.primary.main,
            overlayColor: "rgba(17, 24, 39, .58)",
            overlayClickAction: false,
            spotlightPadding: 6,
            spotlightRadius: 8,
            showProgress: true,
            zIndex: 20,
          }}
          styles={{
            tooltip: { borderRadius: 12, padding: 16 },
            tooltipTitle: { fontSize: 15, fontWeight: 800 },
            tooltipContent: { fontSize: 13, lineHeight: 1.55, padding: "8px 0 12px" },
            buttonPrimary: { borderRadius: 8, fontSize: 13, fontWeight: 700 },
            buttonBack: { borderRadius: 8, fontSize: 13 },
            buttonSkip: { fontSize: 12 },
          }}
          tooltipComponent={OnboardingTooltip}
          onEvent={(data) => {
            if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) onboarding.complete();
          }}
        />
      )}
      <ErrorToast message={toastError} />
    </AssistantWindowShell>
    <AnimatePresence initial={false} onExitComplete={restorePanelAfterProblemBankClose}>
      {problemBankOpen && !collapsed && panelView === "chat" ? (
        <MotionPaper
          key="problem-bank-sidecar"
          className="problem-bank-sidecar"
          elevation={6}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.985 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.985 }}
          transition={{ duration: reduceMotion ? 0.08 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          sx={{
            position: "absolute",
            top: 0,
            left: `calc(100% + ${PROBLEM_BANK_SIDECAR_GAP}px)`,
            width: PROBLEM_BANK_SIDECAR_WIDTH,
            height: "100%",
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            bgcolor: "background.paper",
            transformOrigin: "left center",
            "@media (max-width: 980px)": {
              left: "auto",
              right: 0,
              width: "min(88vw, 380px)",
              zIndex: 6,
              boxShadow: "-16px 0 42px rgba(24, 59, 36, .16)",
            },
          }}
        >
          <ProblemBankSidecar onClose={closeProblemBank} onUseProblem={useProblemInComposer} />
        </MotionPaper>
      ) : null}
    </AnimatePresence>
    </AssistantRuntimeProvider>
  );
}
