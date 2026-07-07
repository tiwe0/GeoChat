import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { type RuntimeInfo } from "@geochat-ai/app";
import { rendererI18n, type Locale } from "./i18n";
import {
  base64ToBlob,
  cleanupAppletGlobals,
  configureDefaultView,
  readGgbBase64,
  resolveAppletApi,
  windowRecord
} from "./geogebra-applet-api";
import { canvasSummary } from "./geogebra-canvas-context";
import {
  executeGeoGebraCommand,
  executeGeoGebraCommands,
  getGeoGebraPNGBase64,
  resetGeoGebra,
  setGeoGebraPerspective,
  type GeoGebraExecutionRuntime
} from "./geogebra-execution";
import {
  ensureGeoGebraBaseMeta,
  isGeoGebraLoadResourceUrl,
  loadScript,
  probeAsset,
  readAppletContainerSize,
  resourceUrlFromTarget,
  wait,
  waitForAppletHost,
  waitForDocumentReady
} from "./geogebra-loader";
import type {
  CanvasSummary,
  ExecuteGeoGebraOptions,
  GgbAppletApi,
  GgbAppletInstance,
  GgbEvent,
  GeoGebraCommandResult,
  GeoGebraExecutionPayload,
  GeoGebraLoadMessage,
  GeoGebraPngBase64Options,
  GeoGebraPngBase64Payload,
  GeoGebraResetPayload
} from "./geogebra-types";

export type {
  CanvasObjectSummary,
  CanvasSummary,
  ExecuteGeoGebraOptions,
  GeoGebraCommandResult,
  GeoGebraExecutionPayload,
  GeoGebraLoadMessage,
  GeoGebraPngBase64Options,
  GeoGebraPngBase64Payload,
  GeoGebraResetPayload
} from "./geogebra-types";

const appletReadyTimeoutMs = 75_000;
const appletApiPollIntervalMs = 250;
const maxAutoRemounts = 3;

