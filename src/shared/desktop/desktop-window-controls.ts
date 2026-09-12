export type DesktopWindowControlAction = "minimize" | "toggleMaximize" | "close";

export function shouldShowDesktopWindowControls() {
  return document.documentElement.classList.contains("geochat-tauri-windows");
}

export async function runDesktopWindowControl(action: DesktopWindowControlAction) {
  if (!window.__TAURI_INTERNALS__) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const currentWindow = getCurrentWindow();
  await currentWindow[action]();
}
