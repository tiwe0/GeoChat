import { describe, expect, test } from "bun:test";
import {
  CONFIG_STORAGE_KEY,
  DESKTOP_CONFIG_CHANGED_EVENT,
  createDefaultDesktopConfig,
  normalizeDesktopConfig,
  normalizeInteractionConfig,
  persistDesktopConfig,
  readDesktopConfig,
} from "../src/shared/desktop/desktop-config";

describe("desktop interaction mode", () => {
  test("defaults new and unrecognized configurations to fusion mode", () => {
    expect(createDefaultDesktopConfig("zh-CN").interaction).toEqual({ mode: "fusion" });
    expect(normalizeDesktopConfig({}, "zh-CN").interaction).toEqual({ mode: "fusion" });
    expect(normalizeInteractionConfig({ mode: "unknown" })).toEqual({ mode: "fusion" });
  });

  test("preserves either explicit interaction mode", () => {
    expect(normalizeDesktopConfig({ interaction: { mode: "fusion" } }, "zh-CN").interaction)
      .toEqual({ mode: "fusion" });
    expect(normalizeDesktopConfig({ interaction: { mode: "window" } }, "zh-CN").interaction)
      .toEqual({ mode: "window" });
  });

  test("persists fusion mode through the canonical desktop config and restores it after a reload", () => {
    const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    let changeEvents = 0;
    const onChange = () => { changeEvents += 1; };
    globalThis.addEventListener(DESKTOP_CONFIG_CHANGED_EVENT, onChange);

    try {
      const config = createDefaultDesktopConfig("zh-CN");
      persistDesktopConfig({ ...config, interaction: { mode: "fusion" } });

      expect(JSON.parse(values.get(CONFIG_STORAGE_KEY) ?? "{}").interaction).toEqual({ mode: "fusion" });
      expect(readDesktopConfig().interaction).toEqual({ mode: "fusion" });
      expect(changeEvents).toBe(1);
    } finally {
      globalThis.removeEventListener(DESKTOP_CONFIG_CHANGED_EVENT, onChange);
      if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
