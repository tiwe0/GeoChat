import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  fusionPanelFromWindowState,
  windowStateFromFusionPanel,
  type FusionPanelId,
} from "../fusion-mode";

type FusionPanelInput = {
  mode: "fusion" | "window";
  reduceMotion: boolean;
  panelView: "chat" | "user";
  conversationDrawerOpen: boolean;
  blackboardOpen: boolean;
  problemBankOpen: boolean;
  onLoadHistory: () => void;
  onLoadBlackboard: () => void;
  onOpenProblemBank: () => void;
  onApplyWindowState: (state: ReturnType<typeof windowStateFromFusionPanel>) => void;
  onModeChanged: () => void;
};

export function useAssistantFusionPanel(input: FusionPanelInput) {
  const [activePanel, setActivePanel] = useState<FusionPanelId | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const focusRestoreTimerRef = useRef<number | null>(null);
  const previousModeRef = useRef(input.mode);

  const cancelFocusRestore = useCallback(() => {
    if (focusRestoreTimerRef.current === null) return;
    globalThis.clearTimeout(focusRestoreTimerRef.current);
    focusRestoreTimerRef.current = null;
  }, []);

  const restoreTrigger = useCallback(() => {
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }, []);

  const close = useCallback((options: { restoreFocus?: boolean } = {}) => {
    setActivePanel(null);
    if (options.restoreFocus === false) {
      cancelFocusRestore();
      triggerRef.current = null;
      return;
    }
    cancelFocusRestore();
    focusRestoreTimerRef.current = globalThis.setTimeout(() => {
      focusRestoreTimerRef.current = null;
      restoreTrigger();
    }, input.reduceMotion ? 0 : 400);
  }, [cancelFocusRestore, input.reduceMotion, restoreTrigger]);

  const toggle = useCallback((panel: FusionPanelId, trigger: HTMLButtonElement, beforeOpen?: () => void) => {
    if (activePanel === panel) {
      close();
      return;
    }
    cancelFocusRestore();
    triggerRef.current = trigger;
    beforeOpen?.();
    setActivePanel(panel);
  }, [activePanel, cancelFocusRestore, close]);

  useEffect(() => () => cancelFocusRestore(), [cancelFocusRestore]);

  useEffect(() => {
    if (input.mode !== "fusion" || !activePanel) return;
    const focusFrame = globalThis.requestAnimationFrame(() => {
      const panel = document.querySelector<HTMLElement>(`[data-fusion-panel="${activePanel}"]`);
      const target = panel?.querySelector<HTMLElement>(
        "[data-fusion-panel-close], button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      target?.focus({ preventScroll: true });
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="menu"], [role="listbox"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    globalThis.addEventListener("keydown", closeOnEscape, { capture: true });
    return () => {
      globalThis.cancelAnimationFrame(focusFrame);
      globalThis.removeEventListener("keydown", closeOnEscape, { capture: true });
    };
  }, [activePanel, close, input.mode]);

  useLayoutEffect(() => {
    const previousMode = previousModeRef.current;
    if (previousMode === input.mode) return;
    previousModeRef.current = input.mode;
    cancelFocusRestore();
    triggerRef.current = null;
    input.onModeChanged();

    if (input.mode === "fusion") {
      const nextPanel = fusionPanelFromWindowState({
        panelView: input.panelView,
        conversationDrawerOpen: input.conversationDrawerOpen,
        blackboardOpen: input.blackboardOpen,
        problemBankOpen: input.problemBankOpen,
      });
      setActivePanel(nextPanel);
      if (nextPanel === "history") input.onLoadHistory();
      if (nextPanel === "blackboard") input.onLoadBlackboard();
      return;
    }

    const returningPanel = activePanel;
    setActivePanel(null);
    if (returningPanel === "problem-bank") input.onOpenProblemBank();
  }, [input.mode]);

  useLayoutEffect(() => {
    if (input.mode !== "fusion") return;
    input.onApplyWindowState(windowStateFromFusionPanel(activePanel));
  }, [activePanel, input.mode]);

  return { activePanel, close, toggle };
}
