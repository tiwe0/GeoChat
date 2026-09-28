import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("sent user message math rendering", () => {
  test("uses static Streamdown rendering in window, fusion bubbles, and transcript", () => {
    const root = join(import.meta.dir, "../src/renderer-react/src");
    const panel = readFileSync(join(root, "components/AssistantPanel.tsx"), "utf8");
    const stack = readFileSync(join(root, "features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    const transcript = readFileSync(join(root, "features/fusion-mode/FusionTranscript.tsx"), "utf8");
    const renderer = readFileSync(join(root, "features/chat/StaticMessageMarkdown.tsx"), "utf8");

    expect(panel).toContain('<StaticMessageMarkdown key={index} className="user-message-markdown">');
    expect(stack).toContain('<StaticMessageMarkdown className="user-message-markdown">');
    expect(transcript).toContain('<StaticMessageMarkdown className="user-message-markdown">');
    expect(renderer).toContain("plugins={STREAMDOWN_PLUGINS}");
    expect(renderer).toContain("animated={false}");
    expect(panel).not.toContain("function TypewriterText");
  });

  test("keeps both composers as raw text inputs", () => {
    const root = join(import.meta.dir, "../src/renderer-react/src");
    const windowComposer = readFileSync(join(root, "components/ChatComposer.tsx"), "utf8");
    const fusionComposer = readFileSync(join(root, "features/fusion-mode/FusionComposer.tsx"), "utf8");
    expect(windowComposer).not.toContain("StaticMessageMarkdown");
    expect(fusionComposer).not.toContain("StaticMessageMarkdown");
    expect(windowComposer).not.toContain("<Streamdown");
    expect(fusionComposer).not.toContain("<Streamdown");
  });
});
