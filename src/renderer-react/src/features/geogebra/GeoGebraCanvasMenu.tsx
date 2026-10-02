import { Alert, Box, Button, ClickAwayListener, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Stack, Tooltip } from "@mui/material";
import { CheckIcon, MenuIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from "react";
import { useTranslation } from "react-i18next";
import { FLOATING_SURFACE_ELEVATION } from "../../theme";
import type { GeoGebraCanvasAction } from "../../geogebra/canvas-controls";
import { useGeoGebraRuntime } from "../../geogebra/runtime";
import { useInteractionMode } from "../fusion-mode/useInteractionMode";
import { useGeoGebraCanvasControls } from "./useGeoGebraCanvasControls";
import { downloadCanvasExport } from "./canvasExport";

type MenuSection = "file" | "edit" | "view";
const MENU_SECTIONS: readonly MenuSection[] = ["file", "edit", "view"];
const VIEW_ACTIONS: readonly GeoGebraCanvasAction[] = ["toggleGrid", "toggleAxes", "showAlgebra", "show3D", "showProperties", "showGraphics"];

export function GeoGebraCanvasMenu(props: { onOpenDocuments(): void; disabled?: boolean }) {
  const { mode } = useInteractionMode();
  return mode === "fusion" ? <GeoGebraMenuBar {...props} /> : null;
}

export function GeoGebraMenuBar({ onOpenDocuments, disabled = false }: { onOpenDocuments(): void; disabled?: boolean }) {
  const { t } = useTranslation();
  const runtime = useGeoGebraRuntime();
  const { controls, snapshot } = useGeoGebraCanvasControls();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState<{ section: MenuSection; anchor: HTMLButtonElement } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const pendingRef = useRef(false);
  const locked = disabled || pending || !snapshot.ready || snapshot.blocked;

  useEffect(() => {
    if (expanded) menuBarRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [expanded]);

  function collapse(restoreFocus = false) {
    setMenu(null);
    setExpanded(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  async function run(action: () => Promise<unknown>) {
    if (locked || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setMenu(null);
    setError(null);
    try {
      await action();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function perform(action: GeoGebraCanvasAction) {
    if (!controls || !snapshot.supportedActions.includes(action)) return;
    void run(() => controls.performAction(action));
  }

  async function exportFile(format: "ggb" | "png") {
    if (format === "ggb") {
      downloadCanvasExport({ base64: await runtime.captureDocumentBase64(), mimeType: "application/vnd.geogebra.file", filename: "GeoChat.ggb" });
      return;
    }
    const result = await runtime.executeTool("getPNGBase64", { exportScale: 2, transparent: false });
    if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true
      || !("base64" in result) || typeof result.base64 !== "string") {
      throw new Error("GeoGebra did not provide a PNG image.");
    }
    downloadCanvasExport({ base64: result.base64, mimeType: "image/png", filename: "GeoChat.png" });
  }

  function navigateSections(event: KeyboardEvent<HTMLElement>) {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-canvas-menu-section]")];
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    if (current < 0) return;
    const next = event.key === "ArrowRight" ? (current + 1) % buttons.length
      : event.key === "ArrowLeft" ? (current + buttons.length - 1) % buttons.length
        : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : null;
    if (next !== null) {
      event.preventDefault();
      buttons[next]?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      buttons[current]?.click();
    }
  }

  return (
    <>
      <ClickAwayListener onClickAway={() => collapse()}>
        <Box data-geogebra-canvas-menu="true" sx={{ position: "fixed", bottom: 12, right: 18, zIndex: 1350, pointerEvents: "auto", maxWidth: "calc(100vw - 30px)" }} onWheel={(event) => event.stopPropagation()}>
          <Paper elevation={FLOATING_SURFACE_ELEVATION} sx={{ borderRadius: 2, overflow: "hidden" }} onKeyDown={(event) => {
            if (event.key === "Escape") { event.stopPropagation(); collapse(true); }
          }}>
            <Stack direction="row" sx={{ p: 0.375, minHeight: 42, boxSizing: "border-box", alignItems: "center" }}>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div key="canvas-menubar" initial={reduceMotion ? false : { width: 0, opacity: 0, x: 8 }} animate={{ width: "auto", opacity: 1, x: 0 }} exit={{ width: 0, opacity: 0, x: reduceMotion ? 0 : 8 }} transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: "hidden" }}>
                    <Stack ref={menuBarRef} id="geogebra-canvas-menubar" direction="row" role="menubar" aria-label={t("geogebra.menu")} onKeyDown={navigateSections} sx={{ width: "max-content" }}>
                      {MENU_SECTIONS.map((section) => (
                        <Button key={section} role="menuitem" size="small" data-canvas-menu-section={section} aria-haspopup="menu" aria-expanded={menu?.section === section} aria-controls={menu?.section === section ? "geogebra-canvas-submenu" : undefined} onClick={(event) => {
                          menuAnchorRef.current = event.currentTarget;
                          setMenu({ section, anchor: event.currentTarget });
                        }} sx={{ minWidth: 44, color: "text.primary", textTransform: "none" }}>
                          {t(`geogebra.${section}`)}
                        </Button>
                      ))}
                    </Stack>
                  </motion.div>
                )}
              </AnimatePresence>
              <Tooltip title={t(expanded ? "geogebra.closeMenu" : "geogebra.menu")}>
                <IconButton ref={triggerRef} size="small" aria-label={t(expanded ? "geogebra.closeMenu" : "geogebra.menu")} aria-expanded={expanded} aria-controls={expanded ? "geogebra-canvas-menubar" : undefined} onClick={() => {
                  if (expanded) collapse();
                  else setExpanded(true);
                }}>
                  {expanded ? <XIcon size={18} /> : <MenuIcon size={18} />}
                </IconButton>
              </Tooltip>
            </Stack>
          </Paper>
          {error && <Alert severity="error" onClose={() => setError(null)} sx={{ position: "absolute", bottom: "calc(100% + 8px)", right: 0, width: "max-content", maxWidth: "min(340px, calc(100vw - 16px))" }}>{t("geogebra.actionError", { message: error })}</Alert>}
          <Menu sx={{ zIndex: 1400 }} open={Boolean(menu)} anchorEl={menu?.anchor} onClose={() => setMenu(null)} transitionDuration={reduceMotion ? 0 : 180} anchorOrigin={{ vertical: "top", horizontal: "right" }} transformOrigin={{ vertical: "bottom", horizontal: "right" }} slotProps={{ transition: { onExited: () => {
            const anchor = menuAnchorRef.current;
            (anchor?.isConnected ? anchor : triggerRef.current)?.focus({ preventScroll: true });
          } }, list: { id: "geogebra-canvas-submenu", "aria-label": t(`geogebra.${menu?.section ?? "file"}`) }, paper: { sx: { mt: -0.5, minWidth: 220, maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100dvh - 120px)", overscrollBehavior: "contain" }, onWheel: (event: WheelEvent<HTMLElement>) => event.stopPropagation() } }}>
            {menu?.section === "file" && [
              <MenuItem key="documents" disabled={locked} onClick={() => { collapse(); onOpenDocuments(); }}>{t("geogebra.localDocuments")}</MenuItem>,
              <MenuItem key="ggb" disabled={locked} onClick={() => void run(() => exportFile("ggb"))}>{t("geogebra.exportGgb")}</MenuItem>,
              <MenuItem key="png" disabled={locked} onClick={() => void run(() => exportFile("png"))}>{t("geogebra.exportPng")}</MenuItem>,
              <Divider key="divider" />,
              <MenuItem key="reset" disabled={locked} onClick={() => { setMenu(null); setConfirmReset(true); }}>{t("geogebra.reset")}</MenuItem>,
            ]}
            {menu?.section === "edit" && (["undo", "redo"] as const).map((action) => (
              <MenuItem key={action} disabled={locked || !snapshot.supportedActions.includes(action)} onClick={() => perform(action)}>{t(`geogebra.${action}`)}</MenuItem>
            ))}
            {menu?.section === "view" && VIEW_ACTIONS.map((action) => {
              const checked = action === "toggleGrid" ? snapshot.gridVisible : action === "toggleAxes" ? snapshot.axesVisible : null;
              return <MenuItem key={action} role={checked === null ? "menuitem" : "menuitemcheckbox"} aria-checked={checked ?? undefined} disabled={locked || !snapshot.supportedActions.includes(action)} onClick={() => perform(action)}>
                <ListItemIcon>{checked && <CheckIcon size={16} />}</ListItemIcon><ListItemText>{t(`geogebra.${action}`)}</ListItemText>
              </MenuItem>;
            })}
          </Menu>
        </Box>
      </ClickAwayListener>
      <Dialog sx={{ zIndex: 1500 }} open={confirmReset} onClose={() => { if (!pending) setConfirmReset(false); }} aria-labelledby="canvas-reset-title">
        <DialogTitle id="canvas-reset-title">{t("geogebra.resetTitle")}</DialogTitle>
        <DialogContent><DialogContentText>{t("geogebra.resetDescription")}</DialogContentText>{error && <Alert severity="error" sx={{ mt: 1 }}>{t("geogebra.actionError", { message: error })}</Alert>}</DialogContent>
        <DialogActions>
          <Button disabled={pending} onClick={() => setConfirmReset(false)}>{t("geogebra.cancel")}</Button>
          <Button color="error" disabled={locked} onClick={() => void run(async () => {
            const result = await runtime.executeTool("resetCanvas", {});
            if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) throw new Error("GeoGebra rejected the canvas reset.");
            setConfirmReset(false);
          })}>{t("geogebra.confirmReset")}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
