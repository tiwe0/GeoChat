import { Box, ListItemText, Menu, MenuItem, Paper, type SxProps, type Theme } from "@mui/material";
import { motion, useReducedMotion } from "motion/react";
import { useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FLOATING_SURFACE_ELEVATION } from "../../theme";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import {
  CHAT_PAGE_MIN_HEIGHT,
  DEFAULT_PANEL_HEIGHT,
  DEFAULT_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  RESIZE_HANDLES,
  USER_PAGE_MIN_HEIGHT,
  USER_PAGE_MIN_WIDTH,
  type PanelView,
  type usePanelWindow,
} from "../panel-window/usePanelWindow";
import { AssistantWindowChrome } from "./AssistantWindowChrome";

const logger = createStructuredLogger("assistant.window-shell");

const MotionPaper = motion.create(Paper);

type PanelContextMenuState = {
  left: number;
  top: number;
  selectedText: string;
  editable: HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
};

function editableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const editable = target.closest("input, textarea, [contenteditable='true'], [contenteditable='']");
  return editable instanceof HTMLElement ? editable : null;
}

function selectedText(target: Element | null) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    return target.value.slice(Math.min(start, end), Math.max(start, end));
  }
  return target?.ownerDocument.getSelection()?.toString() ?? "";
}

async function copyText(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    logger.warn("selection_copy_failed", "ASSISTANT_SELECTION_COPY_FAILED", { error });
  }
}

async function pasteText(target: PanelContextMenuState["editable"]) {
  if (!target) return;
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch (error) {
    logger.warn("clipboard_read_failed", "ASSISTANT_CLIPBOARD_READ_FAILED", { error });
    return;
  }
  if (!text) return;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  target.ownerDocument.execCommand("insertText", false, text);
}

export type AssistantWindowController = ReturnType<typeof usePanelWindow>;

export function AssistantWindowShell(props: {
  panelWindow: AssistantWindowController;
  panelView: PanelView;
  appLabel: string;
  language: string;
  header: ReactNode;
  children: ReactNode;
  onHeaderPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDownCapture?: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [contextMenu, setContextMenu] = useState<PanelContextMenuState | null>(null);
  const { panelRef, collapsed, resizing } = props.panelWindow;

  function openContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null;
    const editable = editableTarget(event.target);
    const selection = selectedText(editable ?? target).trim();
    event.preventDefault();
    event.stopPropagation();
    if (editable || selection) {
      setContextMenu({ left: event.clientX, top: event.clientY, selectedText: selection, editable });
    }
  }

  const sizeStyles: SxProps<Theme> = {
    width: collapsed ? 40 : `min(${DEFAULT_PANEL_WIDTH}px, calc(100vw - 40px))`,
    minWidth: collapsed ? 40 : props.panelView === "user"
      ? `min(${USER_PAGE_MIN_WIDTH}px, calc(100vw - 40px))`
      : `min(${MIN_PANEL_WIDTH}px, calc(100vw - 40px))`,
    maxWidth: collapsed ? 40 : undefined,
    height: collapsed ? 40 : `min(${DEFAULT_PANEL_HEIGHT}px, calc(100vh - 40px))`,
    minHeight: collapsed
      ? 40
      : props.panelView === "user"
        ? `min(${USER_PAGE_MIN_HEIGHT}px, calc(100vh - 40px))`
        : `min(${CHAT_PAGE_MIN_HEIGHT}px, calc(100vh - 40px))`,
    maxHeight: collapsed ? 40 : "calc(100vh - 40px)",
  };

  return (
    <MotionPaper
      ref={panelRef}
      className="geochat-panel"
      aria-label={props.appLabel}
      lang={props.language}
      elevation={FLOATING_SURFACE_ELEVATION}
      layout={!resizing}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.985, y: 8 }}
      animate={{ borderRadius: collapsed ? 20 : 4, opacity: 1, scale: 1, y: 0 }}
      transition={{
        layout: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: reduceMotion ? 0 : 0.18 },
        scale: { duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] },
        y: { duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] },
      }}
      onContextMenuCapture={openContextMenu}
      onPointerDownCapture={props.onPointerDownCapture}
      sx={{
        ...sizeStyles,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        border: 1,
        borderColor: "divider",
        borderRadius: collapsed ? "50%" : 1,
        color: "text.primary",
        transition: (theme) => theme.transitions.create("box-shadow", { duration: 160 }),
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      <AssistantWindowChrome
        panelWindow={props.panelWindow}
        header={props.header}
        onHeaderPointerMove={props.onHeaderPointerMove}
      />
      {props.children}
      {!collapsed && RESIZE_HANDLES.map((handle) => (
        <Box
          key={handle.direction}
          aria-hidden="true"
          onPointerDown={props.panelWindow.startResizing(handle.direction)}
          onPointerMove={props.panelWindow.moveResizing}
          onPointerUp={props.panelWindow.stopResizing}
          onPointerCancel={props.panelWindow.stopResizing}
          onLostPointerCapture={props.panelWindow.stopResizing}
          sx={{ position: "absolute", zIndex: 2, cursor: handle.cursor, touchAction: "none", ...handle.position }}
        />
      ))}
      <Menu
        open={Boolean(contextMenu)}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.top, left: contextMenu.left } : undefined}
        container={() => panelRef.current?.parentElement ?? null}
      >
        <MenuItem
          disabled={!contextMenu?.selectedText}
          onClick={() => {
            if (contextMenu?.selectedText) void copyText(contextMenu.selectedText);
            setContextMenu(null);
          }}
        >
          <ListItemText primary={t("common.copy")} />
        </MenuItem>
        <MenuItem
          disabled={!contextMenu?.editable}
          onClick={() => {
            void pasteText(contextMenu?.editable ?? null);
            setContextMenu(null);
          }}
        >
          <ListItemText primary={t("common.paste")} />
        </MenuItem>
      </Menu>
    </MotionPaper>
  );
}
