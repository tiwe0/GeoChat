import { Box, Typography } from "@mui/material";
import { useAuiState } from "@assistant-ui/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { deriveFusionBubbles, isFusionRenderableMessage } from "./bubbles";
import { FusionBubbleStack } from "./FusionBubbleStack";
import { FusionComposer } from "./FusionComposer";
import { FusionToolbar } from "./FusionToolbar";
import type { FusionChatMessage, FusionChatStatus } from "./types";
import type { FusionModeController } from "./useFusionModeController";
import {
  clampFusionPoint,
  FUSION_BUBBLE_COMPOSER_GAP,
  FUSION_COMPOSER_HEIGHT,
  FUSION_COMPOSER_WIDTH,
  fusionAttachedBubbleLayout,
  type FusionPoint,
  type FusionSurfaceSize,
} from "./geometry";
import {
  fusionSelectionObjectNamesForSubmit,
  type GeoGebraSelectionContext,
  type GeoGebraSelectionRefreshReason,
} from "./selection-context";
import { fusionPanelSafeInsets, layoutFusionSpatialTurns } from "./spatialLayout";
import { fusionTurnDisplayAnchor, fusionTurnVisualOpacity, selectVisibleFusionTurns } from "./spatialTurns";
import { deriveFusionRunAnnouncement } from "./announcements";
import "./fusion-mode.css";

