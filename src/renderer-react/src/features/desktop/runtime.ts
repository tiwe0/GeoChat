import type { RuntimeInfo } from "@geochat-ai/app";

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

export async function loadDesktopRuntime() {
  const api = window.geochatDesktop;
  if (!api) return null;
  runtime = await api.getRuntimeInfo().catch(() => null);
  return runtime;
}

export function desktopRuntime() {
  return runtime;
}

/** The shell's backend when running inside it; the dev fallback otherwise. */
export function backendOrigin() {
  const reported = runtime?.backendBaseUrl?.trim();
  const fallback = import.meta.env.VITE_API_ORIGIN ?? "http://127.0.0.1:17365";
  try {
    return new URL(reported || fallback).origin;
  } catch {
    return new URL(fallback).origin;
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
