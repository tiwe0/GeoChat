import { useEffect, useRef, useState } from "react";
import { AssistantPanel } from "./components/AssistantPanel";
import { GeoGebraController } from "./geogebra/controller";
import { mountGeoGebra } from "./geogebra/ggbdeploy-wrapper";
import { setFrontendGeoGebraController } from "./geogebra/runtime";
import { WindowTitleBar } from "./features/desktop/WindowTitleBar";
// The desktop shell runs its own Bun backend; this is its default address.
const BACKEND_BASE_URL = (import.meta.env.VITE_GEOCHAT_DESKTOP_BACKEND_URL ?? "http://127.0.0.1:17365").replace(/\/$/, "");

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef(new GeoGebraController());
  const [canvasState, setCanvasState] = useState<"loading" | "ready" | "error">("loading");
  const [canvasError, setCanvasError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let mountedApplet: Awaited<ReturnType<typeof mountGeoGebra>> | null = null;
    const container = canvasRef.current;
    if (!container) return;
    void mountGeoGebra({
      container,
      backendBaseUrl: BACKEND_BASE_URL,
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
      mountedApplet?.dispose();
      setFrontendGeoGebraController(null);
    };
  }, []);

  return (
    <main className="frontend-shell">
      <WindowTitleBar />
      <section className="frontend-canvas" aria-label="GeoGebra 画板">
        <div ref={canvasRef} className="frontend-canvas-host" />
        {canvasState !== "ready" && (
          <div className="frontend-canvas-overlay" role={canvasState === "error" ? "alert" : "status"}>
            <div className={canvasState === "error" ? "frontend-canvas-error" : "frontend-loader"} />
            <strong>{canvasState === "error" ? "GeoGebra 画板加载失败" : "正在加载 GeoGebra 画板…"}</strong>
            {canvasError && <span>{canvasError}</span>}
          </div>
        )}
      </section>
      <div id="geochatpro-panel-host" className="geochatpro-panel-host">
        <AssistantPanel canvasReady={canvasState === "ready"} />
      </div>
    </main>
  );
}
