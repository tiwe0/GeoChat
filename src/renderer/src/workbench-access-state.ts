import { createSignal, onCleanup } from "solid-js";
import type { RendererAccessState } from "./workbench-types";
import {
  resolveWorkbenchDesktopRuntime,
  type WorkbenchDesktopRuntime
} from "./workbench-desktop-runtime";

const DEFAULT_ACCESS_STATE: RendererAccessState = {
  available: false,
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

export function accessAllowsUse(state: RendererAccessState) {
  return state.status === "active" && state.features.local;
}

export function createWorkbenchAccessState(input: {
  refetchRuntime: () => void;
  desktopRuntime?: Partial<WorkbenchDesktopRuntime>;
}) {
  const desktopRuntime = resolveWorkbenchDesktopRuntime(input.desktopRuntime);
  const [accessState, setAccessState] = createSignal<RendererAccessState>(DEFAULT_ACCESS_STATE);
  const [accessBusy, setAccessBusy] = createSignal(false);

  async function refreshAccessState() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.getAccessState) {
      setAccessState(DEFAULT_ACCESS_STATE);
      return DEFAULT_ACCESS_STATE;
    }
    const state = await desktopApi.getAccessState().catch((error) => ({
      ...DEFAULT_ACCESS_STATE,
      available: true,
      status: "error" as const,
      errorCode: "unknown" as const,
      error: error instanceof Error ? error.message : String(error)
    }));
    const nextState = { ...state, available: true };
    setAccessState(nextState);
    return nextState;
  }

  async function checkAccess() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.checkAccess) return refreshAccessState();
    setAccessBusy(true);
    try {
      const state = await desktopApi.checkAccess().catch((error) => ({
        ...accessState(),
        status: "error" as const,
        errorCode: "unknown" as const,
        error: error instanceof Error ? error.message : String(error)
      }));
      const nextState = { ...state, available: true };
      setAccessState(nextState);
      input.refetchRuntime();
      return nextState;
    } finally {
      setAccessBusy(false);
    }
  }

  void checkAccess();
  const accessRefreshInterval = desktopRuntime.setInterval(() => {
    void refreshAccessState();
    input.refetchRuntime();
  }, 60_000);
  onCleanup(() => desktopRuntime.clearInterval(accessRefreshInterval));

  return {
    accessState,
    accessBusy,
    refreshAccessState,
    checkAccess
  };
}
