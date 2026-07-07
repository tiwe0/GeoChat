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

export * from "./agent-run-ids";
export * from "./agent-run-review";
export * from "./agent-run-time";
export * from "./agent-prompts";
export * from "./agent-routing-text";
export * from "./advanced-drawing-tools";
export * from "./attachments";
export * from "./blackboard";
export * from "./canvas-visual-guidance";
export * from "./functioncalls";
export * from "./functioncall-groups";
export * from "./functioncall-schemas";
export * from "./geogebra-command-reference";
export * from "./geogebra-command-usage";
export * from "./geogebra-compiler";
export * from "./geogebra-style-policy";
export * from "./geometry-intent-parser";
export * from "./geometry-ir";
export * from "./geometry-verifier";
export * from "./construction-recipes";
export * from "./model-registry";
export * from "./migration";
export * from "./provider-proxy-policy";
export * from "./problem-bank";
export * from "./remote-tool";
export * from "./runner";
export * from "./run-coordinator";
export * from "./run-ledger";
export * from "./workflow-policy";
