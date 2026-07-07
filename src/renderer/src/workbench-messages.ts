import type { DesktopConversationMessage } from "@geochat-ai/app";
import { createRendererId } from "./ids";
import type { DesktopChatMessage, ImageAttachment } from "./workbench-types";
import type { Locale } from "./i18n";

export type RendererUiMessage = {
  id: string;
  role: "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
};

export function nowLabel(locale: Locale = "zh-CN") {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

export function formatIsoTime(value?: string | null, locale: Locale = "zh-CN") {
  if (!value) return "--";
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function readImageFile(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        id: createRendererId(),
        name: file.name || "image",
        mediaType: file.type || "image/png",
        size: file.size,
        dataUrl: String(reader.result ?? "")
      });
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read image: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function userUiMessage(content: string): RendererUiMessage {
  return {
    id: createRendererId(),
    role: "user",
    parts: [{ type: "text", text: content }]
  };
}

export function assistantUiMessage(content: string): RendererUiMessage {
  return {
    id: createRendererId(),
    role: "assistant",
    parts: [{ type: "text", text: content }]
  };
}

function isDesktopChatMessage(value: unknown): value is DesktopChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    typeof message.createdAt === "string"
  );
}

export function desktopMessageFromConversationMessage(message: DesktopConversationMessage): DesktopChatMessage {
  if (isDesktopChatMessage(message.payload)) {
    return {
      ...message.payload,
      id: message.id,
      role: message.role,
      content: message.content,
      createdAtIso: message.payload.createdAtIso ?? message.createdAt
    };
  }
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: formatIsoTime(message.createdAt),
    createdAtIso: message.createdAt
  };
}

export function uiMessagesFromDesktopMessages(messages: DesktopChatMessage[]) {
  return messages.map((message) => (message.role === "user" ? userUiMessage(message.content) : assistantUiMessage(message.content)));
}
