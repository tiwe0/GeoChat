import { useCallback, useEffect, useState } from "react";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import type { DesktopLogLevel, DesktopLoggingState } from "../../../../shared/desktop-api";
import { installedDesktopApi } from "../../../../shared/desktop/tauri-bridge";

const logger = createStructuredLogger("desktop.logging-state");

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
          logger.debug("preferences_loaded", "DESKTOP_LOGGING_PREFERENCES_LOADED", { enabled: next.enabled, level: next.level });
        }
      })
      .catch((reason) => {
        logger.warn("preferences_read_failed", "DESKTOP_LOGGING_READ_FAILED", { error: reason });
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
      logger.info("preferences_updated", "DESKTOP_LOGGING_UPDATED", { enabled: next.enabled, level: next.level });
    } catch (reason) {
      logger.warn("preferences_update_failed", "DESKTOP_LOGGING_UPDATE_FAILED", { error: reason });
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
      logger.info("log_directory_opened", "DESKTOP_LOG_DIRECTORY_OPENED");
    } catch (reason) {
      logger.warn("log_directory_open_failed", "DESKTOP_LOG_DIRECTORY_OPEN_FAILED", { error: reason });
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
