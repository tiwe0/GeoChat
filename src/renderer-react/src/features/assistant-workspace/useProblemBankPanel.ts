import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { preloadProblemBankSidecar } from "../../components/ProblemBankSidecar";
import { resolvePanelWindowHost } from "../panel-window/usePanelWindow";

export const PROBLEM_BANK_SIDECAR_WIDTH = 380;
export const PROBLEM_BANK_SIDECAR_GAP = 12;
const PANEL_VIEWPORT_GUTTER = 8;

type ProblemBankPanelInput = {
  panelRef: RefObject<HTMLElement | null>;
  reduceMotion: boolean;
  moveDragging: (event: ReactPointerEvent<HTMLElement>) => void;
  prepareOpen: () => void;
  onRestoreComposerFocus: () => void;
};

export function useProblemBankPanel(input: ProblemBankPanelInput) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restorePositionRef = useRef<{ left: number; top: number } | null>(null);
  const restoreComposerFocusRef = useRef(false);

  useEffect(() => {
    const warm = () => { void preloadProblemBankSidecar(); };
    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(warm, { timeout: 1_500 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(warm, 900);
    return () => window.clearTimeout(timer);
  }, []);

  const openPanel = useCallback(() => {
    input.prepareOpen();
    const panel = input.panelRef.current;
    const host = panel ? resolvePanelWindowHost(panel) : null;
    if (panel && host && window.innerWidth > 980) {
      const bounds = panel.getBoundingClientRect();
      const targetLeft = Math.max(
        PANEL_VIEWPORT_GUTTER,
        Math.min(
          bounds.left,
          window.innerWidth
            - bounds.width
            - PROBLEM_BANK_SIDECAR_GAP
            - PROBLEM_BANK_SIDECAR_WIDTH
            - PANEL_VIEWPORT_GUTTER,
        ),
      );
      if (targetLeft < bounds.left) {
        restorePositionRef.current = { left: bounds.left, top: bounds.top };
        host.style.inset = "auto";
        host.style.right = "auto";
        host.style.left = `${bounds.left}px`;
        host.style.top = `${bounds.top}px`;
        host.style.transition = input.reduceMotion
          ? "none"
          : "left 220ms cubic-bezier(0.22, 1, 0.36, 1)";
        window.requestAnimationFrame(() => { host.style.left = `${targetLeft}px`; });
      }
    }
    setOpen(true);
  }, [input]);

  const closePanel = useCallback(() => { setOpen(false); }, []);

  const closeForComposer = useCallback(() => {
    restoreComposerFocusRef.current = true;
    closePanel();
  }, [closePanel]);

  const movePanel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const isActiveDrag = event.currentTarget.hasPointerCapture(event.pointerId);
    input.moveDragging(event);
    if (!open || !isActiveDrag) return;
    restorePositionRef.current = null;
    if (window.innerWidth <= 980) return;
    const panel = input.panelRef.current;
    const host = panel ? resolvePanelWindowHost(panel) : null;
    if (!panel || !host) return;
    const panelBounds = panel.getBoundingClientRect();
    const maxLeft = Math.max(
      PANEL_VIEWPORT_GUTTER,
      window.innerWidth
        - panelBounds.width
        - PROBLEM_BANK_SIDECAR_GAP
        - PROBLEM_BANK_SIDECAR_WIDTH
        - PANEL_VIEWPORT_GUTTER,
    );
    if (panelBounds.left > maxLeft) host.style.left = `${maxLeft}px`;
  }, [input, open]);

  const restoreAfterClose = useCallback(() => {
    if (open) return;
    const restoreComposerFocus = () => {
      if (!restoreComposerFocusRef.current) return false;
      restoreComposerFocusRef.current = false;
      input.onRestoreComposerFocus();
      return true;
    };
    const restore = restorePositionRef.current;
    const panel = input.panelRef.current;
    const host = panel ? resolvePanelWindowHost(panel) : null;
    if (!restore || !host) {
      if (!restoreComposerFocus()) triggerRef.current?.focus({ preventScroll: true });
      return;
    }
    host.style.transition = input.reduceMotion
      ? "none"
      : "left 220ms cubic-bezier(0.22, 1, 0.36, 1)";
    host.style.left = `${restore.left}px`;
    host.style.top = `${restore.top}px`;
    restorePositionRef.current = null;
    window.setTimeout(() => {
      if (host.style.transition.includes("left 220ms")) host.style.transition = "";
    }, 240);
    if (!restoreComposerFocus()) triggerRef.current?.focus({ preventScroll: true });
  }, [input, open]);

  return {
    closeForComposer,
    closePanel,
    movePanel,
    open,
    openPanel,
    preload: preloadProblemBankSidecar,
    restoreAfterClose,
    setOpen,
    triggerRef,
  };
}
