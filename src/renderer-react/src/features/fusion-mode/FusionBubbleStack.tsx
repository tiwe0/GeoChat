import { ArrowDownIcon, ChevronDownIcon, ChevronUpIcon, PinIcon, PinOffIcon, ReplyIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { Box, CircularProgress, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type WheelEvent } from "react";
import { useFusionCardScroll } from "./useFusionCardScroll";
import { GeoChatDisplayToolById, GeoChatMessageById } from "../assistant-ui";
import type { FusionBubble } from "./types";
import {
  FUSION_BUBBLE_ABOVE_OFFSET,
  FUSION_BUBBLE_CARD_MAX_HEIGHT,
  FUSION_BUBBLE_COMPOSER_GAP,
  FUSION_BUBBLE_MAX_HEIGHT,
  FUSION_BUBBLE_Z_INDEX_BASE,
  FUSION_COMPOSER_HEIGHT,
  type FusionPlacement,
  type FusionPoint,
} from "./geometry";
import type { FusionTurnStatus } from "./spatialTurns";
import {
  advanceBubbleWindowGesture,
  deferBubbleWindowCommitForMeasurement,
  interpolateBubbleWindowLayout,
  routeBubbleWheel,
  selectBubbleIdsForHeight,
  shiftBubbleIdsForHeight,
  type BubbleWindowGesture,
} from "./bubbleHeightWindow";

const MotionPaper = motion.create(Paper);
const SHELL_VERTICAL_PADDING = 36;
const ESTIMATED_BUBBLE_HEIGHT = 132;
const FUSION_BUBBLE_GAP = 6;
const EMPTY_WINDOW_GESTURE: BubbleWindowGesture = {
  offset: 0,
  direction: null,
  progress: 0,
  commitEndIndex: null,
};

function sameIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function FusionBubbleStack(props: {
  anchor: FusionPoint;
  placement: FusionPlacement;
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
  returnToLatestLabel?: string;
  onToggleCollapsed?: () => void;
  onTogglePinned?: () => void;
  onDismiss?: () => void;
  onContinue?: () => void;
  onRetry?: () => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
  visualOpacity?: number;
  visualOrder?: number;
  maxHeight?: number;
  composerHeight?: number;
}) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const previousTurnStatusRef = useRef<FusionTurnStatus | undefined>(undefined);
  const historyGestureRef = useRef<BubbleWindowGesture>(EMPTY_WINDOW_GESTURE);
  const historyCommitFramesRef = useRef<{ first: number | null; second: number | null }>({ first: null, second: null });
  const [chromeHeight, setChromeHeight] = useState(0);
  const [bubbleHeights, setBubbleHeights] = useState<Record<string, number>>({});
  const [historyWindowIds, setHistoryWindowIds] = useState<readonly string[] | null>(null);
  const [historyGesture, setHistoryGesture] = useState<BubbleWindowGesture>(EMPTY_WINDOW_GESTURE);
  const active = props.turnStatus === "active";
  const maxStackHeight = props.maxHeight ?? FUSION_BUBBLE_MAX_HEIGHT;
  const availableCardHeight = Math.max(
    1,
    maxStackHeight
      - SHELL_VERTICAL_PADDING
      - chromeHeight
      - (chromeHeight > 0 ? FUSION_BUBBLE_GAP : 0),
  );
  const bubbleHeightLimit = Math.max(
    1,
    Math.min(FUSION_BUBBLE_CARD_MAX_HEIGHT, availableCardHeight),
  );
  const allBubbleIds = props.bubbles.map((bubble) => bubble.id);
  const bubbleHeightFor = (id: string) => Math.min(
    bubbleHeightLimit,
    bubbleHeights[id] ?? ESTIMATED_BUBBLE_HEIGHT,
  );
  const latestBubbleIds = selectBubbleIdsForHeight({
    ids: allBubbleIds,
    maxHeight: availableCardHeight,
    gap: FUSION_BUBBLE_GAP,
    heightFor: bubbleHeightFor,
  });
  const historyIds = historyWindowIds?.filter((id) => allBubbleIds.includes(id)) ?? [];
  const visibleBubbleIds = historyIds.length > 0 ? [...historyIds] : latestBubbleIds;
  while (visibleBubbleIds.length > 1) {
    const occupied = visibleBubbleIds.reduce((height, id, index) => (
      height + bubbleHeightFor(id) + (index === 0 ? 0 : FUSION_BUBBLE_GAP)
    ), 0);
    if (occupied <= availableCardHeight) break;
    visibleBubbleIds.shift();
  }
  const visibleBubbleIdSet = new Set(visibleBubbleIds);
  const visibleBubbles = props.bubbles.filter((bubble) => visibleBubbleIdSet.has(bubble.id));
  const firstVisibleIndex = visibleBubbleIds.length > 0
    ? allBubbleIds.indexOf(visibleBubbleIds[0]!)
    : allBubbleIds.length - 1;
  const windowEndIndex = visibleBubbleIds.length > 0
    ? allBubbleIds.indexOf(visibleBubbleIds.at(-1)!)
    : allBubbleIds.length - 1;
  const latest = visibleBubbles.at(-1);
  const previewBubble = [...visibleBubbles].reverse().find((bubble) => bubble.content.trim().length > 0);
  const collapsibleBubbleId = [...visibleBubbles].reverse().find((bubble) => bubble.role !== "user")?.id;
  const scrollOwnerBubbleId = [...visibleBubbles].reverse().find((bubble) => (
    bubble.role === "assistant" || bubble.role === "status"
  ))?.id;
  const followBubbleId = [...props.bubbles].reverse().find((bubble) => (
    bubble.role === "assistant" || bubble.role === "status" || bubble.role === "error"
  ))?.id;
  const fusionCardScroll = useFusionCardScroll({
    active: !props.collapsed,
    targetKey: followBubbleId,
    viewportKey: scrollOwnerBubbleId,
  });
  const historyBrowsing = !sameIds(visibleBubbleIds, latestBubbleIds) || fusionCardScroll.mode === "browse";
  const gestureTargetIds = historyGesture.direction
    ? shiftBubbleIdsForHeight({
      ids: allBubbleIds,
      currentIds: visibleBubbleIds,
      direction: historyGesture.direction,
      maxHeight: availableCardHeight,
      gap: FUSION_BUBBLE_GAP,
      heightFor: bubbleHeightFor,
    })
    : visibleBubbleIds;
  const windowLayout = interpolateBubbleWindowLayout({
    currentIds: visibleBubbleIds,
    targetIds: gestureTargetIds,
    placement: props.placement,
    direction: historyGesture.direction ?? "older",
    progress: historyGesture.progress,
    gap: FUSION_BUBBLE_GAP,
    heightFor: bubbleHeightFor,
  });
  const bubbleById = new Map(props.bubbles.map((bubble) => [bubble.id, bubble]));
  const renderItems = windowLayout.items.flatMap((layout) => {
    const bubble = bubbleById.get(layout.id);
    return bubble ? [{ bubble, layout }] : [];
  });
  const visibleBubbleKey = windowLayout.items.map((item) => item.id).join("\u0000");

  const attachViewport = useCallback((node: HTMLDivElement | null) => {
    fusionCardScroll.viewportRef.current = node;
  }, [fusionCardScroll.viewportRef]);

  const handleHistoryWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || props.collapsed || event.deltaY === 0 || allBubbleIds.length === 0) return;
    const flow = event.currentTarget;
    const path = event.nativeEvent.composedPath();
    for (const node of path) {
      if (node === flow) break;
      if (!(node instanceof HTMLElement)) continue;
      const candidate = node;
      if (candidate.scrollHeight > candidate.clientHeight + 1) {
        const route = routeBubbleWheel({
          deltaY: event.deltaY,
          scrollTop: candidate.scrollTop,
          scrollHeight: candidate.scrollHeight,
          clientHeight: candidate.clientHeight,
        });
        if (route === "inner") return;
      }
    }

    const frames = historyCommitFramesRef.current;
    if (frames.first !== null || frames.second !== null) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const prospectiveOffset = historyGestureRef.current.offset + event.deltaY;
    const prospectiveDirection = prospectiveOffset < 0
      ? "older"
      : prospectiveOffset > 0 ? "newer" : null;
    if (!prospectiveDirection) return;
    const enteringIndex = prospectiveDirection === "older"
      ? firstVisibleIndex - 1
      : windowEndIndex + 1;
    const edgeId = allBubbleIds[enteringIndex];
    const edgeMeasured = !edgeId || bubbleHeights[edgeId] !== undefined;
    const threshold = Math.max(72, Math.min(
      bubbleHeightLimit,
      edgeId ? bubbleHeights[edgeId] ?? bubbleHeightLimit : ESTIMATED_BUBBLE_HEIGHT,
    ));
    const nextGesture = deferBubbleWindowCommitForMeasurement({
      gesture: advanceBubbleWindowGesture({
        offset: historyGestureRef.current.offset,
        wheelDelta: event.deltaY,
        threshold,
        currentEndIndex: windowEndIndex,
        firstVisibleIndex,
        lastIndex: allBubbleIds.length - 1,
      }),
      measured: edgeMeasured,
      threshold,
    });
    if (nextGesture.progress === 0 && historyGestureRef.current.progress === 0) return;
    event.preventDefault();
    event.stopPropagation();
    historyGestureRef.current = nextGesture;
    setHistoryGesture(nextGesture);
    if (nextGesture.direction === "older") fusionCardScroll.pauseFollowing();
    if (nextGesture.commitEndIndex === null || !nextGesture.direction) return;

    const nextWindowIds = shiftBubbleIdsForHeight({
      ids: allBubbleIds,
      currentIds: visibleBubbleIds,
      direction: nextGesture.direction,
      maxHeight: availableCardHeight,
      gap: FUSION_BUBBLE_GAP,
      heightFor: bubbleHeightFor,
    });
    if (sameIds(nextWindowIds, visibleBubbleIds)) return;
    frames.first = requestAnimationFrame(() => {
      frames.first = null;
      frames.second = requestAnimationFrame(() => {
        frames.second = null;
        setHistoryWindowIds(sameIds(nextWindowIds, latestBubbleIds) ? null : nextWindowIds);
        historyGestureRef.current = EMPTY_WINDOW_GESTURE;
        setHistoryGesture(EMPTY_WINDOW_GESTURE);
      });
    });
  }, [allBubbleIds, availableCardHeight, bubbleHeightLimit, bubbleHeights, firstVisibleIndex, latestBubbleIds, fusionCardScroll.pauseFollowing, props.collapsed, visibleBubbleIds, windowEndIndex]);

  const returnToLatest = useCallback(() => {
    const frames = historyCommitFramesRef.current;
    if (frames.first !== null) cancelAnimationFrame(frames.first);
    if (frames.second !== null) cancelAnimationFrame(frames.second);
    frames.first = null;
    frames.second = null;
    historyGestureRef.current = EMPTY_WINDOW_GESTURE;
    setHistoryGesture(EMPTY_WINDOW_GESTURE);
    setHistoryWindowIds(null);
    fusionCardScroll.followLatest();
  }, [fusionCardScroll.followLatest]);

  useEffect(() => () => {
    const frames = historyCommitFramesRef.current;
    if (frames.first !== null) cancelAnimationFrame(frames.first);
    if (frames.second !== null) cancelAnimationFrame(frames.second);
  }, []);

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
    const chrome = chromeRef.current;
    if (!chrome) return;
    const report = () => setChromeHeight((current) => {
      const next = Math.ceil(chrome.getBoundingClientRect().height);
      return current === next ? current : next;
    });
    report();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(report);
    observer?.observe(chrome);
    return () => observer?.disconnect();
  }, [active, props.collapsed, props.selectionLabel]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cards = [...root.querySelectorAll<HTMLElement>("[data-fusion-bubble-id]")];
    const report = (measuredCards: readonly HTMLElement[]) => {
      setBubbleHeights((current) => {
        let next = current;
        for (const card of measuredCards) {
          const id = card.dataset.fusionBubbleId;
          if (!id) continue;
          // offsetHeight is layout-space height; getBoundingClientRect would
          // include the scroll-linked scale transform and feed animation back
          // into the height window.
          const height = Math.ceil(card.offsetHeight);
          if (height <= 0 || current[id] === height) continue;
          if (next === current) next = { ...current };
          next[id] = height;
        }
        return next;
      });
    };
    report(cards);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => report(entries.map((entry) => entry.target as HTMLElement)));
    cards.forEach((card) => observer?.observe(card));
    return () => observer?.disconnect();
  }, [bubbleHeightLimit, visibleBubbleKey]);

  useLayoutEffect(() => {
    if (props.collapsed || fusionCardScroll.mode !== "follow") return;
    fusionCardScroll.scrollToLatest();
  }, [fusionCardScroll.mode, fusionCardScroll.scrollToLatest, props.bubbles, props.collapsed]);

  useLayoutEffect(() => {
    const previousStatus = previousTurnStatusRef.current;
    previousTurnStatusRef.current = props.turnStatus;
    if (previousStatus === props.turnStatus || props.turnStatus !== "active") return;
    const frames = historyCommitFramesRef.current;
    if (frames.first !== null) cancelAnimationFrame(frames.first);
    if (frames.second !== null) cancelAnimationFrame(frames.second);
    frames.first = null;
    frames.second = null;
    setHistoryWindowIds(null);
    historyGestureRef.current = EMPTY_WINDOW_GESTURE;
    setHistoryGesture(EMPTY_WINDOW_GESTURE);
    fusionCardScroll.followLatest();
  }, [fusionCardScroll.followLatest, props.turnStatus]);

  if (props.bubbles.length === 0) return null;

  return (
    <Stack
      ref={rootRef}
      sx={{
        position: "fixed",
        left: props.anchor.x,
        top: props.anchor.y,
        width: "min(430px, calc(100vw - 8px))",
        boxSizing: "border-box",
        transform: props.placement === "above"
          ? `translate(-50%, calc(-100% - ${Math.abs(FUSION_BUBBLE_ABOVE_OFFSET)}px))`
          : `translate(-50%, ${(props.composerHeight ?? FUSION_COMPOSER_HEIGHT) + FUSION_BUBBLE_COMPOSER_GAP}px)`,
        alignItems: "stretch",
        pointerEvents: "auto",
        zIndex: FUSION_BUBBLE_Z_INDEX_BASE + (props.visualOrder ?? 0),
        opacity: props.visualOpacity ?? 1,
        overflow: "visible",
        px: 2.5,
        pt: 1.5,
        pb: 3,
        transition: reduceMotion ? "none" : "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        "&:hover, &:focus-within": { opacity: 1 },
      }}
    >
      <Stack ref={chromeRef} spacing={0.25} sx={{ alignItems: "stretch" }}>
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
        {historyBrowsing && !props.collapsed && (
          <Tooltip title={props.returnToLatestLabel} arrow>
            <IconButton
              size="small"
              color="primary"
              onClick={returnToLatest}
              aria-label={props.returnToLatestLabel}
              sx={{ alignSelf: "flex-end", bgcolor: "rgba(255,255,255,.84)", boxShadow: 1 }}
            >
              <ArrowDownIcon size={17} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {props.collapsed && latest ? (
        <MotionPaper
          layout
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          elevation={2}
          sx={{ mt: 0.75, alignSelf: "flex-end", maxWidth: 320, px: 1.25, py: 0.5, border: 1, borderColor: "divider", borderRadius: 999, bgcolor: "background.paper", pointerEvents: "auto" }}
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
        <Box
          data-fusion-bubble-flow="true"
          onWheelCapture={handleHistoryWheel}
          sx={{
            position: "relative",
            mt: chromeHeight > 0 ? 0.75 : 0,
            height: windowLayout.height,
            overflow: "visible",
          }}
        >
          {renderItems.map(({ bubble, layout }) => {
            const managedScroll = !layout.entering && bubble.id === scrollOwnerBubbleId;
            const outlined = bubble.role === "error" || bubble.role === "display-card";
            return (
              <MotionPaper
                  data-fusion-bubble-id={bubble.id}
                  data-fusion-display-card={bubble.role === "display-card" ? true : undefined}
                  key={bubble.id}
                  initial={reduceMotion || historyGesture.direction ? false : {
                    opacity: 0,
                    y: layout.y + (props.placement === "above" ? 10 : -10),
                    scale: 0.975,
                  }}
                  animate={{ y: layout.y, opacity: layout.opacity, scale: layout.scale }}
                  transition={{
                    duration: reduceMotion || historyGesture.direction ? 0 : 0.2,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  elevation={bubble.role === "user" ? 2 : bubble.role === "display-card" ? 5 : 4}
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: bubble.role === "user" ? "auto" : 0,
                    right: 0,
                    width: bubble.role === "user" ? "fit-content" : "auto",
                    zIndex: layout.entering ? 2 : undefined,
                    pointerEvents: layout.entering || layout.exiting ? "none" : "auto",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    boxSizing: "border-box",
                    maxHeight: bubbleHeightLimit,
                    maxWidth: bubble.role === "user" ? "86%" : "100%",
                    px: 1.5,
                    pr: bubble.id === collapsibleBubbleId && props.onToggleCollapsed ? 5 : undefined,
                    py: 1.125,
                    border: outlined ? 1 : 0,
                    borderColor: bubble.role === "error" ? "error.main" : "divider",
                    borderRadius: bubble.role === "display-card"
                      ? 2
                      : bubble.role === "user"
                        ? "18px 18px 6px 18px"
                        : "18px 18px 18px 6px",
                    bgcolor: bubble.role === "user" ? "primary.main" : "background.paper",
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
                    data-fusion-bubble-scroll="true"
                    ref={managedScroll ? attachViewport : undefined}
                    data-scroll-mode={managedScroll ? fusionCardScroll.mode : undefined}
                    tabIndex={0}
                    onScroll={managedScroll ? fusionCardScroll.handleScroll : undefined}
                    onWheelCapture={managedScroll ? fusionCardScroll.handleWheel : undefined}
                    onTouchStartCapture={managedScroll ? fusionCardScroll.handleTouchStart : undefined}
                    onTouchMoveCapture={managedScroll ? fusionCardScroll.handleTouchMove : undefined}
                    onKeyDown={managedScroll ? fusionCardScroll.handleKeyDown : undefined}
                    sx={{
                      minHeight: 0,
                      flex: 1,
                      overflowY: "auto",
                      overscrollBehavior: "contain",
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
                    <Box ref={managedScroll ? fusionCardScroll.contentRef : undefined}>
                      {bubble.role === "display-card" && bubble.messageId !== undefined && bubble.partIndex !== undefined ? (
                        <GeoChatDisplayToolById
                          messageId={bubble.messageId}
                          partIndex={bubble.partIndex}
                        />
                      ) : bubble.messageId ? (
                        <GeoChatMessageById
                          messageId={bubble.messageId}
                          surface="spatial"
                          showDisplayTools={false}
                          className="geochat-assistant-message geochat-assistant-message--spatial"
                          contentClassName="geochat-assistant-message__content"
                        />
                      ) : bubble.role === "status" ? (
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          {bubble.pending && <CircularProgress size={14} />}
                          <Typography variant="caption" color="text.secondary">{bubble.content}</Typography>
                        </Stack>
                      ) : (
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{bubble.content}</Typography>
                      )}
                    </Box>
                  </Box>
              </MotionPaper>
            );
          })}
        </Box>
      )}
    </Stack>
  );
}
