import type {
  DesktopAccessState,
  DesktopAppBundleUpdateState,
  DesktopImprovementPlanPreferences,
  DesktopMcpStatus,
  DesktopUpdatePreferences,
  DesktopUpdateState,
  GeoChatDesktopApi
} from "../../shared/desktop-api";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type TauriListen = typeof import("@tauri-apps/api/event").listen;
type BridgeSlice<K extends keyof GeoChatDesktopApi> = Pick<GeoChatDesktopApi, K>;

export const TAURI_DESKTOP_COMMANDS = {
  runtime: {
    getRuntimeInfo: "get_runtime_info",
    markRendererReady: "mark_renderer_ready"
  },
  mcp: {
    getMcpStatus: "get_mcp_status",
    setMcpEnabled: "set_mcp_enabled"
  },
  access: {
    getAccessState: "get_access_state",
    checkAccess: "check_access"
  },
  shellUpdate: {
    getUpdateState: "get_update_state",
    checkForUpdates: "check_for_updates",
    checkAllUpdates: "check_all_updates",
    downloadUpdate: "download_update",
    setUpdatePreferences: "set_update_preferences",
    installUpdate: "install_update"
  },
  appBundleUpdate: {
    getAppBundleUpdateState: "get_app_bundle_update_state",
    checkAppBundleUpdate: "check_app_bundle_update",
    installAppBundleUpdate: "install_app_bundle_update",
    rollbackAppBundleUpdate: "rollback_app_bundle_update"
  },
  improvement: {
    getImprovementPlanPreferences: "get_improvement_plan_preferences",
    setImprovementPlanPreferences: "set_improvement_plan_preferences",
    uploadImprovementPlanSamples: "upload_improvement_plan_samples"
  }
} as const;

export const TAURI_DESKTOP_EVENTS = {
  shellUpdateState: "desktop:update-state",
  appBundleUpdateState: "desktop:app-bundle-update-state"
} as const;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export async function installTauriDesktopBridge() {
  if (window.geochatDesktop || !window.__TAURI_INTERNALS__) return;
  document.documentElement.classList.add("geochat-tauri-shell");
  if (navigator.userAgent.includes("Windows")) {
    document.documentElement.classList.add("geochat-tauri-windows");
  }

  const [{ invoke }, { listen }, { getCurrentWindow }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
    import("@tauri-apps/api/window")
  ]);

  const tauriInvoke = invoke as TauriInvoke;
  window.geochatDesktop = createTauriDesktopApi(tauriInvoke, listen);
  const currentWindow = getCurrentWindow();
  installTauriDragRegions(() => currentWindow.startDragging());
}

function installTauriDragRegions(startDragging: () => Promise<void>) {
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    const dragRegion = target?.closest("[data-tauri-drag-region]");
    if (!dragRegion) return;
    if (target?.closest("button, input, textarea, select, a, [role='button'], [data-tauri-no-drag]")) return;
    event.preventDefault();
    void startDragging().catch(() => undefined);
  });
}

export function createTauriDesktopApi(
  invoke: TauriInvoke,
  listen: TauriListen
): GeoChatDesktopApi {
  return {
    ...createRuntimeBridge(invoke),
    ...createMcpBridge(invoke),
    ...createAccessBridge(invoke),
    ...createShellUpdateBridge(invoke, listen),
    ...createAppBundleUpdateBridge(invoke, listen),
    ...createImprovementBridge(invoke)
  };
}

function createRuntimeBridge(invoke: TauriInvoke): BridgeSlice<"getRuntimeInfo" | "markRendererReady"> {
  const commands = TAURI_DESKTOP_COMMANDS.runtime;
  return {
    getRuntimeInfo: () => invoke(commands.getRuntimeInfo),
    markRendererReady: () => invoke(commands.markRendererReady)
  };
}

function createMcpBridge(invoke: TauriInvoke): BridgeSlice<"getMcpStatus" | "setMcpEnabled"> {
  const commands = TAURI_DESKTOP_COMMANDS.mcp;
  return {
    getMcpStatus: () => invoke(commands.getMcpStatus),
    setMcpEnabled: (enabled: boolean) => invoke(commands.setMcpEnabled, { enabled })
  };
}

function createAccessBridge(
  invoke: TauriInvoke
): BridgeSlice<"getAccessState" | "checkAccess"> {
  const commands = TAURI_DESKTOP_COMMANDS.access;
  return {
    getAccessState: () => invoke(commands.getAccessState),
    checkAccess: () => invoke(commands.checkAccess)
  };
}

