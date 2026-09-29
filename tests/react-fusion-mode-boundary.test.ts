import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const moduleRoot = join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode");
const workspaceRoot = join(import.meta.dir, "../src/renderer-react/src/features/assistant-workspace");
const workspace = readFileSync(join(workspaceRoot, "AssistantWorkspace.tsx"), "utf8");
const windowSurface = readFileSync(join(workspaceRoot, "AssistantWindowSurface.tsx"), "utf8");
const fusionSurface = readFileSync(join(workspaceRoot, "AssistantFusionSurface.tsx"), "utf8");
const fusionPanelState = readFileSync(join(workspaceRoot, "useAssistantFusionPanel.ts"), "utf8");

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
    expect(source).not.toContain("MessageProvider");
    expect(source).not.toContain("fromThreadMessageLike");
    expect(source).not.toContain("FusionAssistantMessage");
    expect(source).toContain("GeoChatMessageById");
    expect(source).toContain("GeoChatDisplayToolById");
  });

  test("limits the workspace to dedicated fusion and window surface integrations", () => {
    expect(workspace).toContain("<AssistantFusionSurface");
    expect(workspace).toContain("<AssistantWindowSurface");
    expect(fusionSurface).toContain("<FusionModeSurface");
    expect(windowSurface).toContain("<InteractionModeButton");
    expect(workspace).not.toContain("FusionComposer");
    expect(workspace).not.toContain("FusionBubbleStack");
  });

  test("keeps the mode switch animated and available in both top bars", () => {
    const button = readFileSync(join(moduleRoot, "InteractionModeButton.tsx"), "utf8");
    const toolbar = readFileSync(join(moduleRoot, "FusionToolbar.tsx"), "utf8");
    const transition = readFileSync(join(moduleRoot, "InteractionModeTransition.tsx"), "utf8");
    expect(button).toContain("<AnimatePresence");
    expect(button).toContain("data-interaction-mode-toggle");
    expect(button).toContain('import { CombineIcon, SquareIcon } from "lucide-react"');
    expect(button).toContain('<CombineIcon size={18} />');
    expect(button).toContain('<SquareIcon size={18} />');
    expect(button).toContain("whileTap");
    expect(button).not.toContain("disabled");
    expect(toolbar).toContain("<InteractionModeButton");
    expect(toolbar).not.toContain('<InteractionModeButton mode="fusion" disabled=');
    expect(windowSurface).not.toContain('<InteractionModeButton mode="window" disabled=');
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
    expect(app).not.toContain("frontend-canvas-intro-badge");
    expect(styles).toContain(".frontend-canvas-intro-fusion");
    expect(styles).not.toContain(".frontend-canvas-intro-badge");
    expect(styles).toContain("z-index: 1320");
  });

  test("lets assistant-ui own submit validity before freezing a spatial turn", () => {
    const sharedComposer = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/assistant-ui/GeoChatComposer.tsx"), "utf8");
    const surface = readFileSync(join(moduleRoot, "FusionModeSurface.tsx"), "utf8");
    expect(sharedComposer).toContain("<ComposerPrimitive.Root");
    expect(sharedComposer).toContain("<ComposerPrimitive.Send");
    expect(sharedComposer).toContain("onSubmit={() => {");
    expect(surface).toContain("const prepareSubmit = () => {");
    expect(surface).toContain("onSubmit={prepareSubmit}");
    expect(surface).not.toContain("<form");
  });

  test("keeps the shared fusion composer controls vertically centered", () => {
    const sharedComposer = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/assistant-ui/GeoChatComposer.tsx"), "utf8");
    const composer = readFileSync(join(moduleRoot, "FusionComposer.tsx"), "utf8");
    expect(sharedComposer).toContain('{ alignItems: "center", px: isFusion ? 1 : 1.25, py: isFusion ? 0.5 : 1 }');
    expect(sharedComposer).not.toContain('alignItems: "flex-end"');
    expect(sharedComposer).toContain('lineHeight: "24px"');
    expect(composer).toContain('sx={{ minWidth: 0, alignItems: "center", cursor: "grab"');
    expect(composer).toContain("<GeoChatComposer");
    expect(composer).toContain('variant="fusion"');
  });

  test("moves the ready indicator into the fusion composer without a standalone canvas pill", () => {
    const app = readFileSync(join(import.meta.dir, "../src/renderer-react/src/App.tsx"), "utf8");
    const composer = readFileSync(join(moduleRoot, "FusionComposer.tsx"), "utf8");
    const surface = readFileSync(join(moduleRoot, "FusionModeSurface.tsx"), "utf8");
    const styles = readFileSync(join(import.meta.dir, "../src/renderer-react/src/styles.css"), "utf8");
    expect(app).not.toContain("frontend-canvas-status");
    expect(styles).not.toContain(".frontend-canvas-status");
    expect(composer).toContain("props.canvasConnected &&");
    expect(composer).toContain("aria-label={props.canvasConnectedLabel}");
    expect(surface).toContain('canvasConnectedLabel={t("canvasStatus.canvas.ready")}');
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

  test("removes fusion motion and transient positioning state at accessibility boundaries", () => {
    const bubbleStack = readFileSync(join(moduleRoot, "FusionBubbleStack.tsx"), "utf8");
    const composer = readFileSync(join(moduleRoot, "FusionComposer.tsx"), "utf8");
    const viewportCard = readFileSync(join(moduleRoot, "FusionViewportCard.tsx"), "utf8");
    const controller = readFileSync(join(moduleRoot, "useFusionModeController.ts"), "utf8");
    expect(bubbleStack).toContain('transition: reduceMotion ? "none"');
    expect(bubbleStack).toContain("duration: reduceMotion || historyGesture.direction ? 0 : 0.2");
    expect(composer).toContain("transition={{ duration: reduceMotion ? 0 : 0.2");
    expect(viewportCard).toContain("duration: reduceMotion ? 0 : 0.22");
    expect(controller).toContain("if (!enabled)");
    expect(controller).toContain("setPositioning(false)");
  });

  test("keeps keyboard focus inside viewport cards without trapping portaled menus", () => {
    const viewportCard = readFileSync(join(moduleRoot, "FusionViewportCard.tsx"), "utf8");
    expect(viewportCard).toContain('FocusTrap from "@mui/material/Unstable_TrapFocus"');
    expect(viewportCard).toContain("<FocusTrap open disableRestoreFocus isEnabled={isViewportFocusTrapEnabled}>");
    expect(viewportCard).toContain("!document.querySelector('[role=\"menu\"], [role=\"listbox\"]')");
    expect(viewportCard).toContain("tabIndex={-1}");
    expect(viewportCard).toContain("keepViewportTabFocusInside(event)");
    expect(viewportCard).toContain("event.target instanceof HTMLElement");
    expect(viewportCard).toContain("last.focus({ preventScroll: true })");
    expect(fusionPanelState).toContain("restoreTrigger");
    expect(fusionPanelState).toContain("focusRestoreTimerRef.current = globalThis.setTimeout");
    expect(fusionPanelState).toContain("input.reduceMotion ? 0 : 400");
    expect(fusionPanelState).toContain("trigger.focus({ preventScroll: true })");
  });

  test("keeps complete bubble cards visible while only their body scrolls without a visible scrollbar", () => {
    const bubbleStack = readFileSync(join(moduleRoot, "FusionBubbleStack.tsx"), "utf8");
    const composer = readFileSync(join(moduleRoot, "FusionComposer.tsx"), "utf8");
    expect(bubbleStack).not.toContain('height: props.maxHeight');
    expect(bubbleStack).toContain('data-fusion-bubble-flow="true"');
    expect(bubbleStack).not.toContain("selectVisibleFusionBubbleIds");
    expect(bubbleStack).toContain('overflowY: "auto"');
    expect(bubbleStack).toContain('boxSizing: "border-box"');
    expect(bubbleStack).toContain('overflow: "visible"');
    expect(bubbleStack).toContain('overflow: "hidden"');
    expect(bubbleStack).toContain('scrollbarWidth: "none"');
    expect(bubbleStack).toContain('"&::-webkit-scrollbar": { display: "none" }');
    expect(bubbleStack).not.toContain('scrollbarGutter: "stable"');
    expect(bubbleStack).toContain('ref={managedScroll ? attachViewport : undefined}');
    expect(bubbleStack).toContain('ref={managedScroll ? fusionCardScroll.contentRef : undefined}');
    expect(bubbleStack).toContain('bubble.role !== "user"');
    expect(bubbleStack).toContain('const outlined = bubble.role === "error" || bubble.role === "display-card"');
    expect(bubbleStack).toContain('border: outlined ? 1 : 0');
    expect(bubbleStack).toContain("px: 2.5");
    expect(bubbleStack).toContain("pb: 3");
    expect(composer).toContain("zIndex: FUSION_COMPOSER_Z_INDEX");
  });

  test("keeps the live chat state above the surface split and mounts GeoGebra only once", () => {
    const panelWindow = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/panel-window/usePanelWindow.ts"), "utf8");
    const app = readFileSync(join(import.meta.dir, "../src/renderer-react/src/App.tsx"), "utf8");
    expect(workspace.indexOf("useAgentRunChat({")).toBeGreaterThan(-1);
    expect(workspace.indexOf('if (interaction.mode === "fusion")')).toBeGreaterThan(workspace.indexOf("useAgentRunChat({"));
    expect(workspace).toContain('usePanelWindow(panelView, interaction.mode === "window")');
    expect(fusionPanelState).toContain("fusionPanelFromWindowState");
    expect(fusionPanelState).toContain("windowStateFromFusionPanel");
    expect(workspace).not.toContain('closeFusionPanel({ restoreFocus: false });\n          modeTransition.requestMode("window", origin);');
    expect(panelWindow).toContain("export function usePanelWindow(view: PanelView, enabled = true)");
    expect(panelWindow).toContain("if (!enabled || collapsed) return");
    expect(panelWindow).toContain("}, [enabled]);");
    expect(app.match(/mountGeoGebra\(/g)).toHaveLength(1);
    expect(app).toContain("  }, [canvasMountGeneration]);");
  });

  test("completes a spatial turn only from the native chat finish event", () => {
    const turns = readFileSync(join(moduleRoot, "spatialTurns.ts"), "utf8");
    expect(workspace).toContain("onFinish: () => {");
    expect(workspace).toContain("fusionController.completeActiveTurn();");
    expect(turns).not.toContain('input.chatStatus === "ready" && Boolean(group)');
  });

  test("shares the follow and free-browse scroll state machine with fusion cards", () => {
    const bubbleStack = readFileSync(join(moduleRoot, "FusionBubbleStack.tsx"), "utf8");
    expect(bubbleStack).toContain("targetKey: followBubbleId");
    expect(bubbleStack).toContain("viewportKey: scrollOwnerBubbleId");
    expect(bubbleStack).toContain('data-scroll-mode={managedScroll ? fusionCardScroll.mode : undefined}');
    expect(bubbleStack).toContain('onWheelCapture={managedScroll ? fusionCardScroll.handleWheel : undefined}');
    expect(bubbleStack).toContain('fusionCardScroll.mode !== "follow"');
    expect(bubbleStack).toContain('props.turnStatus !== "active"');
    expect(bubbleStack).toContain('useRef<FusionTurnStatus | undefined>(undefined)');
    expect(bubbleStack).toContain('fusionCardScroll.followLatest()');
    const fusionCardScroll = readFileSync(join(moduleRoot, "useFusionCardScroll.ts"), "utf8");
    expect(fusionCardScroll).toContain('if (scrollFrameRef.current !== null) return;');
    expect(fusionCardScroll).toContain("targetKey?: string");
    expect(fusionCardScroll).toContain("viewportKey?: string");
    expect(fusionCardScroll).toContain("changeMode(\"follow\")");
    expect(fusionCardScroll).toContain("scrollToLatest, viewportKey");
    expect(fusionCardScroll).toContain("canBrowseEarlier(event.currentTarget)");
    expect(fusionCardScroll).not.toContain("const movedUp =");
  });

  test("delegates window follow behavior to the assistant-ui thread viewport", () => {
    const thread = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/assistant-ui/GeoChatThread.tsx"), "utf8");
    expect(workspace).not.toContain("useMessageScroll");
    expect(thread).toContain("<ThreadPrimitive.Viewport");
    expect(thread).toContain("autoScroll={autoScroll}");
    expect(thread).toContain("turnAnchor={turnAnchor}");
    expect(thread).toContain("<ThreadPrimitive.ViewportFooter");
  });
});
