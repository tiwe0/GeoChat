import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fromThreadMessageLike, type ThreadMessage } from "@assistant-ui/react";
import { convertToAssistantUiMessage, type GeoChatMessageState } from "../src/renderer-react/src/features/assistant-ui/messageAdapter";
import { deriveFusionBubbles, isFusionRenderableMessage } from "../src/renderer-react/src/features/fusion-mode/bubbles";
import type { FusionChatMessage, FusionChatStatus } from "../src/renderer-react/src/features/fusion-mode/types";

const labels = { thinking: "thinking", connecting: "connecting", attachment: "attachment" };

function runtimeMessage(
  message: FusionChatMessage,
  state: GeoChatMessageState = "ready",
  error?: unknown,
): ThreadMessage {
  return fromThreadMessageLike(
    convertToAssistantUiMessage(message, { state, error }),
    message.id,
    { type: "complete", reason: "stop" },
  );
}

function project(
  messages: readonly FusionChatMessage[],
  options: {
    active?: boolean;
    status?: FusionChatStatus;
    error?: string | null;
    sourceMessageIds?: readonly string[];
    messageStates?: Readonly<Record<string, GeoChatMessageState>>;
  } = {},
) {
  return deriveFusionBubbles({
    runtimeMessages: messages.map((message) => runtimeMessage(
      message,
      options.messageStates?.[message.id]
        ?? (message.role === "assistant" && options.active ? "streaming" : "ready"),
      options.error,
    )),
    sourceMessageIds: [...(options.sourceMessageIds ?? messages.map((message) => message.id))],
    active: options.active ?? false,
    status: options.status ?? "ready",
    error: options.error,
    labels,
  });
}

