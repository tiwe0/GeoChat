import type { GeoChatDesktopApi } from "../../../../shared/desktop-api";

export type DesktopProblemBankApi = Pick<
  GeoChatDesktopApi,
  | "getProblemBankCacheState"
  | "getProblemBankCatalog"
  | "syncProblemBankMetadata"
  | "openProblemBankCacheDirectory"
  | "clearProblemBankCache"
  | "getProblemBankDownloadStates"
  | "downloadProblemBank"
  | "loadProblemBankPage"
  | "loadProblemDetail"
  | "onProblemBankCacheState"
  | "onProblemBankDownloadState"
>;

/** Keeps the Tauri bridge global behind the renderer's desktop boundary. */
export function desktopProblemBankApi(): DesktopProblemBankApi | null {
  return window.geochatDesktop ?? null;
}
