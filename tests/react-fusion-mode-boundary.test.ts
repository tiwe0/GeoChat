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
    expect(source).toContain("GeoChatThread");
    expect(source).toContain("GeoChatMessage");
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

  test("stacks the fusion toolbar on the right without covering viewport panels", () => {
    const toolbar = readFileSync(join(moduleRoot, "FusionToolbar.tsx"), "utf8");
    const viewportCard = readFileSync(join(moduleRoot, "FusionViewportCard.tsx"), "utf8");
    const tour = readFileSync(join(moduleRoot, "FusionOnboardingTour.tsx"), "utf8");
    expect(toolbar).toContain('direction="column"');
    expect(toolbar).toContain("right: 18");
    expect(toolbar).toContain('top: "50%"');
    expect(toolbar).toContain('transform: "translateY(-50%)"');
    expect(toolbar).toContain('maxHeight: "calc(100dvh - 24px)"');
    expect(toolbar).toContain('overflowY: "auto"');
    expect(toolbar).toContain('overscrollBehavior: "contain"');
    expect(toolbar).toContain('placement="left"');
    expect(tour).not.toContain('placement: "bottom-end"');
    expect(viewportCard).toContain("...FUSION_PANEL_FRAME_SX");
    for (const drawer of ["ConversationDrawer.tsx"]) {
      const source = readFileSync(join(import.meta.dir, "../src/renderer-react/src/components", drawer), "utf8");
      expect(source).toContain('viewport ? FUSION_PANEL_FRAME_SX');
    }
  });

  test("reverses the toolbar DOM and onboarding order with the window switch first", () => {
    const toolbar = readFileSync(join(moduleRoot, "FusionToolbar.tsx"), "utf8");
    const tour = readFileSync(join(moduleRoot, "FusionOnboardingTour.tsx"), "utf8");
    const targets = ["fusion-settings", "fusion-language", "fusion-problem-bank", "fusion-blackboard", "fusion-transcript", "fusion-history", "fusion-new"];
    let previousControl = toolbar.indexOf('<InteractionModeButton mode="fusion"');
    let previousStep = tour.indexOf("[data-interaction-mode-toggle]");
    expect(previousControl).toBeGreaterThan(-1);
    expect(previousStep).toBeGreaterThan(-1);
    for (const target of targets) {
      const controlIndex = toolbar.indexOf(`data-copilot-tour="${target}"`);
      const stepIndex = tour.indexOf(`data-copilot-tour="${target}"`);
      expect(controlIndex).toBeGreaterThan(previousControl);
      expect(stepIndex).toBeGreaterThan(previousStep);
      previousControl = controlIndex;
      previousStep = stepIndex;
    }
    expect(toolbar).not.toContain("column-reverse");
  });

  test("does not overlay introductory copy or its styles on the canvas", () => {
    const app = readFileSync(join(import.meta.dir, "../src/renderer-react/src/App.tsx"), "utf8");
    const styles = readFileSync(join(import.meta.dir, "../src/renderer-react/src/styles.css"), "utf8");
    expect(app).not.toContain("canvasIntro");
    expect(styles).not.toContain("frontend-canvas-intro");
    for (const locale of ["en.ts", "zh-CN.ts"]) {
      const copy = readFileSync(join(import.meta.dir, "../src/renderer-react/src/i18n/locales", locale), "utf8");
      expect(copy).not.toContain("canvasIntro:");
    }
    expect(app).toContain("mountGeoGebra({");
    expect(app).toContain("<AssistantPanel");
    expect(app).toContain('className="frontend-canvas-controls"');
    expect(app).toContain("<GeoGebraDocumentPanel");
    expect(app).not.toContain("toggleGeoGebraToolbar");
    expect(app).toContain("onClick={() => void resetCanvas()}");
  });

  test("removes the native toolbar toggle but preserves document and reset controls", () => {
    const app = readFileSync(join(import.meta.dir, "../src/renderer-react/src/App.tsx"), "utf8");
    const styles = readFileSync(join(import.meta.dir, "../src/renderer-react/src/styles.css"), "utf8");
    expect(app).not.toContain("WrenchIcon");
    expect(app).not.toContain("toolbarVisible");
    expect(app).not.toContain("setToolbarVisible");
    expect(app).not.toContain("frontend-canvas-toolbar");
    expect(app).toContain('className="frontend-canvas-host is-toolbar-collapsed"');
    expect(app).toContain('className="frontend-canvas-control frontend-canvas-menu"');
    expect(app).toContain('className="frontend-canvas-control frontend-canvas-reset"');
    expect(app).toContain("<GeoGebraCanvasMenu");
    expect(styles).not.toContain(".frontend-canvas-toolbar.is-active");
    for (const locale of ["en.ts", "zh-CN.ts"]) {
      const copy = readFileSync(join(import.meta.dir, "../src/renderer-react/src/i18n/locales", locale), "utf8");
      expect(copy).not.toContain("showToolbar:");
      expect(copy).not.toContain("hideToolbar:");
    }
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

  test("removes the canvas introduction animation and submission callback plumbing", () => {
    const app = readFileSync(join(import.meta.dir, "../src/renderer-react/src/App.tsx"), "utf8");
    const panel = readFileSync(join(import.meta.dir, "../src/renderer-react/src/components/AssistantPanel.tsx"), "utf8");
    const submission = readFileSync(join(workspaceRoot, "useAssistantSubmission.ts"), "utf8");
    for (const source of [app, panel, workspace, submission]) {
      expect(source).not.toContain("onConversationStarted");
    }
    expect(app).not.toContain('from "motion/react"');
    expect(app).not.toContain("useInteractionMode");
    expect(app).not.toContain("clipPath");
    expect(submission).toContain("input.controller.activateForSubmit({");
    expect(submission).toContain("await input.send({ text, files }, conversationId)");
  });

  test("lets a completed spatial turn summon the composer at its frozen anchor", () => {
    const controller = readFileSync(join(moduleRoot, "useFusionModeController.ts"), "utf8");
    const surface = readFileSync(join(moduleRoot, "FusionModeSurface.tsx"), "utf8");
    const bubbleStack = readFileSync(join(moduleRoot, "FusionBubbleStack.tsx"), "utf8");
    expect(controller).toContain("continueAtTurn");
    expect(controller).toContain("setComposerPoint(clampFusionPoint(turn.anchor, viewport(), composerSizeRef.current))");
    expect(surface).toContain("props.controller.continueAtTurn(turn.id)");
    expect(bubbleStack).toContain("props.onContinue");
  });

  test("uses the shared message queue and clears transient dragging state", () => {
    const bubbleStack = readFileSync(join(moduleRoot, "FusionBubbleStack.tsx"), "utf8");
    const composer = readFileSync(join(moduleRoot, "FusionComposer.tsx"), "utf8");
    const viewportCard = readFileSync(join(moduleRoot, "FusionViewportCard.tsx"), "utf8");
    const controller = readFileSync(join(moduleRoot, "useFusionModeController.ts"), "utf8");
    expect(bubbleStack).toContain("<GeoChatThread");
    expect(bubbleStack).toContain('renderMessage={renderMessage}');
    expect(bubbleStack).not.toContain("interpolateBubbleWindowLayout");
    expect(composer).toContain("transition={{ duration: reduceMotion ? 0 : 0.2");
    expect(viewportCard).toContain("duration: reduceMotion ? 0 : 0.22");
    expect(controller).toContain("if (!enabled)");
    expect(controller).toContain("dragRef.current = null");
    expect(controller).toContain("startDragging");
  });

  test("removes composer toolbar tools and placement state while retaining keyboard and dragging access", () => {
    const toolbar = readFileSync(join(moduleRoot, "FusionToolbar.tsx"), "utf8");
    const tour = readFileSync(join(moduleRoot, "FusionOnboardingTour.tsx"), "utf8");
    const surface = readFileSync(join(moduleRoot, "FusionModeSurface.tsx"), "utf8");
    const controller = readFileSync(join(moduleRoot, "useFusionModeController.ts"), "utf8");
    for (const source of [toolbar, tour, surface, controller]) {
      for (const removed of ["fusion-position", "fusion-summon", "beginPositioning", "cancelPositioning", "pickPosition", "positioning", "onSummon", "onPosition"]) {
        expect(source).not.toContain(removed);
      }
    }
    expect(controller).toContain("event.metaKey || event.ctrlKey");
    expect(controller).toContain('event.key.toLowerCase() !== "k"');
    expect(controller).toContain("summonAt()");
    expect(controller).toContain('event.key === "Escape"');
    expect(surface).toContain("onDragStart={props.controller.startDragging}");
    expect(surface).toContain("focusSignal={props.controller.summonVersion}");
    for (const locale of ["en.ts", "zh-CN.ts"]) {
      const copy = readFileSync(join(import.meta.dir, "../src/renderer-react/src/i18n/locales", locale), "utf8");
      for (const removed of ["summon:", "choosePosition:", "positioningHint:", "summonTitle:", "summonDescription:", "positionTitle:", "positionDescription:"]) {
        expect(copy).not.toContain(removed);
      }
    }
  });

  test("keeps keyboard focus inside viewport cards without trapping portaled menus", () => {
    const viewportCard = readFileSync(join(moduleRoot, "FusionViewportCard.tsx"), "utf8");
    expect(viewportCard).toContain('FocusTrap from "@mui/material/Unstable_TrapFocus"');
    expect(viewportCard).toContain("<FocusTrap open={isPresent} disableRestoreFocus isEnabled={isViewportFocusTrapEnabled}>");
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

  test("uses the ordinary thread viewport with a transparent fusion background", () => {
    const bubbleStack = readFileSync(join(moduleRoot, "FusionBubbleStack.tsx"), "utf8");
    const styles = readFileSync(join(import.meta.dir, "../src/renderer-react/src/styles.css"), "utf8");
    const composer = readFileSync(join(moduleRoot, "FusionComposer.tsx"), "utf8");
    expect(bubbleStack).toContain('data-fusion-message-queue="true"');
    expect(bubbleStack).toContain('messageIds.has(message.id)');
    expect(bubbleStack).toContain('event.stopPropagation()');
    expect(styles).toContain(".geochat-assistant-thread--fusion .geochat-assistant-thread__viewport");
    expect(styles).toContain("background: transparent");
    expect(styles).toContain("overscroll-behavior: contain");
    expect(composer).toContain("zIndex: FUSION_COMPOSER_Z_INDEX");
    expect(composer).toContain("entry?.borderBoxSize?.[0]");
    expect(composer).toContain("root.offsetHeight");
  });

  test("keeps the shaded left message container separate from the floating composer", () => {
    const surface = readFileSync(join(moduleRoot, "FusionModeSurface.tsx"), "utf8");
    const queueStart = surface.indexOf('data-fusion-conversation="true"');
    expect(queueStart).toBeGreaterThan(-1);
    const queueEnd = surface.indexOf("</Stack>", queueStart);
    expect(queueEnd).toBeGreaterThan(queueStart);
    const queue = surface.slice(queueStart, queueEnd);
    expect(queue).toContain("left: FUSION_VIEWPORT_GUTTER");
    expect(queue).toContain("bgcolor: alpha(theme.palette.background.paper, 0.96)");
    expect(queue).toContain("boxShadow: FLOATING_SURFACE_ELEVATION");
    expect(queue).toContain("<FusionBubbleStack");
    expect(queue).not.toContain("<FusionComposer");
    expect(surface.indexOf("<FusionComposer", queueEnd)).toBeGreaterThan(queueEnd);
    expect(surface).toContain("x={composerPoint.x}");
    expect(surface).toContain("y={composerPoint.y}");
    expect(surface).toContain("onDragStart={props.controller.startDragging}");
    expect(queue).toContain("width: conversationLayout.width");
    expect(queue).toContain("bottom: conversationLayout.bottom");
    expect(surface).toContain("onSizeChange={reportComposerSize}");
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

  test("delegates fusion follow behavior to the same assistant-ui viewport as window mode", () => {
    const bubbleStack = readFileSync(join(moduleRoot, "FusionBubbleStack.tsx"), "utf8");
    expect(bubbleStack).toContain("<GeoChatThread");
    expect(bubbleStack).not.toContain("useFusionCardScroll");
    expect(bubbleStack).not.toContain("handleHistoryWheel");
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
