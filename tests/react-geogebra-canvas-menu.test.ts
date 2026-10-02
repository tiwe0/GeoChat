import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { GeoGebraRuntimeProvider, type GeoGebraRuntimePort } from "../src/renderer-react/src/geogebra/runtime";
import { GeoGebraMenuBar } from "../src/renderer-react/src/features/geogebra/GeoGebraCanvasMenu";
import { downloadCanvasExport, type CanvasDownloadPort } from "../src/renderer-react/src/features/geogebra/canvasExport";
import { UNAVAILABLE_GEOGEBRA_CONTROLS } from "../src/renderer-react/src/geogebra/canvas-controls";
import { en } from "../src/renderer-react/src/i18n/locales/en";
import { zhCN } from "../src/renderer-react/src/i18n/locales/zh-CN";

describe("fusion canvas menu", () => {
  test("renders a collapsed accessible trigger even before the canvas is ready", () => {
    const runtime = {
      ready: false,
      canvasControls: { getSnapshot: () => UNAVAILABLE_GEOGEBRA_CONTROLS, subscribe: () => () => {}, setToolMode: async () => {}, performAction: async () => {} },
    } as unknown as GeoGebraRuntimePort;
    const markup = renderToStaticMarkup(createElement(GeoGebraRuntimeProvider, { runtime }, createElement(GeoGebraMenuBar, { onOpenDocuments: () => {} })));
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('role="menubar"');
    expect(markup).toContain('data-geogebra-canvas-menu="true"');
    expect(markup).toContain('right:18px');
    expect(markup).toContain('bottom:12px');
    expect(markup).not.toContain('left:8px');
    expect(markup).not.toContain('top:8px');
  });

  test("keeps the corner trigger stationary while revealing sections leftward and submenus upward", () => {
    const source = readFileSync("src/renderer-react/src/features/geogebra/GeoGebraCanvasMenu.tsx", "utf8");
    expect(source.indexOf("<AnimatePresence")).toBeLessThan(source.indexOf("<Tooltip"));
    expect(source).toContain('anchorOrigin={{ vertical: "top", horizontal: "right" }}');
    expect(source).toContain('transformOrigin={{ vertical: "bottom", horizontal: "right" }}');
    expect(source).toContain("mt: -0.5, minWidth: 220");
    expect(source).toContain('width: 0, opacity: 0, x: 8');
    expect(source).toContain('bottom: "calc(100% + 8px)", right: 0');
    expect(source).toContain('ref={menuBarRef}');
    expect(source).toContain('menuBarRef.current?.querySelector<HTMLButtonElement>("button")?.focus');
    expect(source).toContain('event.key === "ArrowUp"');
    expect(source).toContain('minHeight: 42, boxSizing: "border-box", alignItems: "center"');
  });

  test("matches the composer bottom gutter and the right rail edge", () => {
    const source = readFileSync("src/renderer-react/src/features/geogebra/GeoGebraCanvasMenu.tsx", "utf8");
    const toolbar = readFileSync("src/renderer-react/src/features/fusion-mode/FusionToolbar.tsx", "utf8");
    const geometry = readFileSync("src/renderer-react/src/features/fusion-mode/geometry.ts", "utf8");
    expect(source).toContain("bottom: 12, right: 18");
    expect(toolbar).toContain("right: 18");
    expect(geometry).toContain("FUSION_VIEWPORT_GUTTER = 12");
  });

  test("provides matching bilingual menu actions without account or sharing actions", () => {
    expect(Object.keys(en.geogebra).sort()).toEqual(Object.keys(zhCN.geogebra).sort());
    for (const copy of [en.geogebra, zhCN.geogebra]) {
      expect(copy.localDocuments.length).toBeGreaterThan(0);
      expect(copy.resetDescription.length).toBeGreaterThan(0);
      expect(copy.undo.length).toBeGreaterThan(0);
    }
    const source = readFileSync("src/renderer-react/src/features/geogebra/GeoGebraCanvasMenu.tsx", "utf8");
    expect(source).toContain('mode === "fusion"');
    expect(source).toContain('role="menubar"');
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('duration: reduceMotion ? 0 : 0.18');
    expect(source).toContain("<ClickAwayListener");
    expect(source).toContain("onExited:");
    expect(source).toContain("anchor?.isConnected");
    expect(source).toMatch(/<Dialog\b[^>]*open=\{confirmReset\}/);
    expect(source).toContain("snapshot.blocked");
    expect(source).not.toMatch(/login|analytics|share|\.click\(\).*GeoGebra/i);
  });

  test("reserves vertical space above the existing message container without moving the composer", () => {
    const source = readFileSync("src/renderer-react/src/features/fusion-mode/FusionModeSurface.tsx", "utf8");
    expect(source).toContain("maxHeight: conversationLayout.maxHeight");
    const geometry = readFileSync("src/renderer-react/src/features/fusion-mode/geometry.ts", "utf8");
    expect(geometry).toContain("viewport.height - bottom - 100");
    expect(source).toContain("x={composerPoint.x}");
    expect(source).toContain("y={composerPoint.y}");
  });
});

describe("shell-owned canvas exports", () => {
  function downloadPort(fail = false) {
    const events: string[] = [];
    let captured: Blob | undefined;
    let cleanup: (() => void) | undefined;
    const port: CanvasDownloadPort = {
      createUrl: (blob) => { captured = blob; events.push("create"); return "blob:canvas"; },
      download: (url, filename) => { events.push(`${url}:${filename}`); if (fail) throw new Error("download failed"); },
      revokeUrl: (url) => { events.push(`revoke:${url}`); },
      defer: (callback) => { events.push("defer"); cleanup = callback; },
    };
    return { port, events, blob: () => captured!, cleanup: () => cleanup?.() };
  }

  test("preserves binary data and delays object URL cleanup", async () => {
    const result = downloadPort();
    downloadCanvasExport({ base64: btoa("PK\u0003\u0004\u0000\u00ff"), mimeType: "application/vnd.geogebra.file", filename: "GeoChat.ggb" }, result.port);
    expect(result.blob().type).toBe("application/vnd.geogebra.file");
    expect([...new Uint8Array(await result.blob().arrayBuffer())]).toEqual([80, 75, 3, 4, 0, 255]);
    expect(result.events).toEqual(["create", "blob:canvas:GeoChat.ggb", "defer"]);
    result.cleanup();
    expect(result.events.at(-1)).toBe("revoke:blob:canvas");
  });

  test("rejects empty or malformed exports before creating a download", () => {
    for (const base64 of ["", "%%%invalid%%%"] ) {
      const result = downloadPort();
      expect(() => downloadCanvasExport({ base64, mimeType: "image/png", filename: "GeoChat.png" }, result.port)).toThrow();
      expect(result.events).toEqual([]);
    }
  });

  test("cleans up backing bytes when the download fails", () => {
    const result = downloadPort(true);
    expect(() => downloadCanvasExport({ base64: btoa("PNG"), mimeType: "image/png", filename: "GeoChat.png" }, result.port)).toThrow("download failed");
    result.cleanup();
    expect(result.events.at(-1)).toBe("revoke:blob:canvas");
  });
});
