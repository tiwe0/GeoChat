import type { GeoChatDesktopApi } from "../../shared/desktop-api";
import {
  flushDesktopConfigWrites,
  installDesktopConfigStorage,
} from "../../shared/desktop/desktop-config";
import { recoverDesktopConfigBeforeLoad } from "../../shared/desktop/desktop-config-recovery";
import { installDesktopLogging } from "./features/desktop/desktopLogger";
import { desktopRuntimeError, loadDesktopRuntime } from "./features/desktop/runtime";
import { installNativePreferences } from "./lib/nativePreferences";
import { installWebViewStorageFacades } from "./webview-storage-facades";

export async function bootstrapRendererStorage(api: GeoChatDesktopApi) {
  const preferences = await installNativePreferences(api);
  installDesktopConfigStorage(preferences.configStorage, preferences.flushWrites);
  await recoverDesktopConfigBeforeLoad(preferences.configStorage, {
    flushWrites: preferences.flushWrites,
  });
  await flushDesktopConfigWrites();
  await installWebViewStorageFacades();
  installDesktopLogging();

  const runtime = await loadDesktopRuntime();
  if (!runtime) {
    throw new Error(desktopRuntimeError() ?? "The local SQLite backend is unavailable.");
  }
}
