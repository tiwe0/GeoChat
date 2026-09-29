export const LEGACY_CONVERSATION_IMPORT_SCHEMA_VERSION = 1 as const;

export type LegacyConversationTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type LegacyConversationImportMessage = {
  id: string;
  role: "user" | "assistant";
  /** Optional in the version-1 local cache. The backend derives a stable value when absent. */
  createdAt?: string;
  parts: unknown[];
  metadata?: {
    tokenUsage?: LegacyConversationTokenUsage;
    [key: string]: unknown;
  };
};

export type LegacyConversationImportRequest = {
  schemaVersion: typeof LEGACY_CONVERSATION_IMPORT_SCHEMA_VERSION;
  /** Lowercase SHA-256 of the immutable source backup item. */
  sourceFingerprint: string;
  conversation: {
    id: string;
    model: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
    messages: LegacyConversationImportMessage[];
  };
};

export type LegacyConversationImportOutcome = "imported" | "skipped" | "conflict";

export type LegacyConversationImportResult = {
  outcome: LegacyConversationImportOutcome;
  conversationId: string;
  sourceFingerprint: string;
  reason?: "conversation_content_conflict" | "message_id_conflict" | "source_fingerprint_mismatch";
};

export type LegacyConversationImportResponse = {
  importResult: LegacyConversationImportResult;
};

