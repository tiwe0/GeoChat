import type { ChatMessageMetadata } from "@geochat-ai/app/contracts";
import {
  decodePersistedConversationMessage,
  decodePersistedConversationParts,
} from "@geochat-ai/app/conversation-message-contract";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import type { UIMessage } from "ai";

const logger = createStructuredLogger("conversations.message-decoder");

export type StoredConversationPart = UIMessage["parts"][number];
export type StoredConversationMessage = {
  schemaVersion: 1;
  id: string;
  clientMessageId: string | null;
  role: "user" | "assistant";
  content: string;
  parts: StoredConversationPart[];
  usage: ChatMessageMetadata["tokenUsage"] | null;
};

export function decodeStoredConversationMessages(value: unknown, apiOrigin?: string): StoredConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const decoded = decodePersistedConversationMessage(item);
    if (!decoded.ok) {
      logger.warn("message_restore_skipped", decoded.errorCode);
      return [];
    }
    return [
      {
        ...decoded.value,
        parts: proxyStoredPartUrls(decoded.value.parts, apiOrigin) as unknown as StoredConversationPart[],
        usage: decoded.value.usage as ChatMessageMetadata["tokenUsage"] | null,
      },
    ];
  });
}

export function decodeStoredConversationParts(value: unknown, apiOrigin?: string): StoredConversationPart[] {
  const decoded = decodePersistedConversationParts(value);
  if (!decoded.ok) return [];
  return proxyStoredPartUrls(decoded.value, apiOrigin) as unknown as StoredConversationPart[];
}

function proxyStoredPartUrls<T extends { type: string } & Record<string, unknown>>(parts: T[], apiOrigin?: string) {
  return parts.map((part) =>
    part.type === "file" && typeof part.url === "string"
      ? { ...part, url: proxyStoredImageUrl(part.url, apiOrigin) }
      : part,
  );
}

function proxyStoredImageUrl(value: string, apiOrigin?: string) {
  if (!apiOrigin || !/^https?:\/\//i.test(value)) return value;
  try {
    const parsed = new URL(value);
    const prefix = "/v1/images/";
    if (!parsed.pathname.startsWith(prefix)) return value;
    const key = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return `${apiOrigin.replace(/\/$/, "")}/api/media/images/${encodeURIComponent(key)}`;
  } catch (caughtError) {
    logger.debug("stored_image_url_parse_failed", "CONVERSATION_IMAGE_URL_INVALID", { error: caughtError });
    return value;
  }
}
