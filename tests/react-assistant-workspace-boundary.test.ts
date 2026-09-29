import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rendererRoot = join(import.meta.dir, "../src/renderer-react/src");
const panel = readFileSync(join(rendererRoot, "components/AssistantPanel.tsx"), "utf8");
const workspaceRoot = join(rendererRoot, "features/assistant-workspace");

describe("assistant workspace boundaries", () => {
  test("keeps the shared assistant runtime above the mode surface split", () => {
    expect(panel.indexOf("useGeoChatAssistantRuntime({")).toBeGreaterThan(-1);
    expect(panel.indexOf('if (interaction.mode === "fusion")')).toBeGreaterThan(
      panel.indexOf("useGeoChatAssistantRuntime({"),
    );
    expect(panel).toContain("<AssistantRuntimeProvider runtime={assistantRuntime}>");
  });

  test("delegates window chrome and clipboard behavior to the window shell", () => {
    const shell = readFileSync(join(workspaceRoot, "AssistantWindowShell.tsx"), "utf8");
    const chrome = readFileSync(join(workspaceRoot, "AssistantWindowChrome.tsx"), "utf8");
    expect(panel).toContain("<AssistantWindowShell");
    expect(panel).not.toContain("navigator.clipboard");
    expect(shell).toContain("RESIZE_HANDLES.map");
    expect(shell).toContain("onContextMenuCapture={openContextMenu}");
    expect(chrome).toContain("props.panelWindow.startDragging");
    expect(chrome).toContain("props.panelWindow.handleCollapsedRestoreClick");
  });

  test("isolates onboarding persistence and fusion overlays from panel orchestration", () => {
    const onboarding = readFileSync(join(workspaceRoot, "useOnboardingState.ts"), "utf8");
    const overlays = readFileSync(join(workspaceRoot, "FusionAssistantOverlays.tsx"), "utf8");
    expect(panel).toContain("const onboarding = useOnboardingState();");
    expect(panel).not.toContain("ONBOARDING_TOUR_STORAGE_KEY");
    expect(onboarding).toContain("export const ONBOARDING_TOUR_VERSION = 3;");
    expect(panel).toContain("<FusionAssistantOverlays");
    expect(overlays).toContain("<ConversationDrawer");
    expect(overlays).toContain("<BlackboardDrawer");
    expect(overlays).toContain("<FusionViewportCard");
    expect(overlays).toContain("<FusionOnboardingTour");
  });
});
