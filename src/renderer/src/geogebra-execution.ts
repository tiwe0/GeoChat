import { normalizeGeoGebraFreeParameterCommands, normalizeGeoGebraPerspectiveMode } from "@geochat-ai/app";
import {
  clearCanvasConstruction,
  configureDefaultView,
  evaluateCommand,
  executionDiagnostics,
  pngByteEstimate
} from "./geogebra-applet-api";
import { canvasObjectNames, canvasSummary, canvasToml } from "./geogebra-canvas-context";
import { wait } from "./geogebra-loader";
import type {
  CanvasSummary,
  ExecuteGeoGebraOptions,
  GgbAppletApi,
  GeoGebraCommandResult,
  GeoGebraExecutionPayload,
  GeoGebraPngBase64Options,
  GeoGebraPngBase64Payload,
  GeoGebraResetPayload
} from "./geogebra-types";

export const commandExecutionIntervalMs = 80;

type CanvasUnavailable = { ready: false; source: "geogebra-applet"; error: string };
type CanvasContext = CanvasSummary | CanvasUnavailable;

type PerspectiveResult = {
  success: boolean;
  requestedMode?: string | null;
  mode: string | null | undefined;
  label?: string;
  kind?: string;
  error: string | null;
  method: string;
};

export type GeoGebraExecutionRuntime = {
  boardId: string;
  getApi: () => GgbAppletApi | undefined;
  isReady: () => boolean;
  ensureReadyApi: () => Promise<{ api?: GgbAppletApi; error: string | null }>;
  readCanvasContext: (includeXml?: boolean) => CanvasContext;
  selectedObjects: () => string[];
  setSelectedObjects: (objects: string[]) => void;
  setLastResults: (results: GeoGebraCommandResult[]) => void;
  scheduleResizeToContainer: () => void;
  pngUnsupportedMessage: () => string;
  pngEmptyMessage: () => string;
  viewport: () => { width: number; height: number };
};

export async function setGeoGebraPerspective(runtime: GeoGebraExecutionRuntime, mode: string | null | undefined): Promise<PerspectiveResult> {
  const normalizedMode = normalizeGeoGebraPerspectiveMode(mode);
  if (!normalizedMode) {
    return {
      success: false,
      requestedMode: mode ?? null,
      mode: null,
      error: "Unsupported GeoGebra perspective. Use codes such as G, AG, AGS, S/G, +D, -D, or T for 3D Graphics.",
      method: "none"
    };
  }
  const currentApi = runtime.getApi();
  if (!currentApi || !runtime.isReady()) {
    return { success: false, mode, error: "GeoGebra applet is not ready", method: "none" };
  }
  const safeMode = normalizedMode.code;
  let apiError = "";
  let apiResult: unknown = null;
  let apiAttempted = false;
  if (typeof currentApi.setPerspective === "function") {
    apiAttempted = true;
    try {
      apiResult = currentApi.setPerspective(safeMode);
    } catch (error) {
      apiError = error instanceof Error ? error.message : String(error);
    }
  }
  const apiSucceeded = apiAttempted && apiResult !== false && !apiError;
  let commandResult: GeoGebraCommandResult | undefined;
  if (!apiSucceeded) {
    commandResult = await evaluateCommand(currentApi, `SetPerspective("${safeMode.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`);
  }
  const success = apiSucceeded || commandResult?.success === true;
  if (success) {
    runtime.scheduleResizeToContainer();
  }
  return {
    success,
    requestedMode: mode,
    mode: safeMode,
    label: normalizedMode.label,
    kind: normalizedMode.kind,
    error: success ? null : commandResult?.error || apiError || "GeoGebra perspective change failed.",
    method: apiSucceeded ? "api.setPerspective" : apiAttempted ? "api.setPerspective->evalCommand" : "evalCommand"
  };
}

