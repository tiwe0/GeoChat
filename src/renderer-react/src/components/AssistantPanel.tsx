import {
  Box,
  ButtonBase,
  CircularProgress,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import AddCircleOutlineRounded from "@mui/icons-material/AddCircleOutlineRounded";
import CalculateRounded from "@mui/icons-material/CalculateRounded";
import ConstructionRounded from "@mui/icons-material/ConstructionRounded";
import CropSquareRounded from "@mui/icons-material/CropSquareRounded";
import FactCheckRounded from "@mui/icons-material/FactCheckRounded";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import AddCommentRounded from "@mui/icons-material/AddCommentRounded";
import MinimizeRounded from "@mui/icons-material/MinimizeRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import KeyboardArrowDownRounded from "@mui/icons-material/KeyboardArrowDownRounded";
import PsychologyRounded from "@mui/icons-material/PsychologyRounded";
import { Joyride, STATUS, type Step } from "react-joyride";
import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import { AnimatePresence, motion } from "motion/react";
import {
} from "@geochat-ai/app/contracts";
import { useAgentRunChat } from "../hooks/useAgentRunChat";
import { formatAgentRunError } from "../features/agent-run/errorMessage";
import { STREAMDOWN_PLUGINS } from "../features/chat/streamdownPlugins";
import { useLocalSession } from "../features/local-session/useLocalSession";
import { SettingsPanel } from "../features/desktop/SettingsPanel";
import { saveStoredModel } from "../features/local-session/storage";
import { areSupportedAgentAttachments } from "../features/attachments/capabilities";
import { useConversations } from "../features/conversations/useConversations";
import { useConversationBlackboard } from "../features/conversations/useConversationBlackboard";
import { PanelChatState } from "../features/chat/panelChatState";
import {
  CHAT_PAGE_MIN_HEIGHT,
  DEFAULT_PANEL_HEIGHT,
  DEFAULT_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  RESIZE_HANDLES,
  USER_PAGE_MIN_HEIGHT,
  USER_PAGE_MIN_WIDTH,
  usePanelWindow,
} from "../features/panel-window/usePanelWindow";
import { useMessageScroll } from "../hooks/useMessageScroll";
import { useStreamdownTranslations } from "../i18n/useStreamdownTranslations";
import { ChatComposer, type ComposerAttachment } from "./ChatComposer";
import { ConversationDrawer } from "./ConversationDrawer";
import { LanguageButton } from "./LanguageButton";
import { MessageAttachment } from "./MessageAttachment";
import { AgentToolResult, isAgentDisplayToolPart } from "./AgentToolResult";
import { BlackboardDrawer } from "./BlackboardDrawer";
import { OnboardingTooltip } from "./OnboardingTooltip";
import { ErrorToast } from "./ErrorToast";
import { BrandIcon } from "./BrandIcon";
import type { ThinkingEffort } from "./ModelMenu";
import { createDesktopDebugActionExecutor } from "../features/desktop/mcpDebugActions";
import { useMcpState } from "../features/desktop/useMcpState";
import { DEFAULT_MCP_STATUS, type DesktopDebugAction } from "../../../shared/desktop/mcp-debug-actions";
import {
  credentialsForProvider,
  readDesktopConfig,
} from "../../../shared/desktop/desktop-config";
import type { RendererMcpStatus } from "../../../shared/desktop/workbench-types";
import { loadModelCatalog, type RuntimeModelOption } from "../features/models/modelCatalog";
import { backendAuthToken, backendOrigin } from "../features/desktop/runtime";

// Desktop conversations and credentials are local-first; using the assistant
// does not require an account or a remote session.
const AUTH_REQUIRED = false;
const ONBOARDING_TOUR_STORAGE_KEY = "geogebraCopilotOnboardingTourCompleted";
const THINKING_ENABLED_STORAGE_KEY = "geogebraCopilotThinkingEnabled";
const LEGACY_REASONING_MODE_STORAGE_KEY = "geogebraCopilotReasoningMode";
const THINKING_EFFORT_STORAGE_KEY = "geogebraCopilotThinkingEffort";
const MotionPaper = motion.create(Paper);

function compactConversationTitle(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[#>*-]|•)\s+/u, "")
    .trim();
  if (!normalized) return "";
  return normalized.length > 60 ? `${normalized.slice(0, 60).trimEnd()}…` : normalized;
}

type PanelContextMenuState = {
  left: number;
  top: number;
  selectedText: string;
  editable: HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
};


function contextMenuEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const editable = target.closest("input, textarea, [contenteditable='true'], [contenteditable='']");
  return editable instanceof HTMLElement ? editable : null;
}

function contextMenuSelectedText(target: Element | null) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    return target.value.slice(Math.min(start, end), Math.max(start, end));
  }
  return target?.ownerDocument.getSelection()?.toString() ?? "";
}

