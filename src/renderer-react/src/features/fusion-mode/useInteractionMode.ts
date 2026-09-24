import { useCallback, useEffect, useState } from "react";
import {
  DESKTOP_CONFIG_CHANGED_EVENT,
  persistDesktopConfig,
  readDesktopConfig,
} from "../../../../shared/desktop/desktop-config";
import type { InteractionMode } from "../../../../shared/desktop/workbench-types";

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
    persistDesktopConfig({ ...config, interaction: { mode: nextMode } });
  }, []);

  return { mode, setMode };
}
