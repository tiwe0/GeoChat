export type GeoGebraApi = Record<string, unknown>;
export type GeoGebraApplet = GeoGebraApi & {
  inject: (...args: unknown[]) => unknown;
  setHTML5Codebase: (url: string, offline?: boolean) => void;
  resize?: () => unknown;
  removeExistingApplet?: (...args: unknown[]) => unknown;
};

declare global {
  interface Window { GGBApplet?: new (...args: unknown[]) => GeoGebraApplet }
}

const DEPLOY_SCRIPT = "__geogebra_deployggb_script__";
const GEOGEBRA_STYLESHEET = "__geogebra_runtime_stylesheet__";
const GEOGEBRA_MODULE_BASE = "__geogebra_web3d_module_base__";
let deployPromise: Promise<void> | undefined;
let stylesheetPromise: Promise<void> | undefined;
// deployggb keeps a process-wide applet registry keyed by the DOM id. Keep a
// lease per host as well so a stale StrictMode mount can never dispose the
// newer applet that replaced it.
const activeMounts = new WeakMap<HTMLElement, symbol>();

function loadDeployScript(url: string) {
  if (window.GGBApplet) return Promise.resolve();
  if (deployPromise) return deployPromise;
  deployPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(DEPLOY_SCRIPT) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("无法加载 GeoGebra deployggb.js。")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = DEPLOY_SCRIPT;
    script.src = url;
    script.async = true;
    script.onload = () => window.GGBApplet ? resolve() : reject(new Error("deployggb.js 未导出 GGBApplet。"));
    script.onerror = () => reject(new Error(`无法加载 ${url}`));
    document.head.appendChild(script);
  });
  return deployPromise;
}

function loadGeoGebraStylesheet(url: string) {
  const existing = document.getElementById(GEOGEBRA_STYLESHEET) as HTMLLinkElement | null;
  if (existing?.href === url) return Promise.resolve();
  // HMR can leave the link element from an earlier, incorrect base URL in
  // the document. Replace it instead of treating the stale 404 as loaded.
  if (existing) {
    existing.remove();
    stylesheetPromise = undefined;
  }
  if (stylesheetPromise) return stylesheetPromise;
  stylesheetPromise = new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.id = GEOGEBRA_STYLESHEET;
    link.rel = "stylesheet";
    link.href = url;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`无法加载 GeoGebra 样式表 ${url}`));
    document.head.appendChild(link);
  });
  return stylesheetPromise;
}

function pinGeoGebraModuleBase(codebase: string) {
  // GWT's bootstrapper normally infers the module base from the script tag.
  // That inference is fragile when deployggb is loaded dynamically (and can
  // fall back to GeoGebra's hosted URL or a relative path).  The vendored
  // web3d.nocache.js explicitly honors this module property, so provide the
  // backend asset directory before inject() starts loading the GWT module.
  const content = `baseUrl=${codebase}`;
  let meta = document.getElementById(GEOGEBRA_MODULE_BASE) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.id = GEOGEBRA_MODULE_BASE;
    meta.name = "web3d::gwt:property";
    document.head.appendChild(meta);
  }
  meta.content = content;
  // The GWT bootstrapper supports a localhost dev-mode hook through
  // sessionStorage. A previous run can leave that hook pointing at a dead
  // backend port, which produces a live API object but no visible applet.
  try {
    sessionStorage.removeItem("__gwtDevModeHook:web3d");
    sessionStorage.removeItem("__gwtDevModeHook:webSimple");
  } catch (caughtError) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/geogebra/ggbdeploy-wrapper.ts:87", caughtError);
    // Storage can be unavailable in a restricted WebView; the explicit
    // module-base meta tag above remains sufficient in that case.
  }
}

