import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FLOATING_SURFACE_ELEVATION, copilotTheme } from "../src/renderer-react/src/theme";

const rendererRoot = join(import.meta.dir, "../src/renderer-react/src");
const readRenderer = (path: string) => readFileSync(join(rendererRoot, path), "utf8");

function cssRule(source: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

describe("floating surface shadow token", () => {
  test("defines one level-three theme shadow and exposes it to CSS surfaces", () => {
    const theme = readRenderer("theme.ts");
    expect(FLOATING_SURFACE_ELEVATION).toBe(3);
    expect(copilotTheme.shadows[FLOATING_SURFACE_ELEVATION]).toBe(copilotTheme.shadows[3]);
    expect(theme).toContain("export const FLOATING_SURFACE_ELEVATION = 3");
    expect(theme).toContain('"--app-floating-shadow"');
    expect(theme.match(/theme\.shadows\[FLOATING_SURFACE_ELEVATION\]/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test("binds menus and dialogs to the same theme shadow", () => {
    const theme = readRenderer("theme.ts");
    for (const component of ["MuiDialog", "MuiMenu"]) {
      const start = theme.indexOf(`${component}:`);
      expect(start).toBeGreaterThan(-1);
      expect(theme.slice(start, start + 520)).toContain("theme.shadows[FLOATING_SURFACE_ELEVATION]");
    }
  });

  test("uses the CSS shadow token for floating stylesheet panels", () => {
    const styles = readRenderer("styles.css");
    for (const selector of [
      ".geogebra-document-panel",
      ".frontend-config-recovery-notice",
      ".geochat-panel-host > .MuiPaper-root",
      ".problem-bank-sidecar",
      ".geochat-blackboard:not(.geochat-blackboard--fusion)",
    ]) {
      expect(cssRule(styles, selector), selector).toContain("box-shadow: var(--app-floating-shadow)");
    }
  });

  test("routes floating React surfaces through the shared elevation constant", () => {
    const expectations: Array<[string, string]> = [
      ["features/assistant-ui/GeoChatComposer.tsx", "boxShadow: isFusion ? FLOATING_SURFACE_ELEVATION : 0"],
      ["features/fusion-mode/FusionModeSurface.tsx", "boxShadow: FLOATING_SURFACE_ELEVATION"],
      ["features/fusion-mode/FusionToolbar.tsx", "elevation={FLOATING_SURFACE_ELEVATION}"],
      ["features/fusion-mode/FusionViewportCard.tsx", "elevation={FLOATING_SURFACE_ELEVATION}"],
      ["features/geogebra/GeoGebraCanvasMenu.tsx", "elevation={FLOATING_SURFACE_ELEVATION}"],
      ["features/geogebra/GeoGebraToolButtons.tsx", "elevation: FLOATING_SURFACE_ELEVATION"],
      ["components/ConversationDrawer.tsx", "boxShadow: FLOATING_SURFACE_ELEVATION"],
      ["components/BlackboardDrawer.tsx", "boxShadow: FLOATING_SURFACE_ELEVATION"],
      ["components/ModelMenu.tsx", "elevation={FLOATING_SURFACE_ELEVATION}"],
      ["features/assistant-workspace/AssistantWindowShell.tsx", "elevation={FLOATING_SURFACE_ELEVATION}"],
      ["features/assistant-workspace/AssistantWindowSurface.tsx", "elevation={FLOATING_SURFACE_ELEVATION}"],
    ];
    for (const [path, contract] of expectations) {
      const source = readRenderer(path);
      expect(source, path).toContain("FLOATING_SURFACE_ELEVATION");
      expect(source, path).toContain(contract);
    }
  });
});
