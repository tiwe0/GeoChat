import { createSignal, onCleanup, type Accessor } from "solid-js";
import type { RuntimeInfo } from "@geochat-ai/app";
import type {
  RendererAppBundleUpdateState,
  RendererUnifiedUpdateState,
  RendererUpdateState
} from "./workbench-types";
import {
  resolveWorkbenchDesktopRuntime,
  type WorkbenchDesktopRuntime
} from "./workbench-desktop-runtime";

const DEFAULT_UPDATE_STATE: RendererUpdateState = {
  available: false,
  status: "disabled",
  currentVersion: "0.0.0",
  updateVersion: null,
  releaseName: null,
  releaseDate: null,
  downloaded: false,
  downloadPercent: null,
  error: null,
  errorCode: null,
  checkedAt: null,
  preferences: {
    autoCheck: true,
    autoDownload: true,
    installOnQuit: false
  }
};

const DEFAULT_APP_BUNDLE_UPDATE_STATE: RendererAppBundleUpdateState = {
  available: false,
  configured: false,
  updateAvailable: false,
  status: "disabled",
  manifestUrl: null,
  currentBundleVersion: null,
  bundleVersion: null,
  rollbackAvailable: false,
  checkedAt: null,
  installedAt: null,
  requiresRestart: false,
  error: null,
  errorCode: null
};

const DEFAULT_UNIFIED_UPDATE_STATE: RendererUnifiedUpdateState = {
  status: "disabled",
  recommendation: "none",
  shell: DEFAULT_UPDATE_STATE,
  appBundle: DEFAULT_APP_BUNDLE_UPDATE_STATE,
  message: null,
  error: null,
  errorCode: null
};

function normalizeAppBundleUpdateState(state: RendererAppBundleUpdateState): RendererAppBundleUpdateState {
  const configured = state.configured ?? state.available;
  return {
    ...state,
    available: state.available,
    configured,
    updateAvailable: state.updateAvailable ?? state.status === "available"
  };
}

function unifiedUpdateFromParts(
  shell: RendererUpdateState,
  appBundle: RendererAppBundleUpdateState
): RendererUnifiedUpdateState {
  if (appBundle.status === "blocked" || appBundle.errorCode === "shell_update_required") {
    return {
      status: "available",
      recommendation: "shell_required_for_app_bundle",
      shell,
      appBundle,
      message: appBundle.error,
      error: appBundle.error,
      errorCode: appBundle.errorCode
    };
  }
  if (shell.available && shell.status === "available" && appBundle.updateAvailable) {
    return {
      status: "available",
      recommendation: "both_shell_first",
      shell,
      appBundle,
      message: shell.updateVersion
        ? `Application shell update ${shell.updateVersion} is available. Install it before the workspace logic update.`
        : null,
      error: null,
      errorCode: null
    };
  }
  if (appBundle.updateAvailable) {
    return {
      status: "available",
      recommendation: "app_bundle",
      shell,
      appBundle,
      message: appBundle.bundleVersion ? `Workspace logic update ${appBundle.bundleVersion} is available.` : null,
      error: null,
      errorCode: null
    };
  }
  if (shell.available && shell.status === "available") {
    return {
      status: "available",
      recommendation: "shell",
      shell,
      appBundle,
      message: shell.updateVersion ? `Application shell update ${shell.updateVersion} is available.` : null,
      error: null,
      errorCode: null
    };
  }
  if (appBundle.status === "error") {
    return {
      status: "error",
      recommendation: "error",
      shell,
      appBundle,
      message: appBundle.error,
      error: appBundle.error,
      errorCode: appBundle.errorCode
    };
  }
  if (shell.status === "error") {
    return {
      status: "error",
      recommendation: "error",
      shell,
      appBundle,
      message: shell.error,
      error: shell.error,
      errorCode: shell.errorCode
    };
  }
  return {
    status: shell.available || appBundle.available ? "not_available" : "disabled",
    recommendation: "none",
    shell,
    appBundle,
    message: null,
    error: null,
    errorCode: null
  };
}

function normalizeUnifiedUpdateState(state: RendererUnifiedUpdateState): RendererUnifiedUpdateState {
  const shell = { ...state.shell, available: state.shell.available };
  const appBundle = normalizeAppBundleUpdateState(state.appBundle);
  return {
    ...state,
    shell,
    appBundle
  };
}

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
