import type { ChatMessageMetadata } from "@geochat-ai/app/contracts";
import type { UIMessage } from "ai";

export type FusionChatMessage = UIMessage<ChatMessageMetadata>;

export type FusionChatStatus = "submitted" | "streaming" | "ready" | "error";

export type FusionBubble = {
  id: string;
  role: "user" | "assistant" | "status" | "error" | "display-card";
  content: string;
  pending?: boolean;
  messageId?: string;
  partIndex?: number;
};
