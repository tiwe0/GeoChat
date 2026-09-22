import { useEffect, useRef, useState } from "react";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import { CircularProgress } from "@mui/material";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { AssistantPanel } from "./components/AssistantPanel";
import { GeoGebraController } from "./geogebra/controller";
import { mountGeoGebra } from "./geogebra/ggbdeploy-wrapper";
import { setFrontendGeoGebraController } from "./geogebra/runtime";
import { WindowTitleBar } from "./features/desktop/WindowTitleBar";
import { backendOrigin, desktopRuntimeError } from "./features/desktop/runtime";
import { desktopLogger } from "./features/desktop/desktopLogger";

export default function App() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef(new GeoGebraController());
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
              className="frontend-canvas-intro"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14, filter: "blur(3px)" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
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
          onConversationStarted={() => setCanvasIntroVisible(false)}
        />
      </div>
    </main>
  );
}
