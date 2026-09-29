import { Schema } from "effect";
import {
  isBlackboardCategory,
  isBlackboardEntryStatus,
  type BlackboardEntry
} from "./blackboard";
import { isAgentRunTimestamp } from "./agent-run-time";
import {
  isRuntimeNonNegativeInteger,
  isRuntimeRecord,
  runtimeDecodeFailure,
  runtimeDecodeSuccess,
  type RuntimeDecodeResult
} from "./runtime-decode";

export const GeoChatRole = Schema.Literal("user", "assistant", "system");

export const GeoChatMessage = Schema.Struct({
  id: Schema.String,
  role: GeoChatRole,
  content: Schema.NonEmptyString,
  createdAt: Schema.String
});

export type GeoChatMessage = Schema.Schema.Type<typeof GeoChatMessage>;

export const CreateGeoChatMessageInput = Schema.Struct({
  content: Schema.NonEmptyString
});

export type CreateGeoChatMessageInput = Schema.Schema.Type<typeof CreateGeoChatMessageInput>;

export type DesktopConversationMessageRole = "user" | "assistant";

export type DesktopConversationMessagePayload = {
  id: string;
  role: DesktopConversationMessageRole;
  content: string;
  createdAt: string;
  attachments?: unknown[];
  toolCalls?: unknown[];
  cards?: unknown[];
  /** Native AI SDK UIMessage parts, including reasoning and tool state. */
  parts?: unknown[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export type DesktopConversationMessage = {
  id: string;
  conversationId: string;
  role: DesktopConversationMessageRole;
  content: string;
  createdAt: string;
  payload: DesktopConversationMessagePayload;
};

export type DesktopConversationSummary = {
  id: string;
  model: string | null;
  title: string;
  summary: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DesktopConversationDetail = DesktopConversationSummary & {
  messages: DesktopConversationMessage[];
  blackboardEntries?: BlackboardEntry[];
};

export type DesktopConversationListResponse = {
  conversations: DesktopConversationSummary[];
};

export type DesktopConversationDetailResponse = {
  conversation: DesktopConversationDetail;
};

export type UpsertDesktopConversationMessageInput = {
  conversationId: string;
  model?: string;
  message: {
    id: string;
    role: DesktopConversationMessageRole;
    content: string;
    createdAt: string;
    payload: DesktopConversationMessagePayload;
  };
};

export type ConversationRuntimeDecodeErrorCode =
  | "conversation_message_upsert_invalid"
  | "conversation_message_path_mismatch"
  | "conversation_restore_invalid";

export function decodeUpsertDesktopConversationMessageInput(
  value: unknown
): RuntimeDecodeResult<UpsertDesktopConversationMessageInput, "conversation_message_upsert_invalid"> {
  if (!isRuntimeRecord(value)) return runtimeDecodeFailure("conversation_message_upsert_invalid");
  if (
    typeof value.conversationId !== "string"
    || !value.conversationId.trim()
    || (value.model !== undefined && (typeof value.model !== "string" || !value.model.trim()))
    || !isDesktopConversationUpsertMessage(value.message)
  ) {
    return runtimeDecodeFailure("conversation_message_upsert_invalid");
  }
  return runtimeDecodeSuccess(value as UpsertDesktopConversationMessageInput);
}

export function decodeDesktopConversationDetailResponse(
  value: unknown
): RuntimeDecodeResult<DesktopConversationDetailResponse, "conversation_restore_invalid"> {
  if (!isRuntimeRecord(value) || !isDesktopConversationDetail(value.conversation)) {
    return runtimeDecodeFailure("conversation_restore_invalid");
  }
  return runtimeDecodeSuccess(value as DesktopConversationDetailResponse);
}

function isDesktopConversationUpsertMessage(value: unknown): value is UpsertDesktopConversationMessageInput["message"] {
  if (!isRuntimeRecord(value)) return false;
  return (
    typeof value.id === "string"
    && Boolean(value.id.trim())
    && (value.role === "user" || value.role === "assistant")
    && typeof value.content === "string"
    && Boolean(value.content.trim())
    && isAgentRunTimestamp(value.createdAt)
    && isDesktopConversationMessageSnapshot(value.payload)
  );
}

function isDesktopConversationMessageSnapshot(value: unknown): value is DesktopConversationMessagePayload {
  if (!isRuntimeRecord(value)) return false;
  return (
    typeof value.id === "string"
    && Boolean(value.id.trim())
    && (value.role === "user" || value.role === "assistant")
    && typeof value.content === "string"
    && typeof value.createdAt === "string"
    && (value.attachments === undefined || Array.isArray(value.attachments))
    && (value.toolCalls === undefined || Array.isArray(value.toolCalls))
    && (value.cards === undefined || Array.isArray(value.cards))
    && (value.parts === undefined || Array.isArray(value.parts))
    && (value.usage === undefined || isDesktopConversationMessageUsage(value.usage))
  );
}

function isDesktopConversationMessageUsage(value: unknown) {
  if (!isRuntimeRecord(value)) return false;
  return (
    (value.inputTokens === undefined || isRuntimeNonNegativeInteger(value.inputTokens))
    && (value.outputTokens === undefined || isRuntimeNonNegativeInteger(value.outputTokens))
    && (value.totalTokens === undefined || isRuntimeNonNegativeInteger(value.totalTokens))
  );
}

function isDesktopConversationDetail(value: unknown): value is DesktopConversationDetail {
  if (!isRuntimeRecord(value) || !isDesktopConversationSummary(value) || !Array.isArray(value.messages)) return false;
  if (!value.messages.every((message) => isDesktopConversationStoredMessage(message, value.id))) return false;
  return value.blackboardEntries === undefined
    || (Array.isArray(value.blackboardEntries) && value.blackboardEntries.every(isDesktopConversationBlackboardEntry));
}

function isDesktopConversationSummary(value: Record<string, unknown>): value is Record<string, unknown> & DesktopConversationSummary {
  return (
    typeof value.id === "string"
    && Boolean(value.id.trim())
    && (value.model === null || typeof value.model === "string")
    && typeof value.title === "string"
    && typeof value.summary === "string"
    && isRuntimeNonNegativeInteger(value.messageCount)
    && isAgentRunTimestamp(value.createdAt)
    && isAgentRunTimestamp(value.updatedAt)
  );
}

function isDesktopConversationStoredMessage(value: unknown, conversationId: string): value is DesktopConversationMessage {
  if (!isRuntimeRecord(value)) return false;
  return (
    typeof value.id === "string"
    && Boolean(value.id.trim())
    && value.conversationId === conversationId
    && (value.role === "user" || value.role === "assistant")
    && typeof value.content === "string"
    && isAgentRunTimestamp(value.createdAt)
    && isDesktopConversationMessageSnapshot(value.payload)
  );
}

function isDesktopConversationBlackboardEntry(value: unknown): value is BlackboardEntry {
  if (!isRuntimeRecord(value)) return false;
  return (
    typeof value.id === "string"
    && typeof value.conversationId === "string"
    && typeof value.key === "string"
    && isBlackboardCategory(value.category)
    && typeof value.value === "string"
    && isBlackboardEntryStatus(value.status)
    && typeof value.confidence === "number"
    && Number.isFinite(value.confidence)
    && typeof value.reason === "string"
    && isAgentRunTimestamp(value.createdAt)
    && isAgentRunTimestamp(value.updatedAt)
    && (value.archivedAt === undefined || value.archivedAt === null || isAgentRunTimestamp(value.archivedAt))
  );
}

export const RuntimeBackendAuth = Schema.Union(
  Schema.Struct({
    status: Schema.Literal("authorized"),
    token: Schema.NonEmptyString
  }),
  Schema.Struct({ status: Schema.Literal("unauthorized") }),
  Schema.Struct({ status: Schema.Literal("disabled") })
);

export type RuntimeBackendAuth = Schema.Schema.Type<typeof RuntimeBackendAuth>;

export const RuntimeInfo = Schema.Struct({
  platform: Schema.String,
  appVersion: Schema.String,
  backendBaseUrl: Schema.String,
  backendAuth: RuntimeBackendAuth
});

export type RuntimeInfo = Schema.Schema.Type<typeof RuntimeInfo>;

export type HealthStatus = {
  status: "ok";
  service: "geochat-desktop-backend";
  version: string;
};
