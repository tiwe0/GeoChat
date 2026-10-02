import type { MessageState } from "@assistant-ui/react";
import { Box, CircularProgress, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { ChevronDownIcon, ChevronUpIcon, PinIcon, PinOffIcon, ReplyIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { GeoChatMessage, GeoChatThread } from "../assistant-ui";
import type { FusionBubble } from "./types";
import type { FusionTurnStatus } from "./spatialTurns";

export function FusionBubbleStack(props: {
  bubbles: readonly FusionBubble[];
  turnStatus?: FusionTurnStatus;
  collapsed?: boolean;
  pinned?: boolean;
  selectionLabel?: string;
  collapseLabel?: string;
  expandLabel?: string;
  pinLabel?: string;
  unpinLabel?: string;
  dismissLabel?: string;
  continueLabel?: string;
  retryLabel?: string;
  collapsedSummaryLabel?: string;
  onToggleCollapsed?: () => void;
  onTogglePinned?: () => void;
  onDismiss?: () => void;
  onContinue?: () => void;
  onRetry?: () => void;
}) {
  const active = props.turnStatus === "active";
  const latest = props.bubbles.at(-1);
  const preview = [...props.bubbles].reverse().find((bubble) => bubble.content.trim());
  const fallback = props.bubbles.find((bubble) => bubble.role === "status" || bubble.role === "error");
  // The projection resolves assistant-ui's merged runtime IDs for each spatial turn.
  const messageIds = new Set(props.bubbles.flatMap((bubble) => bubble.messageId ? [bubble.messageId] : []));

  if (props.bubbles.length === 0) return null;

  const renderMessage = (message: MessageState) => messageIds.has(message.id) ? (
    <GeoChatMessage
      role={message.role}
      surface="spatial"
      className={`geochat-assistant-message geochat-assistant-message--${message.role}`}
      contentClassName="geochat-assistant-message__content"
    />
  ) : null;

  return (
    <Stack
      sx={{
        position: "relative",
        flex: props.collapsed ? "0 0 auto" : "1 1 0",
        minHeight: 0,
        minWidth: 0,
        width: "100%",
        boxSizing: "border-box",
        alignItems: "stretch",
        pointerEvents: "auto",
        overflow: "visible",
      }}
    >
      <Stack spacing={1} sx={{ alignItems: "stretch", flexShrink: 0 }}>
        {props.selectionLabel && (
          <Typography variant="caption" noWrap sx={{ alignSelf: "flex-end", maxWidth: 280, px: 1, py: 0.35, borderRadius: 999, bgcolor: "rgba(255,255,255,.82)", color: "text.secondary", backdropFilter: "blur(12px)" }}>
            {props.selectionLabel}
          </Typography>
        )}
        {!active && !props.collapsed && (
          <Stack direction="row" spacing={1} sx={{ alignSelf: "flex-end", alignItems: "center", pointerEvents: "auto" }}>
            {props.onRetry && <Tooltip title={props.retryLabel} arrow><IconButton size="small" color="primary" onClick={props.onRetry} aria-label={props.retryLabel}><RotateCcwIcon size={18} /></IconButton></Tooltip>}
            <Tooltip title={props.continueLabel} arrow><IconButton size="small" onClick={props.onContinue} aria-label={props.continueLabel}><ReplyIcon size={18} /></IconButton></Tooltip>
            <Tooltip title={props.pinned ? props.unpinLabel : props.pinLabel} arrow><IconButton size="small" color={props.pinned ? "primary" : "default"} onClick={props.onTogglePinned} aria-label={props.pinned ? props.unpinLabel : props.pinLabel}>{props.pinned ? <PinIcon size={18} /> : <PinOffIcon size={18} />}</IconButton></Tooltip>
            <Tooltip title={props.dismissLabel} arrow><IconButton size="small" onClick={props.onDismiss} aria-label={props.dismissLabel}><XIcon size={18} /></IconButton></Tooltip>
          </Stack>
        )}
      </Stack>
      {props.collapsed && latest ? (
        <Paper elevation={0} sx={{ mt: 1, alignSelf: "flex-end", maxWidth: "100%", px: 1.5, py: 0.5, border: 1, borderColor: "divider", borderRadius: 999, bgcolor: "background.paper", pointerEvents: "auto" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 244, fontWeight: 650, flex: 1 }}>{preview?.content || props.collapsedSummaryLabel}</Typography>
            <Tooltip title={props.expandLabel} arrow><IconButton size="small" onClick={props.onToggleCollapsed} aria-label={props.expandLabel} aria-expanded={false} sx={{ p: 0.35 }}><ChevronDownIcon size={16} /></IconButton></Tooltip>
          </Stack>
        </Paper>
      ) : (
        <Box data-fusion-message-queue="true" onWheelCapture={(event) => event.stopPropagation()} sx={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, mt: 1, minHeight: 0 }}>
          {props.onToggleCollapsed && <Tooltip title={props.collapseLabel} arrow><IconButton size="small" onClick={props.onToggleCollapsed} aria-label={props.collapseLabel} aria-expanded={true} sx={{ position: "absolute", top: 4, right: 4, zIndex: 1, p: 0.35, color: "text.secondary" }}><ChevronUpIcon size={16} /></IconButton></Tooltip>}
          <GeoChatThread
            surface="spatial"
            classNames={{
              root: "geochat-assistant-thread geochat-assistant-thread--fusion",
              viewport: "geochat-assistant-thread__viewport",
            }}
            renderMessage={renderMessage}
          >
            {fallback && (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 1.5, py: 1 }}>
                {fallback.pending && <CircularProgress size={14} />}
                <Typography variant="body2" color={fallback.role === "error" ? "error" : "text.secondary"}>{fallback.content}</Typography>
              </Stack>
            )}
          </GeoChatThread>
        </Box>
      )}
    </Stack>
  );
}
