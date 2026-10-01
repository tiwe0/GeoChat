import {
  isRuntimeNonNegativeInteger,
  isRuntimeIsoTimestamp,
  isRuntimeRecord,
  runtimeDecodeFailure,
  runtimeDecodeSuccess,
  type RuntimeDecodeResult,
} from "./runtime-decode";

export const CONVERSATION_TOOL_STATES = [
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-error",
  "output-denied",
] as const;

export const CONVERSATION_MESSAGE_SCHEMA_VERSION = 1 as const;

export type ConversationToolState = (typeof CONVERSATION_TOOL_STATES)[number];
export type PersistedConversationPart = { type: string } & Record<string, unknown>;

export type PersistedConversationUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type PersistedConversationMessageRole = "user" | "assistant";

export type PersistedConversationMessagePayload = {
  schemaVersion: typeof CONVERSATION_MESSAGE_SCHEMA_VERSION;
  id: string;
  role: PersistedConversationMessageRole;
  content: string;
  createdAt: string;
  attachments?: unknown[];
  toolCalls?: unknown[];
  cards?: unknown[];
  parts?: PersistedConversationPart[];
  usage?: PersistedConversationUsage;
};

export type PersistedConversationMessage = {
  schemaVersion: typeof CONVERSATION_MESSAGE_SCHEMA_VERSION;
  id: string;
  clientMessageId: string | null;
  role: PersistedConversationMessageRole;
  content: string;
  parts: PersistedConversationPart[];
  usage: PersistedConversationUsage | null;
};

export type ConversationMessageDecodeErrorCode = "conversation_message_invalid" | "conversation_parts_invalid";

const TOOL_STATES = new Set<string>(CONVERSATION_TOOL_STATES);
const SAFE_SOURCE_URL_SCHEMES = new Set(["http:", "https:"]);
const SAFE_FILE_URL_SCHEMES = new Set(["http:", "https:", "data:", "blob:"]);

/**
 * Decode persisted AI SDK UIMessage parts. Known part kinds are structurally
 * checked while provider metadata and future extension fields remain JSON
 * compatible. The only normalization restores output-error.input after JSON
 * has omitted an explicitly undefined value.
 */
export function decodePersistedConversationParts(
  value: unknown,
): RuntimeDecodeResult<PersistedConversationPart[], "conversation_parts_invalid"> {
  if (!Array.isArray(value) || !value.every(isPersistedConversationPart)) {
    return runtimeDecodeFailure("conversation_parts_invalid");
  }
  return runtimeDecodeSuccess(value.map(normalizePersistedConversationPart));
}

/** Decode one database/API message so a caller can isolate a corrupt row. */
export function decodePersistedConversationMessage(
  value: unknown,
): RuntimeDecodeResult<PersistedConversationMessage, "conversation_message_invalid"> {
  if (!isRuntimeRecord(value)) return runtimeDecodeFailure("conversation_message_invalid");
  const payload = isRuntimeRecord(value.payload) ? value.payload : undefined;
  const id = typeof value.id === "string" && value.id.trim() ? value.id : undefined;
  const role = value.role === "user" || value.role === "assistant" ? value.role : undefined;
  if (!id || !role || typeof value.content !== "string" || !isRuntimeIsoTimestamp(value.createdAt) || !payload) {
    return runtimeDecodeFailure("conversation_message_invalid");
  }
  const normalizedPayload = normalizePersistedConversationMessagePayload(payload);
  if (
    !normalizedPayload ||
    normalizedPayload.id !== id ||
    normalizedPayload.role !== role ||
    normalizedPayload.content !== value.content ||
    normalizedPayload.createdAt !== value.createdAt
  )
    return runtimeDecodeFailure("conversation_message_invalid");
  return runtimeDecodeSuccess({
    schemaVersion: CONVERSATION_MESSAGE_SCHEMA_VERSION,
    id,
    clientMessageId:
      typeof value.clientMessageId === "string" && value.clientMessageId.trim() ? value.clientMessageId : null,
    role,
    content: value.content,
    parts: normalizedPayload.parts ?? [],
    usage: normalizedPayload.usage ?? null,
  });
}

export function isPersistedConversationMessagePayload(value: unknown): value is PersistedConversationMessagePayload {
  if (!isRuntimeRecord(value)) return false;
  if (
    value.schemaVersion !== CONVERSATION_MESSAGE_SCHEMA_VERSION ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    (value.role !== "user" && value.role !== "assistant") ||
    typeof value.content !== "string" ||
    !isRuntimeIsoTimestamp(value.createdAt) ||
    (value.attachments !== undefined && !Array.isArray(value.attachments)) ||
    (value.toolCalls !== undefined && !Array.isArray(value.toolCalls)) ||
    (value.cards !== undefined && !Array.isArray(value.cards)) ||
    (value.usage !== undefined && !isPersistedConversationUsage(value.usage))
  ) {
    return false;
  }
  return value.parts === undefined || decodePersistedConversationParts(value.parts).ok;
}

