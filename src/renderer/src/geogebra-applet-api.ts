import { normalizeGeoGebraPerspectiveMode } from "@geochat-ai/app";
import { canvasHasThreeDimensionalObjects, canvasObjectNames } from "./geogebra-canvas-context";
import type { GgbAppletApi, GgbAppletInstance, GeoGebraCommandResult } from "./geogebra-types";

export function hasCommandApi(api?: GgbAppletApi) {
  return Boolean(api?.asyncEvalCommandResult || api?.evalCommandResult || api?.evalCommand);
}

export function isAppletApi(value: unknown): value is GgbAppletApi {
  if (!value || typeof value !== "object") return false;
  const api = value as GgbAppletApi;
  return Boolean(api.getXML || api.evalCommand || api.evalCommandResult || api.asyncEvalCommandResult);
}

export function windowRecord() {
  return window as unknown as Window & Record<string, unknown>;
}

export function cleanupAppletGlobals(apiIdPrefix: string) {
  const globals = windowRecord();
  for (const key of Object.keys(globals)) {
    if (key !== apiIdPrefix && !key.startsWith(`${apiIdPrefix}_`)) continue;
    const candidate = globals[key] as GgbAppletInstance | undefined;
    try {
      candidate?.remove?.();
    } catch {
      // GeoGebra cleanup is best-effort; a stale global should not block remounting.
    }
    try {
      delete globals[key];
    } catch {
      globals[key] = undefined;
    }
  }
}

export function maybeCall(api: GgbAppletApi, method: keyof GgbAppletApi, args: unknown[]) {
  const fn = api[method];
  if (typeof fn !== "function") return false;
  try {
    (fn as (...args: unknown[]) => unknown)(...args);
    return true;
  } catch {
    return false;
  }
}

export function configureDefaultView(api: GgbAppletApi, perspective?: string | null) {
  const normalizedPerspective = normalizeGeoGebraPerspectiveMode(perspective);
  const mode = normalizedPerspective?.code ?? "G";
  const is3d = mode === "T";
  maybeCall(api, "setPerspective", [mode]);
  maybeCall(api, "setViewVisible", ["A", false]);
  if (is3d) {
    maybeCall(api, "setViewVisible", ["D", true]);
  } else {
    maybeCall(api, "setViewVisible", ["G", true]);
    maybeCall(api, "setViewVisible", ["D", true]);
  }
  if (!maybeCall(api, "setAxesVisible", [3, true, true, true])) maybeCall(api, "setAxesVisible", [true, true]);
  if (!maybeCall(api, "setGridVisible", [3, true])) maybeCall(api, "setGridVisible", [true]);
  if (!maybeCall(api, "setCoordSystem", [-2, 6, -2, 6, -2, 6, false])) {
    maybeCall(api, "setCoordSystem", [-2, 6, -2, 6]);
  }
}

export async function resolveAppletApi(
  candidate: unknown,
  applet: GgbAppletInstance | undefined,
  apiId: string,
  options: { readyTimeoutMs: number; pollIntervalMs: number }
) {
  const globals = windowRecord();
  const attempts = Math.ceil(options.readyTimeoutMs / options.pollIntervalMs);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidates = [
      candidate,
      typeof candidate === "string" ? globals[candidate] : undefined,
      globals[apiId],
      applet?.getAppletObject?.()
    ];
    for (const item of candidates) {
      if (isAppletApi(item) && hasCommandApi(item)) return item;
    }
    await wait(options.pollIntervalMs);
  }
  return undefined;
}

