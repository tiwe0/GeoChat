import type { RuntimeInfo } from "@geochat-ai/app";

const DEFAULT_LOCAL_BACKEND_BASE_URL = "http://127.0.0.1:17365";
export const APP_VERSION = import.meta.env.VITE_GEOCHAT_APP_VERSION ?? "0.1.9";

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
    backendBaseUrl: webBackendBaseUrl()
  } satisfies RuntimeInfo;
}
