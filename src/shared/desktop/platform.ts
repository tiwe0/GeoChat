import type { RuntimeInfo } from "@geochat-ai/app/desktop-contracts";

const DEFAULT_LOCAL_BACKEND_BASE_URL = "http://127.0.0.1:17365";
// The real version is injected from package.json at build time. A literal
// fallback here can only ever be a stale second source of truth — it read
// 0.1.9 while the app shipped 0.2.8 — so when injection is missing, say so
// rather than reporting a plausible wrong number.
export const APP_VERSION = import.meta.env.VITE_GEOCHAT_APP_VERSION ?? "0.0.0-dev";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function webBackendBaseUrl() {
  const explicit =
    import.meta.env.VITE_GEOCHAT_BACKEND_BASE_URL ??
    import.meta.env.VITE_GEOCHAT_BACKEND_URL;
  if (explicit) return trimTrailingSlash(explicit);
  if (import.meta.env.DEV) return DEFAULT_LOCAL_BACKEND_BASE_URL;
  return trimTrailingSlash(globalThis.location?.origin ?? DEFAULT_LOCAL_BACKEND_BASE_URL);
}

export async function fetchRuntimeInfo() {
  if (window.geochatDesktop) return window.geochatDesktop.getRuntimeInfo();
  return {
    platform: "web",
    appVersion: APP_VERSION,
    backendBaseUrl: webBackendBaseUrl(),
    backendAuthToken: undefined
  } satisfies RuntimeInfo;
}
