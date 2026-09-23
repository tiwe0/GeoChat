import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const component = readFileSync(
  new URL("../src/renderer-react/src/features/desktop/settings/ThinkingChainSettings.tsx", import.meta.url),
  "utf8"
);
const panel = readFileSync(
  new URL("../src/renderer-react/src/features/desktop/SettingsPanel.tsx", import.meta.url),
  "utf8"
);

describe("thinking-chain settings", () => {
  test("adds the reasoning module to the settings sidebar", () => {
    expect(panel).toContain('"thinking", "general"');
    expect(panel).toContain("<ThinkingChainSettings");
    expect(panel).toContain("enabled={props.thinkingEnabled}");
    expect(panel).toContain("supported={props.thinkingSupported}");
  });

  test("renders the current mode as an accessible SVG path", () => {
    expect(component).toContain("<svg");
    expect(component).toContain('role="img"');
    expect(component).toContain("settings.thinkingDiagramTitle");
    expect(component).toContain('mode === "extended"');
    expect(component).toContain("thinking-chain-path--loop");
    expect(component).toContain("directAnswer");
  });

  test("derives unsupported and disabled paths before effort", () => {
    expect(component).toContain('const mode: DiagramMode = !supported ? "unsupported" : enabled ? effort : "off";');
  });
});
