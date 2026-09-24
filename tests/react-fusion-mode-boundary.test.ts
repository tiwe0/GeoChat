import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const moduleRoot = join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode");

describe("fusion-mode module boundary", () => {
  test("keeps the fusion interface independent from legacy panel components", () => {
    const source = readdirSync(moduleRoot)
      .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
      .map((name) => readFileSync(join(moduleRoot, name), "utf8"))
      .join("\n");

    expect(source).not.toContain("components/ChatComposer");
    expect(source).not.toContain("components/AssistantPanel");
    expect(source).not.toContain("components/AssistantProcess");
    expect(source).not.toContain("components/AgentToolResult");
  });

  test("limits the legacy panel to a single fusion-mode integration point", () => {
    const panel = readFileSync(join(import.meta.dir, "../src/renderer-react/src/components/AssistantPanel.tsx"), "utf8");
    expect(panel).toContain("<FusionModeSurface");
    expect(panel).toContain("<InteractionModeButton");
    expect(panel).not.toContain("FusionComposer");
    expect(panel).not.toContain("FusionBubbleStack");
  });

  test("keeps the mode switch animated and available in both top bars", () => {
    const button = readFileSync(join(moduleRoot, "InteractionModeButton.tsx"), "utf8");
    const toolbar = readFileSync(join(moduleRoot, "FusionToolbar.tsx"), "utf8");
    const panel = readFileSync(join(import.meta.dir, "../src/renderer-react/src/components/AssistantPanel.tsx"), "utf8");
    const transition = readFileSync(join(moduleRoot, "InteractionModeTransition.tsx"), "utf8");
    expect(button).toContain("<AnimatePresence");
    expect(button).toContain("data-interaction-mode-toggle");
    expect(button).toContain("whileTap");
    expect(button).not.toContain("disabled");
    expect(toolbar).toContain("<InteractionModeButton");
    expect(toolbar).not.toContain('<InteractionModeButton mode="fusion" disabled=');
    expect(panel).not.toContain('<InteractionModeButton\n                mode="window"\n                disabled=');
    const transitionHook = readFileSync(join(moduleRoot, "useInteractionModeTransition.ts"), "utf8");
    expect(transitionHook).toContain("startViewTransition");
    expect(transitionHook).toContain("Math.hypot");
    expect(transitionHook).toContain("flushSync");
    expect(transitionHook).not.toContain("nextPaint");
    expect(transition).toContain("clipPath");
    expect(transition).toContain("useReducedMotion");
    const styles = readFileSync(join(import.meta.dir, "../src/renderer-react/src/styles.css"), "utf8");
    expect(styles).toContain("@keyframes interaction-mode-circle-reveal");
    expect(styles).toContain("html.interaction-mode-view-transition::view-transition-new(root)");
    expect(styles).toContain("clip-path: circle(var(--interaction-transition-radius)");
    expect(styles).toContain("interaction-mode-circle-reveal 900ms");
  });

  test("keeps the canvas introduction visible above the initial fusion surface", () => {
    const app = readFileSync(join(import.meta.dir, "../src/renderer-react/src/App.tsx"), "utf8");
    const styles = readFileSync(join(import.meta.dir, "../src/renderer-react/src/styles.css"), "utf8");
    expect(app).toContain('interaction.mode === "fusion" ? " frontend-canvas-intro-fusion"');
    expect(styles).toContain(".frontend-canvas-intro-fusion");
    expect(styles).toContain("z-index: 1320");
  });

  test("does not create a spatial turn for an empty form submission", () => {
    const composer = readFileSync(join(moduleRoot, "FusionComposer.tsx"), "utf8");
    expect(composer).toContain("if (props.busy || preparing || !canSubmit) return");
    expect(composer).toContain('type={props.busy ? "button" : "submit"}');
    expect(composer).toContain("disabled={preparing || (!props.busy && !canSubmit)}");
    expect(composer).toContain("onClick={props.busy ? props.onStop : undefined}");
  });

  test("slides the shared canvas introduction upward after the first request", () => {
    const app = readFileSync(join(import.meta.dir, "../src/renderer-react/src/App.tsx"), "utf8");
    expect(app).toContain("onConversationStarted={() => setCanvasIntroVisible(false)}");
    expect(app).toContain("y: -58");
    expect(app).toContain('clipPath: "inset(0 0 100% 0)"');
    expect(app).toContain("useReducedMotion");
  });

  test("lets a completed spatial turn summon the composer at its frozen anchor", () => {
    const controller = readFileSync(join(moduleRoot, "useFusionModeController.ts"), "utf8");
    const surface = readFileSync(join(moduleRoot, "FusionModeSurface.tsx"), "utf8");
    const bubbleStack = readFileSync(join(moduleRoot, "FusionBubbleStack.tsx"), "utf8");
    expect(controller).toContain("continueAtTurn");
    expect(controller).toContain("setComposerPoint(clampFusionPoint(turn.anchor, viewport()))");
    expect(surface).toContain("props.controller.continueAtTurn(turn.id)");
    expect(bubbleStack).toContain("props.onContinue");
  });

  test("removes fusion-only motion and transient positioning state at accessibility boundaries", () => {
    const assistantMessage = readFileSync(join(moduleRoot, "FusionAssistantMessage.tsx"), "utf8");
    const viewportCard = readFileSync(join(moduleRoot, "FusionViewportCard.tsx"), "utf8");
    const controller = readFileSync(join(moduleRoot, "useFusionModeController.ts"), "utf8");
    expect(assistantMessage).toContain("timeout={reduceMotion ? 0 : 160}");
    expect(assistantMessage).toContain("timeout={reduceMotion ? 0 : 170}");
    expect(viewportCard).toContain("duration: reduceMotion ? 0 : 0.22");
    expect(controller).toContain("if (!enabled)");
    expect(controller).toContain("setPositioning(false)");
  });

  test("keeps keyboard focus inside viewport cards without trapping portaled menus", () => {
    const viewportCard = readFileSync(join(moduleRoot, "FusionViewportCard.tsx"), "utf8");
    const panel = readFileSync(join(import.meta.dir, "../src/renderer-react/src/components/AssistantPanel.tsx"), "utf8");
    expect(viewportCard).toContain('FocusTrap from "@mui/material/Unstable_TrapFocus"');
    expect(viewportCard).toContain("<FocusTrap open disableRestoreFocus isEnabled={isViewportFocusTrapEnabled}>");
    expect(viewportCard).toContain("!document.querySelector('[role=\"menu\"], [role=\"listbox\"]')");
    expect(viewportCard).toContain("tabIndex={-1}");
    expect(viewportCard).toContain("keepViewportTabFocusInside(event)");
    expect(viewportCard).toContain("event.target instanceof HTMLElement");
    expect(viewportCard).toContain("last.focus({ preventScroll: true })");
    expect(panel).toContain("restoreFusionPanelTrigger");
    expect(panel).toContain("scheduleFusionPanelFocusRestore");
    expect(panel).toContain("reduceMotion ? 0 : 400");
    expect(panel).toContain("trigger.focus({ preventScroll: true })");
  });

  test("reserves transparent padding around scrollable bubbles so card shadows are not hard-clipped", () => {
    const bubbleStack = readFileSync(join(moduleRoot, "FusionBubbleStack.tsx"), "utf8");
    expect(bubbleStack).toContain('overflowY: "auto"');
    expect(bubbleStack).toContain('scrollbarGutter: "stable"');
    expect(bubbleStack).toContain("px: 2.5");
    expect(bubbleStack).toContain("pb: 3");
    expect(bubbleStack).toContain('scrollPaddingBlock: "12px 24px"');
  });

  test("keeps the live chat state above the surface split and mounts GeoGebra only once", () => {
    const panel = readFileSync(join(import.meta.dir, "../src/renderer-react/src/components/AssistantPanel.tsx"), "utf8");
    const panelWindow = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/panel-window/usePanelWindow.ts"), "utf8");
    const app = readFileSync(join(import.meta.dir, "../src/renderer-react/src/App.tsx"), "utf8");
    expect(panel.indexOf("useAgentRunChat({")).toBeGreaterThan(-1);
    expect(panel.indexOf('if (interaction.mode === "fusion")')).toBeGreaterThan(panel.indexOf("useAgentRunChat({"));
    expect(panel).toContain('usePanelWindow(panelView, interaction.mode === "window")');
    expect(panel).toContain("fusionPanelFromWindowState");
    expect(panel).toContain("windowStateFromFusionPanel");
    expect(panel).not.toContain('closeFusionPanel({ restoreFocus: false });\n          modeTransition.requestMode("window", origin);');
    expect(panelWindow).toContain("export function usePanelWindow(view: PanelView, enabled = true)");
    expect(panelWindow).toContain("if (!enabled || collapsed) return");
    expect(panelWindow).toContain("}, [enabled]);");
    expect(app.match(/mountGeoGebra\(/g)).toHaveLength(1);
    expect(app).toContain("  }, []);");
  });
});
