import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveFusionBubbles, isFusionRenderableMessage } from "../src/renderer-react/src/features/fusion-mode/bubbles";
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
      id: "display-1:display:0",
      role: "display-card",
      content: "",
      displayPart: messages[0].parts[0],
    }]);
  });

  test("extracts an interactive display card from its assistant text bubble", () => {
    const messages = [{
      id: "choice-1",
      role: "assistant",
      parts: [
        { type: "text", text: "先看公共条件。" },
        { type: "tool-showChoiceAnalysis", state: "output-available", output: { title: "选项分析", choices: [] } },
      ],
    }] as unknown as FusionChatMessage[];

    expect(deriveFusionBubbles({ messages, status: "ready", labels })).toEqual([
      {
        id: "fusion-active",
        role: "assistant",
        content: "先看公共条件。",
        message: { ...messages[0], id: "choice-1:segment:0", parts: [messages[0].parts[0]] },
      },
      {
        id: "choice-1:display:0",
        role: "display-card",
        content: "",
        displayPart: messages[0].parts[1],
      },
    ]);
  });

  test("keeps an extracted display card at its original position between text segments", () => {
    const messages = [{
      id: "choice-ordered",
      role: "assistant",
      parts: [
        { type: "text", text: "先看题型。" },
        { type: "tool-showChoiceAnalysis", state: "output-available", output: { title: "选项分析", choices: [] } },
        { type: "text", text: "因此答案是 A。" },
      ],
    }] as unknown as FusionChatMessage[];

    const bubbles = deriveFusionBubbles({ messages, status: "ready", labels });
    expect(bubbles.map(({ id, role, content }) => ({ id, role, content }))).toEqual([
      { id: "choice-ordered:segment:0", role: "assistant", content: "先看题型。" },
      { id: "choice-ordered:display:0", role: "display-card", content: "" },
      { id: "fusion-active", role: "assistant", content: "因此答案是 A。" },
    ]);
  });

  test("renders display tools with the shared rich-card renderer", () => {
    const assistant = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionAssistantMessage.tsx"), "utf8");
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    expect(assistant).toContain('from "../chat/AgentDisplayToolResult"');
    expect(assistant).toContain("export function FusionDisplayToolCard");
    expect(stack).toContain('data-fusion-display-card={bubble.role === "display-card" ? true : undefined}');
    expect(stack).toContain("<FusionDisplayToolCard part={bubble.displayPart} />");
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
      { id: "a1:segment:0", role: "assistant", content: "answer", message: { ...messages[1], id: "a1:segment:0" } },
      { id: "u2", role: "user", content: "second", message: messages[2] },
      { id: "fusion-active", role: "assistant", content: "latest", message: { ...messages[3], id: "a2:segment:0" } },
    ]);
  });

  test("keeps the first assistant segment identity stable when a display tool arrives mid-stream", () => {
    const before = [{
      id: "assistant-live",
      role: "assistant",
      parts: [{ type: "text", text: "正在分析" }],
    }] as FusionChatMessage[];
    const after = [{
      ...before[0],
      parts: [
        ...before[0].parts,
        { type: "tool-showChoiceAnalysis", state: "input-streaming", input: { title: "选项分析" } },
      ],
    }] as unknown as FusionChatMessage[];

    expect(deriveFusionBubbles({ messages: before, status: "streaming", labels })[0]?.id).toBe("fusion-active");
    expect(deriveFusionBubbles({ messages: after, status: "streaming", labels })[0]?.id).toBe("fusion-active");
  });

  test("opens the full transcript from the bounded history entry", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    const surface = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionModeSurface.tsx"), "utf8");
    expect(stack).toContain('bubble.role === "overflow"');
    expect(stack).toContain("props.onOpenTranscript?.(event.currentTarget)");
    expect(surface).toContain("onOpenTranscript={props.onOpenTranscript}");
  });

  test("keeps transparent shell padding while scrolling only inside the rounded card", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    expect(stack).toContain("px: 2.5");
    expect(stack).toContain("pb: 3");
    expect(stack).toContain('height: props.maxHeight');
    expect(stack).toContain('overflowY: bodyScrollable ? "auto" : "visible"');
    expect(stack).toContain('scrollbarWidth: "none"');
    expect(stack).toContain('overflow: "hidden"');
    expect(stack).not.toContain('scrollPaddingBlock: "12px 24px"');
    expect(stack).toContain('justifyContent: "flex-start"');
    expect(stack).toContain('justifyContent: props.placement === "above" ? "flex-end" : "flex-start"');
  });

  test("does not render a detached connector capsule between the response and composer", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    const surface = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionModeSurface.tsx"), "utf8");
    expect(stack).toContain('width: "min(430px, calc(100vw - 8px))"');
    expect(stack).not.toContain("connectedToComposer?: boolean");
    expect(stack).not.toContain('content: "\'\'"');
    expect(surface).not.toContain("connectedToComposer={turn.id === props.controller.activeTurnId}");
  });

  test("reuses a stable transient bubble while the request is being submitted", () => {
    const messages = [{ id: "u1", role: "user", parts: [{ type: "text", text: "draw" }] }] as FusionChatMessage[];
    const bubbles = deriveFusionBubbles({ messages, status: "submitted", labels });
    expect(bubbles.at(-1)).toEqual({ id: "fusion-active", role: "status", content: "connecting", pending: true });
  });

  test("keeps thinking and streamed text inside the submitted response bubble", () => {
    const submitted = deriveFusionBubbles({ messages: [], status: "submitted", labels });
    const thinkingMessage = [{
      id: "assistant-live",
      role: "assistant",
      parts: [{ type: "reasoning", text: "分析题目" }],
    }] as FusionChatMessage[];
    const textMessage = [{
      id: "assistant-live",
      role: "assistant",
      parts: [{ type: "text", text: "开始作图" }],
    }] as FusionChatMessage[];
    const thinking = deriveFusionBubbles({ messages: thinkingMessage, status: "streaming", labels });
    const streaming = deriveFusionBubbles({ messages: textMessage, status: "streaming", labels });
    const completed = deriveFusionBubbles({ messages: textMessage, status: "ready", labels });

    expect(submitted).toHaveLength(1);
    expect(thinking).toHaveLength(1);
    expect(streaming).toHaveLength(1);
    expect(completed).toHaveLength(1);
    expect([submitted[0]?.id, thinking[0]?.id, streaming[0]?.id, completed[0]?.id]).toEqual([
      "fusion-active",
      "fusion-active",
      "fusion-active",
      "fusion-active",
    ]);
    expect(thinking[0]).toMatchObject({ role: "status", content: "thinking", pending: true });
    expect(streaming[0]).toMatchObject({ role: "assistant", content: "开始作图" });
  });

  test("replaces transient activity with an error bubble", () => {
    const bubbles = deriveFusionBubbles({ messages: [], status: "error", error: "offline", labels });
    expect(bubbles).toEqual([{ id: "fusion-error", role: "error", content: "offline" }]);
  });

  test("filters empty assistant placeholders from spatial turn synchronization", () => {
    const emptyAssistant = { id: "empty", role: "assistant", parts: [] } as unknown as FusionChatMessage;
    const displayAssistant = {
      id: "display",
      role: "assistant",
      parts: [{
        type: "tool-showSolutionSteps",
        state: "output-available",
        output: { title: "Solution", steps: [] },
      }],
    } as unknown as FusionChatMessage;

    expect(isFusionRenderableMessage(emptyAssistant)).toBe(false);
    expect(isFusionRenderableMessage(displayAssistant)).toBe(true);
  });

  test("renders one compact summary instead of a detached toolbar for collapsed turns", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    expect(stack).toContain("collapsedSummaryLabel?: string");
    expect(stack).toContain("props.collapsed && latest");
    expect(stack).toContain("previewBubble?.content || props.collapsedSummaryLabel");
    expect(stack).toContain("!active && !props.collapsed");
    expect(stack).toContain("collapsibleBubbleId");
    expect(stack).toContain("aria-label={props.collapseLabel}");
    expect(stack).toContain("aria-label={props.expandLabel}");
    expect(stack).toContain("aria-expanded={true}");
    expect(stack).toContain("aria-expanded={false}");
  });
});