async function writeContextMenuText(text: string) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard permission is browser-controlled */ }
}

async function pasteContextMenuText(target: PanelContextMenuState["editable"]) {
  if (!target) return;
  let text = "";
  try { text = await navigator.clipboard.readText(); } catch { return; }
  if (!text) return;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  target.ownerDocument.execCommand("insertText", false, text);
}

function toolPartStatus(part: unknown): string {
  if (!part || typeof part !== "object") return "pending";
  const state = (part as { state?: string }).state;
  if (state === "output-available") return "done";
  if (state === "output-error") return "failed";
  return "running";
}

function TypewriterText({ text }: { text: string }) {
  const [visibleText, setVisibleText] = useState("");

  useEffect(() => {
    let cursor = 0;
    let timer: number | undefined;
    const tick = () => {
      if (cursor >= text.length) {
        setVisibleText(text);
        return;
      }
      const remaining = text.length - cursor;
      const step = remaining > 120 ? 4 : remaining > 60 ? 2 : 1;
      cursor = Math.min(text.length, cursor + step);
      setVisibleText(text.slice(0, cursor));
      timer = window.setTimeout(tick, remaining > 60 ? 12 : 18);
    };

    setVisibleText("");
    timer = window.setTimeout(tick, 10);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [text]);

  return (
    <Typography component="span" variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
      {visibleText}
    </Typography>
  );
}

function formatCredits(value: number) {
  const precision = value >= 1 ? 2 : 4;
  return value.toFixed(precision).replace(/\.?0+$/, "");
}

function ThinkingBlock({
  active,
  collapseLabel,
  completeLabel,
  expandLabel,
  label,
  text,
}: {
  active: boolean;
  collapseLabel: string;
  completeLabel: string;
  expandLabel: string;
  label: string;
  text: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const reasoningLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = reasoningLines[0] ?? "";
  const latestLine = reasoningLines[reasoningLines.length - 1] ?? firstLine;
  const summary = (active ? latestLine : firstLine) || label;

  useEffect(() => {
    if (!active) setExpanded(false);
  }, [active]);

  // DeepSeek's web UI follows the actual streamed text rather than running a
  // timer-driven marquee: while reasoning is active, keep the single-line
  // viewport pinned to the newest content. Once settled, restore the stable
  // first line and the scroll position at the start.
  useLayoutEffect(() => {
    const node = summaryRef.current;
    if (!node) return;

    if (active && !expanded) {
      node.scrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    } else {
      node.scrollLeft = 0;
    }
  }, [active, expanded, text, summary]);

  return (
    <Box
      sx={{
        mb: 0.75,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        bgcolor: "action.hover",
        color: "text.secondary",
        border: 1,
        borderColor: "divider",
      }}
    >
      <ButtonBase
        component="button"
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-label={expanded ? collapseLabel : expandLabel}
        sx={{
          width: "100%",
          minHeight: 28,
          justifyContent: "space-between",
          borderRadius: 0.75,
          textAlign: "left",
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
        }}
      >
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
          {active ? <CircularProgress size={14} thickness={5} color="inherit" /> : <PsychologyRounded sx={{ fontSize: 15 }} />}
          <Typography variant="caption" sx={{ fontWeight: 700 }}>{active ? label : completeLabel}</Typography>
        </Stack>
        <KeyboardArrowDownRounded
          sx={{
            fontSize: 18,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 180ms ease",
          }}
        />
      </ButtonBase>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <Typography
              variant="caption"
              component="div"
              sx={{ pt: 0.5, pb: 0.25, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
            >
              {text}
            </Typography>
          </motion.div>
        )}
      </AnimatePresence>
      {!expanded && (
        <Box
          ref={summaryRef}
          sx={{
            minWidth: 0,
            overflowX: "auto",
            overflowY: "hidden",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
            whiteSpace: "nowrap",
          }}
        >
          <Typography
            component="div"
            variant="caption"
            sx={{
              display: "inline-block",
              px: 0.5,
              pt: 0.35,
              pb: 0.15,
            }}
          >
            {summary}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function AssistantPanel({ canvasReady = true }: { canvasReady?: boolean }) {
  const { t, i18n } = useTranslation();
  const streamdownTranslations = useStreamdownTranslations();
  const [input, setInput] = useState("");
  const [contextMenu, setContextMenu] = useState<PanelContextMenuState | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [panelView, setPanelView] = useState<"chat" | "user">("chat");
  const [modelOptions, setModelOptions] = useState<RuntimeModelOption[]>(loadModelCatalog());
  const modelOptionsRef = useRef<RuntimeModelOption[]>(loadModelCatalog());
  modelOptionsRef.current = modelOptions;
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>("standard");
  const [conversationDrawerOpen, setConversationDrawerOpen] = useState(false);
  const [blackboardOpen, setBlackboardOpen] = useState(false);
  const [onboardingTourReady, setOnboardingTourReady] = useState<boolean | null>(null);
  const suppressBlackboardToggleRef = useRef(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [currentConversationTitle, setCurrentConversationTitle] = useState<string | null>(null);
  const panelChatRef = useRef(new PanelChatState());
  // Desktop is local-first: no account, no credits, no device bridge.
  // The Pro build owns those surfaces; see features/local-session.
  // Resolved during bootstrap, so this is stable for the life of the renderer.
  const API_ORIGIN = backendOrigin();
  const { account, authError, setAuthError, authSessionRef } = useLocalSession({
    localAuthToken: backendAuthToken()
  });
  const blackboard = useConversationBlackboard({
    apiOrigin: API_ORIGIN,
    authSessionRef,
    conversationId: currentConversationId,
    loadFailedMessage: t("blackboard.loadFailed"),
  });
  const panelWindow = usePanelWindow(panelView);
  const { panelRef, collapsed, setCollapsed, dragging, resizing } = panelWindow;
  const messageScroll = useMessageScroll({ active: !collapsed && panelView === "chat" });
  const { messages, setMessages, sendMessage, stop, status, error } = useAgentRunChat({
    apiOrigin: API_ORIGIN,
    getAuthToken: () => authSessionRef.current.token,
    getModel: () => panelChatRef.current.model,
    getModelConfig: getSelectedModelConfig,
    getModelProvider: (model) => modelOptionsRef.current.find((option) => option.id === model)?.provider ?? "deepseek",
    // Auto and Thinking both request provider reasoning so the streamed
    // reasoning deltas can be shown in the transcript. Instant is the only
    // mode that explicitly suppresses the provider's reasoning channel.
    getThinking: () => thinkingEnabled,
    getThinkingEffort: () => thinkingEffort,
    locale: i18n.language.startsWith("en") ? "en-US" : "zh-CN",
    onFinish: () => {
      void conversationHistory.load(true);
      if (blackboardOpen) void blackboard.load();
    },
    onRestore: (run) => {
      panelChatRef.current.setConversationId(run.conversationId);
      setCurrentConversationId(run.conversationId);
      setCurrentConversationTitle(run.prompt.replace(/\s+/g, " ").trim().slice(0, 80));
      changeModel(run.modelId);
      // A recovered run keeps the reasoning setting it started with, not
      // whatever the composer happens to show now.
      setThinkingEnabled(run.thinking === true);
      if (run.thinkingEffort) setThinkingEffort(run.thinkingEffort);
    },
  });
  const isStreaming = status === "streaming" || status === "submitted";

  // The MCP server queues actions and waits for the renderer to run them, so
  // the poll loop belongs here, where the app is mounted, rather than in the
  // Settings screen that merely toggles it. The executor is built once and
  // reads live state through this ref, because an MCP action can arrive on any
  // render and must see the state of that moment, not of its construction.
  const mcpStatusRef = useRef<RendererMcpStatus>(DEFAULT_MCP_STATUS);
  const debugStateRef = useRef({ conversationId: currentConversationId, view: panelView, isStreaming });
  debugStateRef.current = { conversationId: currentConversationId, view: panelView, isStreaming };
  const executeDebugActionRef = useRef<((action: DesktopDebugAction) => Promise<unknown>) | null>(null);
  if (!executeDebugActionRef.current) {
    executeDebugActionRef.current = createDesktopDebugActionExecutor({
      getConversationId: () => debugStateRef.current.conversationId,
      getView: () => debugStateRef.current.view,
      getModelConfig: getSelectedModelConfig,
      getMcpStatus: () => mcpStatusRef.current,
      isRunning: () => debugStateRef.current.isStreaming,
      sendMessage: (content) => submit(content),
      activateConversation: async (conversationId) => {
        if (!conversationId || conversationId === debugStateRef.current.conversationId) return;
        panelChatRef.current.setConversationId(conversationId);
        setCurrentConversationId(conversationId);
      },
      showChat: () => setPanelView("chat")
    });
  }
  const mcp = useMcpState({
    authToken: () => authSessionRef.current.token ?? undefined,
    executeDebugAction: (action) => executeDebugActionRef.current!(action)
  });
  mcpStatusRef.current = mcp.status;
  // The catalog is local and static, so there is nothing to fetch. Only the
  // selection needs reconciling: drop one that is no longer in the registry.
  useEffect(() => {
    const models = loadModelCatalog();
    modelOptionsRef.current = models;
    setModelOptions(models);
    const configured = readDesktopConfig().model;
    const current = panelChatRef.current.model;
    const selected = models.find((model) => model.id === current)
      ?? models.find((model) => model.id === configured.model && model.provider === configured.provider)
      ?? models[0];
    if (!selected) return;
    panelChatRef.current.setModel(selected.id);
    setSelectedModel(selected.id);
  }, []);
  // Show the tour once on first launch. Completion and skipping are persisted
  // locally so returning users are not interrupted.
  useEffect(() => {
    void browser.storage.local
      .get(ONBOARDING_TOUR_STORAGE_KEY)
      .then((stored) => setOnboardingTourReady(stored[ONBOARDING_TOUR_STORAGE_KEY] !== true))
      .catch(() => setOnboardingTourReady(true));
  }, []);
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
        setThinkingEnabled(resolvedThinking);
        panelChatRef.current.setThinkingEnabled(resolvedThinking);
      }
      const effort = stored[THINKING_EFFORT_STORAGE_KEY];
      if (effort === "light" || effort === "standard" || effort === "extended") setThinkingEffort(effort);
    }).catch(() => undefined);
  }, []);

  function completeOnboardingTour() {
    setOnboardingTourReady(false);
    void browser.storage.local.set({ [ONBOARDING_TOUR_STORAGE_KEY]: true });
  }

  function restartOnboardingTour() {
    setPanelView("chat");
    setConversationDrawerOpen(false);
    setBlackboardOpen(false);
    setOnboardingTourReady(false);
    void browser.storage.local.remove(ONBOARDING_TOUR_STORAGE_KEY).then(
      () => setOnboardingTourReady(true),
      () => setOnboardingTourReady(true),
    );
  }

  const onboardingSteps: Step[] = [
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="history"]') ?? null, title: t("tour.historyTitle"), content: t("tour.historyDescription"), placement: "bottom", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="blackboard"]') ?? null, title: t("tour.blackboardTitle"), content: t("tour.blackboardDescription"), placement: "bottom", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="language"]') ?? null, title: t("tour.languageTitle"), content: t("tour.languageDescription"), placement: "bottom", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="model"]') ?? null, title: t("tour.modelTitle"), content: t("tour.modelDescription"), placement: "top", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="attachments"]') ?? null, title: t("tour.attachmentsTitle"), content: t("tour.attachmentsDescription"), placement: "top", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-thinking-tour="thinking"]') ?? null, title: t("tour.thinkingTitle"), content: t("tour.thinkingDescription"), placement: "top", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="send"]') ?? null, title: t("tour.sendTitle"), content: t("tour.sendDescription"), placement: "top", skipBeacon: true, buttons: ["back", "skip", "primary"] },
    { target: () => panelRef.current?.querySelector<HTMLElement>('[data-copilot-tour="minimize"]') ?? null, title: t("tour.minimizeTitle"), content: t("tour.minimizeDescription"), placement: "bottom-end", skipBeacon: true, buttons: ["back", "skip", "primary"] },
  ];
  useLayoutEffect(() => {
    if (collapsed || panelView !== "chat" || messageScroll.mode !== "follow") return;
    messageScroll.scrollToLatest();
  }, [collapsed, messageScroll.mode, messageScroll.scrollToLatest, messages, panelView, status]);
  const conversationHistory = useConversations({
    apiOrigin: API_ORIGIN,
    authSessionRef,
    isStreaming,
    setMessages,
    changeModel,
    followLatest: messageScroll.followLatest,
    onSelect: (conversation) => {
      panelChatRef.current.setConversationId(conversation.id);
      setCurrentConversationId(conversation.id);
      setCurrentConversationTitle(conversation.title || t("history.untitled"));
      setConversationDrawerOpen(false);
      setBlackboardOpen(false);
    },
    onDelete: (conversation) => {
      if (conversation.id !== currentConversationId) return;
      panelChatRef.current.setConversationId(null);
      setCurrentConversationId(null);
      setCurrentConversationTitle(null);
      setMessages([]);
      setInput("");
      setAttachments([]);
      setBlackboardOpen(false);
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
    : t("panel.user");
  const toastError = error
    ? formatAgentRunError(error, t)
    : submissionError ?? conversationHistoryError ?? blackboard.error ?? authError;
  function openConversationHistory() {
    setBlackboardOpen(false);
    setConversationDrawerOpen(true);
    void conversationHistory.load();
  }

  function startNewConversation() {
    if (isStreaming) return;
    panelChatRef.current.setConversationId(null);
    setCurrentConversationId(null);
    setCurrentConversationTitle(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setConversationDrawerOpen(false);
    setBlackboardOpen(false);
    messageScroll.followLatest();
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

  async function submit(exampleText?: string) {
    const text = (exampleText ?? input).trim();
    const pendingAttachments = exampleText === undefined ? attachments : [];
    if ((!text && pendingAttachments.length === 0) || isStreaming || (AUTH_REQUIRED && !authSessionRef.current.token)) {
      if (AUTH_REQUIRED && !authSessionRef.current.token) setAuthError(t("auth.creditsRequired"));
      return;
    }
    const files = pendingAttachments.map((attachment) => attachment.part);
    if (!areSupportedAgentAttachments(files)) {
      const unsupported = pendingAttachments.find((attachment) => !attachment.part.mediaType?.startsWith("image/"));
      setSubmissionError(t("composer.unsupportedFile", { name: unsupported?.part.filename ?? t("common.attachment") }));
      return;
    }
    const conversationId = currentConversationId ?? `conv_${crypto.randomUUID().replaceAll("-", "")}`;
    if (!currentConversationId) {
      panelChatRef.current.setConversationId(conversationId);
      setCurrentConversationId(conversationId);
      const attachmentTitle = pendingAttachments.find((attachment) => attachment.part.filename)?.part.filename ?? "";
      setCurrentConversationTitle(compactConversationTitle(text || attachmentTitle) || t("history.newConversation"));
    }
    messageScroll.followLatest();
    setSubmissionError(null);
    setInput("");
    if (exampleText === undefined) setAttachments([]);
    if (text) {
      await sendMessage({ text, files }, { body: { conversationId } });
    } else {
      await sendMessage({ files }, { body: { conversationId } });
    }
  }

  function changeModel(value: string) {
    const selected = modelOptionsRef.current.find((option) => option.id === value);
    if (!selected) return;
    panelChatRef.current.setModel(selected.id);
    setSelectedModel(selected.id);
    void saveStoredModel(value);
  }

  function getSelectedModelConfig() {
    const config = readDesktopConfig();
    const selected = modelOptionsRef.current.find((option) => option.id === panelChatRef.current.model);
    if (!selected) return config.model;
    const credentials = credentialsForProvider(config.providerCredentials, selected.provider);
    // Model selection belongs to the conversation composer. Rebuild only the
    // transient run config with that model and its provider credentials; keep
    // Settings focused on storing credentials for each provider.
    return {
      ...config.model,
      provider: selected.provider,
      model: selected.id,
      apiKey: credentials.apiKey,
      customBaseUrl: credentials.customBaseUrl,
    };
  }

  function changeThinkingEnabled(enabled: boolean) {
    setThinkingEnabled(enabled);
    panelChatRef.current.setThinkingEnabled(enabled);
    void browser.storage.local.set({ [THINKING_ENABLED_STORAGE_KEY]: enabled });
  }

  function changeThinkingEffort(effort: ThinkingEffort) {
    setThinkingEffort(effort);
    void browser.storage.local.set({ [THINKING_EFFORT_STORAGE_KEY]: effort });
  }

  function togglePanelView() {
    setCollapsed(false);
    setConversationDrawerOpen(false);
    setBlackboardOpen(false);
    setPanelView((view) => view === "chat" ? "user" : "chat");
  }

  return (
    <MotionPaper
      ref={panelRef}
      aria-label={t("common.appName")}
      lang={i18n.resolvedLanguage ?? i18n.language}
      elevation={dragging || resizing ? 10 : 6}
      // Keep layout measurement enabled during restore. The collapsed control
      // starts the transition from the drag surface, before dragging state is
      // released, so disabling layout here would make the restore snap open.
      layout={!resizing}
      animate={{ borderRadius: collapsed ? 20 : 4 }}
      transition={{ layout: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }}
      onContextMenuCapture={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        const editable = contextMenuEditableTarget(event.target);
        const selectedText = contextMenuSelectedText(editable ?? target).trim();
        if (editable || selectedText) {
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({ left: event.clientX, top: event.clientY, selectedText, editable });
          return;
        }
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDownCapture={(event) => {
        if (!blackboardOpen || !(event.target instanceof Element)) return;
        if (event.target.closest("#copilot-blackboard-drawer")) return;
        if (event.target.closest("[data-copilot-blackboard-trigger]")) {
          // Pointer-down closes first; suppress the click emitted after React rerenders.
          suppressBlackboardToggleRef.current = true;
        }
        setBlackboardOpen(false);
      }}
      sx={{
        width: collapsed ? 40 : `min(${DEFAULT_PANEL_WIDTH}px, calc(100vw - 40px))`,
        minWidth: collapsed ? 40 : panelView === "user"
          ? `min(${USER_PAGE_MIN_WIDTH}px, calc(100vw - 40px))`
          : `min(${MIN_PANEL_WIDTH}px, calc(100vw - 40px))`,
        maxWidth: collapsed ? 40 : undefined,
        height: collapsed ? 40 : `min(${DEFAULT_PANEL_HEIGHT}px, calc(100vh - 40px))`,
        minHeight: collapsed
          ? 40
          : panelView === "user"
            ? `min(${USER_PAGE_MIN_HEIGHT}px, calc(100vh - 40px))`
            : `min(${CHAT_PAGE_MIN_HEIGHT}px, calc(100vh - 40px))`,
        maxHeight: collapsed ? 40 : "calc(100vh - 40px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        border: 1,
        borderColor: "divider",
        borderRadius: collapsed ? "50%" : 1,
        color: "text.primary",
        transition: (theme) => theme.transitions.create("box-shadow", { duration: 160 }),
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      {collapsed ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.72 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          onPointerDown={(event) => panelWindow.startDragging(event, true)}
          onPointerMove={panelWindow.moveDragging}
          onPointerUp={panelWindow.stopDragging}
          onPointerCancel={panelWindow.stopDragging}
          onLostPointerCapture={panelWindow.stopDragging}
          style={{
            display: "grid",
            width: "100%",
            height: "100%",
            placeItems: "center",
            cursor: dragging ? "grabbing" : "grab",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          <IconButton
            type="button"
            onClick={panelWindow.handleCollapsedRestoreClick}
            aria-label={t("panel.restoreWindow")}
            title={t("panel.restoreWindow")}
            sx={{ width: 40, height: 40, borderRadius: "50%", color: "primary.main", cursor: "inherit" }}
          >
            <BrandIcon size={34} />
          </IconButton>
        </motion.div>
      ) : (
      <Box
        component="header"
        onPointerDown={panelWindow.startDragging}
        onPointerMove={panelWindow.moveDragging}
        onPointerUp={panelWindow.stopDragging}
        onPointerCancel={panelWindow.stopDragging}
        onLostPointerCapture={panelWindow.stopDragging}
        sx={{
          minHeight: 48,
          px: 1.5,
          py: 0.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          borderTop: 0,
          borderBottom: 0,
          bgcolor: "background.paper",
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ minWidth: 0, flex: 1, minHeight: 36, alignItems: "center" }}>
          {/* The brand mark is identity, not a control, in every view. It used
              to double as the Settings entry, labelled "user information" — a
              logo reads as decoration, so the one screen a keyless first run
              must reach was effectively hidden. Settings is a labelled gear on
              the right, and Settings carries its own Back; a second one here
              would be two controls for one action. */}
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
              <KeyboardArrowDownRounded sx={{ flex: "0 0 auto", fontSize: 18, color: "text.secondary" }} />
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
                <AddCommentRounded fontSize="small" />
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
                <FactCheckRounded fontSize="small" />
              </IconButton>
              <LanguageButton tourId="language" />
              <IconButton
                type="button"
                size="small"
                onClick={togglePanelView}
                aria-label={t("panel.openSettings")}
                title={t("panel.openSettings")}
                data-copilot-no-drag
              >
                <SettingsRounded fontSize="small" />
              </IconButton>
            </>
          )}
          <IconButton
            type="button"
            size="small"
            onClick={() => {
              setConversationDrawerOpen(false);
              setBlackboardOpen(false);
              panelWindow.toggleCollapsed();
            }}
            aria-label={collapsed ? t("panel.restoreWindow") : t("panel.minimizeWindow")}
            title={collapsed ? t("panel.restoreWindow") : t("panel.minimizeWindow")}
            data-copilot-tour="minimize"
          >
            {collapsed ? <CropSquareRounded fontSize="small" /> : <MinimizeRounded fontSize="small" />}
          </IconButton>
        </Stack>
      </Box>
      )}
      {!collapsed && panelView === "chat" && (
        <>
          <ConversationDrawer
            open={conversationDrawerOpen}
            // Desktop history is persisted in local storage and is available
            // before a user signs in (remote sync remains optional).
            signedIn={true}
            interactionDisabled={isStreaming}
            loading={conversationHistoryLoading}
            selectingId={selectingConversationId}
            deletingId={deletingConversationId}
            error={conversationHistoryError}
            conversations={conversations}
            currentConversationId={currentConversationId}
            onClose={() => setConversationDrawerOpen(false)}
            onSelect={(conversation) => void conversationHistory.select(conversation)}
            onDelete={conversationHistory.remove}
          />
          <BlackboardDrawer
            open={blackboardOpen}
            signedIn={Boolean(authSessionRef.current.token)}
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
            key={panelView === "chat" ? "chat" : account ? "user" : "login"}
            initial={{ opacity: 0, x: panelView === "chat" ? -12 : 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: panelView === "chat" ? 12 : -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", overflow: "hidden" }}
          >
          {panelView === "user" ? (
            <SettingsPanel mcp={mcp} onClose={() => setPanelView("chat")} onRestartTour={restartOnboardingTour} />
          ) : (
        <>
          <Box
            ref={messageScroll.viewportRef}
            aria-live="polite"
            aria-label={t("panel.conversationMessages")}
            data-scroll-mode={messageScroll.mode}
            tabIndex={0}
            onScroll={messageScroll.handleScroll}
            onWheelCapture={messageScroll.handleWheel}
            onTouchStartCapture={messageScroll.handleTouchStart}
            onTouchMoveCapture={messageScroll.handleTouchMove}
            onKeyDown={messageScroll.handleKeyDown}
            sx={{
              position: "relative",
              minHeight: 150,
              flex: 1,
              overflowY: "auto",
              overscrollBehavior: "contain",
              bgcolor: "background.default",
              outline: "none",
              "&:focus-visible": {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: -2,
              },
            }}
          >
            <Box
              ref={messageScroll.contentRef}
              sx={{
                minHeight: "100%",
                p: 1.5,
                pb: messages.length === 0 ? 0.75 : 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              {messages.length === 0 && (
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pb: 10,
                    pointerEvents: "none",
                  }}
                >
                  <Stack spacing={0.75} sx={{ alignItems: "center", textAlign: "center" }}>
                    <motion.div
                      initial={{ opacity: 0, y: 12, scale: 0.76, rotate: -8 }}
                      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                      transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <BrandIcon size={136} />
                    </motion.div>
                  </Stack>
                </Box>
              )}
              {messages.length === 0 && (
                <Box
                  sx={{
                    position: "absolute",
                    left: 12,
                    right: 12,
                    bottom: 6,
                    minHeight: 150,
                    display: "flex",
                    alignItems: "flex-end",
                  }}
                >
                  <Stack spacing={1.25} sx={{ width: "100%" }}>
                    <Box sx={{ px: 0.5 }}>
                      <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
                        {t("panel.welcomeTitle")}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35, maxWidth: 520 }}>
                        {t("panel.welcomeDescription")}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.75} sx={{ width: "100%", alignItems: "stretch" }}>
                    {[
                      { key: "circle", icon: <AddCircleOutlineRounded fontSize="small" /> },
                      { key: "construction", icon: <CalculateRounded fontSize="small" /> },
                      { key: "explain", icon: <HelpOutlineRounded fontSize="small" /> },
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
                          onClick={() => void submit(t(`panel.examples.${example.key}`))}
                          sx={{
                            position: "relative",
                            width: "100%",
                            minWidth: 0,
                            minHeight: 94,
                            display: "flex",
                            alignItems: "flex-end",
                            justifyContent: "flex-start",
                            overflow: "hidden",
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
                          <Stack spacing={0.45} sx={{ position: "relative", zIndex: 1, minWidth: 0 }}>
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
              )}
              {messages.map((message) => (
                <Box
                  key={message.id}
                  sx={{
                    maxWidth: message.role === "user" ? "88%" : "100%",
                    alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                    px: message.role === "user" ? 1.25 : 0.5,
                    py: message.role === "user" ? 1 : 0.75,
                    borderRadius: 1.25,
                    bgcolor: message.role === "user" ? "primary.main" : "transparent",
                    color: message.role === "user" ? "primary.contrastText" : "text.primary",
                    overflowWrap: "anywhere",
                  }}
                >
                  {message.parts.map((part, index) => {
                    if (part.type === "reasoning") {
                      const answerStarted = message.parts.some((candidate) =>
                        candidate.type === "text" && candidate.text.trim().length > 0
                      );
                      return (
                        <ThinkingBlock
                          key={index}
                          active={
                            isStreaming &&
                            !answerStarted &&
                            message.role === "assistant" &&
                            message.id === messages.at(-1)?.id
                          }
                          label={t("panel.thinking")}
                          completeLabel={t("panel.thinkingComplete")}
                          expandLabel={t("panel.expandThinking")}
                          collapseLabel={t("panel.collapseThinking")}
                          text={part.text}
                        />
                      );
                    }
                    if (part.type === "text") {
                      if (message.role === "assistant") {
                        return (
                          <Streamdown
                            key={index}
                            animated={{ animation: "fadeIn", sep: "char", stagger: 14, duration: 90 }}
                            isAnimating={status === "streaming"}
                            caret="block"
                            className="copilot-markdown"
                            plugins={STREAMDOWN_PLUGINS}
                            translations={streamdownTranslations}
                          >
                            {part.text}
                          </Streamdown>
                        );
                      }
                      return <TypewriterText key={index} text={part.text} />;
                    }
                    if (part.type === "file") return <MessageAttachment key={index} part={part} />;
                    if (isAgentDisplayToolPart(part)) {
                      return (
                        <AgentToolResult
                          key={index}
                          part={part}
                          locale={i18n.language.startsWith("en") ? "en-US" : "zh-CN"}
                          statusLabel={t(`tools.${toolPartStatus(part)}`)}
                        />
                      );
                    }
                    if (part.type.startsWith("tool-")) return (
                      <Stack direction="row" spacing={0.5} key={index} sx={{ alignItems: "center", color: "text.secondary" }}>
                        <ConstructionRounded sx={{ fontSize: 14 }} />
                        <Typography variant="caption">{part.type.slice(5)}: {t(`tools.${toolPartStatus(part)}`)}</Typography>
                      </Stack>
                    );
                    return null;
                  })}
                </Box>
              ))}
              {status === "submitted" && (
                <Stack
                  direction="row"
                  spacing={1}
                  role="status"
                  aria-live="polite"
                  sx={{ alignItems: "center", px: 1.25, py: 1, color: "text.secondary" }}
                >
                  <CircularProgress size={14} />
                  <Typography
                    variant="caption"
                    sx={{
                      display: "inline-block",
                      animation: "copilotThinkingPulse 1.35s ease-in-out infinite",
                      "@keyframes copilotThinkingPulse": {
                        "0%, 100%": { opacity: 0.55 },
                        "50%": { opacity: 1 },
                      },
                      "@media (prefers-reduced-motion: reduce)": {
                        animation: "none",
                        opacity: 1,
                      },
                    }}
                  >
                    {t("panel.connecting")}
                  </Typography>
                </Stack>
              )}
            </Box>
          </Box>
          <ChatComposer
            value={input}
            attachments={attachments}
            busy={isStreaming}
            model={selectedModel}
            models={modelOptions}
            thinkingEnabled={thinkingEnabled}
            thinkingEffort={thinkingEffort}
            sendDisabled={
              (!input.trim() && attachments.length === 0)
              || isStreaming
              || (AUTH_REQUIRED && !authSessionRef.current.token)
            }
            error={submissionError}
            onChange={(value) => {
              setSubmissionError(null);
              setInput(value);
            }}
            onAttachmentsChange={(next) => {
              setSubmissionError(null);
              setAttachments(next);
            }}
            onSend={() => void submit()}
            onStop={stop}
            onModelChange={changeModel}
            modelPortalContainer={() => panelRef.current?.parentElement ?? null}
            onThinkingEnabledChange={changeThinkingEnabled}
            onThinkingEffortChange={changeThinkingEffort}
          />
        </>
          )}
          </motion.div>
        </AnimatePresence>
      )}
      {onboardingTourReady && !collapsed && panelView === "chat" && panelRef.current && (
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
            primaryColor: "#2563eb",
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
            if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) completeOnboardingTour();
          }}
        />
      )}
      {!collapsed && RESIZE_HANDLES.map((handle) => (
        <Box
          key={handle.direction}
          aria-hidden="true"
          onPointerDown={panelWindow.startResizing(handle.direction)}
          onPointerMove={panelWindow.moveResizing}
          onPointerUp={panelWindow.stopResizing}
          onPointerCancel={panelWindow.stopResizing}
          onLostPointerCapture={panelWindow.stopResizing}
          sx={{
            position: "absolute",
            zIndex: 2,
            cursor: handle.cursor,
            touchAction: "none",
            ...handle.position,
          }}
        />
      ))}
      <Menu
        open={Boolean(contextMenu)}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.top, left: contextMenu.left } : undefined}
        container={() => panelRef.current?.parentElement ?? null}
      >
        <MenuItem
          disabled={!contextMenu?.selectedText}
          onClick={() => {
            if (contextMenu?.selectedText) void writeContextMenuText(contextMenu.selectedText);
            setContextMenu(null);
          }}
        >
          <ListItemText primary={t("common.copy")} />
        </MenuItem>
        <MenuItem
          disabled={!contextMenu?.editable}
          onClick={() => {
            void pasteContextMenuText(contextMenu?.editable ?? null);
            setContextMenu(null);
          }}
        >
          <ListItemText primary={t("common.paste")} />
        </MenuItem>
      </Menu>
      <ErrorToast message={toastError} />
    </MotionPaper>
  );
}
