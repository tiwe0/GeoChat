import { XIcon } from "lucide-react";
import { Box, IconButton, Paper, Stack, Typography } from "@mui/material";
import FocusTrap from "@mui/material/Unstable_TrapFocus";
import { motion, useIsPresent, useReducedMotion } from "motion/react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { FLOATING_SURFACE_ELEVATION } from "../../theme";
import { FUSION_PANEL_FRAME_SX } from "./panelLayout";

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
  hideHeader?: boolean;
  panelId: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const isPresent = useIsPresent();
  return (
    <FocusTrap open={isPresent} disableRestoreFocus isEnabled={isViewportFocusTrapEnabled}>
      <MotionPaper
        role="dialog"
        tabIndex={-1}
        data-fusion-panel={props.panelId}
        className={props.className}
        inert={!isPresent}
        aria-modal="false"
        aria-label={props.title}
        elevation={FLOATING_SURFACE_ELEVATION}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.985 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.985 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        sx={{
          ...FUSION_PANEL_FRAME_SX,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          border: 1,
          borderColor: "divider",
          borderRadius: 2.5,
          bgcolor: "background.paper",
          pointerEvents: isPresent ? "auto" : "none",
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            props.onClose();
            return;
          }
          keepViewportTabFocusInside(event);
        }}
      >
        {!props.hideHeader ? (
          <Stack direction="row" sx={{ minHeight: 52, px: 1.5, alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
            <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 800 }}>{props.title}</Typography>
            <IconButton data-fusion-panel-close size="small" onClick={() => props.onClose()} aria-label={props.closeLabel} title={props.closeLabel}>
              <XIcon size={18} />
            </IconButton>
          </Stack>
        ) : null}
        <Box sx={{ minHeight: 0, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {props.children}
        </Box>
      </MotionPaper>
    </FocusTrap>
  );
}
