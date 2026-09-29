import type { LegacyConversationImportMessage } from "@geochat-ai/app/legacy-conversation-import";

export const LEGACY_CONVERSATIONS_KEY = "geochatDesktopConversations";
export const LEGACY_CONVERSATIONS_VERSION = 1 as const;
export const LEGACY_CONVERSATION_BINARY_OMISSION = "[binary content omitted from local cache]";

export type LegacyConversationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export type LegacyConversationRecord = {
  summary: { id: string; model: string; title: string | null; createdAt: string; updatedAt: string };
  messages: LegacyConversationImportMessage[];
};

export type ParsedLegacyConversationItem =
  | { valid: true; index: number; rawItem: unknown; conversation: LegacyConversationRecord }
  | { valid: false; index: number; rawItem: unknown; error: string };

export type ParsedLegacyConversationCache = {
  envelopeValid: boolean;
  items: ParsedLegacyConversationItem[];
  envelopeError?: string;
};

/** Parse the immutable v1 bytes without the former metadata-dropping adapter. */
export function parseLegacyConversationCache(raw: string): ParsedLegacyConversationCache {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { envelopeValid: false, items: [], envelopeError: "invalid_json" }; }
  const records = Array.isArray(value)
    ? value
    : isRecord(value) && value.version === LEGACY_CONVERSATIONS_VERSION && Array.isArray(value.conversations)
      ? value.conversations
      : null;
  if (!records) return { envelopeValid: false, items: [], envelopeError: "invalid_v1_envelope" };
  return {
    envelopeValid: true,
    items: records.map((rawItem, index) => {
      const parsed = parseLegacyConversationRecord(rawItem);
      return parsed
        ? { valid: true as const, index, rawItem, conversation: parsed }
        : { valid: false as const, index, rawItem, error: "invalid_v1_conversation" };
    }),
  };
}

function parseLegacyConversationRecord(value: unknown): LegacyConversationRecord | null {
  if (!isRecord(value) || !isRecord(value.summary) || !Array.isArray(value.messages)) return null;
  const summary = value.summary;
  if (
    typeof summary.id !== "string" || !summary.id || typeof summary.model !== "string"
    || (summary.title !== null && typeof summary.title !== "string")
    || typeof summary.createdAt !== "string" || typeof summary.updatedAt !== "string"
  ) return null;
  const messages: LegacyConversationImportMessage[] = [];
  for (const valueMessage of value.messages) {
    if (!isRecord(valueMessage) || typeof valueMessage.id !== "string" || !valueMessage.id) return null;
    if (valueMessage.role !== "user" && valueMessage.role !== "assistant") return null;
    if (!Array.isArray(valueMessage.parts)) return null;
    if (valueMessage.createdAt !== undefined && typeof valueMessage.createdAt !== "string") return null;
    if (valueMessage.metadata !== undefined && !isRecord(valueMessage.metadata)) return null;
    messages.push({
      id: valueMessage.id,
      role: valueMessage.role,
      ...(typeof valueMessage.createdAt === "string" ? { createdAt: valueMessage.createdAt } : {}),
      parts: valueMessage.parts,
      ...(isRecord(valueMessage.metadata) ? { metadata: valueMessage.metadata } : {}),
    });
  }
  return {
    summary: { id: summary.id, model: summary.model, title: summary.title, createdAt: summary.createdAt, updatedAt: summary.updatedAt },
    messages,
  };
}

export function markMissingLegacyAttachmentPayloads(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(markMissingLegacyAttachmentPayloads);
  if (!isRecord(value)) return value;
  let attachmentPayloadMissing = value.attachmentPayloadMissing === true;
  const entries = Object.entries(value).map(([key, child]) => {
    if (child === LEGACY_CONVERSATION_BINARY_OMISSION) attachmentPayloadMissing = true;
    return [key, markMissingLegacyAttachmentPayloads(child)] as const;
  });
  return { ...Object.fromEntries(entries), ...(attachmentPayloadMissing ? { attachmentPayloadMissing: true } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
