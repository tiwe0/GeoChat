import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import { BlackboardDrawer, BlackboardPanel } from "../src/renderer-react/src/components/BlackboardDrawer";
import type { BlackboardEntry } from "@geochat-ai/app/blackboard";

const renderer = join(import.meta.dir, "../src/renderer-react/src");
const overlays = readFileSync(join(renderer, "features/assistant-workspace/FusionAssistantOverlays.tsx"), "utf8");
const card = readFileSync(join(renderer, "features/fusion-mode/FusionViewportCard.tsx"), "utf8");

describe("fusion blackboard panel lifecycle", () => {
  test("uses the same AnimatePresence card as the problem bank without a second modal", () => {
    const presence = overlays.indexOf("<AnimatePresence");
    const blackboard = overlays.indexOf('panel === "blackboard"');
    const problemBank = overlays.indexOf('panel === "problem-bank"');
    expect(blackboard).toBeGreaterThan(presence);
    expect(blackboard).toBeLessThan(problemBank);
    expect(overlays).toContain('key="fusion-blackboard" panelId="blackboard"');
    expect(overlays).toContain("<BlackboardPanel");
    expect(overlays).not.toContain("<BlackboardDrawer");
    expect(overlays).toContain('className="geochat-blackboard geochat-blackboard--fusion"');
  });

  test("releases focus and pointer ownership as soon as a card starts exiting", () => {
    expect(card).toContain("useIsPresent()");
    expect(card).toContain("open={isPresent}");
    expect(card).toContain('pointerEvents: isPresent ? "auto" : "none"');
    expect(card).toContain("inert={!isPresent}");
    expect(card).toContain("disableRestoreFocus");
    expect(card).toContain("duration: reduceMotion ? 0 : 0.22");
  });

  test("renders shared blackboard content without a modal, backdrop or nested drawer", async () => {
    const entry: BlackboardEntry = {
      id: "entry-1", conversationId: "conversation-1", key: "goal", category: "goal", value: "Find the circle radius",
      status: "active", confidence: 0.9, reason: "From the prompt", createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
    };
    const html = await renderBlackboard(false, [entry, { ...entry, id: "entry-2", status: "archived", value: "Archived content" }]);
    expect(html).toContain('id="copilot-blackboard-drawer"');
    expect(html).toContain("Find the circle radius");
    expect(html).toContain("From the prompt");
    expect(html).toContain("Current (1)");
    expect(html).toContain("Archived (1)");
    expect(html).not.toContain("Archived content");
    expect(html).toContain('aria-label="Refresh"');
    expect(html).toContain("data-fusion-panel-close");
    expect(html).not.toContain("MuiModal-root");
    expect(html).not.toContain("MuiBackdrop-root");
    expect(html).not.toContain("MuiDrawer-paper");
  });

  test("keeps the ordinary window blackboard in its original left drawer", async () => {
    const html = await renderBlackboard(true);
    expect(html).toContain("MuiModal-root");
    expect(html).toContain("MuiDrawer-anchorLeft");
    expect(html).toContain("MuiDrawer-paper");
    expect(html).toContain("MuiBackdrop-root");
    expect(html).toContain('id="copilot-blackboard-drawer"');
  });
});

async function renderBlackboard(drawer: boolean, entries: BlackboardEntry[] = []) {
  const i18n = i18next.createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: { blackboard: {
    title: "Blackboard", refresh: "Refresh", close: "Close", views: "Views",
    current: "Current ({{count}})", archived: "Archived ({{count}})", emptyCurrent: "Empty", categories: { goal: "Goal" },
  } } } } });
  const props = { conversationId: "conversation-1", loading: false, error: null, entries, onClose: () => {}, onRefresh: () => {} };
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n }, drawer
    ? createElement(BlackboardDrawer, { ...props, open: true })
    : createElement(BlackboardPanel, props)));
}
