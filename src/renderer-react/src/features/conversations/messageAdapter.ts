import type { UIMessage } from "ai";
import type { ChatMessageMetadata } from "@geochat-ai/app/contracts";
import type { StoredConversationMessage, StoredConversationPart } from "./api";

export type ChatMessage = UIMessage<ChatMessageMetadata>;

export function restoreConversationMessages(items: StoredConversationMessage[]): ChatMessage[] {
  return items.flatMap((item) => {
    if (item.role !== "user" && item.role !== "assistant") return [];
    const parts = item.parts.length ? item.parts.map(toUiPart) : [{ type: "text" as const, text: item.content }];
    return [{ id: item.clientMessageId || item.id, role: item.role, parts, ...((item.usage || item.credits !== null) ? { metadata: { ...(item.usage ? { tokenUsage: item.usage } : {}), ...(item.credits === null ? {} : { credits: item.credits }) } } : {}) } satisfies ChatMessage];
  });
}

function toUiPart(part: StoredConversationPart) {
  return part.type === "text"
    ? part
    : { type: "file" as const, url: part.url, mediaType: part.mediaType, ...(part.filename ? { filename: part.filename } : {}) };
}
