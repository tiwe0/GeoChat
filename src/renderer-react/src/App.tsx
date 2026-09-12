import { useEffect, useRef, useState } from "react";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import { CircularProgress } from "@mui/material";
import { AssistantPanel } from "./components/AssistantPanel";
import { GeoGebraController } from "./geogebra/controller";
import { mountGeoGebra } from "./geogebra/ggbdeploy-wrapper";
import { setFrontendGeoGebraController } from "./geogebra/runtime";
import { WindowTitleBar } from "./features/desktop/WindowTitleBar";
import { backendOrigin, desktopRuntimeError } from "./features/desktop/runtime";

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef(new GeoGebraController());
  const [canvasState, setCanvasState] = useState<"loading" | "ready" | "error">("loading");
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // A shell that will not report its backend is a hard failure, not something
  // to paper over with a guessed port.
  const runtimeError = desktopRuntimeError();

  useEffect(() => {
    let disposed = false;
    // React StrictMode intentionally replays effects in development. Abort
    // the first mount before it reaches deployggb's asynchronous inject path;
    // otherwise two applets race on the same host and the later one can be
    // removed by deployggb.removeExistingApplet(), leaving a live API with a
    // blank canvas.
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
        if (disposed) return;
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
      console.warn("Failed to reset GeoGebra canvas", error);
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="frontend-shell">
      <WindowTitleBar />
      <section className="frontend-canvas" aria-label="GeoGebra 画板">
        <div ref={canvasRef} className="frontend-canvas-host" />
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
      <div id="geochatpro-panel-host" className="geochatpro-panel-host">
        <AssistantPanel canvasReady={canvasState === "ready"} />
      </div>
    </main>
  );
}