export function normalizeCommandResult(command: string, payload: unknown, method: string): GeoGebraCommandResult {
  const parsed = typeof payload === "string" && payload.trim().startsWith("{") ? tryParseJson(payload) : payload;
  if (parsed && typeof parsed === "object" && "ok" in parsed) {
    const value = parsed as { ok?: boolean; result?: unknown; labels?: unknown; error?: unknown };
    const success = value.ok === true;
    const error = value.error == null || value.error === "" ? null : String(value.error);
    return {
      command,
      success,
      label: value.labels == null ? String(value.result ?? "") : String(value.labels),
      error: success ? null : error || String(value.result ?? `${method} failed`),
      lastError: success ? null : error || String(value.result ?? `${method} failed`)
    };
  }
  const success = payload !== false;
  return {
    command,
    success,
    label: payload == null || typeof payload === "boolean" ? "" : String(payload),
    error: success ? null : "GeoGebra command failed",
    lastError: success ? null : "GeoGebra command failed"
  };
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export async function evaluateCommand(api: GgbAppletApi, command: string) {
  if (typeof api.asyncEvalCommandResult === "function") {
    try {
      return normalizeCommandResult(command, await api.asyncEvalCommandResult(command), "asyncEvalCommandResult");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { command, success: false, label: "", error: message, lastError: message };
    }
  }
  if (typeof api.evalCommandResult === "function") {
    try {
      return normalizeCommandResult(command, api.evalCommandResult(command), "evalCommandResult");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { command, success: false, label: "", error: message, lastError: message };
    }
  }
  if (typeof api.evalCommand === "function") {
    try {
      return normalizeCommandResult(command, api.evalCommand(command), "evalCommand");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { command, success: false, label: "", error: message, lastError: message };
    }
  }
  return {
    command,
    success: false,
    label: "",
    error: "GeoGebra command API is unavailable",
    lastError: "GeoGebra command API is unavailable"
  };
}

export async function clearCanvasConstruction(api: GgbAppletApi, canvasBefore: unknown) {
  const labels = [...canvasObjectNames(canvasBefore)].reverse();
  let deleted = 0;
  let failed = 0;
  for (const label of labels) {
    let success = false;
    if (typeof api.deleteObject === "function") {
      try {
        api.deleteObject(label);
        success = true;
      } catch {
        success = false;
      }
    }
    if (!success && /^[A-Za-z][A-Za-z0-9_]*$/.test(label)) {
      const result = await evaluateCommand(api, `Delete(${label})`);
      success = result.success;
    }
    if (success) {
      deleted += 1;
    } else {
      failed += 1;
    }
  }
  if (labels.length) await wait(50);
  currentApiReset(api);
  return {
    method: labels.length ? "delete-objects-reset" : "reset",
    objectCount: labels.length,
    deleted,
    failed,
    hadThreeDimensionalObjects: canvasHasThreeDimensionalObjects(canvasBefore)
  };
}

function currentApiReset(api: GgbAppletApi) {
  try {
    api.reset?.();
  } catch {
    // Object deletion above is the important part for stale 3D WebGL geometry.
  }
}

export function executionDiagnostics(results: GeoGebraCommandResult[]) {
  const failedIndex = results.findIndex((result) => !result.success);
  const successfulBeforeFailure = failedIndex >= 0 ? results.slice(0, failedIndex) : results;
  return {
    failedCommandIndex: failedIndex >= 0 ? failedIndex + 1 : null,
    failedCommand: failedIndex >= 0 ? (results[failedIndex]?.command ?? null) : null,
    lastCompletedCommand: [...successfulBeforeFailure].reverse().find((result) => result.success)?.command ?? null
  };
}

export function pngByteEstimate(base64: string) {
  const normalized = base64.includes(",") ? base64.split(",").pop() || "" : base64;
  return Math.floor((normalized.length * 3) / 4);
}

export function readGgbBase64(api: GgbAppletApi) {
  const getBase64 = api.getBase64;
  if (typeof getBase64 !== "function") throw new Error("The current GeoGebra applet cannot export ggb files.");
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("GGB export timed out."));
    }, 10000);
    const finish = (value: unknown) => {
      if (settled || typeof value !== "string" || !value.trim()) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(value);
    };
    try {
      const result = getBase64((value: unknown) => finish(value));
      finish(result);
    } catch (error) {
      settled = true;
      window.clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function base64ToBlob(base64: string, type = "application/vnd.geogebra.file") {
  const normalized = base64.includes(",") ? base64.split(",").pop() || "" : base64;
  const binary = window.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
