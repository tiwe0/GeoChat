import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { InteractionModeTransitionState } from "./useInteractionModeTransition";

export function InteractionModeTransition(props: {
  transition: InteractionModeTransitionState | null;
}) {
  const reduceMotion = useReducedMotion();
  const transition = props.transition;
  const maxRadius = transition
    ? Math.hypot(
      Math.max(transition.origin.x, globalThis.innerWidth - transition.origin.x),
      Math.max(transition.origin.y, globalThis.innerHeight - transition.origin.y),
    )
    : 0;

  return (
    <AnimatePresence>
      {transition && (
        <motion.div
          key={transition.id}
          data-interaction-mode-transition={transition.to}
          aria-hidden
          initial={{
            clipPath: `circle(0px at ${transition.origin.x}px ${transition.origin.y}px)`,
            opacity: 0.96,
          }}
          animate={{
            clipPath: `circle(${maxRadius}px at ${transition.origin.x}px ${transition.origin.y}px)`,
            opacity: [0.96, 1, 0],
          }}
          exit={{ opacity: 0 }}
          transition={{
            clipPath: { duration: reduceMotion ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] },
            opacity: { duration: reduceMotion ? 0 : 0.9, times: [0, 0.88, 1] },
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2400,
            pointerEvents: "none",
            background: transition.to === "fusion"
              ? "linear-gradient(145deg, rgba(238, 242, 255, .98), rgba(246, 243, 255, .98))"
              : "linear-gradient(145deg, rgba(249, 251, 253, .98), rgba(242, 246, 251, .98))",
          }}
        />
      )}
    </AnimatePresence>
  );
}
