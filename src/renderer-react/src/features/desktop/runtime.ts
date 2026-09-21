import type { RuntimeInfo } from "@geochat-ai/app";
import { desktopLogger } from "./desktopLogger";

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
 * The value is resolved once during bootstrap, before the first render, so the
 * coordinator that captures it at mount captures the right one.
 */
let runtime: RuntimeInfo | null = null;
let loadError: string | null = null;

export async function loadDesktopRuntime() {
  const api = window.geochatDesktop;
  if (!api) return null;
  try {
    runtime = await api.getRuntimeInfo();
    loadError = null;
    console.info("[INFO] Desktop runtime information loaded");
    console.debug(`[DEBUG] Desktop backend origin resolved to ${new URL(runtime.backendBaseUrl).origin}`);
  } catch (error) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/features/desktop/runtime.ts:25", error);
    runtime = null;
    loadError = error instanceof Error ? error.message : String(error);
  }
  return runtime;
}

export function desktopRuntime() {
  return runtime;
}

/**
 * Set when the shell is present but would not answer.
 *
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
    console.error("[ERROR] Caught exception at src/renderer-react/src/features/desktop/runtime.ts:56", caughtError);
    const fallbackOrigin = new URL(fallback).origin;
    console.warn(`[WARN] Invalid reported backend URL; using fallback origin ${fallbackOrigin}`);
    return fallbackOrigin;
  }
}

/**
 * The shared token the local backend accepts. Absent outside the shell, which
 * is correct: a browser-only dev run talks to a backend started without one.
 */
export function backendAuthToken() {
  const token = runtime?.backendAuthToken?.trim();
  return token ? token : null;
}
