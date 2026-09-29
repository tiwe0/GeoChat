import {
  ArrowLeftIcon,
  CalculatorIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  CirclePlusIcon,
  ClipboardCheckIcon,
  LibraryBigIcon,
  MessageSquarePlusIcon,
  MinusIcon,
  SettingsIcon,
  SquareIcon,
} from "lucide-react";
import { Box, ButtonBase, IconButton, Paper, Stack, Typography, useTheme } from "@mui/material";
import { Joyride, STATUS, type Step } from "react-joyride";
import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps, PointerEvent as ReactPointerEvent, Ref } from "react";
import { useTranslation } from "react-i18next";
import { BlackboardDrawer } from "../../components/BlackboardDrawer";
import { BrandIcon } from "../../components/BrandIcon";
import { ConversationDrawer } from "../../components/ConversationDrawer";
import { ErrorToast } from "../../components/ErrorToast";
import { LanguageButton } from "../../components/LanguageButton";
import { ModelMenu } from "../../components/ModelMenu";
import { OnboardingTooltip } from "../../components/OnboardingTooltip";
import { ProblemBankSidecar } from "../../components/ProblemBankSidecar";
import { GeoChatComposer, GeoChatThread } from "../assistant-ui";
import { SettingsPanel } from "../desktop/SettingsPanel";
import { InteractionModeButton, InteractionModeTransition } from "../fusion-mode";
import { AssistantWindowShell } from "./AssistantWindowShell";
import { PROBLEM_BANK_SIDECAR_GAP, PROBLEM_BANK_SIDECAR_WIDTH } from "./useProblemBankPanel";

const MotionPaper = motion.create(Paper);

type AssistantWindowSurfaceProps = {
  transition: ComponentProps<typeof InteractionModeTransition>["transition"];
  panelWindow: ComponentProps<typeof AssistantWindowShell>["panelWindow"];
  panelView: "chat" | "user";
  language: string;
  panelTitle: string;
  collapsed: boolean;
  isStreaming: boolean;
  blackboardOpen: boolean;
  problemBankOpen: boolean;
  reduceMotion: boolean;
  assistantThreadId: string;
  canvasReady: boolean;
  composerFocusSignal: number;
  submissionError: string | null;
  toastError: string | null;
  conversationDrawer: ComponentProps<typeof ConversationDrawer>;
  blackboardDrawer: ComponentProps<typeof BlackboardDrawer>;
  settings: ComponentProps<typeof SettingsPanel>;
  modelMenu: ComponentProps<typeof ModelMenu>;
  onboarding: {
    ready: boolean;
    steps: Step[];
    complete: () => void;
  };
  problemBank: {
    triggerRef: Ref<HTMLButtonElement>;
    preload: () => Promise<unknown> | unknown;
    open: () => void;
    close: () => void;
    restoreAfterClose: () => void;
    useProblem: (problem: string) => void;
  };
  onHeaderPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  onOpenHistory: () => void;
  onNewConversation: () => void;
  onToggleBlackboard: () => void;
  onBlackboardPointerCancel: () => void;
  onSwitchToFusion: ComponentProps<typeof InteractionModeButton>["onToggle"];
  onTransitionLanguage: (changeLanguage: () => Promise<void>) => Promise<void>;
  onTogglePanelView: () => void;
  onToggleCollapsed: () => void;
  onSubmitExample: (prompt: string) => void;
  onClearSubmissionError: () => void;
  onAttachmentError: (message: string) => void;
};