export function FusionModeSurface(props: {
  controller: FusionModeController;
  messages: readonly FusionChatMessage[];
  status: FusionChatStatus;
  error?: string | null;
  canvasReady: boolean;
  modelLabel: string;
  modelControl?: ReactNode;
  selectionContext: GeoGebraSelectionContext;
  activePanel?: "transcript" | "history" | "blackboard" | "problem-bank" | "settings" | null;
  languageControl?: ReactNode;
  onRefreshSelection?: (reason: GeoGebraSelectionRefreshReason) => GeoGebraSelectionContext | undefined;
  onPrepareSubmit?: (selectionObjectNames: readonly string[]) => void;
  onAttachmentError?: (message: string) => void;
  canRetry?: boolean;
  onRetry?: () => Promise<boolean>;
  onOpenHistory: (trigger: HTMLButtonElement) => void;
  onOpenTranscript: (trigger: HTMLButtonElement) => void;
  onNewConversation: () => void;
  onOpenBlackboard: (trigger: HTMLButtonElement) => void;
  onOpenProblemBank: (trigger: HTMLButtonElement) => void;
  onOpenSettings: (trigger: HTMLButtonElement) => void;
  onSwitchToWindow: (origin: FusionPoint) => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const runtimeMessages = useAuiState((state) => state.thread.messages);
  const runtimeRunning = useAuiState((state) => state.thread.isRunning);
  const busy = runtimeRunning;
  const [turnSizes, setTurnSizes] = useState<Record<string, FusionSurfaceSize>>({});
  const [composerSize, setComposerSize] = useState<FusionSurfaceSize>({
    width: FUSION_COMPOSER_WIDTH,
    height: FUSION_COMPOSER_HEIGHT,
  });
  const [announcement, setAnnouncement] = useState("");
  const previousStatusRef = useRef(props.status);
  const announcementBaselineRef = useRef<readonly string[]>(props.messages.map((message) => message.id));
  const synchronizeTurns = props.controller.synchronizeTurns;
  useEffect(() => {
    synchronizeTurns(
      props.messages
        .filter(isFusionRenderableMessage)
        .map(({ id, role }) => ({ id, role })),
      props.status,
    );
  }, [synchronizeTurns, props.messages, props.status]);
  const safeInsets = useMemo(
    () => fusionPanelSafeInsets(props.controller.viewport, Boolean(props.activePanel)),
    [props.activePanel, props.controller.viewport],
  );
  const visibleTurns = selectVisibleFusionTurns(props.controller.turns);
  const activeTurn = props.controller.turns.find((turn) => turn.id === props.controller.activeTurnId);
  const composerPoint = useMemo(() => clampFusionPoint(
    props.controller.composerPoint,
    props.controller.viewport,
    composerSize,
    safeInsets,
  ), [composerSize, props.controller.composerPoint, props.controller.viewport, safeInsets]);
  const activeBubbleLayout = useMemo(
    () => fusionAttachedBubbleLayout(composerPoint, props.controller.viewport, safeInsets, composerSize),
    [composerPoint, composerSize, props.controller.viewport, safeInsets],
  );
  const activeBubbleSize = activeBubbleLayout.size;
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = props.status;
    if ((props.status === "submitted" || props.status === "streaming")
      && previousStatus !== "submitted" && previousStatus !== "streaming") {
      announcementBaselineRef.current = props.messages.map((message) => message.id);
    }
    const next = deriveFusionRunAnnouncement({
      previousStatus,
      status: props.status,
      messages: props.messages,
      activeMessageIds: activeTurn?.messageIds ?? [],
      baselineMessageIds: announcementBaselineRef.current,
      error: props.error,
    });
    if (next) setAnnouncement(next);
  }, [activeTurn?.messageIds, props.error, props.messages, props.status]);
  const turnLayouts = useMemo(() => new Map(layoutFusionSpatialTurns(
    visibleTurns.map((turn) => ({
      id: turn.id,
      anchor: fusionTurnDisplayAnchor(turn, props.controller.activeTurnId, composerPoint),
      collapsed: turn.collapsed,
      pinned: turn.pinned,
      // The turn attached to the composer must win collision resolution even
      // after streaming has finished. Otherwise an older pinned card can push
      // the latest conversation away when the composer is dragged.
      active: turn.id === props.controller.activeTurnId,
      createdAt: turn.createdAt,
      // Streaming content changes height on nearly every token. Reserve the
      // final viewport footprint instead of feeding every ResizeObserver tick
      // back into collision resolution, which visibly shakes the whole stack.
      size: turn.status === "active" ? activeBubbleSize : turnSizes[turn.id],
      belowOffset: turn.id === props.controller.activeTurnId
        ? composerSize.height + FUSION_BUBBLE_COMPOSER_GAP
        : undefined,
    })),
    props.controller.viewport,
    safeInsets,
  ).map((layout) => [layout.id, layout])), [activeBubbleSize, composerPoint, composerSize.height, props.controller.activeTurnId, props.controller.viewport, safeInsets, turnSizes, visibleTurns]);
  const recordTurnSize = useCallback((turnId: string, size: FusionSurfaceSize) => {
    setTurnSizes((current) => {
      const previous = current[turnId];
      if (previous && Math.abs(previous.width - size.width) < 1 && Math.abs(previous.height - size.height) < 1) return current;
      return { ...current, [turnId]: size };
    });
  }, []);

  const prepareSubmit = () => {
    if (busy) return;
    const refreshedSelection = props.onRefreshSelection?.("submit");
    props.onPrepareSubmit?.(
      fusionSelectionObjectNamesForSubmit(props.selectionContext, refreshedSelection),
    );
  };

  return (
    <motion.div
      className="fusion-mode-surface"
      data-interaction-mode="fusion"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.992, filter: "blur(3px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: "fixed", inset: 0, zIndex: 1300, pointerEvents: "none", transformOrigin: "center" }}
    >
      <Box
        component="span"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        sx={{
          position: "absolute",
          width: 1,
          height: 1,
          p: 0,
          m: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {announcement}
      </Box>
      <FusionToolbar
        summonLabel={t("fusion.summon")}
        positionLabel={t("fusion.choosePosition")}
        windowLabel={t("fusion.switchToWindow")}
        historyLabel={t("history.open")}
        transcriptLabel={t("fusion.transcript")}
        newConversationLabel={t("history.newConversation")}
        blackboardLabel={t("blackboard.open")}
        problemBankLabel={t("problemBank.open")}
        settingsLabel={t("panel.openSettings")}
        activePanel={props.activePanel}
        disabled={busy}
        languageControl={props.languageControl}
        onSummon={() => props.controller.summonAt()}
        onPosition={props.controller.beginPositioning}
        onOpenHistory={props.onOpenHistory}
        onOpenTranscript={props.onOpenTranscript}
        onNewConversation={props.onNewConversation}
        onOpenBlackboard={props.onOpenBlackboard}
        onOpenProblemBank={props.onOpenProblemBank}
        onOpenSettings={props.onOpenSettings}
        onSwitchToWindow={props.onSwitchToWindow}
      />

      <AnimatePresence>
        {props.controller.positioning && (
          <motion.div
            key="fusion-position-picker"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.14 }}
            onPointerDown={(event) => {
              event.preventDefault();
              props.controller.pickPosition({ x: event.clientX, y: event.clientY });
            }}
            onContextMenu={(event) => { event.preventDefault(); props.controller.cancelPositioning(); }}
            style={{
              position: "fixed",
              inset: 0,
              cursor: "crosshair",
              pointerEvents: "auto",
              background: "rgba(48, 76, 140, 0.035)",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                position: "fixed",
                top: 64,
                left: "50%",
                transform: "translateX(-50%)",
                px: 1.5,
                py: 0.75,
                borderRadius: 999,
                color: "text.secondary",
                bgcolor: "background.paper",
                border: 1,
                borderColor: "divider",
                boxShadow: 2,
              }}
            >
              {t("fusion.positioningHint")}
            </Typography>
          </motion.div>
        )}
      </AnimatePresence>

      {visibleTurns.map((turn, turnIndex) => {
        const layout = turnLayouts.get(turn.id);
        const displayAnchor = fusionTurnDisplayAnchor(turn, props.controller.activeTurnId, composerPoint);
        const turnChatStatus: FusionChatStatus = turn.status === "active"
          ? props.status === "submitted" ? "submitted" : "streaming"
          : turn.status === "error" ? "error" : "ready";
        const bubbles = deriveFusionBubbles({
          runtimeMessages,
          sourceMessageIds: turn.messageIds,
          active: turn.status === "active" && runtimeRunning,
          status: turnChatStatus,
          error: turn.status === "error" ? props.error : null,
          labels: {
            thinking: t("fusion.thinking"),
            connecting: t("fusion.connecting"),
            attachment: t("fusion.attachmentMessage"),
          },
        });
        return (
          <FusionBubbleStack
            key={turn.id}
            anchor={layout?.anchor ?? displayAnchor}
            placement={layout?.placement ?? props.controller.bubblePlacement}
            bubbles={bubbles}
            turnStatus={turn.status}
            collapsed={turn.collapsed}
            pinned={turn.pinned}
            selectionLabel={turn.selectionObjectNames.length
              ? t("fusion.selectedObjects", { objects: turn.selectionObjectNames.join(", ") })
              : undefined}
            collapseLabel={t("fusion.collapseTurn")}
            expandLabel={t("fusion.expandTurn")}
            pinLabel={t("fusion.pinTurn")}
            unpinLabel={t("fusion.unpinTurn")}
            dismissLabel={t("fusion.dismissTurn")}
            continueLabel={t("fusion.continueTurn")}
            retryLabel={t("fusion.retryTurn")}
            collapsedSummaryLabel={t("fusion.collapsedTurn")}
            returnToLatestLabel={t("fusion.returnToLatest")}
            onToggleCollapsed={() => props.controller.toggleTurnCollapsed(turn.id)}
            onTogglePinned={() => props.controller.toggleTurnPinned(turn.id)}
            onDismiss={() => props.controller.dismissTurn(turn.id)}
            onContinue={() => props.controller.continueAtTurn(turn.id)}
            onRetry={turn.status === "error" && turn.id === props.controller.activeTurnId && props.canRetry && props.onRetry
              ? () => {
                props.controller.retryTurn(turn.id);
                void props.onRetry?.().then((accepted) => {
                  if (!accepted) props.controller.failTurn(turn.id);
                }).catch(() => props.controller.failTurn(turn.id));
              }
              : undefined}
            onSizeChange={turn.status === "active" ? undefined : (size) => recordTurnSize(turn.id, size)}
            visualOpacity={fusionTurnVisualOpacity(turnIndex, visibleTurns.length, turn.status === "active")}
            visualOrder={turnIndex}
            maxHeight={turn.id === props.controller.activeTurnId && !turn.collapsed
              ? activeBubbleSize.height
              : undefined}
            composerHeight={turn.id === props.controller.activeTurnId ? composerSize.height : undefined}
          />
        );
      })}

      <AnimatePresence>
        {props.controller.visible && !props.controller.positioning && (
          <FusionComposer
            key="fusion-composer"
            x={composerPoint.x}
            y={composerPoint.y}
            disabled={!props.canvasReady}
            canvasConnected={props.canvasReady}
            canvasConnectedLabel={t("canvasStatus.canvas.ready")}
            modelLabel={props.modelLabel}
            focusSignal={props.controller.summonVersion}
            modelControl={props.modelControl}
            selectionLabel={props.selectionContext.status === "known"
              ? t("fusion.selectedObjects", { objects: props.selectionContext.objectNames.join(", ") })
              : undefined}
            placeholder={t("fusion.placeholder")}
            attachLabel={t("composer.attachFiles")}
            removeAttachmentLabel={(name) => t("composer.removeAttachment", { name })}
            sendLabel={t("composer.sendMessage")}
            stopLabel={t("composer.stopGeneration")}
            dragLabel={t("fusion.dragComposer")}
            onFocus={() => props.onRefreshSelection?.("focus")}
            onSubmit={prepareSubmit}
            onAttachmentError={props.onAttachmentError}
            onDragStart={props.controller.startDragging}
            onDragMove={props.controller.moveDragging}
            onDragStop={props.controller.stopDragging}
            onSizeChange={setComposerSize}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
