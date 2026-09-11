import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopUpdateState } from "../../../../shared/desktop-api";

/**
 * Desktop update state, subscribed through the shell bridge.
 *
 * Without this the app can never tell a user a new version exists, which is
 * the one capability that cannot be deferred to a later release — an app that
 * cannot update is stuck at whatever version it shipped with.
 */
const IDLE: DesktopUpdateState = {
  status: "idle",
  available: false,
  currentVersion: "",
  updateVersion: null,
  releaseName: null,
  releaseDate: null,
  downloaded: false,
  downloadPercent: null,
  error: null,
  errorCode: null
};

export function useUpdateState() {
  const [state, setState] = useState<DesktopUpdateState>(IDLE);
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const api = window.geochatDesktop;
    if (!api) return;
    void api.getUpdateState().then((next) => {
      if (aliveRef.current) setState(next);
    }).catch(() => undefined);
    // The shell pushes progress during download, so polling is unnecessary.
    const unsubscribe = api.onUpdateState?.((next) => {
      if (aliveRef.current) setState(next);
    });
    return () => {
      aliveRef.current = false;
      unsubscribe?.();
    };
  }, []);

  const run = useCallback(
    async (action: (api: NonNullable<typeof window.geochatDesktop>) => Promise<DesktopUpdateState>) => {
      const api = window.geochatDesktop;
      if (!api) return;
      setBusy(true);
      try {
        const next = await action(api);
        if (aliveRef.current) setState(next);
      } catch (error) {
        if (aliveRef.current) {
          setState((current) => ({
            ...current,
            status: "error",
            error: error instanceof Error ? error.message : String(error)
          }));
        }
      } finally {
        if (aliveRef.current) setBusy(false);
      }
    },
    []
  );

  return {
    state,
    busy,
    /** Present only inside the desktop shell. */
    supported: typeof window !== "undefined" && Boolean(window.geochatDesktop),
    check: useCallback(() => run((api) => api.checkForUpdates()), [run]),
    download: useCallback(() => run((api) => api.downloadUpdate()), [run]),
    install: useCallback(() => run((api) => api.installUpdate()), [run])
  };
}