function createShellUpdateBridge(
  invoke: TauriInvoke,
  listen: TauriListen
): BridgeSlice<
  | "getUpdateState"
  | "checkForUpdates"
  | "checkAllUpdates"
  | "downloadUpdate"
  | "setUpdatePreferences"
  | "installUpdate"
  | "onUpdateState"
> {
  const commands = TAURI_DESKTOP_COMMANDS.shellUpdate;
  return {
    getUpdateState: () => invoke(commands.getUpdateState),
    checkForUpdates: () => invoke(commands.checkForUpdates),
    checkAllUpdates: () => invoke(commands.checkAllUpdates),
    downloadUpdate: () => invoke(commands.downloadUpdate),
    setUpdatePreferences: (preferences: Partial<DesktopUpdatePreferences>) =>
      invoke(commands.setUpdatePreferences, { preferences }),
    installUpdate: () => invoke(commands.installUpdate),
    onUpdateState: (callback: (state: DesktopUpdateState) => void) => {
      let disposed = false;
      let unlisten: (() => void) | undefined;
      void listen<DesktopUpdateState>(TAURI_DESKTOP_EVENTS.shellUpdateState, (event) => {
        callback(event.payload);
      }).then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      });
      return () => {
        disposed = true;
        unlisten?.();
      };
    }
  };
}

function createAppBundleUpdateBridge(
  invoke: TauriInvoke,
  listen: TauriListen
): BridgeSlice<
  | "getAppBundleUpdateState"
  | "checkAppBundleUpdate"
  | "installAppBundleUpdate"
  | "rollbackAppBundleUpdate"
  | "onAppBundleUpdateState"
> {
  const commands = TAURI_DESKTOP_COMMANDS.appBundleUpdate;
  return {
    getAppBundleUpdateState: () => invoke(commands.getAppBundleUpdateState),
    checkAppBundleUpdate: () => invoke(commands.checkAppBundleUpdate),
    installAppBundleUpdate: () => invoke(commands.installAppBundleUpdate),
    rollbackAppBundleUpdate: () => invoke(commands.rollbackAppBundleUpdate),
    onAppBundleUpdateState: (callback: (state: DesktopAppBundleUpdateState) => void) => {
      let disposed = false;
      let unlisten: (() => void) | undefined;
      void listen<DesktopAppBundleUpdateState>(TAURI_DESKTOP_EVENTS.appBundleUpdateState, (event) => {
        callback(event.payload);
      }).then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      });
      return () => {
        disposed = true;
        unlisten?.();
      };
    }
  };
}

function createImprovementBridge(
  invoke: TauriInvoke
): BridgeSlice<
  | "getImprovementPlanPreferences"
  | "setImprovementPlanPreferences"
  | "uploadImprovementPlanSamples"
> {
  const commands = TAURI_DESKTOP_COMMANDS.improvement;
  return {
    getImprovementPlanPreferences: () => invoke(commands.getImprovementPlanPreferences),
    setImprovementPlanPreferences: (preferences: Partial<DesktopImprovementPlanPreferences>) =>
      invoke(commands.setImprovementPlanPreferences, { preferences }),
    uploadImprovementPlanSamples: (samples: unknown[]) => invoke(commands.uploadImprovementPlanSamples, { samples })
  };
}

export function inactiveAccessState(): DesktopAccessState {
  return {
    status: "error",
    features: {
      local: false,
      problemBank: false,
      improvementUpload: false
    },
    checkedAt: null,
    error: null,
    errorCode: null
  };
}

export function disabledUpdateState(currentVersion: string): DesktopUpdateState {
  return {
    status: "disabled",
    available: false,
    currentVersion,
    updateVersion: null,
    releaseName: null,
    releaseDate: null,
    downloaded: false,
    downloadPercent: null,
    error: "Shell updates are not available in this runtime.",
    errorCode: null,
    checkedAt: null,
    preferences: {
      autoCheck: false,
      autoDownload: false,
      installOnQuit: false
    }
  };
}

export function disabledAppBundleUpdateState(): DesktopAppBundleUpdateState {
  return {
    status: "disabled",
    available: false,
    configured: false,
    updateAvailable: false,
    manifestUrl: null,
    currentBundleVersion: null,
    bundleVersion: null,
    rollbackAvailable: false,
    checkedAt: null,
    installedAt: null,
    requiresRestart: false,
    error: "App bundle updates are not available in this runtime.",
    errorCode: null
  };
}

export function unavailableMcpStatus(): DesktopMcpStatus {
  return {
    available: false,
    enabled: false,
    running: false,
    endpoint: null,
    healthUrl: null,
    port: 17369,
    pid: null,
    error: "Desktop MCP is not available in this runtime."
  };
}
