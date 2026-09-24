import type { FusionChatMessage, FusionChatStatus } from "./types";

function isBusy(status: FusionChatStatus) {
  return status === "submitted" || status === "streaming";
}

function assistantText(message: FusionChatMessage) {
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Produce one screen-reader announcement per completed run. Streaming
 * reasoning and tool deltas deliberately return nothing.
 */
export function deriveFusionRunAnnouncement(input: {
  previousStatus: FusionChatStatus;
  status: FusionChatStatus;
  messages: readonly FusionChatMessage[];
  activeMessageIds: readonly string[];
  baselineMessageIds?: readonly string[];
  error?: string | null;
}) {
  if (!isBusy(input.previousStatus) || isBusy(input.status)) return null;
  if (input.status === "error") return input.error?.trim() || null;
  const activeIds = new Set(input.activeMessageIds);
  const baselineIds = new Set(input.baselineMessageIds ?? []);
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index]!;
    if (
      message.role !== "assistant"
      || (activeIds.size > 0 ? !activeIds.has(message.id) && baselineIds.has(message.id) : baselineIds.has(message.id))
    ) continue;
    const text = assistantText(message);
    if (text) return text;
  }
  return null;
}
