import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useReducedMotion } from "motion/react";
import type { InteractionMode } from "../../../../shared/desktop/workbench-types";
import type { FusionPoint } from "./geometry";

export type InteractionModeTransitionState = {
  id: number;
  from: InteractionMode;
  to: InteractionMode;
  origin: FusionPoint;
};

type NativeViewTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => NativeViewTransition;
};

const FALLBACK_TRANSITION_DURATION = 900;

function revealRadius(origin: FusionPoint) {
  return Math.hypot(
    Math.max(origin.x, globalThis.innerWidth - origin.x),
    Math.max(origin.y, globalThis.innerHeight - origin.y),
  );
}

export function useInteractionModeTransition(input: {
  mode: InteractionMode;
  setMode: (mode: InteractionMode) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [transition, setTransition] = useState<InteractionModeTransitionState | null>(null);
  const activeRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof globalThis.setTimeout>[]>([]);
  const sequenceRef = useRef(0);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => globalThis.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const runFallback = useCallback((next: InteractionModeTransitionState) => {
    setTransition(next);
    const switchTimer = globalThis.setTimeout(() => input.setMode(next.to), 150);
    const finishTimer = globalThis.setTimeout(() => {
      activeRef.current = false;
      setTransition(null);
    }, FALLBACK_TRANSITION_DURATION);
    timersRef.current = [switchTimer, finishTimer];
  }, [input.setMode]);

  const requestMode = useCallback((to: InteractionMode, requestedOrigin?: FusionPoint) => {
    if (to === input.mode || activeRef.current) return;
    clearTimers();
    activeRef.current = true;
    const origin = requestedOrigin ?? { x: globalThis.innerWidth / 2, y: globalThis.innerHeight / 2 };
    const next = { id: ++sequenceRef.current, from: input.mode, to, origin };

    if (reduceMotion) {
      input.setMode(to);
      activeRef.current = false;
      return;
    }

    const transitionDocument = document as ViewTransitionDocument;
    if (!transitionDocument.startViewTransition) {
      runFallback(next);
      return;
    }

    void (async () => {
      const root = document.documentElement;
      try {
        root.style.setProperty("--interaction-transition-x", `${origin.x}px`);
        root.style.setProperty("--interaction-transition-y", `${origin.y}px`);
        root.style.setProperty("--interaction-transition-radius", `${revealRadius(origin)}px`);
        root.classList.add("interaction-mode-view-transition");
        const viewTransition = transitionDocument.startViewTransition!(() => {
          flushSync(() => input.setMode(to));
        });
        await viewTransition.finished;
      } catch (error) {
        console.error("[ERROR] Interaction mode view transition failed", error);
        input.setMode(to);
      } finally {
        root.classList.remove("interaction-mode-view-transition");
        root.style.removeProperty("--interaction-transition-x");
        root.style.removeProperty("--interaction-transition-y");
        root.style.removeProperty("--interaction-transition-radius");
        activeRef.current = false;
      }
    })();
  }, [clearTimers, input.mode, input.setMode, reduceMotion, runFallback]);

  return { transition, requestMode };
}
