import { Box, Stack, Typography } from "@mui/material";
import { GripVerticalIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { GeoChatComposer } from "../assistant-ui";
import { FUSION_COMPOSER_Z_INDEX } from "./geometry";

const MotionBox = motion.create(Box);

/**
 * Spatial shell for the shared assistant-ui composer.
 *
 * assistant-ui owns text, attachments, submit/cancel, paste, drop, focus and
 * input history. This wrapper only owns GeoChat's canvas placement and drag
 * interaction, keeping the fusion surface free of a second chat state model.
 */
export function FusionComposer(props: {
  x: number;
  y: number;
  disabled: boolean;
  canvasConnected: boolean;
  canvasConnectedLabel: string;
  modelLabel: string;
  focusSignal: number;
  modelControl?: ReactNode;
  selectionLabel?: string;
  placeholder: string;
  attachLabel: string;
  removeAttachmentLabel: string | ((name: string) => string);
  sendLabel: string;
  stopLabel: string;
  dragLabel: string;
  error?: string | null;
  onFocus?: () => void;
  onSubmit?: () => void;
  onAttachmentError?: (message: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onDragMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onDragStop: (event: ReactPointerEvent<HTMLElement>) => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
}) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !props.onSizeChange) return;
    const report = (entry?: ResizeObserverEntry) => {
      // Layout size is stable during the surface's transform-based entrance.
      const bounds = entry?.borderBoxSize?.[0];
      props.onSizeChange?.({ width: bounds?.inlineSize ?? root.offsetWidth, height: bounds?.blockSize ?? root.offsetHeight });
    };
    report();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => report(entries[0]));
    observer?.observe(root);
    return () => observer?.disconnect();
  }, [props.onSizeChange]);

  const composerHeader = (
    <Stack
      data-copilot-tour="fusion-composer"
      direction="row"
      spacing={0.5}
      onPointerDown={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("button, input, textarea, select, [role='button'], [role='menuitem']")) return;
        props.onDragStart(event);
      }}
      onPointerMove={props.onDragMove}
      onPointerUp={props.onDragStop}
      onPointerCancel={props.onDragStop}
      onLostPointerCapture={props.onDragStop}
      sx={{ minWidth: 0, alignItems: "center", cursor: "grab", touchAction: "none", userSelect: "none" }}
      aria-label={props.dragLabel}
    >
      <GripVerticalIcon size={16} color="#9ca3af" />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {props.modelControl ?? (
          <Typography variant="caption" color="text.secondary" noWrap>
            {props.modelLabel}
          </Typography>
        )}
      </Box>
      {props.selectionLabel && (
        <Typography
          variant="caption"
          color="primary.main"
          noWrap
          sx={{ maxWidth: 180, fontWeight: 650 }}
          title={props.selectionLabel}
        >
          {props.selectionLabel}
        </Typography>
      )}
    </Stack>
  );

  return (
    <Box
      ref={rootRef}
      data-fusion-composer="true"
      sx={{
        position: "fixed",
        left: props.x,
        top: props.y,
        width: "min(390px, calc(100vw - 24px))",
        transform: "translateX(-50%)",
        pointerEvents: "auto",
        zIndex: FUSION_COMPOSER_Z_INDEX,
      }}
    >
      <MotionBox
        initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        sx={{ position: "relative" }}
      >
        {props.canvasConnected && (
          <Box
            role="status"
            aria-label={props.canvasConnectedLabel}
            title={props.canvasConnectedLabel}
            sx={{
              position: "absolute",
              top: 10,
              right: 11,
              zIndex: 2,
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "#42a564",
              boxShadow: "0 0 0 3px rgba(66, 165, 100, 0.14)",
            }}
          />
        )}
        <GeoChatComposer
          variant="fusion"
          header={composerHeader}
          focusSignal={props.focusSignal}
          disabled={props.disabled}
          error={props.error}
          placeholder={props.placeholder}
          attachLabel={props.attachLabel}
          removeAttachmentLabel={props.removeAttachmentLabel}
          sendLabel={props.sendLabel}
          stopLabel={props.stopLabel}
          onFocus={props.onFocus}
          onSubmit={props.onSubmit}
          onAttachmentError={props.onAttachmentError}
          sx={{
            header: { pr: 3.5 },
            root: { borderRadius: 3 },
          }}
        />
      </MotionBox>
    </Box>
  );
}
