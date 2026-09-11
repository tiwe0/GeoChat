import { createSignal, onCleanup, type Accessor } from "solid-js";
import type { RuntimeInfo } from "@geochat-ai/app";
import type {
  RendererAppBundleUpdateState,
  RendererUnifiedUpdateState,
  RendererUpdateState
} from "../../shared/desktop/workbench-types";
import {
  resolveWorkbenchDesktopRuntime,
  type WorkbenchDesktopRuntime
} from "../../shared/desktop/workbench-desktop-runtime";
import {
  DEFAULT_APP_BUNDLE_UPDATE_STATE,
  DEFAULT_UNIFIED_UPDATE_STATE,
  DEFAULT_UPDATE_STATE,
  normalizeAppBundleUpdateState,
  normalizeUnifiedUpdateState,
  unifiedUpdateFromParts
} from "../../shared/desktop/update-state";

export function createWorkbenchUpdateState(input: {
  runtime: Accessor<RuntimeInfo | undefined>;
  desktopRuntime?: Partial<WorkbenchDesktopRuntime>;
}) {
  const desktopRuntime = resolveWorkbenchDesktopRuntime(input.desktopRuntime);
  const [updateState, setUpdateState] = createSignal<RendererUpdateState>(DEFAULT_UPDATE_STATE);
  const [appBundleUpdateState, setAppBundleUpdateState] =
    createSignal<RendererAppBundleUpdateState>(DEFAULT_APP_BUNDLE_UPDATE_STATE);
  const [unifiedUpdateState, setUnifiedUpdateState] =
    createSignal<RendererUnifiedUpdateState>(DEFAULT_UNIFIED_UPDATE_STATE);

  function localUpdateFallback(error?: unknown): RendererUpdateState {
    return {
      ...DEFAULT_UPDATE_STATE,
      currentVersion: input.runtime()?.appVersion ?? DEFAULT_UPDATE_STATE.currentVersion,
      error: error ? (error instanceof Error ? error.message : String(error)) : null
    };
  }

  function localAppBundleUpdateFallback(error?: unknown): RendererAppBundleUpdateState {
    return {
      ...DEFAULT_APP_BUNDLE_UPDATE_STATE,
      error: error ? (error instanceof Error ? error.message : String(error)) : null
    };
  }

  function localUnifiedUpdateFallback(error?: unknown): RendererUnifiedUpdateState {
    const fallback = unifiedUpdateFromParts(updateState(), appBundleUpdateState());
    return {
      ...fallback,
      status: error ? "error" : fallback.status,
      recommendation: error ? "error" : fallback.recommendation,
      error: error ? (error instanceof Error ? error.message : String(error)) : fallback.error,
      errorCode: error ? "unknown" : fallback.errorCode
    };
  }

  function setUpdateParts(nextShell: RendererUpdateState, nextAppBundle = appBundleUpdateState()) {
    setUpdateState(nextShell);
    setUnifiedUpdateState(unifiedUpdateFromParts(nextShell, nextAppBundle));
  }

  function setAppBundleUpdateParts(nextAppBundle: RendererAppBundleUpdateState, nextShell = updateState()) {
    setAppBundleUpdateState(nextAppBundle);
    setUnifiedUpdateState(unifiedUpdateFromParts(nextShell, nextAppBundle));
  }

  async function refreshUpdateState() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.getUpdateState) {
      const nextState = localUpdateFallback();
      setUpdateParts(nextState);
      return nextState;
    }
    const state = await desktopApi.getUpdateState().catch((error) => localUpdateFallback(error));
    const nextState = { ...state, available: state.available };
    setUpdateParts(nextState);
    return nextState;
  }

  async function checkForUpdates() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.checkForUpdates) return refreshUpdateState();
    const state = await desktopApi.checkForUpdates().catch((error) => localUpdateFallback(error));
    const nextState = { ...state, available: state.available };
    setUpdateParts(nextState);
    return nextState;
  }

  async function downloadUpdate() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.downloadUpdate) return refreshUpdateState();
    const state = await desktopApi.downloadUpdate().catch((error) => localUpdateFallback(error));
    const nextState = { ...state, available: state.available };
    setUpdateParts(nextState);
    return nextState;
  }

  async function changeUpdatePreferences(preferences: Partial<RendererUpdateState["preferences"]>) {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.setUpdatePreferences) return refreshUpdateState();
    const state = await desktopApi.setUpdatePreferences(preferences).catch((error) => localUpdateFallback(error));
    const nextState = { ...state, available: state.available };
    setUpdateParts(nextState);
    return nextState;
  }

  async function installUpdate() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.installUpdate) return refreshUpdateState();
    const state = await desktopApi.installUpdate().catch((error) => localUpdateFallback(error));
    const nextState = { ...state, available: state.available };
    setUpdateParts(nextState);
    return nextState;
  }

  async function refreshAppBundleUpdateState() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.getAppBundleUpdateState) {
      const nextState = localAppBundleUpdateFallback();
      setAppBundleUpdateParts(nextState);
      return nextState;
    }
    const state = await desktopApi.getAppBundleUpdateState().catch((error) => localAppBundleUpdateFallback(error));
    const nextState = normalizeAppBundleUpdateState(state);
    setAppBundleUpdateParts(nextState);
    return nextState;
  }

  async function checkAppBundleUpdate() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.checkAppBundleUpdate) return refreshAppBundleUpdateState();
    const state = await desktopApi.checkAppBundleUpdate().catch((error) => localAppBundleUpdateFallback(error));
    const nextState = normalizeAppBundleUpdateState(state);
    setAppBundleUpdateParts(nextState);
    return nextState;
  }

  async function installAppBundleUpdate() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.installAppBundleUpdate) return refreshAppBundleUpdateState();
    const state = await desktopApi.installAppBundleUpdate().catch((error) => localAppBundleUpdateFallback(error));
    const nextState = normalizeAppBundleUpdateState(state);
    setAppBundleUpdateParts(nextState);
    return nextState;
  }

  async function rollbackAppBundleUpdate() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.rollbackAppBundleUpdate) return refreshAppBundleUpdateState();
    const state = await desktopApi.rollbackAppBundleUpdate().catch((error) => localAppBundleUpdateFallback(error));
    const nextState = normalizeAppBundleUpdateState(state);
    setAppBundleUpdateParts(nextState);
    return nextState;
  }

  async function checkAllUpdates() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.checkAllUpdates) {
      await checkForUpdates();
      await checkAppBundleUpdate();
      const fallback = localUnifiedUpdateFallback();
      setUnifiedUpdateState(fallback);
      return fallback;
    }
    const state = await desktopApi.checkAllUpdates().catch((error) => localUnifiedUpdateFallback(error));
    const nextState = normalizeUnifiedUpdateState(state);
    setUpdateState(nextState.shell);
    setAppBundleUpdateState(nextState.appBundle);
    setUnifiedUpdateState(nextState);
    return nextState;
  }

  void refreshUpdateState();
  void refreshAppBundleUpdateState();

  const desktopApi = desktopRuntime.desktopApi();
  if (desktopApi?.onUpdateState) {
    const disposeUpdateListener = desktopApi.onUpdateState((state) => {
      setUpdateParts({ ...state, available: state.available });
    });
    onCleanup(disposeUpdateListener);
  }

  if (desktopApi?.onAppBundleUpdateState) {
    const disposeAppBundleUpdateListener = desktopApi.onAppBundleUpdateState((state) => {
      setAppBundleUpdateParts(normalizeAppBundleUpdateState(state));
    });
    onCleanup(disposeAppBundleUpdateListener);
  }

  return {
    updateState,
    appBundleUpdateState,
    unifiedUpdateState,
    refreshUpdateState,
    checkForUpdates,
    downloadUpdate,
    changeUpdatePreferences,
    installUpdate,
    refreshAppBundleUpdateState,
    checkAppBundleUpdate,
    installAppBundleUpdate,
    rollbackAppBundleUpdate,
    checkAllUpdates
  };
}
