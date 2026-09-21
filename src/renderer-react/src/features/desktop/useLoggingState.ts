import { useCallback, useEffect, useState } from "react";
import type { DesktopLogLevel, DesktopLoggingState } from "../../../../shared/desktop-api";
import { installedDesktopApi } from "../../../../shared/desktop/tauri-bridge";

const INITIAL_STATE: DesktopLoggingState = {
  enabled: false,
  level: "info",
  logDirectory: "",
};

export function useLoggingState() {
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
    void api.getLoggingPreferences()
      .then((next) => {
        if (!disposed) {
          setStatus(next);
          console.debug(`[DEBUG] Loaded logging preferences enabled=${next.enabled} level=${next.level}`);
        }
      })
      .catch((reason) => {
        console.error("[ERROR] Failed to read desktop logging preferences", reason);
        if (!disposed) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const update = useCallback(async (preferences: Partial<Pick<DesktopLoggingState, "enabled" | "level">>) => {
    const api = installedDesktopApi();
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.setLoggingPreferences(preferences);
      setStatus(next);
      console.info(`[INFO] Logging preferences updated enabled=${next.enabled} level=${next.level}`);
    } catch (reason) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/features/desktop/useLoggingState.ts:47", reason);
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }, []);

  const openDirectory = useCallback(async () => {
    const api = installedDesktopApi();
    if (!api) return;
    setError(null);
    try {
      const logDirectory = await api.openLogDirectory();
      setStatus((current) => ({ ...current, logDirectory }));
      console.info("[INFO] Opened the local log directory");
    } catch (reason) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/features/desktop/useLoggingState.ts:61", reason);
      setError(errorMessage(reason));
    }
  }, []);

  return {
    status,
    available,
    busy,
    error,
    setEnabled: (enabled: boolean) => update({ enabled }),
    setLevel: (level: DesktopLogLevel) => update({ level }),
    openDirectory,
  };
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
