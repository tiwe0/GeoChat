import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  FUSION_COMPOSER_HEIGHT,
  FUSION_COMPOSER_WIDTH,
  clampFusionPoint,
  defaultFusionPoint,
  fusionBubblePlacement,
  type FusionPlacement,
  type FusionPoint,
  type FusionViewport,
  type FusionSurfaceSize,
} from "./geometry";
import {
  beginFusionSpatialTurn,
  clampFusionTurnAnchors,
  collapseLatestFusionTurn,
  completeActiveFusionTurn,
  dismissFusionTurn,
  EMPTY_FUSION_SPATIAL_STATE,
  failFusionTurn,
  retryFusionTurn,
  synchronizeFusionSpatialTurns,
  toggleFusionTurnCollapsed,
  toggleFusionTurnPinned,
  type FusionMessageIdentity,
  type FusionSpatialTurn,
} from "./spatialTurns";
import type { FusionChatStatus } from "./types";

function viewport() {
  return { width: globalThis.innerWidth, height: globalThis.innerHeight };
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export type FusionModeController = {
  visible: boolean;
  summonVersion: number;
  composerPoint: FusionPoint;
  turnAnchor: FusionPoint | null;
  turns: readonly FusionSpatialTurn[];
  activeTurnId: string | null;
  bubblePlacement: FusionPlacement;
  viewport: FusionViewport;
  summonAt: (point?: FusionPoint) => void;
  dismissComposer: () => void;
  freezeTurnAnchor: (runId?: string, selectionObjectNames?: readonly string[]) => string;
  clearTurnAnchor: () => void;
  synchronizeTurns: (messages: readonly FusionMessageIdentity[], status: FusionChatStatus) => void;
  toggleTurnCollapsed: (turnId: string) => void;
  toggleTurnPinned: (turnId: string) => void;
  dismissTurn: (turnId: string) => void;
  failTurn: (turnId: string) => void;
  retryTurn: (turnId: string) => void;
  completeActiveTurn: () => void;
  continueAtTurn: (turnId: string) => void;
  resetTurns: () => void;
  measureComposer: (size: FusionSurfaceSize) => void;
  startDragging: (event: ReactPointerEvent<HTMLElement>) => void;
  moveDragging: (event: ReactPointerEvent<HTMLElement>) => void;
  stopDragging: (event: ReactPointerEvent<HTMLElement>) => void;
};

export function useFusionModeController(enabled: boolean): FusionModeController {
  const [visible, setVisible] = useState(true);
  const [summonVersion, setSummonVersion] = useState(0);
  const [viewportSize, setViewportSize] = useState<FusionViewport>(() => viewport());
  const [composerPoint, setComposerPoint] = useState<FusionPoint>(() => defaultFusionPoint(viewport()));
  const [turnAnchor, setTurnAnchor] = useState<FusionPoint | null>(null);
  const [spatialState, setSpatialState] = useState(EMPTY_FUSION_SPATIAL_STATE);
  const latestPointerRef = useRef<FusionPoint | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const composerSizeRef = useRef<FusionSurfaceSize>({ width: FUSION_COMPOSER_WIDTH, height: FUSION_COMPOSER_HEIGHT });
  const automaticPlacementRef = useRef(true);

  const measureComposer = useCallback((size: FusionSurfaceSize) => {
    composerSizeRef.current = size;
    setComposerPoint((point) => automaticPlacementRef.current
      ? defaultFusionPoint(viewport(), size)
      : clampFusionPoint(point, viewport(), size));
  }, []);

  const summonAt = useCallback((point?: FusionPoint) => {
    automaticPlacementRef.current = false;
    setComposerPoint(clampFusionPoint(point ?? latestPointerRef.current ?? defaultFusionPoint(viewport(), composerSizeRef.current), viewport(), composerSizeRef.current));
    setVisible(true);
    setSummonVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const trackPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".frontend-canvas")) return;
      latestPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.defaultPrevented || document.querySelector('[role="menu"], [role="listbox"]')) return;
        if (visible) {
          event.preventDefault();
          setVisible(false);
        } else {
          setSpatialState((state) => collapseLatestFusionTurn(state));
        }
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k" || isEditableTarget(event.target)) return;
      event.preventDefault();
      summonAt();
    };
    globalThis.addEventListener("pointermove", trackPointer, { passive: true });
    globalThis.addEventListener("keydown", handleShortcut);
    return () => {
      globalThis.removeEventListener("pointermove", trackPointer);
      globalThis.removeEventListener("keydown", handleShortcut);
    };
  }, [enabled, summonAt, visible]);

  useEffect(() => {
    if (!enabled) {
      dragRef.current = null;
      return;
    }
    const handleResize = () => {
      setViewportSize(viewport());
      setComposerPoint((point) => automaticPlacementRef.current
        ? defaultFusionPoint(viewport(), composerSizeRef.current)
        : clampFusionPoint(point, viewport(), composerSizeRef.current));
      setTurnAnchor((point) => point ? clampFusionPoint(point, viewport()) : null);
      setSpatialState((state) => clampFusionTurnAnchors(
        state,
        (point) => clampFusionPoint(point, viewport()),
      ));
    };
    handleResize();
    globalThis.addEventListener("resize", handleResize);
    return () => globalThis.removeEventListener("resize", handleResize);
  }, [enabled]);

  const freezeTurnAnchor = useCallback((runId = `fusion-run:${crypto.randomUUID()}`, selectionObjectNames: readonly string[] = []) => {
    setTurnAnchor(composerPoint);
    setSpatialState((state) => beginFusionSpatialTurn(state, { id: runId, anchor: composerPoint, selectionObjectNames }));
    return runId;
  }, [composerPoint]);

  const synchronizeTurns = useCallback((messages: readonly FusionMessageIdentity[], status: FusionChatStatus) => {
    setSpatialState((state) => synchronizeFusionSpatialTurns(state, {
      messages,
      chatStatus: status,
      fallbackAnchor: composerPoint,
    }));
  }, [composerPoint]);

  const startDragging = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    automaticPlacementRef.current = false;
    const bounds = event.currentTarget.closest("[data-fusion-composer]")?.getBoundingClientRect();
    const origin = bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top } : composerPoint;
    setComposerPoint(origin);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - origin.x,
      offsetY: event.clientY - origin.y,
    };
  }, [composerPoint]);

  const moveDragging = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setComposerPoint(clampFusionPoint({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    }, viewport(), composerSizeRef.current));
  }, []);

  const stopDragging = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const continueAtTurn = useCallback((turnId: string) => {
    const turn = spatialState.turns.find((candidate) => candidate.id === turnId && !candidate.dismissed);
    if (!turn || turn.status === "active") return;
    automaticPlacementRef.current = false;
    setComposerPoint(clampFusionPoint(turn.anchor, viewport(), composerSizeRef.current));
    setVisible(true);
    setSummonVersion((version) => version + 1);
  }, [spatialState.turns]);

  return {
    visible,
    summonVersion,
    composerPoint,
    turnAnchor,
    turns: spatialState.turns,
    activeTurnId: spatialState.activeTurnId,
    bubblePlacement: fusionBubblePlacement(turnAnchor ?? composerPoint, viewport()),
    viewport: viewportSize,
    summonAt,
    dismissComposer: () => setVisible(false),
    freezeTurnAnchor,
    clearTurnAnchor: () => setTurnAnchor(null),
    synchronizeTurns,
    toggleTurnCollapsed: (turnId) => setSpatialState((state) => toggleFusionTurnCollapsed(state, turnId)),
    toggleTurnPinned: (turnId) => setSpatialState((state) => toggleFusionTurnPinned(state, turnId)),
    dismissTurn: (turnId) => setSpatialState((state) => dismissFusionTurn(state, turnId)),
    failTurn: (turnId) => setSpatialState((state) => failFusionTurn(state, turnId)),
    retryTurn: (turnId) => setSpatialState((state) => retryFusionTurn(state, turnId)),
    completeActiveTurn: () => setSpatialState((state) => completeActiveFusionTurn(state)),
    continueAtTurn,
    resetTurns: () => {
      setTurnAnchor(null);
      setSpatialState(EMPTY_FUSION_SPATIAL_STATE);
    },
    measureComposer,
    startDragging,
    moveDragging,
    stopDragging,
  };
}
