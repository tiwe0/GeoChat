import { describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import { FusionToolbar } from "../src/renderer-react/src/features/fusion-mode/FusionToolbar";
import { GeoGebraToolButtons } from "../src/renderer-react/src/features/geogebra/GeoGebraToolButtons";
import { GEOGEBRA_TOOL_GROUPS } from "../src/renderer-react/src/features/geogebra/toolCatalog";
import type { GeoGebraCanvasControls, GeoGebraControlsSnapshot } from "../src/renderer-react/src/geogebra/canvas-controls";
import { GeoGebraRuntimeProvider, type GeoGebraRuntimePort } from "../src/renderer-react/src/geogebra/runtime";

async function renderWithCanvas(snapshot: GeoGebraControlsSnapshot, children: ReactNode, includeControls = true) {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: { geogebra: { tools: "GeoGebra tools", toolError: "Could not select the GeoGebra tool." } } } },
  });
  const controls: GeoGebraCanvasControls = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    setToolMode: async () => {},
    performAction: async () => {},
  };
  const runtime: GeoGebraRuntimePort = {
    ready: snapshot.ready,
    ...(includeControls ? { canvasControls: controls } : {}),
    executeTool: async () => ({}),
    runCanvasTransaction: async (_options, work) => work(async () => ({})),
    getCanvasXml: () => undefined,
    captureDocumentBase64: async () => "",
    restoreDocumentBase64: async () => {},
  };
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n }, createElement(GeoGebraRuntimeProvider, { runtime }, children)),
  );
}

const READY_SNAPSHOT: GeoGebraControlsSnapshot = {
  ready: true,
  blocked: false,
  mode: 1,
  gridVisible: true,
  axesVisible: true,
  supportsToolModes: true,
  supportedActions: [],
};

describe("fusion GeoGebra tool UI", () => {
  test("uses unique documented 2D mode IDs without login or sharing actions", () => {
    const tools = GEOGEBRA_TOOL_GROUPS.flatMap((group) => group.tools);
    const modes = tools.map((entry) => entry.mode);
    const labels = JSON.stringify(GEOGEBRA_TOOL_GROUPS).toLowerCase();

    expect(new Set(modes).size).toBe(modes.length);
    expect(modes).toContain(0);
    expect(modes).toContain(1);
    expect(modes).toContain(2);
    expect(modes).toContain(8);
    expect(modes).toContain(10);
    expect(modes).toContain(16);
    expect(modes).toContain(36);
    expect(modes).toContain(62);
    expect(modes).toContain(6);
    expect(modes.some((mode) => mode >= 510)).toBe(false);
    expect(labels).not.toContain("login");
    expect(labels).not.toContain("share");
    expect(labels).not.toContain("登录");
    expect(labels).not.toContain("分享");
  });

  test("renders accessible selected tool groups from the canvas snapshot", async () => {
    const html = await renderWithCanvas(READY_SNAPSHOT, createElement(GeoGebraToolButtons));

    expect(html).toContain('aria-label="GeoGebra tools"');
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-label="Points"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-geogebra-tools="true"');
  });

  test("disables tool groups when the canvas is unavailable", async () => {
    const html = await renderWithCanvas(
      { ...READY_SNAPSHOT, ready: false, mode: null, supportsToolModes: false },
      createElement(GeoGebraToolButtons),
    );

    expect((html.match(/ disabled=""/g) ?? []).length).toBe(GEOGEBRA_TOOL_GROUPS.length);
  });

  test("uses the stable unavailable snapshot when the runtime omits canvas controls", async () => {
    const html = await renderWithCanvas(
      READY_SNAPSHOT,
      createElement(GeoGebraToolButtons),
      false,
    );

    expect((html.match(/ disabled=""/g) ?? []).length).toBe(GEOGEBRA_TOOL_GROUPS.length);
    expect(html).not.toContain('aria-pressed="true"');
  });

  test("hardens popup motion, duplicate selection, overflow and localized errors", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/renderer-react/src/features/geogebra/GeoGebraToolButtons.tsx"),
      "utf8",
    );

    expect(source).toContain("useReducedMotion()");
    expect(source).toContain("transitionDuration={reduceMotion ? 0 : 180}");
    expect(source).toContain("pendingRef.current");
    expect(source).toContain('t("geogebra.toolError", { message: error })');
    expect(source).toContain("zIndex: 1400");
    expect(source).toContain('overscrollBehavior: "contain"');
    expect(source).toContain('maxWidth: "calc(100vw - 24px)"');
    expect(source).toContain("<Portal>");
    expect(source).toContain('<Tooltip key={entry.mode} title={label} placement="left" arrow>');
  });

  test("places a horizontal separator after GeoChat actions and before GeoGebra tools", async () => {
    const html = await renderWithCanvas(READY_SNAPSHOT, createElement(FusionToolbar, {
      windowLabel: "Window",
      historyLabel: "History",
      transcriptLabel: "Transcript",
      newConversationLabel: "New",
      blackboardLabel: "Blackboard",
      problemBankLabel: "Problems",
      settingsLabel: "Settings",
      onOpenHistory: () => {},
      onOpenTranscript: () => {},
      onNewConversation: () => {},
      onOpenBlackboard: () => {},
      onOpenProblemBank: () => {},
      onOpenSettings: () => {},
      onSwitchToWindow: () => {},
    }));

    const newConversationIndex = html.indexOf('aria-label="New"');
    const separatorIndex = html.indexOf('data-toolbar-section-separator="geogebra"');
    const toolsIndex = html.indexOf('data-geogebra-tools="true"');
    expect(newConversationIndex).toBeGreaterThan(-1);
    expect(separatorIndex).toBeGreaterThan(newConversationIndex);
    expect(html).not.toContain('data-copilot-tour="fusion-position"');
    expect(html).not.toContain('data-copilot-tour="fusion-summon"');
    expect(toolsIndex).toBeGreaterThan(separatorIndex);
    const separator = html.slice(separatorIndex, toolsIndex);
    expect(separator).toContain("lucide-minus");
    expect(separator).not.toContain("<button");
    expect(separator).not.toContain("tabindex");
    expect(html).toContain("width:24px;height:16px;");
    expect(html).toContain("flex-shrink:0");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("top:50%");
    expect(html).toContain("translateY(-50%)");
    expect(html).toContain("max-height:calc(100dvh - 24px)");
  });

  test("gives language controls a localized tooltip, including disabled transitions", () => {
    const source = readFileSync(join(import.meta.dir, "../src/renderer-react/src/components/LanguageButton.tsx"), "utf8");
    const workspace = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/assistant-workspace/AssistantWorkspace.tsx"), "utf8");
    expect(source).toContain("<Tooltip title={label} placement={tooltipPlacement} arrow>");
    expect(source).toContain('<span style={{ display: "inline-flex" }}>');
    expect(source).not.toContain("title={label}\n");
    expect(workspace).toContain('<LanguageButton tooltipPlacement="left" />');
  });
});
