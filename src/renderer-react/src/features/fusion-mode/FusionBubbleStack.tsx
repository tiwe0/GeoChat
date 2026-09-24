import CloseRounded from "@mui/icons-material/CloseRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import PushPinOutlined from "@mui/icons-material/PushPinOutlined";
import PushPinRounded from "@mui/icons-material/PushPinRounded";
import ReplyRounded from "@mui/icons-material/ReplyRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import { Box, ButtonBase, CircularProgress, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { Streamdown } from "streamdown";
import { STREAMDOWN_PLUGINS } from "../chat/streamdownPlugins";
import { useStreamdownTranslations } from "../../i18n/useStreamdownTranslations";
import type { FusionBubble } from "./types";
import type { FusionPlacement, FusionPoint } from "./geometry";
import { FusionAssistantMessage } from "./FusionAssistantMessage";
import type { FusionTurnStatus } from "./spatialTurns";

const MotionPaper = motion.create(Paper);

export function FusionBubbleStack(props: {
  anchor: FusionPoint;
  placement: FusionPlacement;
  bubbles: readonly FusionBubble[];
  streaming: boolean;
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
  onToggleCollapsed?: () => void;
  onTogglePinned?: () => void;
  onDismiss?: () => void;
  onContinue?: () => void;
  onRetry?: () => void;
  onOpenTranscript?: (trigger: HTMLButtonElement) => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
  connectedToComposer?: boolean;
  visualOpacity?: number;
  visualOrder?: number;
}) {
  const reduceMotion = useReducedMotion();
  const translations = useStreamdownTranslations();
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !props.onSizeChange) return;
    const report = () => {
      const bounds = root.getBoundingClientRect();
      props.onSizeChange?.({ width: bounds.width, height: bounds.height });
    };
    report();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(report);
    observer?.observe(root);
    return () => observer?.disconnect();
  }, [props.onSizeChange]);
  if (props.bubbles.length === 0) return null;
  const active = props.turnStatus === "active";
  const latest = props.bubbles.at(-1);

  return (
    <Stack
      ref={rootRef}
      spacing={0.75}
      sx={{
        position: "fixed",
        left: props.anchor.x,
        top: props.anchor.y,
        // The transparent horizontal padding below leaves a 390px visual
        // surface, matching the composer exactly.
        width: "min(430px, calc(100vw - 8px))",
        maxHeight: "min(48vh, 420px)",
        transform: props.placement === "above"
          ? "translate(-50%, calc(-100% + 16px))"
          : "translate(-50%, 68px)",
        alignItems: "stretch",
        justifyContent: props.placement === "above" ? "flex-end" : "flex-start",
        pointerEvents: "auto",
        zIndex: 1320 + (props.visualOrder ?? 0),
        opacity: props.visualOpacity ?? 1,
        overflowY: "auto",
        overscrollBehavior: "contain",
        scrollbarWidth: "thin",
        scrollbarGutter: "stable",
        // Scroll containers clip descendant shadows at their rectangular
        // edges. Keep a full shadow-radius of transparent room on every edge
        // so the rounded cards never end in a sharp vertical/horizontal cut.
        px: 2.5,
        pt: 1.5,
        pb: 3,
        scrollPaddingBlock: "12px 24px",
        transition: reduceMotion ? "none" : "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        "&:hover, &:focus-within": { opacity: 1 },
        ...(props.connectedToComposer ? {
          "&::after": {
            content: "''",
            position: "absolute",
            left: "50%",
            width: 34,
            height: 16,
            transform: "translateX(-50%)",
            borderRadius: 999,
            bgcolor: "rgba(255,255,255,0.9)",
            borderLeft: 1,
            borderRight: 1,
            borderColor: "divider",
            boxShadow: "0 8px 18px rgba(31,42,68,0.08)",
            backdropFilter: "blur(18px)",
            pointerEvents: "none",
            zIndex: 0,
            ...(props.placement === "above" ? { bottom: 12 } : { top: 2 }),
          },
        } : {}),
      }}
    >
      {props.selectionLabel && (
        <Typography variant="caption" noWrap sx={{ alignSelf: "flex-end", maxWidth: 280, px: 1, py: 0.35, borderRadius: 999, bgcolor: "rgba(255,255,255,.82)", color: "text.secondary", backdropFilter: "blur(12px)" }}>
          {props.selectionLabel}
        </Typography>
      )}
      {!active && (
        <Stack direction="row" spacing={0.25} sx={{ alignSelf: "flex-end", alignItems: "center", pointerEvents: "auto" }}>
          {props.onRetry && (
            <Tooltip title={props.retryLabel} arrow>
              <IconButton size="small" color="primary" onClick={props.onRetry} aria-label={props.retryLabel}>
                <ReplayRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={props.continueLabel} arrow>
            <IconButton size="small" onClick={props.onContinue} aria-label={props.continueLabel}>
              <ReplyRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={props.collapsed ? props.expandLabel : props.collapseLabel} arrow>
            <IconButton size="small" onClick={props.onToggleCollapsed} aria-label={props.collapsed ? props.expandLabel : props.collapseLabel}>
              {props.collapsed ? <ExpandMoreRounded fontSize="small" /> : <ExpandLessRounded fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={props.pinned ? props.unpinLabel : props.pinLabel} arrow>
            <IconButton size="small" color={props.pinned ? "primary" : "default"} onClick={props.onTogglePinned} aria-label={props.pinned ? props.unpinLabel : props.pinLabel}>
              {props.pinned ? <PushPinRounded fontSize="small" /> : <PushPinOutlined fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={props.dismissLabel} arrow>
            <IconButton size="small" onClick={props.onDismiss} aria-label={props.dismissLabel}>
              <CloseRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
      {props.collapsed && latest ? (
        <MotionPaper
          layout
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          elevation={2}
          onClick={props.onToggleCollapsed}
          sx={{ alignSelf: "flex-end", maxWidth: 300, px: 1.25, py: 0.75, border: 1, borderColor: "divider", borderRadius: 999, bgcolor: "background.paper", cursor: "pointer", pointerEvents: "auto" }}
        >
          <Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 260, fontWeight: 650 }}>
            {latest.content}
          </Typography>
        </MotionPaper>
      ) : (
      <AnimatePresence initial={false} mode="popLayout">
        {props.bubbles.map((bubble) => (
          <MotionPaper
            layout
            key={bubble.id}
            initial={reduceMotion ? false : { opacity: 0, y: props.placement === "above" ? 10 : -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            elevation={bubble.role === "user" ? 2 : 4}
            sx={{
              alignSelf: bubble.role === "user" ? "flex-end" : bubble.role === "overflow" ? "center" : "stretch",
              maxWidth: bubble.role === "user" ? "86%" : bubble.role === "overflow" ? "78%" : "100%",
              px: bubble.role === "overflow" ? 0 : 1.5,
              py: bubble.role === "overflow" ? 0 : 1.125,
              border: 1,
              borderColor: bubble.role === "error" ? "error.main" : "divider",
              borderRadius: bubble.role === "overflow" ? 999 : bubble.role === "user" ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
              bgcolor: bubble.role === "user" ? "primary.main" : bubble.role === "overflow" ? "rgba(255,255,255,.82)" : "background.paper",
              color: bubble.role === "user" ? "primary.contrastText" : bubble.role === "error" ? "error.main" : "text.primary",
              overflowWrap: "anywhere",
              backdropFilter: "blur(18px)",
            }}
          >
            {bubble.role === "overflow" ? (
              <ButtonBase
                component="button"
                type="button"
                onClick={(event) => props.onOpenTranscript?.(event.currentTarget)}
                sx={{ width: "100%", minHeight: 30, px: 1.5, borderRadius: 999 }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  {bubble.content}
                </Typography>
              </ButtonBase>
            ) : bubble.role === "status" && bubble.message ? (
              <FusionAssistantMessage message={bubble.message} active={active && bubble.pending === true} />
            ) : bubble.role === "status" ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {bubble.pending && <CircularProgress size={14} />}
                <Typography variant="caption" color="text.secondary">{bubble.content}</Typography>
              </Stack>
            ) : bubble.role === "assistant" && bubble.message ? (
              <FusionAssistantMessage message={bubble.message} active={props.streaming} />
            ) : bubble.role === "assistant" ? (
              <Box className="fusion-mode-markdown"><Streamdown animated={false} isAnimating={props.streaming} caret="block" plugins={STREAMDOWN_PLUGINS} translations={translations}>{bubble.content}</Streamdown></Box>
            ) : (
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                {bubble.content}
              </Typography>
            )}
          </MotionPaper>
        ))}
      </AnimatePresence>
      )}
    </Stack>
  );
}
