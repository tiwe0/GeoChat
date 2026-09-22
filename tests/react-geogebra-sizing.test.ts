import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

describe("GeoGebra canvas sizing ownership", () => {
  test("the imperative WebGL applet is not double-mounted by React StrictMode", () => {
    const entry = readFileSync(resolve(root, "src/renderer-react/src/main.tsx"), "utf8");
    const app = readFileSync(resolve(root, "src/renderer-react/src/App.tsx"), "utf8");

    expect(entry).not.toContain("<StrictMode>");
    expect(app).toContain('error.name === "AbortError"');
  });

  test("the shell sizes the applet frame without overriding GeoGebra's DPR-aware canvases", () => {
    const wrapper = readFileSync(resolve(root, "src/renderer-react/src/geogebra/ggbdeploy-wrapper.ts"), "utf8");
    const styles = readFileSync(resolve(root, "src/renderer-react/src/styles.css"), "utf8");

    expect(wrapper).toContain('root.querySelector<HTMLElement>(".GeoGebraFrame")');
    expect(wrapper).toContain("setSize.call(runtimeApi, width, height)");
    expect(wrapper).toContain("new ResizeObserver(scheduleSyncSize)");
    expect(wrapper).toContain('querySelector(".GeoGebraFrame canvas")');
    expect(wrapper).not.toContain('querySelector(".GeoGebraFrame, canvas")');
    expect(wrapper).not.toContain("visualRefreshTimers");
    expect(wrapper).not.toContain("lastRuntimeSize");
    expect(wrapper).not.toContain("for (const delay of");
    expect(wrapper).not.toContain('window.addEventListener("resize", scheduleSyncSize)');
    expect(wrapper).not.toContain('canvas.style.width = "100%"');
    expect(wrapper).not.toContain('canvas.style.height = "100%"');
    expect(styles).not.toMatch(/\.frontend-canvas-host\s+canvas\s*\{[^}]*width:\s*100%/s);
    expect(styles).not.toMatch(/\.frontend-canvas-host\s+canvas\s*\{[^}]*height:\s*100%/s);
  });
});
