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
let deployPromise: Promise<void> | undefined;
let stylesheetPromise: Promise<void> | undefined;

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
  if (document.getElementById(GEOGEBRA_STYLESHEET)) return Promise.resolve();
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

export async function mountGeoGebra(options: {
  container: HTMLElement;
  /** Base URL of the local backend, which serves vendor/geogebra. */
  backendBaseUrl: string;
  onReady: (api: GeoGebraApi) => void;
}) {
  // The desktop app serves one vendored GeoGebra runtime from its own backend,
  // so there is no version path and no original/patched split — the web build
  // needed those because it fetched releases from a hosted origin.
  const origin = options.backendBaseUrl.replace(/\/$/, "");
  const assetBase = `${origin}/tools/geogebra-assets-v2`;
  const codebase = `${assetBase}/HTML5/5.0/web3d/`;
  await loadGeoGebraStylesheet(`${codebase}css/bundles/bundle.css`);
  await loadDeployScript(`${assetBase}/deployggb.js`);
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
  let disposed = false;

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
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    const scaler = root.querySelector<HTMLElement>(".applet_scaler");
    if (scaler) {
      scaler.style.width = `${width}px`;
      scaler.style.height = `${height}px`;
      scaler.style.transform = "none";
    }
    const parameters = root.querySelector<HTMLElement>(".appletParameters");
    if (parameters) {
      parameters.setAttribute("data-param-width", String(width));
      parameters.setAttribute("data-param-height", String(height));
    }
    const setSize = runtimeApi?.setSize;
    if (typeof setSize === "function") {
      // A throw here needs no bookkeeping: the next observer or window event
      // recomputes from the stage, which is always the current truth.
      try { setSize.call(runtimeApi, width, height); } catch { /* retried on the next event */ }
      return;
    }
    // Until the runtime API exists, deployggb's own resize() is all there is.
    try { applet.resize?.(); } catch { /* best effort during teardown */ }
  };

  // A window drag fires resize continuously; coalescing to one frame keeps the
  // applet from re-laying out dozens of times per second.
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
    perspective: "G",
    showToolBar: false,
    showToolBarHelp: false,
    showMenuBar: false,
    showAlgebraInput: false,
    showResetIcon: true,
    enableLabelDrags: true,
    enableShiftDragZoom: true,
    enableRightClick: true,
    language: "zh-CN",
    borderColor: "#dfe7e2",
    appletOnLoad: (api: GeoGebraApi) => {
      if (disposed) return;
      runtimeApi = api;
      const showToolBar = api.showToolBar;
      const showAlgebraInput = api.showAlgebraInput;
      const setPerspective = api.setPerspective;
      try { if (typeof showToolBar === "function") showToolBar.call(api, false); } catch { /* initial parameters already hide it */ }
      try { if (typeof showAlgebraInput === "function") showAlgebraInput.call(api, false); } catch { /* initial parameters already hide it */ }
      try {
        // This standalone frontend uses the patched applet API directly. The
        // extension-only switchThroughSubApp bridge must not be used here.
        if (typeof setPerspective === "function") setPerspective.call(api, "G");
      } catch { /* perspective: G remains the initialization fallback */ }
      options.onReady(api);
      syncSize();
    },
  });
  applet.setHTML5Codebase(codebase);
  applet.inject(options.container, "html5", true);
  // Observe the stage. Observing the host would feed syncSize its own writes.
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSyncSize);
  resizeObserver?.observe(options.container.parentElement ?? options.container);
  window.addEventListener("resize", scheduleSyncSize);
  syncSize();

  return {
    applet,
    dispose() {
      disposed = true;
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSyncSize);
      runtimeApi = null;
      try { applet.removeExistingApplet?.(options.container, false); } catch { /* best effort */ }
      options.container.replaceChildren();
    },
  };
}