export async function mountGeoGebra(options: {
  container: HTMLElement;
  /** Base URL of the local backend, which serves vendor/geogebra. */
  backendBaseUrl: string;
  /** Cancels an in-flight mount (notably React StrictMode effect replay). */
  signal?: AbortSignal;
  onReady: (api: GeoGebraApi) => void;
}) {
  const mountToken = Symbol("geogebra-mount");
  activeMounts.set(options.container, mountToken);
  const isActiveMount = () => activeMounts.get(options.container) === mountToken;
  // The desktop app serves one vendored GeoGebra runtime from its own backend,
  // so there is no version path and no original/patched split — the web build
  // needed those because it fetched releases from a hosted origin.
  const origin = options.backendBaseUrl.replace(/\/$/, "");
  const assetBase = `${origin}/tools/geogebra-assets-v2`;
  const codebase = `${assetBase}/HTML5/5.0/web3d/`;
  // The shared stylesheet lives beside the selected GWT codebase, not inside
  // the web3d module directory. The old URL returned 404 in both dev and the
  // packaged backend; browsers often still fire link.onload for that response,
  // leaving GeoGebra injected without its required layout styles.
  await loadGeoGebraStylesheet(`${assetBase}/HTML5/5.0/css/bundles/bundle.css`);
  throwIfMountCancelled(options.signal, isActiveMount);
  await loadDeployScript(`${assetBase}/deployggb.js`);
  throwIfMountCancelled(options.signal, isActiveMount);
  if (!window.GGBApplet) throw new Error("GeoGebra deployggb.js 未就绪。");

  const id = options.container.id || "geogebra-applet";
  options.container.id = id;
  /**
   * Measure the stage, not the applet host.
   *
   * syncSize writes an explicit pixel size onto the host, so measuring the
   * host would measure the last answer rather than the space available. The
   * parent is the element that actually tracks the window.
   */
  const initialSize = () => {
    const stage = options.container.parentElement instanceof HTMLElement
      ? options.container.parentElement
      : options.container;
    const rect = stage.getBoundingClientRect();
    return {
      width: Math.max(320, Math.floor(rect.width || stage.clientWidth || 900)),
      height: Math.max(320, Math.floor(rect.height || stage.clientHeight || 620)),
    };
  };
  let runtimeApi: GeoGebraApi | null = null;
  let resizeFrame: number | undefined;
  let drawingCanvasObserved = false;
  let disposed = false;

  const refreshRuntimeViews = () => {
    if (!runtimeApi) return;
    try {
      const recalculateEnvironments = runtimeApi.recalculateEnvironments;
      if (typeof recalculateEnvironments === "function") recalculateEnvironments.call(runtimeApi);
    } catch (caughtError) {
      console.error("[ERROR] Failed to recalculate GeoGebra environments after resize", caughtError);
    }
    try {
      const refreshViews = runtimeApi.refreshViews;
      if (typeof refreshViews === "function") refreshViews.call(runtimeApi);
    } catch (caughtError) {
      console.error("[ERROR] Failed to refresh GeoGebra views after resize", caughtError);
    }
  };

  /**
   * Resizing the applet takes more than setSize.
   *
   * deployggb wraps the applet in `.applet_scaler` and fits it with a CSS
   * transform, so on its own setSize leaves the drawing scaled inside a box
   * of the old shape rather than redrawn at the new one. The scaler is given
   * the real box and its transform cleared, `.appletParameters` is kept in
   * step so a reload starts at the current size, and only then does the
   * runtime get told.
   */
  const syncSize = () => {
    if (disposed) return;
    const { width, height } = initialSize();
    const root = options.container;
    root.style.display = "block";
    root.style.visibility = "visible";
    root.style.opacity = "1";
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    const scaler = root.querySelector<HTMLElement>(".applet_scaler");
    if (scaler) {
      scaler.style.display = "block";
      scaler.style.visibility = "visible";
      scaler.style.opacity = "1";
      scaler.style.width = `${width}px`;
      scaler.style.height = `${height}px`;
      scaler.style.transform = "none";
    }
    // GeoGebra's renderer owns an inner frame beneath the scaler.  In the
    // standalone Tauri shell it can retain the bootstrap dimensions (or zero
    // dimensions when the host mounted during a layout pass), leaving a live
    // API with a completely blank visual surface. Keep the frame tied to the
    // host box, but leave its internal canvases to GeoGebra: their CSS size is
    // DPR-aware and overriding it makes the drawing render at half size on
    // Retina displays.
    const frame = root.querySelector<HTMLElement>(".GeoGebraFrame");
    if (frame) {
      frame.style.display = "block";
      frame.style.visibility = "visible";
      frame.style.opacity = "1";
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      frame.style.position = "relative";
    }
    root.querySelectorAll<HTMLCanvasElement>("canvas").forEach((canvas) => {
      canvas.style.display = "block";
      canvas.style.visibility = "visible";
      canvas.style.opacity = "1";
    });
    const parameters = root.querySelector<HTMLElement>(".appletParameters");
    if (parameters) {
      parameters.setAttribute("data-param-width", String(width));
      parameters.setAttribute("data-param-height", String(height));
    }
    const setSize = runtimeApi?.setSize;
    if (typeof setSize === "function") {
      // Canvas insertion can happen after appletOnLoad without changing the
      // host dimensions. Always forward a scheduled lifecycle resize so that
      // the canvas-ready pass also forces GeoGebra to repaint.
      try {
        setSize.call(runtimeApi, width, height);
        refreshRuntimeViews();
      } catch (caughtError) {
        console.error("[ERROR] Failed to resize the GeoGebra runtime", caughtError);
      }
      return;
    }
    // Until the runtime API exists, deployggb's own resize() is all there is.
    try { applet.resize?.(); } catch (caughtError) { console.error("[ERROR] Caught exception at src/renderer-react/src/geogebra/ggbdeploy-wrapper.ts:208", caughtError); /* best effort during teardown */ }
  };

  // ResizeObserver also covers window drags and shell layout changes. Coalesce
  // its notifications to one frame so the applet only performs one layout for
  // the final size in that frame.
  const scheduleSyncSize = () => {
    if (disposed) return;
    if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = undefined;
      syncSize();
    });
  };
  const applet = new window.GGBApplet(5.0, {
    id,
    width: initialSize().width,
    height: initialSize().height,
    appName: "classic",
    // Start with the Graphics-only layout while keeping GeoGebra's Algebra
    // input field collapsed by default. Users can reopen it from the applet
    // controls when needed.
    perspective: "G",
    showToolBar: false,
    showToolBarHelp: false,
    showMenuBar: false,
    showAlgebraInput: false,
    algebraInputPosition: "algebra",
    // Use the shell-owned reset control so it stays reachable above the
    // canvas/panel overlays and can be positioned in the bottom-right corner.
    showResetIcon: false,
    enableLabelDrags: true,
    enableShiftDragZoom: true,
    enableRightClick: true,
    language: "zh-CN",
    borderColor: "#dfe7e2",
    appletOnLoad: (api: GeoGebraApi) => {
      if (disposed || !isActiveMount() || options.signal?.aborted) return;
      runtimeApi = api;
      const showToolBar = api.showToolBar;
      const setPerspective = api.setPerspective;
      try { if (typeof showToolBar === "function") showToolBar.call(api, false); } catch (caughtError) { console.error("[ERROR] Caught exception at src/renderer-react/src/geogebra/ggbdeploy-wrapper.ts:279", caughtError); /* initial parameters already hide it */ }
      try {
        // This standalone frontend uses the patched applet API directly. The
        // extension-only switchThroughSubApp bridge must not be used here.
        if (typeof setPerspective === "function") setPerspective.call(api, "G");
      } catch (caughtError) { console.error("[ERROR] Caught exception at src/renderer-react/src/geogebra/ggbdeploy-wrapper.ts:284", caughtError); /* perspective: G remains the initialization fallback */ }
      options.onReady(api);
      scheduleSyncSize();
    },
  });
  throwIfMountCancelled(options.signal, isActiveMount);
  pinGeoGebraModuleBase(codebase);
  applet.setHTML5Codebase(codebase);
  throwIfMountCancelled(options.signal, isActiveMount);
  applet.inject(options.container, "html5", true);
  // Observe the stage. Observing the host would feed syncSize its own writes.
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSyncSize);
  resizeObserver?.observe(options.container.parentElement ?? options.container);
  // On a cold GWT load, GeoGebra can append `.GeoGebraFrame` before its actual
  // drawing canvas exists. Do not treat the frame as readiness: wait for the
  // canvas insertion, then run one deterministic sizing/repaint pass.
  const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
    if (!drawingCanvasObserved && options.container.querySelector(".GeoGebraFrame canvas")) {
      drawingCanvasObserved = true;
      scheduleSyncSize();
    }
  });
  mutationObserver?.observe(options.container, { childList: true, subtree: true });
  syncSize();

  return {
    applet,
    dispose() {
      disposed = true;
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      runtimeApi = null;
      if (!isActiveMount()) return;
      activeMounts.delete(options.container);
      try { applet.removeExistingApplet?.(options.container, false); } catch (caughtError) { console.error("[ERROR] Caught exception at src/renderer-react/src/geogebra/ggbdeploy-wrapper.ts:323", caughtError); /* best effort */ }
      options.container.replaceChildren();
    },
  };
}

function throwIfMountCancelled(signal: AbortSignal | undefined, isActiveMount: () => boolean) {
  if (!signal?.aborted && isActiveMount()) return;
  const error = new Error("GeoGebra mount cancelled.");
  error.name = "AbortError";
  throw error;
}
