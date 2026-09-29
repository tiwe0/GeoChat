import { MenuIcon, RotateCcwIcon, WrenchIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Alert, CircularProgress } from "@mui/material";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { GeoGebraController } from "./geogebra/controller";
import type { CanvasRecoveryState } from "./geogebra/canvas-transactions";
import {
  DEFAULT_GEOGEBRA_TOOLBAR_VISIBLE,
  mountGeoGebra,
  openGeoGebraNativeMenu,
} from "./geogebra/ggbdeploy-wrapper";
import {
  createGeoGebraSelectionContextBridge,
  type GeoGebraSelectionContext,
  type GeoGebraSelectionContextBridge,
  type GeoGebraSelectionRefreshReason,
} from "./geogebra/selection-context";
import { setFrontendGeoGebraController } from "./geogebra/runtime";
import { useInteractionMode } from "./features/fusion-mode";
import { backendOrigin, desktopRuntimeError } from "./features/desktop/runtime";
import { desktopLogger } from "./features/desktop/desktopLogger";
import { consumeDesktopConfigRecoveryNotice } from "../../shared/desktop/desktop-config-recovery";

const AssistantPanel = lazy(async () => ({
  default: (await import("./components/AssistantPanel")).AssistantPanel,
}));

export default function App() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const interaction = useInteractionMode();
  const canvasRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef(new GeoGebraController());
  const selectionBridgeRef = useRef<GeoGebraSelectionContextBridge | null>(null);
  const [selectionContext, setSelectionContext] = useState<GeoGebraSelectionContext>({ status: "unavailable", objectNames: [] });
  const [canvasState, setCanvasState] = useState<"loading" | "ready" | "error">("loading");
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [canvasRecovery, setCanvasRecovery] = useState<CanvasRecoveryState | null>(null);
  const [canvasMountGeneration, setCanvasMountGeneration] = useState(0);
  const [retryingRecovery, setRetryingRecovery] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(DEFAULT_GEOGEBRA_TOOLBAR_VISIBLE);
  const [canvasIntroVisible, setCanvasIntroVisible] = useState(true);
  const [configRecoveryNotice, setConfigRecoveryNotice] = useState(() => consumeDesktopConfigRecoveryNotice());

  // A shell that will not report its backend is a hard failure, not something
  // to paper over with a guessed port.
  const runtimeError = desktopRuntimeError();

  useEffect(() => controllerRef.current.subscribeCanvasRecovery(() => {
    setCanvasRecovery(controllerRef.current.canvasRecoveryState);
  }), []);

  useEffect(() => {
    let disposed = false;
    // Abort an in-flight mount during HMR or teardown so a stale applet can
    // never replace the current one on the shared host.
    const mountAbort = new AbortController();
    let mountedApplet: Awaited<ReturnType<typeof mountGeoGebra>> | null = null;
    const container = canvasRef.current;
    if (!container) return;
    void mountGeoGebra({
      container,
      backendBaseUrl: backendOrigin(),
      signal: mountAbort.signal,
      onReady: (api) => {
        if (disposed) return;
        controllerRef.current.setApi(api);
        selectionBridgeRef.current?.dispose();
        selectionBridgeRef.current = createGeoGebraSelectionContextBridge(api, { onChange: setSelectionContext });
        setSelectionContext(selectionBridgeRef.current.getSnapshot());
        setFrontendGeoGebraController(controllerRef.current);
        setToolbarVisible(DEFAULT_GEOGEBRA_TOOLBAR_VISIBLE);
        setCanvasState("ready");
      },
    }).then((mounted) => {
      if (disposed) mounted.dispose();
      else mountedApplet = mounted;
    }).catch((error) => {
        if (disposed || (error instanceof Error && error.name === "AbortError")) return;
        console.error("[ERROR] Failed to mount the GeoGebra applet", error);
        setCanvasState("error");
        setCanvasError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      disposed = true;
      mountAbort.abort();
      mountedApplet?.dispose();
      selectionBridgeRef.current?.dispose();
      selectionBridgeRef.current = null;
      controllerRef.current.setApi(null);
      setFrontendGeoGebraController(null);
    };
  }, [canvasMountGeneration]);

  async function retryCanvasRecovery() {
    if (!canvasRecovery || retryingRecovery) return;
    setRetryingRecovery(true);
    try {
      await controllerRef.current.retryCanvasRecovery();
    } catch (error) {
      desktopLogger.warn(error);
      setCanvasError(error instanceof Error ? error.message : String(error));
    } finally {
      setRetryingRecovery(false);
    }
  }

  function reloadCanvasForRecovery() {
    setCanvasState("loading");
    setCanvasError(null);
    setCanvasMountGeneration((current) => current + 1);
  }

  function exportCanvasRecoveryDiagnostics() {
    if (!canvasRecovery) return;
    const payload = JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      canvasState,
      recovery: canvasRecovery,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `geochat-canvas-recovery-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function resetCanvas() {
    if (canvasState !== "ready" || resetting) return;
    setResetting(true);
    try {
      const result = await controllerRef.current.executeTool("resetCanvas", {});
      if (!result || typeof result !== "object" || ("ok" in result && result.ok === false)) {
        throw new Error("GeoGebra 画板重置失败。");
      }
    } catch (error) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/App.tsx:72", error);
      console.warn("Failed to reset GeoGebra canvas", error);
      desktopLogger.warn(error);
    } finally {
      setResetting(false);
    }
  }

  function toggleGeoGebraToolbar() {
    if (canvasState !== "ready") return;
    const nextVisible = !toolbarVisible;
    try {
      controllerRef.current.setToolbarVisible(nextVisible);
      setToolbarVisible(nextVisible);
    } catch (error) {
      console.error("[ERROR] Failed to toggle the GeoGebra toolbar", error);
      desktopLogger.warn(error);
    }
  }

  function openGeoGebraMenu() {
    const container = canvasRef.current;
    if (canvasState !== "ready" || !container) return;
    if (openGeoGebraNativeMenu(container)) {
      setCanvasIntroVisible(false);
      return;
    }
    const error = new Error("GeoGebra 原生菜单尚未就绪。");
    console.error("[ERROR] Failed to open the GeoGebra native menu", error);
    desktopLogger.warn(error);
  }

  return (
    <main className="frontend-shell">
      {configRecoveryNotice && (
        <Alert
          className="frontend-config-recovery-notice"
          severity="warning"
          onClose={() => setConfigRecoveryNotice(null)}
        >
          {t("configRecovery.recovered", { count: configRecoveryNotice.recoveredFields.length })}
        </Alert>
      )}
      <section className="frontend-canvas" aria-label="GeoGebra 画板">
        <div
          ref={canvasRef}
          className={`frontend-canvas-host${toolbarVisible ? "" : " is-toolbar-collapsed"}`}
        />
        <AnimatePresence initial={false}>
          {canvasState === "ready" && canvasIntroVisible && (
            <motion.div
              className={`frontend-canvas-intro${interaction.mode === "fusion" ? " frontend-canvas-intro-fusion" : ""}`}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, clipPath: "inset(0 0 0% 0)" }}
              animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)", filter: "blur(0px)" }}
              exit={reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -58, clipPath: "inset(0 0 100% 0)", filter: "blur(2px)" }}
              transition={{ duration: reduceMotion ? 0.12 : 0.38, ease: [0.22, 1, 0.36, 1] }}
              aria-live="polite"
            >
              <h1>{t("canvasIntro.title")}</h1>
              <p>{t("canvasIntro.description")}</p>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="frontend-canvas-controls">
          <button
            type="button"
            className="frontend-canvas-control frontend-canvas-menu"
            onClick={openGeoGebraMenu}
            disabled={canvasState !== "ready"}
            aria-label={t("canvasControls.openMenu")}
            title={t("canvasControls.openMenu")}
          >
            <MenuIcon size={18} />
          </button>
          <button
            type="button"
            className={`frontend-canvas-control frontend-canvas-toolbar${toolbarVisible ? " is-active" : ""}`}
            onClick={toggleGeoGebraToolbar}
            disabled={canvasState !== "ready"}
            aria-label={toolbarVisible ? t("canvasControls.hideToolbar") : t("canvasControls.showToolbar")}
            title={toolbarVisible ? t("canvasControls.hideToolbar") : t("canvasControls.showToolbar")}
            aria-pressed={toolbarVisible}
          >
            <WrenchIcon size={18} />
          </button>
          <button
            type="button"
            className="frontend-canvas-control frontend-canvas-reset"
            onClick={() => void resetCanvas()}
            disabled={canvasState !== "ready" || resetting}
            aria-label={t("canvasControls.reset")}
            title={t("canvasControls.reset")}
          >
            {resetting ? <CircularProgress size={18} color="inherit" /> : <RotateCcwIcon size={18} />}
          </button>
        </div>
        {canvasState !== "ready" && (
          <div className="frontend-canvas-overlay" role={canvasState === "error" ? "alert" : "status"}>
            <div className={canvasState === "error" ? "frontend-canvas-error" : "frontend-loader"} />
            <strong>{canvasState === "error" ? "GeoGebra 画板加载失败" : "正在加载 GeoGebra 画板…"}</strong>
            {canvasError && <span>{canvasError}</span>}
            {runtimeError && <span>{`Desktop bridge unavailable: ${runtimeError}`}</span>}
          </div>
        )}
        {canvasRecovery && (
          <div className="frontend-canvas-overlay" role="alert" aria-live="assertive">
            <div className="frontend-canvas-error" />
            <strong>{t("canvasRecovery.title")}</strong>
            <span>{t("canvasRecovery.description")}</span>
            <span>{canvasRecovery.error}</span>
            <div className="frontend-canvas-recovery-actions">
              <button type="button" onClick={() => void retryCanvasRecovery()} disabled={retryingRecovery}>
                {retryingRecovery ? t("canvasRecovery.retrying") : t("canvasRecovery.retry")}
              </button>
              <button type="button" onClick={exportCanvasRecoveryDiagnostics}>
                {t("canvasRecovery.exportDiagnostics")}
              </button>
              <button type="button" onClick={reloadCanvasForRecovery}>
                {t("canvasRecovery.reload")}
              </button>
            </div>
          </div>
        )}
      </section>
      <div id="geochat-panel-host" className="geochat-panel-host">
        <Suspense fallback={null}>
          <AssistantPanel
            canvasReady={canvasState === "ready"}
            selectionContext={selectionContext}
            onRefreshSelection={(reason: GeoGebraSelectionRefreshReason) => {
              const next = selectionBridgeRef.current?.refresh(reason);
              if (next) setSelectionContext(next);
              return next;
            }}
            onConversationStarted={() => setCanvasIntroVisible(false)}
          />
        </Suspense>
      </div>
    </main>
  );
}
