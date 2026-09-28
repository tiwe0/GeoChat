import { ChevronDownIcon, ChevronUpIcon, PinIcon, PinOffIcon, ReplyIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { Box, ButtonBase, CircularProgress, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { Streamdown } from "streamdown";
import { useMessageScroll } from "../../hooks/useMessageScroll";
import { STREAMDOWN_PLUGINS } from "../chat/streamdownPlugins";
import { StaticMessageMarkdown } from "../chat/StaticMessageMarkdown";
import { useStreamdownTranslations } from "../../i18n/useStreamdownTranslations";
import type { FusionBubble } from "./types";
import {
  FUSION_BUBBLE_ABOVE_OFFSET,
  FUSION_BUBBLE_BELOW_OFFSET,
  FUSION_BUBBLE_Z_INDEX_BASE,
  type FusionPlacement,
  type FusionPoint,
} from "./geometry";
import { FusionAssistantMessage, FusionDisplayToolCard } from "./FusionAssistantMessage";
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
  collapsedSummaryLabel?: string;
  onToggleCollapsed?: () => void;
  onTogglePinned?: () => void;
  onDismiss?: () => void;
  onContinue?: () => void;
  onRetry?: () => void;
  onOpenTranscript?: (trigger: HTMLButtonElement) => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
  visualOpacity?: number;
  visualOrder?: number;
  maxHeight?: number;
}) {
  const reduceMotion = useReducedMotion();
  const translations = useStreamdownTranslations();
  const rootRef = useRef<HTMLDivElement>(null);
  const previousTurnStatusRef = useRef<FusionTurnStatus | undefined>(undefined);
  const messageScroll = useMessageScroll({ active: !props.collapsed });
  const attachViewport = useCallback((node: HTMLDivElement | null) => {
    messageScroll.viewportRef.current = node;
  }, [messageScroll.viewportRef]);
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
  useLayoutEffect(() => {
    if (props.collapsed || messageScroll.mode !== "follow") return;
    messageScroll.scrollToLatest();
  }, [messageScroll.mode, messageScroll.scrollToLatest, props.bubbles, props.collapsed, props.streaming]);
  useLayoutEffect(() => {
    const previousStatus = previousTurnStatusRef.current;
    previousTurnStatusRef.current = props.turnStatus;
    if (previousStatus === props.turnStatus || props.turnStatus !== "active") return;
    messageScroll.followLatest();
  }, [messageScroll.followLatest, props.turnStatus]);
  if (props.bubbles.length === 0) return null;
  const active = props.turnStatus === "active";
  const latest = props.bubbles.at(-1);
  const previewBubble = [...props.bubbles].reverse().find((bubble) => bubble.content.trim().length > 0);
  const collapsibleBubbleId = [...props.bubbles].reverse().find((bubble) => (
    bubble.role !== "user" && bubble.role !== "overflow"
  ))?.id;

  return (
    <Stack
      ref={rootRef}
      sx={{
        position: "fixed",
        left: props.anchor.x,
        top: props.anchor.y,
        // The transparent horizontal padding below leaves a 390px visual
        // surface, matching the composer exactly.
        width: "min(430px, calc(100vw - 8px))",
        height: props.maxHeight,
        maxHeight: props.maxHeight ?? "min(48vh, 420px)",
        boxSizing: "border-box",
        transform: props.placement === "above"
          ? `translate(-50%, calc(-100% - ${Math.abs(FUSION_BUBBLE_ABOVE_OFFSET)}px))`
          : `translate(-50%, ${FUSION_BUBBLE_BELOW_OFFSET}px)`,
        alignItems: "stretch",
        // The outer shell owns the attached viewport height. The inner stack
        // anchors short answers toward the composer and lets each rounded card
        // shrink its body without clipping the card shadow here.
        justifyContent: "flex-start",
        pointerEvents: "auto",
        zIndex: FUSION_BUBBLE_Z_INDEX_BASE + (props.visualOrder ?? 0),
        opacity: props.visualOpacity ?? 1,
        overflow: "visible",
        // Scroll containers clip descendant shadows at their rectangular
        // edges. Keep a full shadow-radius of transparent room on every edge
        // so the rounded cards never end in a sharp vertical/horizontal cut.
        px: 2.5,
        pt: 1.5,
        pb: 3,
        transition: reduceMotion ? "none" : "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        "&:hover, &:focus-within": { opacity: 1 },
      }}
    >
      <Stack
        spacing={0.75}
        sx={{
          minHeight: 0,
          flex: 1,
          alignItems: "stretch",
          justifyContent: props.placement === "above" ? "flex-end" : "flex-start",
          overflow: "visible",
        }}
      >
      {props.selectionLabel && (
        <Typography variant="caption" noWrap sx={{ alignSelf: "flex-end", maxWidth: 280, px: 1, py: 0.35, borderRadius: 999, bgcolor: "rgba(255,255,255,.82)", color: "text.secondary", backdropFilter: "blur(12px)" }}>
          {props.selectionLabel}
        </Typography>
      )}
      {!active && !props.collapsed && (
        <Stack direction="row" spacing={0.25} sx={{ alignSelf: "flex-end", alignItems: "center", pointerEvents: "auto" }}>
          {props.onRetry && (
            <Tooltip title={props.retryLabel} arrow>
              <IconButton size="small" color="primary" onClick={props.onRetry} aria-label={props.retryLabel}>
                <RotateCcwIcon size={18} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={props.continueLabel} arrow>
            <IconButton size="small" onClick={props.onContinue} aria-label={props.continueLabel}>
              <ReplyIcon size={18} />
            </IconButton>
          </Tooltip>
          <Tooltip title={props.pinned ? props.unpinLabel : props.pinLabel} arrow>
            <IconButton size="small" color={props.pinned ? "primary" : "default"} onClick={props.onTogglePinned} aria-label={props.pinned ? props.unpinLabel : props.pinLabel}>
              {props.pinned ? <PinIcon size={18} /> : <PinOffIcon size={18} />}
            </IconButton>
          </Tooltip>
          <Tooltip title={props.dismissLabel} arrow>
            <IconButton size="small" onClick={props.onDismiss} aria-label={props.dismissLabel}>
              <XIcon size={18} />
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
          sx={{ alignSelf: "flex-end", maxWidth: 320, px: 1.25, py: 0.5, border: 1, borderColor: "divider", borderRadius: 999, bgcolor: "background.paper", pointerEvents: "auto" }}
        >
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 244, fontWeight: 650, flex: 1 }}>
              {previewBubble?.content || props.collapsedSummaryLabel}
            </Typography>
            <Tooltip title={props.expandLabel} arrow>
              <IconButton
                size="small"
                onClick={props.onToggleCollapsed}
                aria-label={props.expandLabel}
                aria-expanded={false}
                sx={{ p: 0.35 }}
              >
                <ChevronDownIcon size={16} />
              </IconButton>
            </Tooltip>
          </Stack>
        </MotionPaper>
      ) : (
      <AnimatePresence initial={false} mode="popLayout">
        {props.bubbles.map((bubble) => {
          const managedScroll = bubble.id === collapsibleBubbleId;
          const bodyScrollable = bubble.role !== "overflow";
          const outlined = bubble.role === "error" || bubble.role === "display-card";
          return (
          <MotionPaper
            data-fusion-display-card={bubble.role === "display-card" ? true : undefined}
            layout={!props.streaming}
            key={bubble.id}
            initial={reduceMotion ? false : { opacity: 0, y: props.placement === "above" ? 10 : -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            elevation={bubble.role === "user" ? 2 : bubble.role === "display-card" ? 5 : 4}
            sx={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              flexShrink: bodyScrollable ? 1 : 0,
              maxHeight: bodyScrollable ? "100%" : undefined,
              alignSelf: bubble.role === "user" ? "flex-end" : bubble.role === "overflow" ? "center" : "stretch",
              maxWidth: bubble.role === "user" ? "86%" : bubble.role === "overflow" ? "78%" : "100%",
              px: bubble.role === "overflow" ? 0 : 1.5,
              pr: bubble.id === collapsibleBubbleId && props.onToggleCollapsed ? 5 : undefined,
              py: bubble.role === "overflow" ? 0 : 1.125,
              border: outlined ? 1 : 0,
              borderColor: bubble.role === "error" ? "error.main" : "divider",
              borderRadius: bubble.role === "overflow"
                ? 999
                : bubble.role === "display-card"
                  ? 2
                  : bubble.role === "user"
                    ? "18px 18px 6px 18px"
                    : "18px 18px 18px 6px",
              bgcolor: bubble.role === "user" ? "primary.main" : bubble.role === "overflow" ? "rgba(255,255,255,.82)" : "background.paper",
              color: bubble.role === "user" ? "primary.contrastText" : bubble.role === "error" ? "error.main" : "text.primary",
              overflow: "hidden",
              overflowWrap: "anywhere",
              backdropFilter: "blur(18px)",
            }}
          >
            {bubble.id === collapsibleBubbleId && props.onToggleCollapsed && (
              <Tooltip title={props.collapseLabel} arrow>
                <IconButton
                  size="small"
                  onClick={props.onToggleCollapsed}
                  aria-label={props.collapseLabel}
                  aria-expanded={true}
                  sx={{ position: "absolute", top: 4, right: 4, zIndex: 1, p: 0.35, color: "text.secondary" }}
                >
                  <ChevronUpIcon size={16} />
                </IconButton>
              </Tooltip>
            )}
            <Box
              ref={managedScroll ? attachViewport : undefined}
              data-scroll-mode={managedScroll ? messageScroll.mode : undefined}
              tabIndex={managedScroll ? 0 : undefined}
              onScroll={managedScroll ? messageScroll.handleScroll : undefined}
              onWheelCapture={managedScroll ? messageScroll.handleWheel : undefined}
              onTouchStartCapture={managedScroll ? messageScroll.handleTouchStart : undefined}
              onTouchMoveCapture={managedScroll ? messageScroll.handleTouchMove : undefined}
              onKeyDown={managedScroll ? messageScroll.handleKeyDown : undefined}
              sx={{
                minHeight: 0,
                flex: bodyScrollable ? 1 : undefined,
                overflowY: bodyScrollable ? "auto" : "visible",
                overscrollBehavior: bodyScrollable ? "contain" : undefined,
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                outline: "none",
                "&::-webkit-scrollbar": { display: "none" },
                "&:focus-visible": managedScroll ? {
                  outline: "2px solid",
                  outlineColor: "primary.main",
                  outlineOffset: -2,
                  borderRadius: 1,
                } : undefined,
              }}
            >
              <Box ref={managedScroll ? messageScroll.contentRef : undefined}>
                {bubble.role === "display-card" && bubble.displayPart ? (
                  <FusionDisplayToolCard part={bubble.displayPart} />
                ) : bubble.role === "overflow" ? (
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
                ) : bubble.role === "user" ? (
                  <StaticMessageMarkdown className="user-message-markdown">
                    {bubble.content}
                  </StaticMessageMarkdown>
                ) : (
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{bubble.content}</Typography>
                )}
              </Box>
            </Box>
          </MotionPaper>
          );
        })}
      </AnimatePresence>
      )}
      </Stack>
    </Stack>
  );
}
