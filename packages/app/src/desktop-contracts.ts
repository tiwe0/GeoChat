import { Schema } from "effect";
import type { BlackboardEntry } from "./blackboard";

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
  message: {
    id: string;
    role: DesktopConversationMessageRole;
    content: string;
    createdAt: string;
    payload: DesktopConversationMessagePayload;
  };
};

export const RuntimeInfo = Schema.Struct({
  platform: Schema.String,
  appVersion: Schema.String,
  backendBaseUrl: Schema.String,
  backendAuthToken: Schema.optional(Schema.String)
});

export type RuntimeInfo = Schema.Schema.Type<typeof RuntimeInfo>;

export type HealthStatus = {
  status: "ok";
  service: "geochat-desktop-backend";
  version: string;
};
