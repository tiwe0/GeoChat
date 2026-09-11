import {
  Alert,
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
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import CalculateRounded from "@mui/icons-material/CalculateRounded";
import ConstructionRounded from "@mui/icons-material/ConstructionRounded";
import CropSquareRounded from "@mui/icons-material/CropSquareRounded";
import FactCheckRounded from "@mui/icons-material/FactCheckRounded";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import AddCommentRounded from "@mui/icons-material/AddCommentRounded";
import MinimizeRounded from "@mui/icons-material/MinimizeRounded";
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
import { BrandIcon } from "./BrandIcon";
import type { ReasoningMode, ThinkingEffort } from "./ModelMenu";
import { loadModelCatalog, type RuntimeModelOption } from "../features/models/modelCatalog";

const API_ORIGIN = new URL(
  import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8787",
).origin;
const AUTH_REQUIRED = import.meta.env.VITE_AUTH_REQUIRED !== "false";
const ONBOARDING_TOUR_STORAGE_KEY = "geogebraCopilotOnboardingTourCompleted";
const ONBOARDING_TOUR_OPT_IN_KEY = "geochatDesktopOnboardingTour";
const REASONING_MODE_STORAGE_KEY = "geogebraCopilotReasoningMode";
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
  const [reasoningMode, setReasoningMode] = useState<ReasoningMode>("auto");
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
  const { account, authError, setAuthError, authSessionRef } = useLocalSession();
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
    getModelProvider: (model) => modelOptionsRef.current.find((option) => option.id === model)?.provider ?? "deepseek",
    getThinking: () => reasoningMode === "thinking",
    getThinkingEffort: () => thinkingEffort,
    locale: i18n.language.startsWith("en") ? "en-US" : "zh-CN",
    onFinish: () => {
      if (authSessionRef.current.token) void conversationHistory.load(true);
      if (blackboardOpen) void blackboard.load();
    },
    onRestore: (run) => {
      panelChatRef.current.setConversationId(run.conversationId);
      setCurrentConversationId(run.conversationId);
      setCurrentConversationTitle(run.prompt.replace(/\s+/g, " ").trim().slice(0, 80));
      changeModel(run.modelId);
      const restoredThinking = run.thinkingEnabled === true;
      panelChatRef.current.setThinkingEnabled(restoredThinking);
      setReasoningMode(restoredThinking ? "thinking" : "auto");
      if (run.thinkingEffort === "light" || run.thinkingEffort === "standard" || run.thinkingEffort === "extended") {
        setThinkingEffort(run.thinkingEffort);
      }
    },
  });
  const isStreaming = status === "streaming" || status === "submitted";
  // The catalog is local and static, so there is nothing to fetch. Only the
  // selection needs reconciling: drop one that is no longer in the registry.
  useEffect(() => {
    const models = loadModelCatalog();
    modelOptionsRef.current = models;
    setModelOptions(models);
    const current = panelChatRef.current.model;
    if (current && models.some((model) => model.id === current)) return;
    const first = models[0];
    if (!first) return;
    panelChatRef.current.setModel(first.id);
    setSelectedModel(first.id);
  }, []);
  // The tour does not auto-start in the desktop build. Its steps were written
  // for the web layout and the spotlight lands on the wrong region here, which
  // is worse on first launch than no tour at all. The first-run problem worth
  // solving is configuring a model key, not a nine-step feature walkthrough.
  // Re-enable by setting geochatDesktopOnboardingTour = true in local storage
  // once the step targets have been reworked for this layout.
  useEffect(() => {
    void browser.storage.local
      .get(ONBOARDING_TOUR_OPT_IN_KEY)
      .then((stored) => setOnboardingTourReady(stored[ONBOARDING_TOUR_OPT_IN_KEY] === true))
      .catch(() => setOnboardingTourReady(false));
  }, []);
  useEffect(() => {
    void browser.storage.local.get([REASONING_MODE_STORAGE_KEY, THINKING_EFFORT_STORAGE_KEY]).then((stored) => {
      const mode = stored[REASONING_MODE_STORAGE_KEY];
      const effort = stored[THINKING_EFFORT_STORAGE_KEY];
      if (mode === "auto" || mode === "instant" || mode === "thinking") {
        setReasoningMode(mode);
        panelChatRef.current.setThinkingEnabled(mode === "thinking");
      }
      if (effort === "light" || effort === "standard" || effort === "extended") setThinkingEffort(effort);
    }).catch(() => undefined);
  }, []);

  function completeOnboardingTour() {
    setOnboardingTourReady(false);
    void browser.storage.local.set({ [ONBOARDING_TOUR_STORAGE_KEY]: true });
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
  function openConversationHistory() {
    setBlackboardOpen(false);
    setConversationDrawerOpen(true);
    if (authSessionRef.current.token) void conversationHistory.load();
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
    if (!modelOptionsRef.current.some((option) => option.id === value)) return;
    panelChatRef.current.setModel(value);
    setSelectedModel(value);
    void saveStoredModel(value);
  }

  function changeReasoningMode(mode: ReasoningMode) {
    setReasoningMode(mode);
    panelChatRef.current.setThinkingEnabled(mode === "thinking");
    void browser.storage.local.set({ [REASONING_MODE_STORAGE_KEY]: mode });
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
          <IconButton
            type="button"
            onClick={togglePanelView}
            aria-label={panelView === "chat" ? t("panel.openUserInformation") : t("panel.returnToChat")}
            title={panelView === "chat" ? t("panel.openUserInformation") : t("panel.returnToChat")}
            sx={{
              width: 30,
              height: 30,
              flex: "0 0 auto",
              display: "grid",
              placeItems: "center",
              borderRadius: 1,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              "&:hover": { bgcolor: "primary.dark" },
              ...(panelView === "chat" ? {
                p: 0,
                bgcolor: "transparent",
                "&:hover": { bgcolor: "action.hover" },
              } : {}),
            }}
          >
            {panelView === "chat"
              ? <BrandIcon size={26} />
              : <ArrowBackRounded sx={{ fontSize: 18 }} />}
          </IconButton>
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
            signedIn={Boolean(account && authSessionRef.current.token)}
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
            <SettingsPanel onClose={() => setPanelView("chat")} />
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
                      return (
                        <ThinkingBlock
                          key={index}
                          active={isStreaming && message.role === "assistant" && message.id === messages.at(-1)?.id}
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
          {error && <Alert severity="error" sx={{ mx: 1.5, mt: 1 }}>{formatAgentRunError(error, t)}</Alert>}
          <ChatComposer
            value={input}
            attachments={attachments}
            busy={isStreaming}
            model={selectedModel}
            models={modelOptions}
            reasoningMode={reasoningMode}
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
            onReasoningModeChange={changeReasoningMode}
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
          portalElement={panelRef.current}
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
    </MotionPaper>
  );
}
