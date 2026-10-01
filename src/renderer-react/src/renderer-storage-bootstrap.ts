import type { GeoChatDesktopApi } from "../../shared/desktop-api";
import {
  acceptNativeDesktopConfigCommit,
  flushDesktopConfigWrites,
  installDesktopConfigStorage,
} from "../../shared/desktop/desktop-config";
import { recoverDesktopConfigBeforeLoad } from "../../shared/desktop/desktop-config-recovery";
import { installDesktopLogging } from "./features/desktop/desktopLogger";
import { desktopRuntimeError, loadDesktopRuntime } from "./features/desktop/runtime";
import { installNativePreferences, type NativePreferences } from "./lib/nativePreferences";
import { installWebViewStorageFacades } from "./webview-storage-facades";

export async function bootstrapRendererStorage(api: GeoChatDesktopApi) {
  const preferences = await installNativePreferences(api);
  await prepareRendererConfigBeforeRuntime(api, preferences);
  await installWebViewStorageFacades();
  installDesktopLogging();

  const runtime = await loadDesktopRuntime();
  if (!runtime) {
    throw new Error(desktopRuntimeError() ?? "The local SQLite backend is unavailable.");
  }
}

export async function prepareRendererConfigBeforeRuntime(
  api: Pick<GeoChatDesktopApi, "reconcileProviderCredentials">,
  preferences: Pick<NativePreferences, "configStorage" | "flushWrites">,
) {
  installDesktopConfigStorage(preferences.configStorage, preferences.flushWrites);
  await recoverDesktopConfigBeforeLoad(preferences.configStorage, {
    flushWrites: preferences.flushWrites,
  });
  await flushDesktopConfigWrites();
  const lifecycle = await api.reconcileProviderCredentials();
  acceptNativeDesktopConfigCommit(lifecycle.configJson);
  if (lifecycle.status !== "ready") {
    throw new Error(`Credential recovery is incomplete for operation ${lifecycle.operationId}.`);
  }
}