export function createGeoGebraController(runtime: () => RuntimeInfo | undefined, locale: () => Locale = () => "zh-CN") {
  const [container, setContainer] = createSignal<HTMLDivElement>();
  const [api, setApi] = createSignal<GgbAppletApi>();
  const [isReady, setIsReady] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [loadMessages, setLoadMessages] = createSignal<GeoGebraLoadMessage[]>([]);
  const [lastResults, setLastResults] = createSignal<GeoGebraCommandResult[]>([]);
  const [selectedObjects, setSelectedObjects] = createSignal<string[]>([]);
  let mountRunId = 0;
  const appletId = "geochat_desktop_ggb";
  const boardId = "default";
  const containerId = "geochat-desktop-geogebra";
  const assetBase = createMemo(() => `${runtime()?.backendBaseUrl ?? "http://127.0.0.1:17365"}/tools/geogebra-assets-v2`);
  const codebase = createMemo(() => `${assetBase()}/HTML5/5.0/web3d/`);
  const copy = createMemo(() => rendererI18n(locale()));
  const appletLanguage = createMemo(() => (locale() === "en-US" ? "en" : "zh-CN"));
  let resizeFrame: number | undefined;
  let autoRemounts = 0;
  let pendingMountKey = "";
  let activeMountKey = "";

  function mountKey(root = container(), info = runtime()) {
    if (!root || !info) return "";
    return `${info.backendBaseUrl}|${containerId}|${appletLanguage()}`;
  }

  function updateSelectedObjects(event: GgbEvent) {
    const label = event.target ?? event.argument ?? event.arguement;
    if (!label) return;
    const type = String(event.type ?? "").toLowerCase();
    if (type.includes("deselect") || type.includes("delete")) {
      setSelectedObjects((current) => current.filter((item) => item !== label));
      return;
    }
    if (type.includes("select")) {
      setSelectedObjects((current) => (current.includes(label) ? current : [...current, label]));
    }
  }

  function currentCanvasContext(includeXml = false): CanvasSummary | { ready: false; source: "geogebra-applet"; error: string } {
    const currentApi = api();
    if (!currentApi?.getXML) {
      return { ready: false, source: "geogebra-applet", error: "GeoGebra applet is not ready" };
    }
    try {
      return canvasSummary(currentApi.getXML(), selectedObjects(), includeXml);
    } catch (error) {
      return {
        ready: false,
        source: "geogebra-applet",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async function mountApplet(expectedMountKey: string) {
    const root = container();
    if (!root || isLoading() || mountKey(root) !== expectedMountKey) return;
    await waitForDocumentReady();
    if (root !== container() || mountKey(root) !== expectedMountKey) return;
    const hostReady = await waitForAppletHost(root, containerId);
    if (root !== container() || mountKey(root) !== expectedMountKey) return;
    if (!hostReady) {
      pendingMountKey = "";
      setLoadError("GeoGebra applet host was not attached to the DOM before loading.");
      return;
    }
    if (isLoading()) return;
    const runId = ++mountRunId;
    setIsLoading(true);
    setLoadError(null);
    setIsReady(false);
    setApi(undefined);
    setSelectedObjects([]);
    setLastResults([]);
    setLoadMessages([
      { label: "deployggb.js", status: "checking", detail: `${assetBase()}/deployggb.js` },
      { label: "web3d.nocache.js", status: "checking", detail: `${codebase()}web3d.nocache.js` }
    ]);
    cleanupAppletGlobals(appletId);
    root.innerHTML = "";

    ensureGeoGebraBaseMeta(codebase());
    void Promise.all([probeAsset("deployggb.js", `${assetBase()}/deployggb.js`), probeAsset("web3d.nocache.js", `${codebase()}web3d.nocache.js`)]).then(
      (messages) => {
        if (runId === mountRunId) setLoadMessages(messages);
      }
    );

    const failLoad = (message: string, retryable = false) => {
      if (runId !== mountRunId || isReady()) return;
      setLoadError(message);
      setIsLoading(false);
      pendingMountKey = "";
      activeMountKey = "";
      window.clearTimeout(timeoutId);
      cleanupLoadWatchers();
      if (retryable && autoRemounts < maxAutoRemounts) {
        autoRemounts += 1;
        const retryDelayMs = 800 * autoRemounts;
        window.setTimeout(() => {
          if (runId === mountRunId && !isReady()) {
            pendingMountKey = expectedMountKey;
            void mountApplet(expectedMountKey);
          }
        }, retryDelayMs);
      }
    };
    const onResourceError = (event: Event) => {
      const url = resourceUrlFromTarget(event.target);
      if (isGeoGebraLoadResourceUrl(url, assetBase())) {
        failLoad(`GeoGebra resource failed: ${url}`, true);
      }
    };
    const onRuntimeError = (event: ErrorEvent) => {
      const message = event.message || event.error?.message || "";
      const filename = event.filename || "";
      if (`${message} ${filename}`.match(/GeoGebra|GGB|GWT|web3d|cache\.js|nocache/i)) {
        failLoad(`${message || "GeoGebra runtime error"}${filename ? ` (${filename})` : ""}`);
      }
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
      if (reason.match(/GeoGebra|GGB|GWT|web3d|cache\.js|nocache/i)) failLoad(reason);
    };
    window.addEventListener("error", onResourceError, true);
    window.addEventListener("error", onRuntimeError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    const cleanupLoadWatchers = () => {
      window.removeEventListener("error", onResourceError, true);
      window.removeEventListener("error", onRuntimeError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
    const timeoutId = window.setTimeout(() => {
      const knownApiKeys = Object.keys(windowRecord())
        .filter((key) => key === appletId || key.startsWith(`${appletId}_`))
        .join(", ");
      failLoad(`GeoGebra applet did not become ready in ${Math.round(appletReadyTimeoutMs / 1000)}s. codebase=${codebase()}${knownApiKeys ? ` globals=${knownApiKeys}` : ""}`, true);
    }, appletReadyTimeoutMs);

    try {
      await loadScript(`${assetBase()}/deployggb.js`);
      if (!window.GGBApplet) throw new Error("GGBApplet constructor is unavailable.");
      const size = readAppletContainerSize(root);
      const apiId = `${appletId}_${runId}`;
      let applet: GgbAppletInstance | undefined;
      let readySettled = false;
      const finishReady = async (loadedApiOrId?: unknown) => {
        if (readySettled || runId !== mountRunId) return;
        const nextApi = await resolveAppletApi(loadedApiOrId, applet, apiId, {
          readyTimeoutMs: appletReadyTimeoutMs,
          pollIntervalMs: appletApiPollIntervalMs
        });
        if (readySettled || runId !== mountRunId) return;
        if (!nextApi) throw new Error("GeoGebra applet loaded, but command API is unavailable.");
        readySettled = true;
        autoRemounts = 0;
        pendingMountKey = "";
        activeMountKey = expectedMountKey;
        setApi(nextApi);
        nextApi.registerClientListener?.(updateSelectedObjects);
        configureDefaultView(nextApi);
        resizeToContainer();
        setIsReady(true);
        setIsLoading(false);
        window.clearTimeout(timeoutId);
        cleanupLoadWatchers();
      };
      applet = new window.GGBApplet(
        {
          id: apiId,
          appName: "classic",
          width: size.width,
          height: size.height,
          showToolBar: false,
          showAlgebraInput: true,
          showAlgebraView: false,
          showGraphicsView: true,
          showGraphicsView3D: true,
          perspective: "G",
          showMenuBar: false,
          enableLabelDrags: false,
          enableShiftDragZoom: true,
          enableRightClick: true,
          enable3d: true,
          enableUndoRedo: true,
          errorDialogsActive: false,
          showResetIcon: false,
          useBrowserForJS: false,
          allowStyleBar: false,
          disableAutoScale: true,
          preventFocus: false,
          language: appletLanguage(),
          appletOnLoad: (loadedApiOrId: unknown) => {
            void finishReady(loadedApiOrId).catch((error) => {
              failLoad(error instanceof Error ? error.message : String(error), true);
            });
          }
        },
        true
      );
      applet.setHTML5Codebase?.(codebase(), true);
      applet.inject(root);
      void finishReady().catch(() => {
        if (runId !== mountRunId || readySettled) return;
        failLoad(`GeoGebra applet loaded, but command API was unavailable after ${Math.round(appletReadyTimeoutMs / 1000)}s. codebase=${codebase()}`, true);
      });
    } catch (error) {
      pendingMountKey = "";
      activeMountKey = "";
      setLoadError(error instanceof Error ? error.message : String(error));
      setIsLoading(false);
      window.clearTimeout(timeoutId);
      cleanupLoadWatchers();
    }
  }

  function resizeToContainer() {
    const root = container();
    const currentApi = api();
    if (!root) return;
    const size = readAppletContainerSize(root);
    root.style.width = `${size.width}px`;
    root.style.height = `${size.height}px`;
    const scaler = root.querySelector<HTMLElement>(".applet_scaler");
    scaler?.style.setProperty("width", `${size.width}px`);
    scaler?.style.setProperty("height", `${size.height}px`);
    scaler?.style.setProperty("transform", "none");
    const parameters = root.querySelector<HTMLElement>(".appletParameters");
    parameters?.setAttribute("data-param-width", String(size.width));
    parameters?.setAttribute("data-param-height", String(size.height));
    currentApi?.setSize?.(size.width, size.height);
  }

  function scheduleResizeToContainer() {
    if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = undefined;
      resizeToContainer();
    });
  }

  createEffect(() => {
    const info = runtime();
    const root = container();
    if (!info || !root) return;
    const key = mountKey(root, info);
    if (!key) return;
    const alreadyScheduled = untrack(() => pendingMountKey === key || (activeMountKey === key && (isLoading() || isReady())));
    if (alreadyScheduled) return;
    pendingMountKey = key;
    untrack(() => void mountApplet(key));
  });

  createEffect(() => {
    const root = container();
    if (!root) return;
    const observer = new ResizeObserver(() => scheduleResizeToContainer());
    const onWindowResize = () => scheduleResizeToContainer();
    observer.observe(root.parentElement ?? root);
    window.addEventListener("resize", onWindowResize);
    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener("resize", onWindowResize);
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
    });
  });

  function rebuild() {
    const key = mountKey();
    if (!key) return Promise.resolve();
    pendingMountKey = key;
    return mountApplet(key);
  }

  async function ensureReadyApi() {
    let currentApi = api();
    if (currentApi && isReady()) return { api: currentApi, error: null as string | null };
    await rebuild();
    currentApi = api();
    if (currentApi && isReady()) return { api: currentApi, error: null as string | null };
    return { api: undefined, error: loadError() || "GeoGebra applet is not ready." };
  }

  function executionRuntime(): GeoGebraExecutionRuntime {
    return {
      boardId,
      getApi: api,
      isReady,
      ensureReadyApi,
      readCanvasContext: currentCanvasContext,
      selectedObjects,
      setSelectedObjects,
      setLastResults,
      scheduleResizeToContainer,
      pngUnsupportedMessage: () => copy().geogebra.pngUnsupported,
      pngEmptyMessage: () => copy().geogebra.pngEmpty,
      viewport: () => ({ width: window.innerWidth, height: window.innerHeight })
    };
  }

  function setPerspective(mode: string | null | undefined) {
    return setGeoGebraPerspective(executionRuntime(), mode);
  }

  function executeCommand(command: string, includeCanvas = true): Promise<GeoGebraCommandResult> {
    return executeGeoGebraCommand(executionRuntime(), command, includeCanvas);
  }

  function executeCommands(commands: string[], options: ExecuteGeoGebraOptions = {}): Promise<GeoGebraExecutionPayload> {
    return executeGeoGebraCommands(executionRuntime(), commands, options);
  }

  function reset(perspective?: string | null): Promise<GeoGebraResetPayload> {
    return resetGeoGebra(executionRuntime(), perspective);
  }

  async function getPNGBase64(options: GeoGebraPngBase64Options = {}): Promise<GeoGebraPngBase64Payload> {
    return getGeoGebraPNGBase64(executionRuntime(), options);
  }

  function exportTimestamp() {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function downloadBase64File(base64: string, filename: string, type: string) {
    const url = URL.createObjectURL(base64ToBlob(base64, type));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  }

  async function downloadGgb() {
    const currentApi = api();
    if (!currentApi) throw new Error("GeoGebra applet is not ready.");
    const base64 = await readGgbBase64(currentApi);
    return downloadBase64File(base64, `geochat-desktop-${exportTimestamp()}.ggb`, "application/vnd.geogebra.file");
  }

  async function downloadPng() {
    const payload = await getPNGBase64({ exportScale: 1, transparent: false });
    if (!payload.ok || !payload.base64) throw new Error(copy().geogebra.pngEmpty);
    return downloadBase64File(payload.base64, `geochat-desktop-${exportTimestamp()}.png`, payload.mediaType);
  }

  async function exportCanvas() {
    try {
      return { format: "ggb" as const, filename: await downloadGgb(), fallbackReason: null as string | null };
    } catch (error) {
      return {
        format: "png" as const,
        filename: await downloadPng(),
        fallbackReason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function getCanvasXml() {
    return api()?.getXML?.() ?? "";
  }

  return {
    containerId,
    setContainer,
    isReady,
    isLoading,
    loadError,
    loadMessages,
    assetBase,
    codebase,
    lastResults,
    selectedObjects,
    setPerspective,
    executeCommand,
    executeCommands,
    reset,
    rebuild,
    downloadGgb,
    exportCanvas,
    getPNGBase64,
    getCanvasContext: currentCanvasContext,
    getCanvasXml
  };
}
