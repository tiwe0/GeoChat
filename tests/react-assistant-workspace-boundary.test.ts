import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rendererRoot = join(import.meta.dir, "../src/renderer-react/src");
const panel = readFileSync(join(rendererRoot, "components/AssistantPanel.tsx"), "utf8");
const workspaceRoot = join(rendererRoot, "features/assistant-workspace");
const workspace = readFileSync(join(workspaceRoot, "AssistantWorkspace.tsx"), "utf8");
const windowSurface = readFileSync(join(workspaceRoot, "AssistantWindowSurface.tsx"), "utf8");
const fusionSurface = readFileSync(join(workspaceRoot, "AssistantFusionSurface.tsx"), "utf8");
const runtimeBridge = readFileSync(join(workspaceRoot, "useAssistantRuntimeBridge.ts"), "utf8");

describe("assistant workspace boundaries", () => {
  test("keeps AssistantPanel as a thin public composition root", () => {
    expect(panel).toContain("<AssistantWorkspace {...props} />");
    expect(panel).not.toContain("useAgentRunChat");
    expect(panel).not.toContain("useState");
    expect(panel.split("\n").length).toBeLessThan(30);
  });

  test("keeps the shared assistant runtime above the mode surface split", () => {
    expect(runtimeBridge).toContain("useGeoChatAssistantRuntime({");
    expect(workspace.indexOf("useAssistantRuntimeBridge({")).toBeGreaterThan(-1);
    expect(workspace.indexOf('if (interaction.mode === "fusion")')).toBeGreaterThan(
      workspace.indexOf("useAssistantRuntimeBridge({"),
    );
    expect(workspace).toContain("<AssistantRuntimeProvider runtime={assistantRuntime}>");
    expect(workspace).toContain("<AssistantFusionSurface");
    expect(workspace).toContain("<AssistantWindowSurface");
  });

  test("delegates window chrome and clipboard behavior to the window shell", () => {
    const shell = readFileSync(join(workspaceRoot, "AssistantWindowShell.tsx"), "utf8");
    const chrome = readFileSync(join(workspaceRoot, "AssistantWindowChrome.tsx"), "utf8");
    expect(windowSurface).toContain("<AssistantWindowShell");
    expect(workspace).not.toContain("navigator.clipboard");
    expect(shell).toContain("RESIZE_HANDLES.map");
    expect(shell).toContain("onContextMenuCapture={openContextMenu}");
    expect(chrome).toContain("props.panelWindow.startDragging");
    expect(chrome).toContain("props.panelWindow.handleCollapsedRestoreClick");
  });

  test("isolates onboarding persistence and fusion overlays from panel orchestration", () => {
    const onboarding = readFileSync(join(workspaceRoot, "useOnboardingState.ts"), "utf8");
    const overlays = readFileSync(join(workspaceRoot, "FusionAssistantOverlays.tsx"), "utf8");
    expect(workspace).toContain("const onboarding = useOnboardingState();");
    expect(workspace).not.toContain("ONBOARDING_TOUR_STORAGE_KEY");
    expect(onboarding).toContain("export const ONBOARDING_TOUR_VERSION = 3;");
    expect(fusionSurface).toContain("<FusionAssistantOverlays");
    expect(overlays).toContain("<ConversationHistoryContent");
    expect(overlays).toContain("<BlackboardPanel");
    expect(overlays).toContain("<FusionViewportCard");
    expect(overlays).toContain("<FusionOnboardingTour");
  });

  test("uses the shared non-modal viewport card for fusion history", () => {
    const history = readFileSync(join(rendererRoot, "components/ConversationDrawer.tsx"), "utf8");
    const overlays = readFileSync(join(workspaceRoot, "FusionAssistantOverlays.tsx"), "utf8");
    expect(overlays).toContain('<FusionViewportCard key="fusion-history" panelId="history"');
    expect(overlays).toContain("<ConversationHistoryContent");
    expect(overlays).not.toContain("<ConversationDrawer");
    expect(history).not.toContain("viewport");
    expect(history).toContain('bgcolor: "rgba(15, 23, 42, 0.22)"');
    expect(history).toContain("boxShadow: FLOATING_SURFACE_ELEVATION");
  });

  test("preserves history selection, deletion, disabled and close-reset behavior across both surfaces", () => {
    const history = readFileSync(join(rendererRoot, "components/ConversationDrawer.tsx"), "utf8");
    const overlays = readFileSync(join(workspaceRoot, "FusionAssistantOverlays.tsx"), "utf8");
    expect(history).toContain("const busy = interactionDisabled || selectingId !== null || deletingId !== null");
    expect(history).toContain("if (await onDelete(conversation)) setConfirmingId(null)");
    expect(history).toContain('<ConversationHistoryContent key={open ? "open" : "closed"}');
    expect(overlays).toContain("props.conversationHistory.select(conversation).finally(() => props.onClose())");
  });

  test("lets fusion blackboard use the shared card shadow without adding a modal veil", () => {
    const overlays = readFileSync(join(workspaceRoot, "FusionAssistantOverlays.tsx"), "utf8");
    const styles = readFileSync(join(rendererRoot, "styles.css"), "utf8");
    expect(overlays).not.toContain("<BlackboardDrawer");
    expect(overlays).toContain('className="geochat-blackboard geochat-blackboard--fusion"');
    expect(styles).toContain(".geochat-blackboard:not(.geochat-blackboard--fusion) {\n  box-shadow: var(--app-floating-shadow)");
    expect(styles).not.toContain(".geochat-blackboard--fusion {\n  box-shadow: none !important;");
  });

  test("separates session, model, submission, panel and surface responsibilities", () => {
    for (const file of [
      "useAssistantSessionState.ts",
      "useAssistantModelState.ts",
      "useAssistantSubmission.ts",
      "useAssistantFusionPanel.ts",
      "useProblemBankPanel.ts",
      "AssistantWindowSurface.tsx",
      "AssistantFusionSurface.tsx",
    ]) {
      expect(readFileSync(join(workspaceRoot, file), "utf8").length).toBeGreaterThan(0);
    }
    expect(workspace).not.toContain("browser.storage.local");
    expect(windowSurface).toContain("<GeoChatThread");
  });

  test("restores the conversation title and composer from the canonical run prompt", () => {
    expect(workspace).toContain('title: run.prompt.replace(/\\s+/g, " ").trim().slice(0, 80)');
    expect(workspace).toContain("assistantRuntimeRef.current?.thread.composer.setText(run.prompt)");
    expect(workspace).not.toContain("providerMessages");
  });
});
