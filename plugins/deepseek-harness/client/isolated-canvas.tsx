import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { CanvasRuntime, CanvasRuntimeOptions } from "./canvas-runtime.ts";

const DEFAULT_RUNTIME_SCRIPT_URL = "/geochat-assets/geochat-runtime.js";
const FRAME_ROOT_ID = "geochat-canvas-root";

type CanvasRuntimeFactory = {
  createCanvasRuntime(options: CanvasRuntimeOptions): CanvasRuntime;
};

type CanvasFrameWindow = Window & {
  GeoChatCanvasRuntime?: CanvasRuntimeFactory;
};

type CanvasFramePhase = "loading" | "ready" | "error";

type CanvasFrameGenerationOptions = {
  readonly setPhase: (phase: CanvasFramePhase) => void;
  readonly publish: (runtime: CanvasRuntime | null) => void;
};

type RuntimeLease = {
  readonly runtime: CanvasRuntime;
  readonly unsubscribe: () => void;
};

export interface IsolatedCanvasProps {
  readonly assetBaseUrl: string;
  readonly runtimeScriptUrl?: string;
  readonly onRuntimeChange?: (runtime: CanvasRuntime | null) => void;
}

export function createCanvasFrameGeneration({ setPhase, publish }: CanvasFrameGenerationOptions) {
  let active = true;
  let generation = 0;
  let lease: RuntimeLease | undefined;

  const release = () => {
    const current = lease;
    lease = undefined;
    if (!current) return;
    current.unsubscribe();
    current.runtime.dispose();
    publish(null);
  };

  const begin = () => {
    if (!active) return undefined;
    release();
    generation += 1;
    setPhase("loading");
    return generation;
  };

  return {
    replace(createRuntime: () => CanvasRuntime) {
      const currentGeneration = begin();
      if (currentGeneration === undefined) return;
      let runtime: CanvasRuntime | undefined;
      try {
        const created = createRuntime();
        runtime = created;
        const update = () => {
          if (!active || generation !== currentGeneration || lease?.runtime !== created) return;
          setPhase(toFramePhase(created.getSnapshot().phase));
        };
        const unsubscribe = created.subscribe(update);
        lease = { runtime: created, unsubscribe };
        update();
        publish(created);
      } catch {
        runtime?.dispose();
        if (active && generation === currentGeneration) setPhase("error");
      }
    },
    fail() {
      const currentGeneration = begin();
      if (currentGeneration !== undefined && generation === currentGeneration) setPhase("error");
    },
    dispose() {
      if (!active) return;
      active = false;
      generation += 1;
      release();
    }
  };
}

const ROOT_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  background: "#ffffff",
  color: "#4b5563",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
};

export const CANVAS_FRAME_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  border: 0,
  background: "#ffffff",
  pointerEvents: "auto"
};

const STATUS_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  margin: 0,
  padding: "1rem",
  background: "#ffffff",
  fontSize: "0.875rem",
  lineHeight: 1.5,
  textAlign: "center",
  pointerEvents: "none"
};

export function IsolatedCanvas({
  assetBaseUrl,
  runtimeScriptUrl = DEFAULT_RUNTIME_SCRIPT_URL,
  onRuntimeChange
}: IsolatedCanvasProps): ReactNode {
  const frame = useRef<HTMLIFrameElement>(null);
  const runtimeChange = useRef(onRuntimeChange);
  runtimeChange.current = onRuntimeChange;
  const [phase, setPhase] = useState<CanvasFramePhase>("loading");
  const sourceDocument = useMemo(() => canvasFrameSourceDocument(runtimeScriptUrl), [runtimeScriptUrl]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const generation = createCanvasFrameGeneration({
      setPhase,
      publish: (runtime) => runtimeChange.current?.(runtime)
    });

    const handleLoad = () => {
      const frameWindow = element.contentWindow as CanvasFrameWindow | null;
      const root = element.contentDocument?.getElementById(FRAME_ROOT_ID);
      const factory = frameWindow?.GeoChatCanvasRuntime;
      if (!factory || !root) {
        generation.fail();
        return;
      }
      generation.replace(() => {
        const runtime = factory.createCanvasRuntime({ assetBaseUrl });
        try {
          runtime.attach(root);
          return runtime;
        } catch (error) {
          runtime.dispose();
          throw error;
        }
      });
    };

    setPhase("loading");
    element.addEventListener("load", handleLoad);
    element.srcdoc = sourceDocument;
    return () => {
      element.removeEventListener("load", handleLoad);
      generation.dispose();
    };
  }, [assetBaseUrl, sourceDocument]);

  return (
    <section aria-label="GeoChat 画布" style={ROOT_STYLE}>
      <iframe ref={frame} style={CANVAS_FRAME_STYLE} tabIndex={-1} title="GeoChat 画布" />
      {phase === "loading" ? (
        <p aria-live="polite" role="status" style={STATUS_STYLE}>
          正在加载 GeoGebra 画布…
        </p>
      ) : null}
      {phase === "error" ? (
        <p aria-live="polite" role="alert" style={STATUS_STYLE}>
          GeoGebra 画布加载失败。
        </p>
      ) : null}
    </section>
  );
}

export function canvasFrameSourceDocument(runtimeScriptUrl: string) {
  const scriptUrl = escapeHtmlAttribute(runtimeScriptUrl);
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body,#${FRAME_ROOT_ID}{width:100%;height:100%;margin:0;overflow:hidden;background:#fff}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}</style></head><body><div id="${FRAME_ROOT_ID}"></div><script src="${scriptUrl}"></script></body></html>`;
}

function escapeHtmlAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function toFramePhase(phase: ReturnType<CanvasRuntime["getSnapshot"]>["phase"]): CanvasFramePhase {
  if (phase === "ready") return "ready";
  if (phase === "error" || phase === "disposed") return "error";
  return "loading";
}
