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
});
