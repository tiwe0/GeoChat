import { useCallback, useEffect, useRef, useState } from "react";
import type { RendererAccessState } from "../../../../shared/desktop/workbench-types";
import {
  resolveWorkbenchDesktopRuntime,
  type WorkbenchDesktopRuntime
} from "../../../../shared/desktop/workbench-desktop-runtime";

/**
 * React counterpart of the Solid renderer's createWorkbenchAccessState.
 *
 * The desktop access state is the one piece of the desktop layer that is
 * genuinely reactive, so it could not simply move to src/shared like the rest.
 * Behaviour is deliberately identical: check once on mount, refresh every
 * minute, and report "unavailable" rather than throwing when the app is not
 * running inside the Tauri shell.
 */
export const DEFAULT_ACCESS_STATE: RendererAccessState = {
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

const REFRESH_INTERVAL_MS = 60_000;

export function useAccessState(input: {
  refetchRuntime: () => void;
  desktopRuntime?: Partial<WorkbenchDesktopRuntime>;
}) {
  const [accessState, setAccessState] = useState<RendererAccessState>(DEFAULT_ACCESS_STATE);
  const [accessBusy, setAccessBusy] = useState(false);

  // Kept in refs so the polling effect never needs to re-subscribe, and so a
  // late response cannot overwrite newer state after unmount.
  const runtimeRef = useRef(resolveWorkbenchDesktopRuntime(input.desktopRuntime));
  const refetchRuntimeRef = useRef(input.refetchRuntime);
  refetchRuntimeRef.current = input.refetchRuntime;
  const stateRef = useRef(accessState);
  stateRef.current = accessState;
  const aliveRef = useRef(true);

  const applyState = useCallback((next: RendererAccessState) => {
    if (!aliveRef.current) return next;
    stateRef.current = next;
    setAccessState(next);
    return next;
  }, []);

  const refreshAccessState = useCallback(async () => {
    const desktopApi = runtimeRef.current.desktopApi();
    if (!desktopApi?.getAccessState) return applyState(DEFAULT_ACCESS_STATE);
    const state = await desktopApi.getAccessState().catch((error) => ({
      ...DEFAULT_ACCESS_STATE,
      available: true,
      status: "error" as const,
      errorCode: "unknown" as const,
      error: error instanceof Error ? error.message : String(error)
    }));
    return applyState({ ...state, available: true });
  }, [applyState]);

  const checkAccess = useCallback(async () => {
    const desktopApi = runtimeRef.current.desktopApi();
    if (!desktopApi?.checkAccess) return refreshAccessState();
    setAccessBusy(true);
    try {
      const state = await desktopApi.checkAccess().catch((error) => ({
        ...stateRef.current,
        status: "error" as const,
        errorCode: "unknown" as const,
        error: error instanceof Error ? error.message : String(error)
      }));
      const next = applyState({ ...state, available: true });
      refetchRuntimeRef.current();
      return next;
    } finally {
      if (aliveRef.current) setAccessBusy(false);
    }
  }, [applyState, refreshAccessState]);

  useEffect(() => {
    aliveRef.current = true;
    const runtime = runtimeRef.current;
    void checkAccess();
    const interval = runtime.setInterval(() => {
      void refreshAccessState();
      refetchRuntimeRef.current();
    }, REFRESH_INTERVAL_MS);
    return () => {
      aliveRef.current = false;
      runtime.clearInterval(interval);
    };
  }, [checkAccess, refreshAccessState]);

  return { accessState, accessBusy, refreshAccessState, checkAccess };
}
