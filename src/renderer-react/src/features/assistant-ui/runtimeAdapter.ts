import type {
  AppendMessage,
  AttachmentAdapter,
  ExternalStoreAdapter,
  ExternalStoreMessageConverter,
} from "@assistant-ui/react";
import { SimpleImageAttachmentAdapter } from "@assistant-ui/react";
import type { FileUIPart, UIMessage } from "ai";

/**
 * The submission shape consumed by GeoChat's existing agent-run boundary.
 *
 * Keeping this independent from assistant-ui's `AppendMessage` prevents the UI
 * runtime from taking ownership of native runs, attachment uploads, or tool
 * execution.
 */
export type GeoChatAssistantSubmission = {
  text?: string;
  files?: FileUIPart[];
};

export type GeoChatAssistantOnNew = (
  submission: GeoChatAssistantSubmission,
) => void | Promise<void>;

export type GeoChatAssistantOnCancel = () => void | Promise<void>;

export type GeoChatExternalStoreOptions<Message extends UIMessage> = {
  threadId?: string;
  messages: readonly Message[];
  isRunning: boolean;
  isSendDisabled?: boolean;
  convertMessage: ExternalStoreMessageConverter<Message>;
  onNew: GeoChatAssistantOnNew;
  onCancel?: GeoChatAssistantOnCancel;
  attachmentAdapter?: AttachmentAdapter;
};

const defaultImageAttachmentAdapter = new SimpleImageAttachmentAdapter();

export function resolveGeoChatConversationId(
  runtimeThreadId: string,
  currentConversationId?: string | null,
  requestedConversationId?: string,
) {
  return requestedConversationId ?? currentConversationId ?? runtimeThreadId;
}

export function createGeoChatExternalStoreAdapter<Message extends UIMessage>(
  options: GeoChatExternalStoreOptions<Message>,
): ExternalStoreAdapter<Message> {
  const adapter = {
    messages: options.messages,
    isRunning: options.isRunning,
    isSendDisabled: options.isSendDisabled,
    convertMessage: options.convertMessage,
    onNew: async (message: AppendMessage) => {
      await options.onNew(toGeoChatAssistantSubmission(message));
    },
    onCancel: options.onCancel
      ? async () => {
          await options.onCancel?.();
        }
      : undefined,
    adapters: {
      attachments: options.attachmentAdapter ?? defaultImageAttachmentAdapter,
      ...(options.threadId ? { threadList: { threadId: options.threadId } } : {}),
    },
    // GeoChat's useAgentRunChat hook is the sole renderer-tool executor.
    // Enabling assistant-ui's invocation tracker here would execute tools twice.
    unstable_enableToolInvocations: false,
  };
  // assistant-ui models `convertMessage` through a conditional type. Generic
  // UIMessage subtypes cannot satisfy that branch at declaration time even
  // though GeoChat always supplies the converter required by the branch.
  return adapter as ExternalStoreAdapter<Message>;
}

export function toGeoChatAssistantSubmission(
  message: AppendMessage,
): GeoChatAssistantSubmission {
  if (message.role !== "user") {
    throw new Error(`GeoChat only accepts user submissions, received ${message.role}.`);
  }

  const text = message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
  const files = collectFiles(message);

  return {
    ...(text ? { text } : {}),
    ...(files.length ? { files } : {}),
  };
}

function collectFiles(message: AppendMessage) {
  const files: FileUIPart[] = [];
  const fileIndexByPayload = new Map<string, number>();
  const add = (file: FileUIPart) => {
    const key = `${file.mediaType}\u0000${file.url}`;
    const existingIndex = fileIndexByPayload.get(key);
    if (existingIndex !== undefined) {
      const existing = files[existingIndex];
      if (existing && !existing.filename && file.filename) {
        files[existingIndex] = { ...existing, filename: file.filename };
      }
      return;
    }
    fileIndexByPayload.set(key, files.length);
    files.push(file);
  };

  const visit = (
    part: Extract<(typeof message.content)[number], { type: "image" | "file" }>,
    fallbackMediaType?: string,
    fallbackFilename?: string,
  ) => {
    if (part.type === "image") {
      add({
        type: "file",
        mediaType: mediaTypeFromDataUrl(part.image) ?? fallbackMediaType ?? "image/*",
        filename: part.filename ?? fallbackFilename,
        url: part.image,
      });
      return;
    }

    const mediaType = part.mimeType || fallbackMediaType || "application/octet-stream";
    add({
      type: "file",
      mediaType,
      filename: part.filename ?? fallbackFilename,
      url: normalizeFileData(part.data, mediaType, part.sourceType),
    });
  };

  for (const part of message.content) {
    if (part.type === "image" || part.type === "file") visit(part);
  }
  for (const attachment of message.attachments ?? []) {
    for (const part of attachment.content) {
      if (part.type === "image" || part.type === "file") {
        visit(part, attachment.contentType, attachment.name);
      }
    }
  }

  return files;
}

function normalizeFileData(
  data: string,
  mediaType: string,
  sourceType: "url" | "id" | undefined,
) {
  if (sourceType === "url" || /^(?:data:|https?:|blob:)/i.test(data)) return data;
  return `data:${mediaType};base64,${data}`;
}

function mediaTypeFromDataUrl(value: string) {
  return /^data:([^;,]+)[;,]/i.exec(value)?.[1];
}
