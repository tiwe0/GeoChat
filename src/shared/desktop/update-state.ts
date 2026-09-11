/**
 * Update state, shared between renderers.
 *
 * The desktop updates on two tracks: the Tauri shell (a full reinstall, gated
 * by the OS) and the app bundle (the renderer's own JavaScript, swapped in
 * place). Which one to offer is not a per-renderer styling decision — install
 * an app bundle that needs a newer shell and it is rejected — so the decision
 * lives here and both renderers read the same answer.
 */
import type {
  RendererAppBundleUpdateState,
  RendererUnifiedUpdateState,
  RendererUpdateState
} from "./workbench-types";

export type DesktopPrimaryUpdateAction = "install_shell" | "download_shell" | "install_app_bundle" | "check";

export const DEFAULT_UPDATE_STATE: RendererUpdateState = {
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

export const DEFAULT_APP_BUNDLE_UPDATE_STATE: RendererAppBundleUpdateState = {
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

export const DEFAULT_UNIFIED_UPDATE_STATE: RendererUnifiedUpdateState = {
  status: "disabled",
  recommendation: "none",
  shell: DEFAULT_UPDATE_STATE,
  appBundle: DEFAULT_APP_BUNDLE_UPDATE_STATE,
  message: null,
  error: null,
  errorCode: null
};

export function normalizeAppBundleUpdateState(state: RendererAppBundleUpdateState): RendererAppBundleUpdateState {
  const configured = state.configured ?? state.available;
  return {
    ...state,
    available: state.available,
    configured,
    updateAvailable: state.updateAvailable ?? state.status === "available"
  };
}

export function unifiedUpdateFromParts(
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

export function normalizeUnifiedUpdateState(state: RendererUnifiedUpdateState): RendererUnifiedUpdateState {
  return {
    ...state,
    shell: { ...state.shell, available: state.shell.available },
    appBundle: normalizeAppBundleUpdateState(state.appBundle)
  };
}

export function updateCanDownload(state: RendererUpdateState) {
  return state.status === "available" && !state.downloaded;
}

/**
 * One button, because only one action is ever correct. A downloaded shell
 * update must be installed before anything else; an available one must be
 * downloaded first; only then does an app bundle become the next move.
 */
export function primaryUpdateAction(input: {
  updateState: RendererUpdateState;
  appBundleUpdateState: RendererAppBundleUpdateState;
}): DesktopPrimaryUpdateAction {
  if (input.updateState.status === "downloaded") return "install_shell";
  if (updateCanDownload(input.updateState)) return "download_shell";
  if (input.appBundleUpdateState.updateAvailable) return "install_app_bundle";
  return "check";
}

export function primaryUpdateActionBusy(input: {
  unifiedUpdateBusy: boolean;
  updateBusy: boolean;
  appBundleUpdateBusy: boolean;
  unifiedUpdateState: RendererUnifiedUpdateState;
  updateState: RendererUpdateState;
  appBundleUpdateState: RendererAppBundleUpdateState;
}) {
  return (
    input.unifiedUpdateBusy ||
    input.updateBusy ||
    input.appBundleUpdateBusy ||
    input.unifiedUpdateState.status === "checking" ||
    input.updateState.status === "checking" ||
    input.updateState.status === "downloading" ||
    input.appBundleUpdateState.status === "checking" ||
    input.appBundleUpdateState.status === "downloading"
  );
}
