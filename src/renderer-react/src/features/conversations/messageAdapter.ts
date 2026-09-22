import type { UIMessage } from "ai";
import type { ChatMessageMetadata } from "@geochat-ai/app/contracts";
import type { StoredConversationMessage } from "./api";

export type ChatMessage = UIMessage<ChatMessageMetadata>;

export function restoreConversationMessages(items: StoredConversationMessage[]): ChatMessage[] {
  return items.flatMap((item) => {
    if (item.role !== "user" && item.role !== "assistant") return [];
    const parts = item.parts.length ? item.parts : [{ type: "text" as const, text: item.content }];
    return [{ id: item.clientMessageId || item.id, role: item.role, parts, ...(item.usage ? { metadata: { tokenUsage: item.usage } } : {}) } satisfies ChatMessage];
  });
}
