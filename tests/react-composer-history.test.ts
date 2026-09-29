import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const rendererRoot = join(import.meta.dir, "../src/renderer-react/src");

describe("composer input history", () => {
  test("delegates keyboard history to the shared assistant-ui composer", () => {
    const composer = readFileSync(join(rendererRoot, "features/assistant-ui/GeoChatComposer.tsx"), "utf8");
    expect(composer).toContain("unstable_useComposerInputHistory");
    expect(composer).toContain("const history = unstable_useComposerInputHistory();");
    expect(composer).toContain("history.onKeyDown(event)");
    expect(composer).toContain("<ComposerPrimitive.Input");
  });

  test("shares one composer implementation across window and fusion surfaces", () => {
    const windowSurface = readFileSync(join(rendererRoot, "features/assistant-workspace/AssistantWindowSurface.tsx"), "utf8");
    const fusionComposer = readFileSync(join(rendererRoot, "features/fusion-mode/FusionComposer.tsx"), "utf8");
    expect(windowSurface).toContain("<GeoChatComposer");
    expect(fusionComposer).toContain('import { GeoChatComposer } from "../assistant-ui"');
    expect(fusionComposer).toContain('<GeoChatComposer\n          variant="fusion"');
    expect(existsSync(join(rendererRoot, "features/chat/composerHistory.ts"))).toBe(false);
    expect(existsSync(join(rendererRoot, "hooks/useComposerHistory.ts"))).toBe(false);
  });
});
