import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveFusionBubbles } from "../src/renderer-react/src/features/fusion-mode/bubbles";
import type { FusionChatMessage } from "../src/renderer-react/src/features/fusion-mode/types";

const labels = {
  thinking: "thinking",
  connecting: "connecting",
  runningTool: (name: string) => `tool:${name}`,
  attachment: "attachment",
  moreMessages: (count: number) => `${count} earlier`,
};

describe("fusion-mode bubble projection", () => {
  test("renders a reasoning or tool-only assistant message through the real process UI", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    const assistant = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionAssistantMessage.tsx"), "utf8");
    expect(stack).toContain('bubble.role === "status" && bubble.message');
    expect(stack).toContain("<FusionAssistantMessage message={bubble.message}");
    expect(assistant).toContain("<ToolStatus status={status} />");
    expect(assistant).not.toContain("active && <CircularProgress");
  });

  test("keeps completed display-tool messages in the spatial bubble projection", () => {
    const messages = [{
      id: "display-1",
      role: "assistant",
      parts: [{
        type: "tool-showSolutionSteps",
        state: "output-available",
        output: { title: "Solution", steps: [{ label: "1", body: "Draw the circle" }] },
      }],
    }] as unknown as FusionChatMessage[];

    expect(deriveFusionBubbles({ messages, status: "ready", labels })).toEqual([{
      id: "display-1",
      role: "assistant",
      content: "",
      message: messages[0],
    }]);
  });

  test("renders display tools with the shared rich-card renderer", () => {
    const assistant = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionAssistantMessage.tsx"), "utf8");
    expect(assistant).toContain('from "../chat/AgentDisplayToolResult"');
    expect(assistant).toContain("<AgentDisplayToolResult");
    expect(assistant).not.toContain('isAssistantDisplayToolPart(part)) return <ToolRow');
  });

  test("projects the recent conversation into a bounded bubble stack", () => {
    const messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "first" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "answer" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "second" }] },
      { id: "a2", role: "assistant", parts: [{ type: "text", text: "latest" }] },
    ] as FusionChatMessage[];

    expect(deriveFusionBubbles({ messages, status: "ready", labels, limit: 3 })).toEqual([
      { id: "fusion-overflow", role: "overflow", content: "1 earlier" },
      { id: "a1", role: "assistant", content: "answer", message: messages[1] },
      { id: "u2", role: "user", content: "second", message: messages[2] },
      { id: "a2", role: "assistant", content: "latest", message: messages[3] },
    ]);
  });

  test("opens the full transcript from the bounded history entry", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    const surface = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionModeSurface.tsx"), "utf8");
    expect(stack).toContain('bubble.role === "overflow"');
    expect(stack).toContain("props.onOpenTranscript?.(event.currentTarget)");
    expect(surface).toContain("onOpenTranscript={props.onOpenTranscript}");
  });

  test("keeps enough transparent scroll padding for rounded card shadows", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    expect(stack).toContain("px: 2.5");
    expect(stack).toContain("pb: 3");
    expect(stack).toContain('scrollPaddingBlock: "12px 24px"');
    expect(stack).toContain('justifyContent: "flex-start"');
    expect(stack).not.toContain('props.placement === "above" ? "flex-end" : "flex-start"');
  });

  test("visually joins the composer-attached conversation into one floating cluster", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    const surface = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionModeSurface.tsx"), "utf8");
    expect(stack).toContain("connectedToComposer?: boolean");
    expect(stack).toContain('width: "min(430px, calc(100vw - 8px))"');
    expect(stack).toContain('content: "\'\'"');
    expect(surface).toContain("connectedToComposer={turn.id === props.controller.activeTurnId}");
  });

  test("reuses a stable transient bubble while the request is being submitted", () => {
    const messages = [{ id: "u1", role: "user", parts: [{ type: "text", text: "draw" }] }] as FusionChatMessage[];
    const bubbles = deriveFusionBubbles({ messages, status: "submitted", labels });
    expect(bubbles.at(-1)).toEqual({ id: "fusion-active", role: "status", content: "connecting", pending: true });
  });

  test("replaces transient activity with an error bubble", () => {
    const bubbles = deriveFusionBubbles({ messages: [], status: "error", error: "offline", labels });
    expect(bubbles).toEqual([{ id: "fusion-error", role: "error", content: "offline" }]);
  });
});
