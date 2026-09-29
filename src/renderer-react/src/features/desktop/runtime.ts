import type { RuntimeInfo } from "@geochat-ai/app/desktop-contracts";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { desktopLogger } from "./desktopLogger";

const logger = createStructuredLogger("desktop.runtime");

/**
 * Where the backend actually is.
 *
 * The shell starts its own Bun backend and picks the port at launch, then
 * reports it through getRuntimeInfo along with the token that backend expects.
 * This renderer had two hardcoded guesses instead — VITE_API_ORIGIN defaulting
 * to localhost:8787 for the agent runs, and 127.0.0.1:17365 for the GeoGebra
 * assets — and neither is the shell's answer. Nothing listens on 8787, so every
 * agent run failed to connect.
 *
 * Bootstrap resolves it once before the coordinator mounts.
 */
let runtime: RuntimeInfo | null = null;
let loadError: string | null = null;

export async function loadDesktopRuntime() {
  const api = window.geochatDesktop;
  if (!api) return null;
  try {
    runtime = await api.getRuntimeInfo();
    loadError = null;
    logger.info("runtime_loaded", "DESKTOP_RUNTIME_LOADED");
    logger.debug("backend_origin_resolved", "DESKTOP_BACKEND_ORIGIN_RESOLVED", { origin: new URL(runtime.backendBaseUrl).origin });
  } catch (error) {
    logger.error("runtime_load_failed", "DESKTOP_RUNTIME_LOAD_FAILED", { error });
    runtime = null;
    loadError = error instanceof Error ? error.message : String(error);
  }
  return runtime;
}

export function desktopRuntime() {
  return runtime;
}

/**
 * This must not fail quietly. The fallback below is a guess at a port the
 * shell scans from, and an unrelated backend left running on that port will
 * answer it — so a broken bridge looks exactly like a working app until a
 * request lands somewhere unexpected. The caller surfaces this instead.
 */
export function desktopRuntimeError() {
  return loadError;
}

/** The shell's backend when running inside it; the dev fallback otherwise. */
export function backendOrigin() {
  const reported = runtime?.backendBaseUrl?.trim();
  // The shell scans upward from this port for a free one, so it is only ever
  // correct by luck. It exists for `bun run react:dev` in a plain browser.
  const fallback = import.meta.env.VITE_API_ORIGIN ?? "http://127.0.0.1:17365";
  try {
    const origin = new URL(reported || fallback).origin;
    desktopLogger.trace(`Using backend origin ${origin}`);
    return origin;
  } catch (caughtError) {
    logger.warn("backend_url_invalid", "DESKTOP_BACKEND_URL_INVALID", { error: caughtError });
    const fallbackOrigin = new URL(fallback).origin;
    logger.warn("backend_origin_fallback", "DESKTOP_BACKEND_ORIGIN_FALLBACK", { fallbackOrigin });
    return fallbackOrigin;
  }
}

/**
 * The shared token the local backend accepts. Absent outside the shell, which
 * is correct: a browser-only dev run talks to a backend started without one.
 */
export function backendAuthToken() {
  const token = runtime?.backendAuth.status === "authorized"
    ? runtime.backendAuth.token.trim()
    : undefined;
  return token ? token : null;
}
