import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  runDesktopWindowControl,
  shouldShowDesktopWindowControls
} from "../../../../shared/desktop/desktop-window-controls";
import { APP_VERSION } from "../../../../shared/desktop/platform";

/**
 * The window's drag handle.
 *
 * The shell hides its own title (`hiddenTitle`, `titleBarStyle: Overlay`) so
 * the canvas can run edge to edge, which left the window with nothing to grab.
 * This bar floats over the canvas rather than pushing it down: frosted, so the
 * drawing stays visible underneath, and no drawing area is lost — only pointer
 * access to the top strip, which the traffic lights already occupied.
 *
 * It renders only inside the shell. In a browser it would be dead chrome.
 */
export function WindowTitleBar() {
  const { t } = useTranslation();
  const [shell, setShell] = useState<{ present: boolean; windowsControls: boolean }>({
    present: false,
    windowsControls: false
  });

  useEffect(() => {
    // main.tsx awaits the bridge before rendering, so the classes it stamps
    // are already on the document by the time this mounts.
    setShell({
      present: document.documentElement.classList.contains("geochat-tauri-shell"),
      windowsControls: shouldShowDesktopWindowControls()
    });
  }, []);

  if (!shell.present) return null;

  return (
    <header
      className={`window-titlebar${shell.windowsControls ? " window-titlebar-windows" : ""}`}
      data-tauri-drag-region
      // Double-click to zoom is what a titlebar is expected to do. The drag
      // installer suppresses the default on pointerdown, so this is the only
      // way the gesture survives.
      onDoubleClick={() => void runDesktopWindowControl("toggleMaximize")}
    >
      <span className="window-titlebar-title" data-tauri-drag-region>
        {t("common.appName")}
        <span className="window-titlebar-version">v{APP_VERSION}</span>
      </span>
      {shell.windowsControls && (
        <div className="window-titlebar-controls">
          <button
            type="button"
            aria-label={t("window.minimize")}
            title={t("window.minimize")}
            onClick={() => void runDesktopWindowControl("minimize")}
          >
            <svg viewBox="0 0 10 10" aria-hidden><path d="M0 5h10" /></svg>
          </button>
          <button
            type="button"
            aria-label={t("window.maximize")}
            title={t("window.maximize")}
            onClick={() => void runDesktopWindowControl("toggleMaximize")}
          >
            <svg viewBox="0 0 10 10" aria-hidden><rect x="0.5" y="0.5" width="9" height="9" /></svg>
          </button>
          <button
            type="button"
            className="window-titlebar-close"
            aria-label={t("window.close")}
            title={t("window.close")}
            onClick={() => void runDesktopWindowControl("close")}
          >
            <svg viewBox="0 0 10 10" aria-hidden><path d="M0 0l10 10M10 0L0 10" /></svg>
          </button>
        </div>
      )}
    </header>
  );
}