export async function executeGeoGebraCommand(runtime: GeoGebraExecutionRuntime, command: string, includeCanvas = true): Promise<GeoGebraCommandResult> {
  const commandStartedAt = performance.now();
  const currentApi = runtime.getApi();
  if (!currentApi || !runtime.isReady()) {
    const error = "GeoGebra applet is not ready.";
    return { command, success: false, label: "", error, lastError: error, durationMs: 0 };
  }
  const result = await evaluateCommand(currentApi, command);
  const shouldReadCanvas = includeCanvas || !result.success;
  const canvas = shouldReadCanvas && currentApi.getXML ? canvasSummary(currentApi.getXML(), runtime.selectedObjects()) : undefined;
  return {
    ...result,
    durationMs: Math.round(performance.now() - commandStartedAt),
    canvas,
    canvasToml: result.success && canvas ? canvasToml(canvas) : null
  };
}

export async function executeGeoGebraCommands(
  runtime: GeoGebraExecutionRuntime,
  commands: string[],
  options: ExecuteGeoGebraOptions = {}
): Promise<GeoGebraExecutionPayload> {
  const readyState = await runtime.ensureReadyApi();
  const currentApi = readyState.api;
  let filteredCommands = commands.map((item) => item.trim()).filter(Boolean);
  if (!currentApi) {
    const error = readyState.error || "GeoGebra applet is not ready.";
    const results = filteredCommands.map((command) => ({
      command,
      success: false,
      label: "",
      error,
      lastError: error
    }));
    const diagnostics = executionDiagnostics(results);
    return {
      ok: false,
      results,
      canvasContext: { ready: false, source: "geogebra-applet", error },
      canvasBefore: { ready: false, source: "geogebra-applet", error },
      canvasAfter: { ready: false, source: "geogebra-applet", error },
      clientMeta: { source: "geogebra-applet", boardId: runtime.boardId, ready: false, ...diagnostics },
      error,
      ...diagnostics
    };
  }
  if (options.restoreBeforeXml && typeof currentApi.setXML === "function") {
    currentApi.setXML(options.restoreBeforeXml);
    runtime.setSelectedObjects([]);
  }
  const canvasBefore = runtime.readCanvasContext();
  let savedXml = typeof currentApi.getXML === "function" ? currentApi.getXML() : null;
  let resetMeta: Awaited<ReturnType<typeof clearCanvasConstruction>> | null = null;
  if (options.resetBefore) {
    resetMeta = await clearCanvasConstruction(currentApi, canvasBefore);
    runtime.setSelectedObjects([]);
    configureDefaultView(currentApi, options.perspective);
    savedXml = typeof currentApi.getXML === "function" ? currentApi.getXML() : null;
  }
  if (options.normalizeFreeParameters) {
    filteredCommands = normalizeGeoGebraFreeParameterCommands(filteredCommands, {
      declaredNames: canvasObjectNames(runtime.readCanvasContext())
    });
  }
  const perspectiveResult = options.perspective
    ? await setGeoGebraPerspective(runtime, options.perspective)
    : { success: true, mode: null, error: null as string | null, method: "none" };
  const results: GeoGebraCommandResult[] = [];
  for (let index = 0; index < filteredCommands.length; index += 1) {
    const command = filteredCommands[index];
    const result = await executeGeoGebraCommand(runtime, command, index === filteredCommands.length - 1);
    results.push(result);
    if (!result.success) break;
    if (index < filteredCommands.length - 1) await wait(commandExecutionIntervalMs);
  }
  const failed = results.filter((result) => !result.success);
  const diagnostics = executionDiagnostics(results);
  let restoredAfterError = false;
  if (failed.length && options.restoreOnError && savedXml && typeof currentApi.setXML === "function") {
    currentApi.setXML(savedXml);
    runtime.setSelectedObjects([]);
    restoredAfterError = true;
  }
  const canvasContext = runtime.readCanvasContext();
  const perspectiveError = perspectiveResult.success ? null : perspectiveResult.error;
  const error = perspectiveError || failed[0]?.error || null;
  runtime.setLastResults(results);
  return {
    ok: !error && failed.length === 0,
    results,
    canvasContext,
    canvasBefore,
    canvasAfter: canvasContext,
    clientMeta: {
      source: "geogebra-applet",
      boardId: runtime.boardId,
      ready: true,
      perspective: options.perspective || null,
      perspectiveResult,
      restoreOnError: Boolean(options.restoreOnError),
      restoredAfterError,
      resetBefore: Boolean(options.resetBefore),
      resetMeta,
      commandDelayMs: filteredCommands.length > 1 ? commandExecutionIntervalMs : 0,
      ...diagnostics,
      viewport: runtime.viewport()
    },
    error,
    ...diagnostics
  };
}

