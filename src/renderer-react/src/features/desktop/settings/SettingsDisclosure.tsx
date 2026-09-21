import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export function SettingsDisclosure(props: { open: boolean; children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {props.open ? (
        <motion.div
          className={props.className ?? "settings-disclosure"}
          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {props.children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
