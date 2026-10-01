import {
  CONVERSATION_MESSAGE_SCHEMA_VERSION,
  decodePersistedConversationParts,
  isPersistedConversationMessagePayload,
  isPersistedConversationUsage,
  type PersistedConversationMessagePayload,
  type PersistedConversationUsage,
} from "@geochat-ai/app/conversation-message-contract";
import { RuntimeContractDecodeError } from "@geochat-ai/app/runtime-decode";
import type { UIMessage } from "ai";

/**
 * Convert a live AI SDK message into the durable conversation contract.
 * The encoder deliberately does not serialize provider-only request messages.
 */
export function encodeConversationMessagePayload(input: {
  message: UIMessage;
  content: string;
  createdAt: string;
  usage?: unknown;
}): PersistedConversationMessagePayload {
  const parts = decodePersistedConversationParts(input.message.parts);
  if (!parts.ok) {
    throw new RuntimeContractDecodeError(
      parts.errorCode,
      `Conversation message ${input.message.id || "<pending>"} contains invalid UI parts.`,
    );
  }
  const usage = selectUsage(input.usage, input.message.metadata);
  const payload = {
    schemaVersion: CONVERSATION_MESSAGE_SCHEMA_VERSION,
    id: input.message.id,
    role: input.message.role as "user" | "assistant",
    content: input.content,
    createdAt: input.createdAt,
    parts: parts.value,
    ...(usage ? { usage } : {}),
  };
  if (!isPersistedConversationMessagePayload(payload)) {
    throw new RuntimeContractDecodeError(
      "conversation_message_invalid",
      `Conversation message ${input.message.id || "<pending>"} does not match the persistence contract.`,
    );
  }
  return payload;
}

function selectUsage(explicitUsage: unknown, metadata: unknown): PersistedConversationUsage | undefined {
  if (isPersistedConversationUsage(explicitUsage)) return explicitUsage;
  if (
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    "tokenUsage" in metadata &&
    isPersistedConversationUsage(metadata.tokenUsage)
  ) {
    return metadata.tokenUsage;
  }
  return undefined;
}
