import { useEffect, useRef, useState } from "react";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import { CircularProgress } from "@mui/material";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { AssistantPanel } from "./components/AssistantPanel";
import { GeoGebraController } from "./geogebra/controller";
import { mountGeoGebra } from "./geogebra/ggbdeploy-wrapper";
import {
  createGeoGebraSelectionContextBridge,
  type GeoGebraSelectionContext,
  type GeoGebraSelectionContextBridge,
  type GeoGebraSelectionRefreshReason,
} from "./geogebra/selection-context";
import { setFrontendGeoGebraController } from "./geogebra/runtime";
import { WindowTitleBar } from "./features/desktop/WindowTitleBar";
import { useInteractionMode } from "./features/fusion-mode";
import { backendOrigin, desktopRuntimeError } from "./features/desktop/runtime";
import { desktopLogger } from "./features/desktop/desktopLogger";

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
  const [resetting, setResetting] = useState(false);
  const [canvasIntroVisible, setCanvasIntroVisible] = useState(true);

  // A shell that will not report its backend is a hard failure, not something
  // to paper over with a guessed port.
  const runtimeError = desktopRuntimeError();

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
      setFrontendGeoGebraController(null);
    };
  }, []);

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

  return (
    <main className="frontend-shell">
      <WindowTitleBar />
      <section className="frontend-canvas" aria-label="GeoGebra 画板">
        <div ref={canvasRef} className="frontend-canvas-host" />
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
              <span className="frontend-canvas-intro-badge">{t("canvasIntro.badge")}</span>
              <h1>{t("canvasIntro.title")}</h1>
              <p>{t("canvasIntro.description")}</p>
            </motion.div>
          )}
        </AnimatePresence>
        <div
          className={`frontend-canvas-status frontend-canvas-status-${canvasState}`}
          role="status"
          aria-live="polite"
        >
          <span className="frontend-canvas-status-item">
            <i aria-hidden="true" />
            {t(`canvasStatus.canvas.${canvasState}`)}
          </span>
        </div>
        <button
          type="button"
          className="frontend-canvas-reset"
          onClick={() => void resetCanvas()}
          disabled={canvasState !== "ready" || resetting}
          aria-label="重置 GeoGebra 画板"
          title="重置画板"
        >
          {resetting ? <CircularProgress size={18} color="inherit" /> : <RestartAltRounded fontSize="small" />}
        </button>
        {canvasState !== "ready" && (
          <div className="frontend-canvas-overlay" role={canvasState === "error" ? "alert" : "status"}>
            <div className={canvasState === "error" ? "frontend-canvas-error" : "frontend-loader"} />
            <strong>{canvasState === "error" ? "GeoGebra 画板加载失败" : "正在加载 GeoGebra 画板…"}</strong>
            {canvasError && <span>{canvasError}</span>}
            {runtimeError && <span>{`Desktop bridge unavailable: ${runtimeError}`}</span>}
          </div>
        )}
      </section>
      <div id="geochat-panel-host" className="geochat-panel-host">
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
      </div>
    </main>
  );
}
