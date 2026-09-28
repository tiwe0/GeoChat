import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";

const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as {
  app: { windows: Array<Record<string, unknown>> };
};
const mainWindow = tauriConfig.app.windows.find((window) => window.label === "main");
const mainRustSource = readFileSync("src-tauri/src/main.rs", "utf8");
const bridgeSource = readFileSync("src/shared/desktop/tauri-bridge.ts", "utf8");
const appSource = readFileSync("src/renderer-react/src/App.tsx", "utf8");

test("desktop shell uses the operating system titlebar", () => {
  expect(mainWindow).toBeDefined();
  expect(mainWindow?.decorations).toBe(true);
  expect("titleBarStyle" in (mainWindow ?? {})).toBe(false);
  expect("hiddenTitle" in (mainWindow ?? {})).toBe(false);
  expect("trafficLightPosition" in (mainWindow ?? {})).toBe(false);
  expect(mainRustSource).not.toContain("window_builder.decorations(false)");
});

test("renderer does not install a custom native-window drag region", () => {
  expect(bridgeSource).not.toContain("startDragging");
  expect(bridgeSource).not.toContain("data-tauri-drag-region");
  expect(appSource).not.toContain("WindowTitleBar");
});
