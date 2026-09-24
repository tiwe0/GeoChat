import type { ChatMessageMetadata } from "@geochat-ai/app/contracts";
import type { FileUIPart, UIMessage } from "ai";

export type FusionChatMessage = UIMessage<ChatMessageMetadata>;

export type FusionAttachment = {
  id: string;
  signature: string;
  size: number;
  part: FileUIPart;
};

export type FusionChatStatus = "submitted" | "streaming" | "ready" | "error";

export type FusionBubble = {
  id: string;
  role: "user" | "assistant" | "status" | "error" | "overflow";
  content: string;
  pending?: boolean;
  message?: FusionChatMessage;
};
