import { Box, IconButton } from "@mui/material";
import { motion } from "motion/react";
import { type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BrandIcon } from "../../components/BrandIcon";
import type { usePanelWindow } from "../panel-window/usePanelWindow";

type AssistantWindowController = ReturnType<typeof usePanelWindow>;

export function AssistantWindowChrome(props: {
  panelWindow: AssistantWindowController;
  header: ReactNode;
  onHeaderPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const { t } = useTranslation();
  const { collapsed, dragging } = props.panelWindow;

  if (collapsed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.72 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        onPointerDown={(event) => props.panelWindow.startDragging(event, true)}
        onPointerMove={props.panelWindow.moveDragging}
        onPointerUp={props.panelWindow.stopDragging}
        onPointerCancel={props.panelWindow.stopDragging}
        onLostPointerCapture={props.panelWindow.stopDragging}
        style={{
          display: "grid",
          width: "100%",
          height: "100%",
          placeItems: "center",
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <IconButton
          type="button"
          onClick={props.panelWindow.handleCollapsedRestoreClick}
          aria-label={t("panel.restoreWindow")}
          title={t("panel.restoreWindow")}
          sx={{ width: 40, height: 40, borderRadius: "50%", color: "primary.main", cursor: "inherit" }}
        >
          <BrandIcon size={34} />
        </IconButton>
      </motion.div>
    );
  }

  return (
    <Box
      component="header"
      data-language-transition-surface
      onPointerDown={props.panelWindow.startDragging}
      onPointerMove={props.onHeaderPointerMove}
      onPointerUp={props.panelWindow.stopDragging}
      onPointerCancel={props.panelWindow.stopDragging}
      onLostPointerCapture={props.panelWindow.stopDragging}
      sx={{
        minHeight: 48,
        px: 1.5,
        py: 0.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        borderTop: 0,
        borderBottom: 0,
        bgcolor: "background.paper",
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {props.header}
    </Box>
  );
}
