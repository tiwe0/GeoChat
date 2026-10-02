import { alpha, Box, Stack } from "@mui/material";
import { useAuiState } from "@assistant-ui/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FLOATING_SURFACE_ELEVATION } from "../../theme";
import { deriveFusionBubbles, isFusionRenderableMessage } from "./bubbles";
import { FusionBubbleStack } from "./FusionBubbleStack";
import { FusionComposer } from "./FusionComposer";
import { FusionToolbar } from "./FusionToolbar";
import type { FusionChatMessage, FusionChatStatus } from "./types";
import type { FusionModeController } from "./useFusionModeController";
import { clampFusionPoint, fusionConversationLayout, FUSION_BUBBLE_Z_INDEX_BASE, FUSION_COMPOSER_HEIGHT, FUSION_COMPOSER_WIDTH, FUSION_VIEWPORT_GUTTER, type FusionPoint, type FusionSurfaceSize } from "./geometry";
import {
  fusionSelectionObjectNamesForSubmit,
  type GeoGebraSelectionContext,
  type GeoGebraSelectionRefreshReason,
} from "./selection-context";
import { selectVisibleFusionTurns } from "./spatialTurns";
import { deriveFusionRunAnnouncement } from "./announcements";
import { fusionPanelComposerInsets } from "./panelLayout";
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
  const [composerSize, setComposerSize] = useState<FusionSurfaceSize>({
    width: FUSION_COMPOSER_WIDTH,
    height: FUSION_COMPOSER_HEIGHT,
  });
  const measureComposer = props.controller.measureComposer;
  const reportComposerSize = useCallback((size: FusionSurfaceSize) => {
    setComposerSize(size);
    measureComposer(size);
  }, [measureComposer]);
  const composerInsets = useMemo(() => props.activePanel
    ? fusionPanelComposerInsets(props.controller.viewport, composerSize)
    : {}, [props.activePanel, props.controller.viewport, composerSize]);
  const conversationLayout = fusionConversationLayout(props.controller.viewport, composerSize, props.controller.visible, composerInsets);
  const composerPoint = useMemo(() => clampFusionPoint(
    props.controller.composerPoint,
    props.controller.viewport,
    composerSize,
    composerInsets,
  ), [composerSize, props.controller.composerPoint, props.controller.viewport, composerInsets]);
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
  const visibleTurns = selectVisibleFusionTurns(props.controller.turns);
  const activeTurn = props.controller.turns.find((turn) => turn.id === props.controller.activeTurnId);
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
        onOpenHistory={props.onOpenHistory}
        onOpenTranscript={props.onOpenTranscript}
        onNewConversation={props.onNewConversation}
        onOpenBlackboard={props.onOpenBlackboard}
        onOpenProblemBank={props.onOpenProblemBank}
        onOpenSettings={props.onOpenSettings}
        onSwitchToWindow={props.onSwitchToWindow}
      />

      {visibleTurns.length > 0 && (
        <Stack
          data-fusion-conversation="true"
          role="region"
          aria-label={t("panel.conversationMessages")}
          sx={(theme) => ({
            position: "fixed",
            left: FUSION_VIEWPORT_GUTTER,
            bottom: conversationLayout.bottom,
            width: conversationLayout.width,
            height: visibleTurns.some((turn) => !turn.collapsed) ? conversationLayout.maxHeight : "auto",
            maxHeight: conversationLayout.maxHeight,
            boxSizing: "border-box",
            minHeight: 0,
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            border: 1,
            borderColor: "divider",
            bgcolor: alpha(theme.palette.background.paper, 0.96),
            boxShadow: FLOATING_SURFACE_ELEVATION,
            pointerEvents: "auto",
            zIndex: FUSION_BUBBLE_Z_INDEX_BASE,
          })}
        >
          {visibleTurns.map((turn) => {
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
              />
            );
          })}
        </Stack>
      )}

      <AnimatePresence>
        {props.controller.visible && (
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
            onSizeChange={reportComposerSize}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
