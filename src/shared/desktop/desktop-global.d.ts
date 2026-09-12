import type { GeoChatDesktopApi } from "../desktop-api";

/**
 * The bridge installs the desktop API on `window`, so both renderers need this
 * declaration. It lived in the Solid renderer's env.d.ts, where the React one
 * could not see it.
 */
declare global {
  interface Window {
    geochatDesktop?: GeoChatDesktopApi;
    __TAURI_INTERNALS__?: unknown;
  }
}

export {};
