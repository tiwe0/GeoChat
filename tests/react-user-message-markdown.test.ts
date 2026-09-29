import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("sent user message math rendering", () => {
  test("uses one assistant-ui message-parts renderer in every surface", () => {
    const root = join(import.meta.dir, "../src/renderer-react/src");
    const parts = readFileSync(join(root, "features/assistant-ui/GeoChatMessageParts.tsx"), "utf8");
    const stack = readFileSync(join(root, "features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    const transcript = readFileSync(join(root, "features/fusion-mode/FusionTranscript.tsx"), "utf8");
    const panel = readFileSync(join(root, "components/AssistantPanel.tsx"), "utf8");

    expect(parts).toContain('if (role === "assistant")');
    expect(parts).toContain("return <StaticMessageMarkdown>{text}</StaticMessageMarkdown>");
    expect(parts).toContain("<MessagePrimitive.GroupedParts");
    expect(stack).toContain("<GeoChatMessage");
    expect(transcript).toContain("<GeoChatThread");
    expect(panel).toContain("<GeoChatThread");
  });

  test("keeps the shared composer as a raw assistant-ui text input", () => {
    const composer = readFileSync(join(
      import.meta.dir,
      "../src/renderer-react/src/features/assistant-ui/GeoChatComposer.tsx",
    ), "utf8");
    expect(composer).toContain("<ComposerPrimitive.Input");
    expect(composer).not.toContain("StaticMessageMarkdown");
    expect(composer).not.toContain("<Streamdown");
  });
});
