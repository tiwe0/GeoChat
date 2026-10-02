import { ClipboardCheckIcon, LibraryBigIcon, ListIcon, MessageSquarePlusIcon, MessagesSquareIcon, MinusIcon, SettingsIcon } from "lucide-react";
import { Box, IconButton, Paper, Stack, Tooltip } from "@mui/material";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { FLOATING_SURFACE_ELEVATION } from "../../theme";
import { GeoGebraToolButtons } from "../geogebra/GeoGebraToolButtons";
import { InteractionModeButton } from "./InteractionModeButton";
import type { FusionPoint } from "./geometry";
import { FUSION_TOOLBAR_HEIGHT_PROPERTY } from "./panelLayout";

export function FusionToolbar(props: {
  windowLabel: string;
  historyLabel: string;
  transcriptLabel: string;
  newConversationLabel: string;
  blackboardLabel: string;
  problemBankLabel: string;
  settingsLabel: string;
  activePanel?: "transcript" | "history" | "blackboard" | "problem-bank" | "settings" | null;
  disabled?: boolean;
  languageControl?: ReactNode;
  onOpenHistory: (trigger: HTMLButtonElement) => void;
  onOpenTranscript: (trigger: HTMLButtonElement) => void;
  onNewConversation: () => void;
  onOpenBlackboard: (trigger: HTMLButtonElement) => void;
  onOpenProblemBank: (trigger: HTMLButtonElement) => void;
  onOpenSettings: (trigger: HTMLButtonElement) => void;
  onSwitchToWindow: (origin: FusionPoint) => void;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const style = document.documentElement.style;
    // Layout height ignores the fusion surface's transient entrance transform.
    const updateHeight = (entries?: ResizeObserverEntry[]) => {
      const height = entries?.[0]?.borderBoxSize?.[0]?.blockSize ?? toolbar.offsetHeight;
      style.setProperty(FUSION_TOOLBAR_HEIGHT_PROPERTY, `${height}px`);
    };
    updateHeight();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateHeight);
    observer?.observe(toolbar);
    return () => {
      observer?.disconnect();
      style.removeProperty(FUSION_TOOLBAR_HEIGHT_PROPERTY);
    };
  }, []);
  return (
    <Paper
      ref={toolbarRef}
      data-fusion-toolbar
      elevation={FLOATING_SURFACE_ELEVATION}
      sx={{
        position: "fixed",
        top: "50%",
        transform: "translateY(-50%)",
        right: 18,
        maxHeight: "calc(100dvh - 24px)",
        overflowY: "auto",
        overscrollBehavior: "contain",
        zIndex: 1350,
        border: 1,
        borderColor: "divider",
        borderRadius: 999,
        pointerEvents: "auto",
      }}
    >
      <Stack direction="column" spacing={0.25} sx={{ p: 0.375, alignItems: "center" }}>
        <InteractionModeButton mode="fusion" label={props.windowLabel} onToggle={props.onSwitchToWindow} />
        <Tooltip title={props.settingsLabel} placement="left" arrow>
          <IconButton size="small" color={props.activePanel === "settings" ? "primary" : "default"} onClick={(event) => props.onOpenSettings(event.currentTarget)} aria-label={props.settingsLabel} data-copilot-tour="fusion-settings"><SettingsIcon size={18} /></IconButton>
        </Tooltip>
        <span data-copilot-tour="fusion-language" style={{ display: "inline-flex" }}>{props.languageControl}</span>
        <Tooltip title={props.problemBankLabel} placement="left" arrow>
          <IconButton size="small" color={props.activePanel === "problem-bank" ? "primary" : "default"} onClick={(event) => props.onOpenProblemBank(event.currentTarget)} aria-label={props.problemBankLabel} data-copilot-tour="fusion-problem-bank"><LibraryBigIcon size={18} /></IconButton>
        </Tooltip>
        <Tooltip title={props.blackboardLabel} placement="left" arrow>
          <IconButton size="small" color={props.activePanel === "blackboard" ? "primary" : "default"} onClick={(event) => props.onOpenBlackboard(event.currentTarget)} aria-label={props.blackboardLabel} data-copilot-tour="fusion-blackboard"><ClipboardCheckIcon size={18} /></IconButton>
        </Tooltip>
        <Tooltip title={props.transcriptLabel} placement="left" arrow>
          <IconButton size="small" color={props.activePanel === "transcript" ? "primary" : "default"} onClick={(event) => props.onOpenTranscript(event.currentTarget)} aria-label={props.transcriptLabel} data-copilot-tour="fusion-transcript"><ListIcon size={18} /></IconButton>
        </Tooltip>
        <Tooltip title={props.historyLabel} placement="left" arrow>
          <IconButton size="small" color={props.activePanel === "history" ? "primary" : "default"} onClick={(event) => props.onOpenHistory(event.currentTarget)} aria-label={props.historyLabel} data-copilot-tour="fusion-history"><MessagesSquareIcon size={18} /></IconButton>
        </Tooltip>
        <Tooltip title={props.newConversationLabel} placement="left" arrow>
          <span><IconButton size="small" disabled={props.disabled} onClick={props.onNewConversation} aria-label={props.newConversationLabel} data-copilot-tour="fusion-new"><MessageSquarePlusIcon size={18} /></IconButton></span>
        </Tooltip>
        <Box component="span" aria-hidden="true" data-toolbar-section-separator="geogebra" sx={{ width: 24, height: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "text.secondary", pointerEvents: "none" }}>
          <MinusIcon size={24} strokeWidth={1.5} />
        </Box>
        <GeoGebraToolButtons disabled={props.disabled} />
      </Stack>
    </Paper>
  );
}
