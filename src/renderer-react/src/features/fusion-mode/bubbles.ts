import { getExternalStoreMessages, type ThreadMessage } from "@assistant-ui/react";
import { isToolUIPart } from "ai";
import { isGeoChatDisplayToolName } from "../assistant-ui/toolPresentation";
import type { FusionBubble, FusionChatMessage, FusionChatStatus } from "./types";

export type FusionBubbleLabels = {
  thinking: string;
  connecting: string;
  attachment: string;
};

function runtimeTextContent(message: ThreadMessage) {
  return message.content
    .filter((part): part is Extract<(typeof message.content)[number], { type: "text" }> => part.type === "text")
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

function externalMessageIds(message: ThreadMessage) {
  return getExternalStoreMessages<FusionChatMessage>(message).map((external) => external.id);
}

function stableSourceId(message: ThreadMessage, sourceMessageIds: ReadonlySet<string>) {
  return externalMessageIds(message).find((id) => sourceMessageIds.has(id))
    ?? (sourceMessageIds.has(message.id) ? message.id : undefined)
    ?? message.id;
}

function belongsToTurn(message: ThreadMessage, sourceMessageIds: ReadonlySet<string>) {
  if (sourceMessageIds.has(message.id)) return true;
  return externalMessageIds(message).some((id) => sourceMessageIds.has(id));
}

function hasUserAttachment(message: ThreadMessage) {
  return message.role === "user" && (
    message.attachments.length > 0
    || message.content.some((part) => part.type === "file" || part.type === "image")
  );
}

function isDisplayToolPart(
  part: ThreadMessage["content"][number],
): part is Extract<ThreadMessage["content"][number], { type: "tool-call" }> {
  return part.type === "tool-call" && isGeoChatDisplayToolName(part.toolName);
}

function shouldRenderAssistantShell(message: Extract<ThreadMessage, { role: "assistant" }>) {
  return message.status.type !== "complete"
    || message.content.some((part) => !isDisplayToolPart(part));
}

export function deriveFusionBubbles(input: {
  runtimeMessages: readonly ThreadMessage[];
  sourceMessageIds: readonly string[];
  active: boolean;
  status: FusionChatStatus;
  error?: string | null;
  labels: FusionBubbleLabels;
}): FusionBubble[] {
  const sourceMessageIds = new Set(input.sourceMessageIds);
  const matchedIndices = input.runtimeMessages.flatMap((message, index) => (
    belongsToTurn(message, sourceMessageIds) ? [index] : []
  ));
  const lastMatchedIndex = matchedIndices.at(-1) ?? -1;
  const selectedMessages = input.runtimeMessages.filter((message, index) => (
    belongsToTurn(message, sourceMessageIds)
    || (sourceMessageIds.size > 0 && input.active && index > lastMatchedIndex && message.role === "assistant")
  ));
  const bubbles: FusionBubble[] = [];
  let hasAssistantShell = false;
  let currentUserSeed: string | undefined;

  for (const message of selectedMessages) {
    if (message.role === "system") continue;
    const content = runtimeTextContent(message);
    if (message.role === "user") {
      currentUserSeed = stableSourceId(message, sourceMessageIds);
      if (content || hasUserAttachment(message)) {
        bubbles.push({
          id: message.id,
          role: "user",
          content: content || input.labels.attachment,
          messageId: message.id,
        });
      }
      continue;
    }

    if (shouldRenderAssistantShell(message)) {
      hasAssistantShell = true;
      bubbles.push({
        id: `fusion-response:${currentUserSeed ?? stableSourceId(message, sourceMessageIds)}`,
        role: "assistant",
        content: content || input.labels.thinking,
        messageId: message.id,
        ...(message.status.type === "running" || message.status.type === "requires-action" ? { pending: true } : {}),
      });
    }
    message.content.forEach((part, partIndex) => {
      if (!isDisplayToolPart(part)) return;
      bubbles.push({
        id: `${message.id}:${part.toolCallId}`,
        role: "display-card",
        content: "",
        messageId: message.id,
        partIndex,
      });
    });
  }

  const firstAssistant = selectedMessages.find((message) => message.role === "assistant");
  const responseSeed = currentUserSeed
    ?? (firstAssistant ? stableSourceId(firstAssistant, sourceMessageIds) : undefined)
    ?? input.sourceMessageIds[0]
    ?? "pending";
  const responseShellId = `fusion-response:${responseSeed}`;

  if (input.active && !hasAssistantShell && (input.status === "submitted" || input.status === "streaming")) {
    bubbles.push({
      id: responseShellId,
      role: "status",
      content: input.status === "submitted" ? input.labels.connecting : input.labels.thinking,
      pending: true,
    });
  } else if (!hasAssistantShell && input.error) {
    bubbles.push({ id: responseShellId, role: "error", content: input.error });
  }

  return bubbles;
}
