import {
  isBoundedRuntimeString,
  isRuntimeIsoTimestamp,
  isRuntimeNonNegativeInteger,
  isRuntimeRecord,
  runtimeDecodeFailure,
  runtimeDecodeSuccess,
  type RuntimeDecodeResult
} from "./runtime-decode";

export const LEGACY_CONVERSATION_IMPORT_SCHEMA_VERSION = 1 as const;
export const MAX_LEGACY_CONVERSATION_IMPORT_MESSAGES = 5_000;

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

export function decodeLegacyConversationImportRequest(
  value: unknown
): RuntimeDecodeResult<LegacyConversationImportRequest, "legacy_conversation_import_request_invalid"> {
  if (!isRuntimeRecord(value)) return runtimeDecodeFailure("legacy_conversation_import_request_invalid");
  if (
    value.schemaVersion !== LEGACY_CONVERSATION_IMPORT_SCHEMA_VERSION
    || typeof value.sourceFingerprint !== "string"
    || !/^[a-f0-9]{64}$/.test(value.sourceFingerprint)
    || !isLegacyConversationRecord(value.conversation)
  ) {
    return runtimeDecodeFailure("legacy_conversation_import_request_invalid");
  }
  return runtimeDecodeSuccess(value as LegacyConversationImportRequest);
}

export function decodeLegacyConversationImportResponse(
  value: unknown
): RuntimeDecodeResult<LegacyConversationImportResponse, "legacy_conversation_import_response_invalid"> {
  if (!isRuntimeRecord(value) || !isLegacyConversationImportResult(value.importResult)) {
    return runtimeDecodeFailure("legacy_conversation_import_response_invalid");
  }
  return runtimeDecodeSuccess(value as LegacyConversationImportResponse);
}

function isLegacyConversationRecord(value: unknown) {
  if (!isRuntimeRecord(value)) return false;
  if (
    !isBoundedRuntimeString(value.id, 160)
    || !isBoundedRuntimeString(value.model, 200)
    || !(value.title === null || isBoundedRuntimeString(value.title, 500))
    || !isRuntimeIsoTimestamp(value.createdAt)
    || !isRuntimeIsoTimestamp(value.updatedAt)
    || !Array.isArray(value.messages)
    || value.messages.length > MAX_LEGACY_CONVERSATION_IMPORT_MESSAGES
  ) return false;

  const ids = new Set<string>();
  return value.messages.every((message) => {
    if (!isRuntimeRecord(message)) return false;
    if (
      !isBoundedRuntimeString(message.id, 160)
      || ids.has(message.id)
      || (message.role !== "user" && message.role !== "assistant")
      || (message.createdAt !== undefined && !isRuntimeIsoTimestamp(message.createdAt))
      || !Array.isArray(message.parts)
      || (message.metadata !== undefined && !isRuntimeRecord(message.metadata))
    ) return false;
    ids.add(message.id);
    const usage = isRuntimeRecord(message.metadata) ? message.metadata.tokenUsage : undefined;
    return usage === undefined || isLegacyTokenUsage(usage);
  });
}

function isLegacyConversationImportResult(value: unknown): value is LegacyConversationImportResult {
  if (!isRuntimeRecord(value)) return false;
  return (
    (value.outcome === "imported" || value.outcome === "skipped" || value.outcome === "conflict")
    && isBoundedRuntimeString(value.conversationId, 160)
    && typeof value.sourceFingerprint === "string"
    && /^[a-f0-9]{64}$/.test(value.sourceFingerprint)
    && (
      value.reason === undefined
      || value.reason === "conversation_content_conflict"
      || value.reason === "message_id_conflict"
      || value.reason === "source_fingerprint_mismatch"
    )
  );
}

function isLegacyTokenUsage(value: unknown) {
  if (!isRuntimeRecord(value)) return false;
  return [value.inputTokens, value.outputTokens, value.totalTokens].every((token) =>
    token === undefined || isRuntimeNonNegativeInteger(token));
}
