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
  apiOrigin: string;
  version: string;
  onReady: (api: GeoGebraApi) => void;
}) {
  const origin = options.apiOrigin.replace(/\/$/, "");
  const resourceRoot = `${origin}/api/geogebra/resources`;
  const versionPath = encodeURIComponent(options.version);
  // The GWT permutation contains SVG markup but not the layout/reset rules for
  // toolbar and view chrome. Keep the exact release stylesheet alongside the
  // patched runtime so standalone Web rendering matches the extension host.
  await loadGeoGebraStylesheet(`${resourceRoot}/patched/${versionPath}/css/bundles/bundle.css`);
  await loadDeployScript(`${resourceRoot}/original/${versionPath}/deployggb.js`);
  if (!window.GGBApplet) throw new Error("GeoGebra deployggb.js 未就绪。");

  const id = options.container.id || "geogebra-applet";
  options.container.id = id;
  const initialSize = () => {
    const rect = options.container.getBoundingClientRect();
    return {
      width: Math.max(320, Math.floor(rect.width || options.container.clientWidth || 900)),
      height: Math.max(320, Math.floor(rect.height || options.container.clientHeight || 620)),
    };
  };
  let runtimeApi: GeoGebraApi | null = null;
  let lastSize = "";
  let disposed = false;
  const syncSize = () => {
    if (disposed) return;
    const { width, height } = initialSize();
    const sizeKey = `${width}x${height}`;
    if (sizeKey === lastSize) return;
    const setSize = runtimeApi?.setSize;
    if (typeof setSize === "function") {
      try {
        setSize.call(runtimeApi, width, height);
        lastSize = sizeKey;
      } catch {
        // Keep the key dirty so a later observer/window event retries after
        // the runtime finishes booting.
      }
    } else {
      // deployggb.js exposes resize() for its responsive scaler. Use it until
      // the patched applet API is ready, then switch to the exact setSize API.
      try { applet.resize?.(); } catch { /* best effort during teardown */ }
      lastSize = sizeKey;
    }
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
      lastSize = "";
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
  applet.setHTML5Codebase(`${resourceRoot}/patched/${versionPath}/web3d/`);
  applet.inject(options.container, "html5", true);
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncSize);
  resizeObserver?.observe(options.container);
  window.addEventListener("resize", syncSize);
  syncSize();

  return {
    applet,
    dispose() {
      disposed = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncSize);
      runtimeApi = null;
      try { applet.removeExistingApplet?.(options.container, false); } catch { /* best effort */ }
      options.container.replaceChildren();
    },
  };
}
