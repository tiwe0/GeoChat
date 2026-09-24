import CropSquareRounded from "@mui/icons-material/CropSquareRounded";
import HubRounded from "@mui/icons-material/HubRounded";
import { IconButton, Tooltip } from "@mui/material";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { InteractionMode } from "../../../../shared/desktop/workbench-types";
import type { FusionPoint } from "./geometry";

export function InteractionModeButton(props: {
  mode: InteractionMode;
  label: string;
  onToggle: (origin: FusionPoint) => void;
}) {
  const reduceMotion = useReducedMotion();
  const targetMode = props.mode === "window" ? "fusion" : "window";

  return (
    <Tooltip title={props.label} arrow>
      <IconButton
        type="button"
        size="small"
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          props.onToggle({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
        }}
        aria-label={props.label}
        data-interaction-mode-toggle
        data-target-mode={targetMode}
        data-copilot-no-drag
        sx={{
          overflow: "hidden",
          color: props.mode === "fusion" ? "primary.main" : "text.secondary",
          bgcolor: props.mode === "fusion" ? "action.selected" : undefined,
        }}
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={targetMode}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.55, rotate: -28 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.55, rotate: 28 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: "grid", placeItems: "center" }}
            whileHover={reduceMotion ? undefined : { scale: 1.12, rotate: targetMode === "fusion" ? 10 : -8 }}
            whileTap={reduceMotion ? undefined : { scale: 0.72, rotate: targetMode === "fusion" ? 42 : -36 }}
          >
            {targetMode === "fusion" ? <HubRounded fontSize="small" /> : <CropSquareRounded fontSize="small" />}
          </motion.span>
        </AnimatePresence>
      </IconButton>
    </Tooltip>
  );
}
