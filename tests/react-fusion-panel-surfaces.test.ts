import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import { FusionViewportCard } from "../src/renderer-react/src/features/fusion-mode/FusionViewportCard";
import { ConversationDrawer } from "../src/renderer-react/src/components/ConversationDrawer";
import { copilotTheme, FLOATING_SURFACE_ELEVATION } from "../src/renderer-react/src/theme";
import { FUSION_PANEL_FRAME_SX, fusionPanelComposerInsets } from "../src/renderer-react/src/features/fusion-mode/panelLayout";
import { clampFusionPoint, defaultFusionPoint } from "../src/renderer-react/src/features/fusion-mode/geometry";

const renderer = join(import.meta.dir, "../src/renderer-react/src");

describe("fusion toolbar panel surface consistency", () => {
  test("all panels share four-edge geometry, including settings and narrow history", () => {
    expect(FUSION_PANEL_FRAME_SX).toMatchObject({ top: "max(12px, calc((100dvh - var(--fusion-toolbar-height, 0px)) / 2))", right: 72, bottom: 12, width: "min(420px, calc(100vw - 84px))" });
    const card = readFileSync(join(renderer, "features/fusion-mode/FusionViewportCard.tsx"), "utf8");
    const history = readFileSync(join(renderer, "components/ConversationDrawer.tsx"), "utf8");
    const overlays = readFileSync(join(renderer, "features/assistant-workspace/FusionAssistantOverlays.tsx"), "utf8");
    expect(card).toContain("...FUSION_PANEL_FRAME_SX");
    expect(history).toContain("viewport ? FUSION_PANEL_FRAME_SX");
    expect(history).toContain("border: viewport ? 1 : 0");
    expect(overlays).not.toContain(" wide");
    expect(card).not.toContain("wide?:");
  });

  test("tracks the actual toolbar height and releases its layout token on unmount", () => {
    const toolbar = readFileSync(join(renderer, "features/fusion-mode/FusionToolbar.tsx"), "utf8");
    expect(toolbar).toContain("new ResizeObserver(updateHeight)");
    expect(toolbar).toContain("toolbar.offsetHeight");
    expect(toolbar).toContain("style.setProperty(FUSION_TOOLBAR_HEIGHT_PROPERTY");
    expect(toolbar).toContain("observer?.disconnect()");
    expect(toolbar).toContain("style.removeProperty(FUSION_TOOLBAR_HEIGHT_PROPERTY)");
  });

  test("settings tabs stay reachable in the shared narrow frame", () => {
    const settings = readFileSync(join(renderer, "features/desktop/SettingsPanel.tsx"), "utf8");
    expect(settings).toContain('variant={verticalNavigation ? "standard" : "scrollable"}');
    expect(settings).toContain('scrollButtons={verticalNavigation ? false : "auto"}');
    expect(settings).toContain("allowScrollButtonsMobile");
  });

  test("panels leave a 16px composer gap whenever both surfaces fit", () => {
    const composer = { width: 390, height: 72 };
    for (const width of [910, 1024, 1280, 1920]) {
      const viewport = { width, height: 900 };
      const insets = fusionPanelComposerInsets(viewport, composer);
      expect(insets.right).toBe(508);
      const point = clampFusionPoint(defaultFusionPoint(viewport, composer), viewport, composer, insets);
      const panelLeft = width - 72 - 420;
      expect(panelLeft - point.x - composer.width / 2).toBeGreaterThanOrEqual(16);
      expect(point.x - composer.width / 2).toBeGreaterThanOrEqual(12);
    }
    expect(fusionPanelComposerInsets({ width: 760, height: 800 }, composer)).toEqual({});
    expect(fusionPanelComposerInsets({ width: 360, height: 640 }, composer)).toEqual({});
  });

  test("shares the application floating-surface elevation", () => {
    const composer = readFileSync(join(renderer, "features/assistant-ui/GeoChatComposer.tsx"), "utf8");
    const card = readFileSync(join(renderer, "features/fusion-mode/FusionViewportCard.tsx"), "utf8");
    expect(FLOATING_SURFACE_ELEVATION).toBe(3);
    expect(composer).toContain("boxShadow: isFusion ? FLOATING_SURFACE_ELEVATION : 0");
    expect(card).toContain("elevation={FLOATING_SURFACE_ELEVATION}");
  });

  for (const panelId of ["blackboard", "problem-bank", "settings", "transcript"]) {
    test(`${panelId} inherits the theme panel shadow`, () => {
      const html = renderToStaticMarkup(createElement(ThemeProvider, { theme: copilotTheme }, createElement(FusionViewportCard, {
        panelId, title: panelId, closeLabel: "Close", onClose: () => {}, children: "Content",
        ...(panelId === "blackboard" ? { className: "geochat-blackboard geochat-blackboard--fusion" } : {}),
      })));
      expect(html).toContain(`MuiPaper-elevation${FLOATING_SURFACE_ELEVATION}`);
      expect(html).toContain(`--Paper-shadow:${copilotTheme.shadows[FLOATING_SURFACE_ELEVATION]}`);
    });
  }

  test("history uses the same floating shadow in fusion and window surfaces", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: "en", resources: { en: { translation: { history: { title: "History", close: "Close", empty: "Empty" } } } } });
    for (const viewport of [true, false]) {
      const html = renderToStaticMarkup(createElement(ThemeProvider, { theme: copilotTheme }, createElement(I18nextProvider, { i18n }, createElement(ConversationDrawer, {
        viewport, open: true, interactionDisabled: false, loading: false, selectingId: null, deletingId: null,
        error: null, conversations: [], currentConversationId: null, onClose: () => {}, onSelect: () => {}, onDelete: async () => true,
      }))));
      expect(html).toContain(`box-shadow:${copilotTheme.shadows[FLOATING_SURFACE_ELEVATION]}`);
    }
  });
});
