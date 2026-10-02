import { FileTextIcon, RotateCcwIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Alert, CircularProgress } from "@mui/material";
import { useTranslation } from "react-i18next";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { GeoGebraController } from "./geogebra/controller";
import type { CanvasRecoveryState } from "./geogebra/canvas-transactions";
import { mountGeoGebra } from "./geogebra/ggbdeploy-wrapper";
import {
  createGeoGebraSelectionContextBridge,
  type GeoGebraSelectionContext,
  type GeoGebraSelectionContextBridge,
  type GeoGebraSelectionRefreshReason,
} from "./geogebra/selection-context";
import { GeoGebraRuntimeProvider } from "./geogebra/runtime";
import { backendOrigin, desktopRuntimeError } from "./features/desktop/runtime";
import { desktopLogger } from "./features/desktop/desktopLogger";
import { consumeDesktopConfigRecoveryNotice } from "../../shared/desktop/desktop-config-recovery";
import { GeoGebraDocumentPanel } from "./features/geogebra/GeoGebraDocumentPanel";
import { GeoGebraCanvasMenu } from "./features/geogebra/GeoGebraCanvasMenu";

const logger = createStructuredLogger("renderer.app");

const AssistantPanel = lazy(async () => ({
  default: (await import("./components/AssistantPanel")).AssistantPanel,
}));

export default function App() {
  const { t } = useTranslation();
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
  const [documentPanelOpen, setDocumentPanelOpen] = useState(false);
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
        setCanvasState("ready");
      },
    }).then((mounted) => {
      if (disposed) mounted.dispose();
      else mountedApplet = mounted;
    }).catch((error) => {
        if (disposed || (error instanceof Error && error.name === "AbortError")) return;
        logger.error("applet_mount_failed", "GEOGEBRA_APPLET_MOUNT_FAILED", { error });
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
      logger.warn("canvas_reset_failed", "GEOGEBRA_CANVAS_RESET_FAILED", { error });
      desktopLogger.warn(error);
    } finally {
      setResetting(false);
    }
  }

  return (
    <GeoGebraRuntimeProvider runtime={controllerRef.current}>
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
          className="frontend-canvas-host is-toolbar-collapsed"
        />
        <div className="frontend-canvas-controls">
          <button
            type="button"
            className="frontend-canvas-control frontend-canvas-menu"
            onClick={() => setDocumentPanelOpen((current) => !current)}
            disabled={canvasState !== "ready" || Boolean(canvasRecovery)}
            aria-label={t("canvasControls.openMenu")}
            title={t("canvasControls.openMenu")}
            aria-expanded={documentPanelOpen}
          >
            <FileTextIcon size={18} />
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
        <GeoGebraCanvasMenu
          onOpenDocuments={() => setDocumentPanelOpen(true)}
          disabled={canvasState !== "ready" || Boolean(canvasRecovery) || resetting}
        />
        <GeoGebraDocumentPanel
          controller={controllerRef.current}
          open={documentPanelOpen}
          blocked={Boolean(canvasRecovery)}
          onClose={() => setDocumentPanelOpen(false)}
        />
        {canvasState !== "ready" && (
          <div className="frontend-canvas-overlay" role={canvasState === "error" ? "alert" : "status"}>
            <div className={canvasState === "error" ? "frontend-canvas-error" : "frontend-loader"} />
            <strong>{canvasState === "error" ? "GeoGebra 画板加载失败" : "正在加载 GeoGebra 画板…"}</strong>
            {canvasError && <span>{canvasError}</span>}
            {runtimeError && <span>{`Desktop bridge unavailable: ${runtimeError}`}</span>}
          </div>
        )}
        {canvasRecovery && (
          <div className="frontend-canvas-overlay frontend-canvas-recovery-overlay" role="alert" aria-live="assertive">
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
          />
        </Suspense>
      </div>
      </main>
    </GeoGebraRuntimeProvider>
  );
}
