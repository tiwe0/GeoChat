import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("model-aware thinking defaults", () => {
  test("unsupported models are forced to non-reasoning requests and expose a disabled switch", () => {
    const panel = readFileSync(new URL("../src/renderer-react/src/components/AssistantPanel.tsx", import.meta.url), "utf8");
    const transport = readFileSync(new URL("../src/renderer-react/src/hooks/useAgentRunChat.ts", import.meta.url), "utf8");
    const menu = readFileSync(new URL("../src/renderer-react/src/components/ModelMenu.tsx", import.meta.url), "utf8");

    expect(panel).toContain("if (!selectedModel || thinkingSupported || !thinkingEnabled) return;");
    expect(panel).toContain("agentModelSupportsReasoning(selected.provider, selected.id)");
    expect(transport).toContain("&& agentModelSupportsReasoning(model.provider, model.model)");
    expect(menu).toContain("disabled={!thinkingSupported}");
  });

  test("uses a compact composer-aligned model menu in fusion mode only", () => {
    const panel = readFileSync(new URL("../src/renderer-react/src/components/AssistantPanel.tsx", import.meta.url), "utf8");
    const menu = readFileSync(new URL("../src/renderer-react/src/components/ModelMenu.tsx", import.meta.url), "utf8");

    expect(panel).toContain('tourId="fusion-model"');
    expect(panel).toContain("compact");
    expect(menu).toContain('anchorEl={compact ? anchorElement?.closest("form") ?? anchorElement : anchorElement}');
    expect(menu).toContain('placement={compact ? "top-start" : "top-end"}');
    expect(menu).toContain('{ name: "offset", options: { offset: [0, compact ? 6 : 4] } }');
    expect(menu).toContain("width: compact ? 216 : 320");
    expect(menu).toContain('maxHeight: compact ? "min(286px, 46vh)"');
    expect(menu).toContain('ownerDocument.addEventListener("focusin", closeOnOutsideFocus, true)');
    expect(menu).toContain('ownerDocument.removeEventListener("focusin", closeOnOutsideFocus, true)');
  });
});
