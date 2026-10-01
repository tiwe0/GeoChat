import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("model-aware thinking defaults", () => {
  test("unsupported models are forced to non-reasoning requests and expose a disabled switch", () => {
    const modelState = readFileSync(new URL("../src/renderer-react/src/features/assistant-workspace/useAssistantModelState.ts", import.meta.url), "utf8");
    const request = readFileSync(new URL("../src/renderer-react/src/features/agent-run/nativeRunRequest.ts", import.meta.url), "utf8");
    const menu = readFileSync(new URL("../src/renderer-react/src/components/ModelMenu.tsx", import.meta.url), "utf8");

    expect(modelState).toContain("if (!input.selectedModel || thinkingSupported || !input.thinkingEnabled) return;");
    expect(modelState).toContain("agentModelSupportsReasoning(selected.provider, selected.id)");
    expect(request).toContain("&& agentModelSupportsReasoning(model.provider, model.model)");
    expect(menu).toContain("disabled={!thinkingSupported}");
  });

  test("uses a compact composer-aligned model menu in fusion mode only", () => {
    const workspace = readFileSync(new URL("../src/renderer-react/src/features/assistant-workspace/AssistantWorkspace.tsx", import.meta.url), "utf8");
    const menu = readFileSync(new URL("../src/renderer-react/src/components/ModelMenu.tsx", import.meta.url), "utf8");

    expect(workspace).toContain('tourId="fusion-model"');
    expect(workspace).toContain("compact");
    expect(menu).toContain('anchorEl={compact ? anchorElement?.closest("form") ?? anchorElement : anchorElement}');
    expect(menu).toContain('placement={compact ? "top-start" : "top-end"}');
    expect(menu).toContain('{ name: "offset", options: { offset: [0, compact ? 6 : 4] } }');
    expect(menu).toContain("width: compact ? 216 : 320");
    expect(menu).toContain('maxHeight: compact ? "min(286px, 46vh)"');
    expect(menu).toContain('ownerDocument.addEventListener("focusin", closeOnOutsideFocus, true)');
    expect(menu).toContain('ownerDocument.removeEventListener("focusin", closeOnOutsideFocus, true)');
  });
});
