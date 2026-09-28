import { useCallback, useEffect, useState } from "react";
import type { DesktopGraphicsState } from "../../../../shared/desktop-api";
import { installedDesktopApi } from "../../../../shared/desktop/tauri-bridge";

const INITIAL_STATE: DesktopGraphicsState = {
  enabled: true,
  applied: true,
  configurable: false,
  restartRequired: false,
  mode: "system_managed",
};

export function useGraphicsState() {
  const [status, setStatus] = useState(INITIAL_STATE);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const api = installedDesktopApi();
    if (!api) {
      setBusy(false);
      return;
    }
    setAvailable(true);
    void api.getGraphicsPreferences()
      .then((next) => {
        if (!disposed) setStatus(next);
      })
      .catch((reason) => {
        if (!disposed) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const setEnabled = useCallback(async (enabled: boolean) => {
    const api = installedDesktopApi();
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.setGraphicsPreferences({ hardwareAcceleration: enabled }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, available, busy, error, setEnabled };
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