/** Accept only the current persisted payload contract. */
export function normalizePersistedConversationMessagePayload(
  value: unknown,
): PersistedConversationMessagePayload | undefined {
  if (!isPersistedConversationMessagePayload(value)) return undefined;
  if (value.parts === undefined) return value;
  const parts = decodePersistedConversationParts(value.parts);
  return parts.ok ? { ...value, parts: parts.value } : undefined;
}

export function isPersistedConversationUsage(value: unknown): value is PersistedConversationUsage {
  if (!isRuntimeRecord(value)) return false;
  return [value.inputTokens, value.outputTokens, value.totalTokens].every(
    (token) => token === undefined || isRuntimeNonNegativeInteger(token),
  );
}

function isPersistedConversationPart(value: unknown): value is PersistedConversationPart {
  if (!isRuntimeRecord(value) || typeof value.type !== "string" || !value.type.trim()) return false;
  switch (value.type) {
    case "text":
    case "reasoning":
      return typeof value.text === "string";
    case "file":
    case "reasoning-file":
      return typeof value.url === "string" && isSafeFileUrl(value.url) && typeof value.mediaType === "string";
    case "source-url":
      return typeof value.sourceId === "string" && typeof value.url === "string" && isSafeSourceUrl(value.url);
    case "source-document":
      return (
        typeof value.sourceId === "string" && typeof value.mediaType === "string" && typeof value.title === "string"
      );
    case "custom":
      return typeof value.kind === "string" && value.kind.includes(".");
    case "step-start":
      return true;
    case "dynamic-tool":
      return typeof value.toolName === "string" && Boolean(value.toolName.trim()) && isToolInvocation(value);
    default:
      if (value.type.startsWith("tool-")) return isToolInvocation(value);
      if (value.type.startsWith("data-")) return Object.hasOwn(value, "data");
      // Preserve future AI SDK/provider part kinds. Their fields stay opaque
      // until this contract learns the new kind, while the record/type boundary
      // still prevents primitive or anonymous payloads from reaching the UI.
      return true;
  }
}

function isToolInvocation(value: Record<string, unknown>) {
  if (
    typeof value.toolCallId !== "string" ||
    !value.toolCallId.trim() ||
    typeof value.state !== "string" ||
    !TOOL_STATES.has(value.state)
  ) {
    return false;
  }
  switch (value.state as ConversationToolState) {
    case "input-streaming":
      return true;
    case "input-available":
      return Object.hasOwn(value, "input");
    case "approval-requested":
      return Object.hasOwn(value, "input") && isApproval(value.approval, undefined);
    case "approval-responded":
      return Object.hasOwn(value, "input") && isApproval(value.approval, "boolean");
    case "output-available":
      return (
        Object.hasOwn(value, "input") &&
        Object.hasOwn(value, "output") &&
        (value.approval === undefined || isApproval(value.approval, true))
      );
    case "output-error":
      return typeof value.errorText === "string" && (value.approval === undefined || isApproval(value.approval, true));
    case "output-denied":
      return Object.hasOwn(value, "input") && isApproval(value.approval, false);
  }
}

function normalizePersistedConversationPart(value: PersistedConversationPart): PersistedConversationPart {
  if (
    (value.type === "dynamic-tool" || value.type.startsWith("tool-")) &&
    value.state === "output-error" &&
    !Object.hasOwn(value, "input")
  ) {
    // AI SDK permits output-error.input to be undefined. JSON persistence drops
    // undefined object properties, so restore the field on decode while keeping
    // rawInput, provider metadata, and future extension fields untouched.
    return { ...value, input: undefined };
  }
  return value;
}

function isSafeSourceUrl(value: string): boolean {
  return hasAllowedUrlScheme(value, SAFE_SOURCE_URL_SCHEMES);
}

function isSafeFileUrl(value: string): boolean {
  return hasAllowedUrlScheme(value, SAFE_FILE_URL_SCHEMES);
}

function hasAllowedUrlScheme(value: string, allowedSchemes: ReadonlySet<string>): boolean {
  if (!value || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    return allowedSchemes.has(new URL(value).protocol.toLowerCase());
  } catch {
    return false;
  }
}

function isApproval(value: unknown, approved: true | false | "boolean" | undefined) {
  if (!isRuntimeRecord(value) || typeof value.id !== "string" || !value.id.trim()) return false;
  if (approved === "boolean") return typeof value.approved === "boolean";
  if (approved === undefined) return value.approved === undefined;
  return value.approved === approved;
}
