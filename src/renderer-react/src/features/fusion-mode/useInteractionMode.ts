import { useCallback, useEffect, useState } from "react";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import {
  DESKTOP_CONFIG_CHANGED_EVENT,
  readDesktopConfig,
  updateDesktopConfig,
} from "../../../../shared/desktop/desktop-config";
import type { InteractionMode } from "../../../../shared/desktop/workbench-types";

const logger = createStructuredLogger("fusion-mode.interaction");

export function useInteractionMode() {
  const [mode, setModeState] = useState<InteractionMode>(() => readDesktopConfig().interaction.mode);

  useEffect(() => {
    const refresh = () => setModeState(readDesktopConfig().interaction.mode);
    globalThis.addEventListener(DESKTOP_CONFIG_CHANGED_EVENT, refresh);
    return () => globalThis.removeEventListener(DESKTOP_CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const setMode = useCallback((nextMode: InteractionMode) => {
    const config = readDesktopConfig();
    if (config.interaction.mode === nextMode) return;
    void updateDesktopConfig((current) => ({ ...current, interaction: { mode: nextMode } })).catch((error) => {
      logger.warn("interaction_mode_save_failed", "INTERACTION_MODE_SAVE_FAILED", { error, nextMode });
    });
  }, []);

  return { mode, setMode };
}