export async function resetGeoGebra(runtime: GeoGebraExecutionRuntime, perspective?: string | null): Promise<GeoGebraResetPayload> {
  const readyState = await runtime.ensureReadyApi();
  const currentApi = readyState.api;
  if (!currentApi) {
    const error = readyState.error || "GeoGebra applet is not ready.";
    const canvasContext = { ready: false as const, source: "geogebra-applet" as const, error };
    return {
      ok: false,
      results: [],
      canvasContext,
      canvasBefore: canvasContext,
      canvasAfter: canvasContext,
      clientMeta: { source: "geogebra-applet", boardId: runtime.boardId, ready: false },
      error
    };
  }
  const canvasBefore = runtime.readCanvasContext();
  const resetMeta = await clearCanvasConstruction(currentApi, canvasBefore);
  runtime.setSelectedObjects([]);
  runtime.setLastResults([]);
  configureDefaultView(currentApi, perspective);
  const perspectiveResult = perspective ? await setGeoGebraPerspective(runtime, perspective) : { success: true, mode: null, error: null as string | null, method: "none" };
  runtime.scheduleResizeToContainer();
  const canvasContext = runtime.readCanvasContext();
  const error = perspectiveResult.success ? null : perspectiveResult.error;
  return {
    ok: !error,
    results: [],
    canvasContext,
    canvasBefore,
    canvasAfter: canvasContext,
    clientMeta: {
      source: "geogebra-applet",
      boardId: runtime.boardId,
      ready: true,
      perspective: perspective ?? null,
      perspectiveResult,
      resetMeta,
      viewport: runtime.viewport()
    },
    error
  };
}

export function getGeoGebraPNGBase64(
  runtime: GeoGebraExecutionRuntime,
  options: GeoGebraPngBase64Options = {}
): GeoGebraPngBase64Payload {
  const currentApi = runtime.getApi();
  if (!currentApi || !runtime.isReady()) throw new Error("GeoGebra applet is not ready.");
  const getPngBase64 = currentApi.getPNGBase64;
  if (typeof getPngBase64 !== "function") throw new Error(runtime.pngUnsupportedMessage());
  const exportScale =
    typeof options.exportScale === "number" && Number.isFinite(options.exportScale)
      ? Math.min(Math.max(options.exportScale, 0.25), 4)
      : 1;
  const transparent = typeof options.transparent === "boolean" ? options.transparent : true;
  const dpi = typeof options.dpi === "number" && Number.isFinite(options.dpi) ? Math.min(Math.max(options.dpi, 1), 600) : undefined;
  const raw = getPngBase64(exportScale, transparent, dpi);
  if (typeof raw !== "string" || !raw) throw new Error(runtime.pngEmptyMessage());
  const base64 = raw.includes(",") ? raw.split(",").pop() || "" : raw;
  return {
    ok: true,
    base64,
    mediaType: "image/png",
    exportScale,
    transparent,
    ...(dpi === undefined ? {} : { dpi }),
    byteEstimate: pngByteEstimate(base64),
    clientMeta: { source: "geogebra-applet", ready: true, boardId: runtime.boardId }
  };
}
