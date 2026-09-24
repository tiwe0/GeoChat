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

function assistantStatus(message: FusionChatMessage, labels: FusionBubbleLabels) {
  const activeTool = [...message.parts].reverse().find((part) => isToolUIPart(part) && part.state !== "output-available");
  if (activeTool && isToolUIPart(activeTool)) return labels.runningTool(getToolName(activeTool));
  const hasReasoning = message.parts.some((part) => part.type === "reasoning");
  return hasReasoning ? labels.thinking : "";
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
    const content = textContent(message);
    if (content) {
      historyBubbles.push({ id: message.id, role: message.role === "user" ? "user" : "assistant", content, message });
      continue;
    }
    if (message.role === "user" && message.parts.some((part) => part.type === "file")) {
      historyBubbles.push({ id: message.id, role: "user", content: input.labels.attachment, message });
      continue;
    }
    if (message.role === "assistant") {
      if (message.parts.some(isAssistantDisplayToolPart)) {
        historyBubbles.push({ id: message.id, role: "assistant", content: "", message });
        continue;
      }
      const status = assistantStatus(message, input.labels);
      if (status) historyBubbles.push({ id: message.id, role: "status", content: status, pending: input.status !== "ready", message });
    }
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
  } else if (input.status === "submitted") {
    bubbles.push({ id: "fusion-active", role: "status", content: input.labels.connecting, pending: true });
  }

  return bubbles;
}
