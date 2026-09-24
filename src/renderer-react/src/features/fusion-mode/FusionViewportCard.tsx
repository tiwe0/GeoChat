import CloseRounded from "@mui/icons-material/CloseRounded";
import { Box, IconButton, Paper, Stack, Typography } from "@mui/material";
import FocusTrap from "@mui/material/Unstable_TrapFocus";
import { motion, useReducedMotion } from "motion/react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

const MotionPaper = motion.create(Paper);
const isViewportFocusTrapEnabled = () => !document.querySelector('[role="menu"], [role="listbox"]');
const VIEWPORT_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function keepViewportTabFocusInside(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(VIEWPORT_FOCUSABLE_SELECTOR))
    .filter((element) => element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!first || !last || !target) return;
  if (event.shiftKey && target === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && target === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

export function FusionViewportCard(props: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  panelId: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <FocusTrap open disableRestoreFocus isEnabled={isViewportFocusTrapEnabled}>
      <MotionPaper
        role="dialog"
        tabIndex={-1}
        data-fusion-panel={props.panelId}
        aria-modal="false"
        aria-label={props.title}
        elevation={8}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.985 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.985 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        sx={{
          position: "fixed",
          top: 104,
          right: 18,
          bottom: 18,
          zIndex: 1340,
          width: props.wide ? "min(760px, calc(100vw - 36px))" : "min(420px, calc(100vw - 36px))",
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          border: 1,
          borderColor: "divider",
          borderRadius: 2.5,
          bgcolor: "background.paper",
          pointerEvents: "auto",
          "@media (max-width: 760px)": {
            top: "auto",
            left: 12,
            right: 12,
            bottom: 12,
            width: "auto",
            height: "min(78vh, 720px)",
          },
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            props.onClose();
            return;
          }
          keepViewportTabFocusInside(event);
        }}
      >
        <Stack direction="row" sx={{ minHeight: 52, px: 1.5, alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 800 }}>{props.title}</Typography>
          <IconButton data-fusion-panel-close size="small" onClick={() => props.onClose()} aria-label={props.closeLabel} title={props.closeLabel}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </Stack>
        <Box sx={{ minHeight: 0, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {props.children}
        </Box>
      </MotionPaper>
    </FocusTrap>
  );
}