describe("fusion-mode bubble projection", () => {
  test("renders runtime messages by id without a detached MessageProvider", () => {
    const root = join(import.meta.dir, "../src/renderer-react/src");
    const stack = readFileSync(join(root, "features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    const thread = readFileSync(join(root, "features/assistant-ui/GeoChatThread.tsx"), "utf8");
    const parts = readFileSync(join(root, "features/assistant-ui/GeoChatMessageParts.tsx"), "utf8");

    expect(stack).toContain("<GeoChatMessageById");
    expect(stack).toContain("messageId={bubble.messageId}");
    expect(stack).toContain("<GeoChatDisplayToolById");
    expect(stack).not.toContain("MessageProvider");
    expect(stack).not.toContain("fromThreadMessageLike");
    expect(stack).not.toContain("convertToAssistantUiMessage");
    expect(thread).toContain("<ThreadPrimitive.Unstable_MessageById");
    expect(parts).toContain("<MessagePrimitive.GroupedParts");
    expect(parts).toContain("{({ part, children }) => {");
  });

  test("projects completed display tools as part-index references", () => {
    const message = {
      id: "display-1",
      role: "assistant",
      parts: [{
        type: "tool-showSolutionSteps",
        toolCallId: "tool-1",
        state: "output-available",
        input: {},
        output: { title: "Solution", steps: [{ label: "1", body: "Draw the circle" }] },
      }],
    } as unknown as FusionChatMessage;

    expect(project([message])).toEqual([{
      id: "display-1:tool-1",
      role: "display-card",
      content: "",
      messageId: "display-1",
      partIndex: 0,
    }]);
  });

  test("ignores system messages and preserves runtime message identities", () => {
    const system = { id: "system-1", role: "system", parts: [{ type: "text", text: "internal policy" }] } as FusionChatMessage;
    const user = { id: "u1", role: "user", parts: [{ type: "text", text: "draw" }] } as FusionChatMessage;
    const assistant = { id: "a1", role: "assistant", parts: [{ type: "text", text: "done" }] } as FusionChatMessage;

    expect(project([system, user, assistant])).toEqual([
      { id: "u1", role: "user", content: "draw", messageId: "u1" },
      { id: "fusion-response:u1", role: "assistant", content: "done", messageId: "a1" },
    ]);
  });

  test("keeps a completed operational-tool-only assistant message renderable by id", () => {
    const message = {
      id: "a1",
      role: "assistant",
      parts: [{
        type: "tool-getCanvasContext",
        toolCallId: "tool-1",
        state: "output-available",
        input: {},
        output: { objects: [] },
      }],
    } as unknown as FusionChatMessage;

    expect(project([message])).toEqual([{
      id: "fusion-response:a1",
      role: "assistant",
      content: "thinking",
      messageId: "a1",
    }]);
  });

  test("keeps prose and a display tool addressable through the same runtime message", () => {
    const message = {
      id: "choice-1",
      role: "assistant",
      parts: [
        { type: "text", text: "先看公共条件。" },
        {
          type: "tool-showChoiceAnalysis",
          toolCallId: "choice-tool",
          state: "output-available",
          input: {},
          output: { title: "选项分析", choices: [] },
        },
      ],
    } as unknown as FusionChatMessage;

    expect(project([message])).toEqual([
      { id: "fusion-response:choice-1", role: "assistant", content: "先看公共条件。", messageId: "choice-1" },
      {
        id: "choice-1:choice-tool",
        role: "display-card",
        content: "",
        messageId: "choice-1",
        partIndex: 1,
      },
    ]);
  });

  test("preserves each conversation message for the height-based stack window", () => {
    const messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "first" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "answer" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "second" }] },
      { id: "a2", role: "assistant", parts: [{ type: "text", text: "latest" }] },
    ] as FusionChatMessage[];

    expect(project(messages).map(({ id, messageId }) => ({ id, messageId }))).toEqual([
      { id: "u1", messageId: "u1" },
      { id: "fusion-response:u1", messageId: "a1" },
      { id: "u2", messageId: "u2" },
      { id: "fusion-response:u2", messageId: "a2" },
    ]);
  });

  test("does not remove conversation cards by count or render a synthetic overflow card", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    const projection = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/bubbles.ts"), "utf8");
    expect(projection).toContain("return bubbles");
    expect(projection).not.toContain("slice(-limit)");
    expect(projection).not.toContain("fusion-overflow");
    expect(stack).not.toContain('bubble.role === "overflow"');
    expect(stack).not.toContain("selectVisibleFusionBubbleIds");
  });

  test("keeps transparent shell padding while scrolling only inside a complete rounded card", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    expect(stack).toContain("px: 2.5");
    expect(stack).toContain("pb: 3");
    expect(stack).not.toContain("height: props.maxHeight");
    expect(stack).toContain('data-fusion-bubble-flow="true"');
    expect(stack).toContain('overflowY: "auto"');
    expect(stack).toContain('scrollbarWidth: "none"');
    expect(stack).toContain('overflow: "hidden"');
    expect(stack).not.toContain('scrollPaddingBlock: "12px 24px"');
    expect(stack).toContain('overflow: "visible"');
    expect(stack).toContain("maxHeight: bubbleHeightLimit");
  });

  test("animates a bounded suffix of whole cards instead of clipping the stack", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    expect(stack).not.toContain("selectVisibleFusionBubbleIds");
    expect(stack).toContain("renderItems.map");
    expect(stack).toContain("selectBubbleIdsForHeight");
    expect(stack).toContain("shiftBubbleIdsForHeight");
    expect(stack).toContain("interpolateBubbleWindowLayout");
    expect(stack).not.toContain("visibleCapacity");
    expect(stack).toContain('position: "absolute"');
    expect(stack).not.toContain("flexShrink: bodyScrollable ? 1 : 0");
    expect(stack).toContain("animate={{ y: layout.y, opacity: layout.opacity, scale: layout.scale }}");
  });

  test("reopens height-evicted history cards by scrolling the complete-card window", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    expect(stack).toContain("historyWindowIds");
    expect(stack).toContain("advanceBubbleWindowGesture");
    expect(stack).toContain("onWheelCapture={handleHistoryWheel}");
    expect(stack).toContain('data-fusion-bubble-scroll="true"');
    expect(stack).toContain("setHistoryWindowIds(sameIds(nextWindowIds, latestBubbleIds) ? null : nextWindowIds)");
  });

  test("interpolates whole-card entry and exit from the scroll edge and direction", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    expect(stack).toContain("interpolateBubbleWindowLayout");
    expect(stack).toContain("historyGesture.progress");
    expect(stack).toContain("height: windowLayout.height");
    expect(stack).toContain("duration: reduceMotion || historyGesture.direction ? 0 : 0.2");
  });

  test("does not render a detached connector capsule between the response and composer", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    const surface = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionModeSurface.tsx"), "utf8");
    expect(stack).toContain('width: "min(430px, calc(100vw - 8px))"');
    expect(stack).not.toContain("connectedToComposer?: boolean");
    expect(stack).not.toContain('content: "\'\'"');
    expect(surface).not.toContain("connectedToComposer={turn.id === props.controller.activeTurnId}");
  });

  test("uses one stable placeholder while waiting for the first assistant runtime message", () => {
    const user = { id: "u1", role: "user", parts: [{ type: "text", text: "draw" }] } as FusionChatMessage;
    const submitted = project([user], { active: true, status: "submitted" });
    const streaming = project([user], { active: true, status: "streaming" });

    expect(submitted.at(-1)).toEqual({ id: "fusion-response:u1", role: "status", content: "connecting", pending: true });
    expect(streaming.at(-1)).toEqual({ id: "fusion-response:u1", role: "status", content: "thinking", pending: true });
  });

  test("replaces the placeholder with the assistant runtime message instead of adding a detached status card", () => {
    const user = { id: "u1", role: "user", parts: [{ type: "text", text: "draw" }] } as FusionChatMessage;
    const assistant = { id: "a1", role: "assistant", parts: [{ type: "reasoning", text: "分析题目" }] } as FusionChatMessage;
    const submitted = project([user], { active: true, status: "submitted" });
    const thinking = project([user, assistant], {
      active: true,
      status: "streaming",
      messageStates: { a1: "streaming" },
    });

    expect(submitted.map((bubble) => bubble.id)).toEqual(["u1", "fusion-response:u1"]);
    expect(thinking.map((bubble) => bubble.id)).toEqual(["u1", "fusion-response:u1"]);
    expect(thinking.at(-1)).toMatchObject({ role: "assistant", messageId: "a1", content: "thinking", pending: true });
  });

  test("keeps terminal errors in the shared message slot when an assistant message exists", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    const parts = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/assistant-ui/GeoChatMessageParts.tsx"), "utf8");
    expect(stack).not.toContain("bubble.error");
    expect(parts).toContain("<MessagePrimitive.Error>");
    expect(parts).toContain('state.message.status?.type === "incomplete"');
  });

  test("uses one fallback error card only when no assistant runtime message exists", () => {
    const user = { id: "u1", role: "user", parts: [{ type: "text", text: "draw" }] } as FusionChatMessage;
    expect(project([user], { status: "error", error: "failed" }).at(-1)).toEqual({
      id: "fusion-response:u1",
      role: "error",
      content: "failed",
    });
  });

  test("filters empty assistant placeholders from spatial turn synchronization", () => {
    const empty = { id: "empty", role: "assistant", parts: [] } as unknown as FusionChatMessage;
    const text = { id: "text", role: "assistant", parts: [{ type: "text", text: "done" }] } as FusionChatMessage;
    const reasoning = { id: "reasoning", role: "assistant", parts: [{ type: "reasoning", text: "work" }] } as FusionChatMessage;
    expect(isFusionRenderableMessage(empty)).toBe(false);
    expect(isFusionRenderableMessage(text)).toBe(true);
    expect(isFusionRenderableMessage(reasoning)).toBe(true);
  });

  test("renders one compact summary instead of a detached toolbar for collapsed turns", () => {
    const stack = readFileSync(join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode/FusionBubbleStack.tsx"), "utf8");
    expect(stack).toContain("props.collapsed && latest");
    expect(stack).toContain("props.collapsedSummaryLabel");
    expect(stack).not.toContain('data-fusion-bubble-controls="true"');
  });
});