function WindowThreadEmpty(props: { onSubmit: (prompt: string) => void }) {
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
                onClick={() => props.onSubmit(t(`panel.examples.${example.key}`))}
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

export function AssistantWindowSurface(props: AssistantWindowSurfaceProps) {
  const { t } = useTranslation();
  const appTheme = useTheme();
  return (
    <>
      <InteractionModeTransition transition={props.transition} />
      <AssistantWindowShell
        panelWindow={props.panelWindow}
        panelView={props.panelView}
        appLabel={t("common.appName")}
        language={props.language}
        onHeaderPointerMove={props.onHeaderPointerMove}
        onPointerDownCapture={props.onPointerDownCapture}
        header={(
          <>
            <Stack direction="row" spacing={1} sx={{ minWidth: 0, flex: 1, minHeight: 36, alignItems: "center" }}>
              <Box aria-hidden sx={{ width: 30, height: 30, flex: "0 0 auto", display: "grid", placeItems: "center" }}>
                <BrandIcon size={26} />
              </Box>
              {props.panelView === "chat" ? (
                <ButtonBase
                  component="button"
                  type="button"
                  disabled={props.isStreaming}
                  onClick={props.onOpenHistory}
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
                    {props.panelTitle}
                  </Typography>
                  <ChevronDownIcon size={18} style={{ flex: "0 0 auto", color: "#526079" }} />
                </ButtonBase>
              ) : (
                <Typography variant="subtitle2" sx={{ minWidth: 0, flex: 1, fontWeight: 700 }} noWrap title={props.panelTitle}>
                  {props.panelTitle}
                </Typography>
              )}
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ minHeight: 36, alignItems: "center", alignSelf: "center" }}>
              {props.panelView === "chat" && (
                <>
                  <IconButton
                    type="button"
                    size="small"
                    disabled={props.isStreaming}
                    onClick={props.onNewConversation}
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
                    onClick={props.onToggleBlackboard}
                    aria-label={t("blackboard.open")}
                    title={t("blackboard.open")}
                    aria-expanded={props.blackboardOpen}
                    aria-controls={props.blackboardOpen ? "copilot-blackboard-drawer" : undefined}
                    data-copilot-no-drag
                    data-copilot-blackboard-trigger
                    data-copilot-tour="blackboard"
                    onPointerCancel={props.onBlackboardPointerCancel}
                    sx={{
                      color: "#1f5a49",
                      bgcolor: props.blackboardOpen ? "rgba(31, 90, 73, 0.12)" : undefined,
                      "&:hover": { bgcolor: "rgba(31, 90, 73, 0.12)" },
                    }}
                  >
                    <ClipboardCheckIcon size={18} />
                  </IconButton>
                  <IconButton
                    ref={props.problemBank.triggerRef}
                    type="button"
                    size="small"
                    onClick={props.problemBankOpen ? props.problemBank.close : props.problemBank.open}
                    aria-label={props.problemBankOpen ? t("problemBank.close") : t("problemBank.open")}
                    title={props.problemBankOpen ? t("problemBank.close") : t("problemBank.open")}
                    aria-expanded={props.problemBankOpen}
                    aria-controls={props.problemBankOpen ? "copilot-problem-bank-sidecar" : undefined}
                    data-copilot-no-drag
                    data-copilot-tour="problem-bank"
                    onPointerEnter={() => { void props.problemBank.preload(); }}
                    onFocus={() => { void props.problemBank.preload(); }}
                    sx={{
                      color: props.problemBankOpen ? "primary.main" : undefined,
                      bgcolor: props.problemBankOpen ? "action.selected" : undefined,
                    }}
                  >
                    <LibraryBigIcon size={18} />
                  </IconButton>
                  <InteractionModeButton mode="window" label={t("panel.switchToFusion")} onToggle={props.onSwitchToFusion} />
                  <LanguageButton tourId="language" transitionLanguage={props.onTransitionLanguage} />
                  <IconButton
                    type="button"
                    size="small"
                    onClick={props.onTogglePanelView}
                    aria-label={t("panel.openSettings")}
                    title={t("panel.openSettings")}
                    data-copilot-no-drag
                    data-copilot-tour="settings"
                  >
                    <SettingsIcon size={18} />
                  </IconButton>
                </>
              )}
              {props.panelView === "user" && (
                <IconButton
                  type="button"
                  size="small"
                  onClick={props.onTogglePanelView}
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
                onClick={props.onToggleCollapsed}
                aria-label={props.collapsed ? t("panel.restoreWindow") : t("panel.minimizeWindow")}
                title={props.collapsed ? t("panel.restoreWindow") : t("panel.minimizeWindow")}
                data-copilot-tour="minimize"
              >
                {props.collapsed ? <SquareIcon size={18} /> : <MinusIcon size={18} />}
              </IconButton>
            </Stack>
          </>
        )}
      >
        {!props.collapsed && props.panelView === "chat" && (
          <>
            <ConversationDrawer {...props.conversationDrawer} />
            <BlackboardDrawer {...props.blackboardDrawer} />
          </>
        )}
        {!props.collapsed && (
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              data-language-transition-surface
              key={props.panelView}
              initial={{ opacity: 0, x: props.panelView === "chat" ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: props.panelView === "chat" ? 12 : -12 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", overflow: "hidden" }}
            >
              {props.panelView === "user" ? (
                <SettingsPanel {...props.settings} />
              ) : (
                <GeoChatThread
                  key={props.assistantThreadId}
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
                  empty={<WindowThreadEmpty onSubmit={props.onSubmitExample} />}
                  footer={(
                    <GeoChatComposer
                      variant="window"
                      focusSignal={props.composerFocusSignal}
                      disabled={!props.canvasReady}
                      error={props.submissionError}
                      placeholder={t("composer.placeholder")}
                      attachLabel={t("composer.attachFiles")}
                      removeAttachmentLabel={(name) => t("composer.removeAttachment", { name })}
                      sendLabel={t("composer.sendMessage")}
                      stopLabel={t("composer.stopGeneration")}
                      modelControl={<ModelMenu {...props.modelMenu} />}
                      onFocus={props.onClearSubmissionError}
                      onAttachmentError={props.onAttachmentError}
                    />
                  )}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
        {props.onboarding.ready && !props.collapsed && props.panelView === "chat" && props.panelWindow.panelRef.current && (
          <Joyride
            steps={props.onboarding.steps}
            run
            continuous
            scrollToFirstStep={false}
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
              if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) props.onboarding.complete();
            }}
          />
        )}
        <ErrorToast message={props.toastError} />
      </AssistantWindowShell>
      <AnimatePresence initial={false} onExitComplete={props.problemBank.restoreAfterClose}>
        {props.problemBankOpen && !props.collapsed && props.panelView === "chat" ? (
          <MotionPaper
            key="problem-bank-sidecar"
            className="problem-bank-sidecar"
            elevation={6}
            initial={props.reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={props.reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.985 }}
            transition={{ duration: props.reduceMotion ? 0.08 : 0.2, ease: [0.22, 1, 0.36, 1] }}
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
            <ProblemBankSidecar onClose={props.problemBank.close} onUseProblem={props.problemBank.useProblem} />
          </MotionPaper>
        ) : null}
      </AnimatePresence>
    </>
  );
}
