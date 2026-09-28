import { getToolName, isToolUIPart } from "ai";
import { isAssistantDisplayToolPart } from "../chat/assistantProcess";
import type { FusionBubble, FusionChatMessage, FusionChatStatus } from "./types";

export type FusionBubbleLabels = {
  thinking: string;
  connecting: string;
  runningTool: (name: string) => string;
  attachment: string;
  moreMessages: (count: number) => string;
};

function textContent(message: FusionChatMessage) {
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function isFusionRenderableMessage(message: FusionChatMessage) {
  if (message.role === "system") return false;
  return message.parts.some((part) => {
    if (part.type === "text" || part.type === "reasoning") return part.text.trim().length > 0;
    if (part.type === "file") return true;
    return isToolUIPart(part);
  });
}

function assistantStatus(message: FusionChatMessage, labels: FusionBubbleLabels) {
  const activeTool = [...message.parts].reverse().find((part) => isToolUIPart(part) && part.state !== "output-available");
  if (activeTool && isToolUIPart(activeTool)) return labels.runningTool(getToolName(activeTool));
  const hasReasoning = message.parts.some((part) => part.type === "reasoning");
  return hasReasoning ? labels.thinking : "";
}

function appendAssistantSegment(
  target: FusionBubble[],
  message: FusionChatMessage,
  parts: FusionChatMessage["parts"],
  segmentIndex: number,
  status: FusionChatStatus,
  labels: FusionBubbleLabels,
) {
  if (parts.length === 0) return;
  const segmentMessage: FusionChatMessage = {
    ...message,
    id: `${message.id}:segment:${segmentIndex}`,
    parts,
  };
  const content = textContent(segmentMessage);
  if (content) {
    target.push({ id: segmentMessage.id, role: "assistant", content, message: segmentMessage });
    return;
  }
  const segmentStatus = assistantStatus(segmentMessage, labels);
  if (segmentStatus) {
    target.push({
      id: segmentMessage.id,
      role: "status",
      content: segmentStatus,
      pending: status !== "ready",
      message: segmentMessage,
    });
  }
}

export function deriveFusionBubbles(input: {
  messages: readonly FusionChatMessage[];
  status: FusionChatStatus;
  error?: string | null;
  labels: FusionBubbleLabels;
  limit?: number;
}): FusionBubble[] {
  const historyBubbles: FusionBubble[] = [];
  for (const message of input.messages) {
    if (message.role === "user") {
      const content = textContent(message);
      if (content) historyBubbles.push({ id: message.id, role: "user", content, message });
      else if (message.parts.some((part) => part.type === "file")) {
        historyBubbles.push({ id: message.id, role: "user", content: input.labels.attachment, message });
      }
      continue;
    }

    let segmentIndex = 0;
    let displayIndex = 0;
    let segmentParts: FusionChatMessage["parts"] = [];
    const flushSegment = () => {
      appendAssistantSegment(historyBubbles, message, segmentParts, segmentIndex, input.status, input.labels);
      if (segmentParts.length > 0) segmentIndex += 1;
      segmentParts = [];
    };

    for (const part of message.parts) {
      if (!isAssistantDisplayToolPart(part)) {
        segmentParts.push(part);
        continue;
      }
      flushSegment();
      historyBubbles.push({
        id: `${message.id}:display:${displayIndex}`,
        role: "display-card",
        content: "",
        displayPart: part,
      });
      displayIndex += 1;
    }
    flushSegment();
  }

  // Keep the newest assistant response on one React identity for its whole
  // lifecycle. The submitted/thinking placeholder can therefore turn into
  // reasoning, tools, and streamed text without mounting a second bubble.
  let currentResponseIndex = -1;
  for (let index = historyBubbles.length - 1; index >= 0; index -= 1) {
    const bubble = historyBubbles[index];
    if (bubble?.role !== "assistant" && bubble?.role !== "status") continue;
    currentResponseIndex = index;
    break;
  }
  if (currentResponseIndex >= 0) {
    historyBubbles[currentResponseIndex] = {
      ...historyBubbles[currentResponseIndex],
      id: "fusion-active",
    };
  } else if (input.status === "submitted" || input.status === "streaming") {
    historyBubbles.push({
      id: "fusion-active",
      role: "status",
      content: input.status === "submitted" ? input.labels.connecting : input.labels.thinking,
      pending: true,
    });
  }

  const limit = Math.max(1, input.limit ?? 3);
  const hiddenCount = Math.max(0, historyBubbles.length - limit);
  const bubbles: FusionBubble[] = hiddenCount > 0
    ? [
      { id: "fusion-overflow", role: "overflow", content: input.labels.moreMessages(hiddenCount) },
      ...historyBubbles.slice(-limit),
    ]
    : historyBubbles;

  if (input.error) {
    bubbles.push({ id: "fusion-error", role: "error", content: input.error });
  }

  return bubbles;
}
