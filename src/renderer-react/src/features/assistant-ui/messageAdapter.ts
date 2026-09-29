import type { ThreadMessageLike } from "@assistant-ui/react";
import {
  getToolName,
  isToolUIPart,
  type UIMessage,
  type UIMessagePart,
} from "ai";
import { isInternalToolResultEcho } from "../chat/toolResultEcho";

type AssistantUiContentPart = Exclude<ThreadMessageLike["content"], string>[number];
type AssistantUiMessageStatus = NonNullable<ThreadMessageLike["status"]>;
type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
type JsonObject = { readonly [key: string]: JsonValue };

export type GeoChatMessageState = "submitted" | "streaming" | "ready" | "error";

export type AssistantUiMessageProjectionOptions = {
  /** Runtime state for this message. Only assistant messages expose a status. */
  state?: GeoChatMessageState;
  /** Error detail used when state is `error`. */
  error?: unknown;
  /** Overrides a timestamp carried by a restored message. */
  createdAt?: Date | string | number;
};

const STABLE_FALLBACK_CREATED_AT = 0;

function toCreatedAt(value: unknown): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value === "string" || typeof value === "number") {
    const timestamp = new Date(value);
    if (Number.isFinite(timestamp.getTime())) return timestamp;
  }
  // AI SDK UIMessage does not carry a timestamp. A deterministic fallback keeps
  // assistant-ui from assigning a fresh Date every time the external store is
  // projected, while array order remains the conversation ordering authority.
  return new Date(STABLE_FALLBACK_CREATED_AT);
}

function messageCreatedAt(message: UIMessage, override: unknown): Date {
  if (override !== undefined) return toCreatedAt(override);
  return toCreatedAt((message as UIMessage & { createdAt?: unknown }).createdAt);
}

function partStreamStatus(state: "streaming" | "done" | undefined) {
  return state === "streaming"
    ? ({ type: "running" } as const)
    : state === "done"
      ? ({ type: "complete" } as const)
      : undefined;
}

function assistantStatus(state: GeoChatMessageState | undefined, error: unknown): AssistantUiMessageStatus {
  if (state === "submitted" || state === "streaming") return { type: "running" };
  if (state === "error") {
    return {
      type: "incomplete",
      reason: "error",
      ...(error === undefined ? {} : { error: error instanceof Error ? error.message : String(error) }),
    };
  }
  return { type: "complete", reason: "stop" };
}

function stringifyToolInput(input: unknown): string | undefined {
  if (input === undefined) return undefined;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function toolArgs(input: unknown): JsonObject | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  try {
    const cloned = JSON.parse(JSON.stringify(input)) as unknown;
    return cloned !== null && typeof cloned === "object" && !Array.isArray(cloned)
      ? cloned as JsonObject
      : undefined;
  } catch {
    return undefined;
  }
}

function convertToolPart(
  messageId: string,
  part: Extract<UIMessagePart<any, any>, { type: `tool-${string}` | "dynamic-tool" }>,
  index: number,
): AssistantUiContentPart {
  const input = "input" in part ? part.input : undefined;
  const args = toolArgs(input);
  const argsText = stringifyToolInput(input);
  const common = {
    type: "tool-call" as const,
    toolCallId: part.toolCallId || `${messageId}:tool:${index}`,
    toolName: getToolName(part),
    ...(args ? { args } : {}),
    ...(argsText ? { argsText } : {}),
  };

  if (part.state === "output-available") {
    return {
      ...common,
      result: part.output,
      ...(part.preliminary ? { isPreliminary: true } : {}),
    };
  }
  if (part.state === "output-error") {
    return { ...common, result: part.errorText, isError: true };
  }
  if (part.state === "output-denied") {
    return {
      ...common,
      result: part.approval.reason ?? "Tool execution denied",
      isError: true,
    };
  }
  return common;
}

function convertPart(messageId: string, part: UIMessagePart<any, any>, index: number): AssistantUiContentPart | undefined {
  if (part.type === "text") {
    return { type: "text", text: part.text, ...(partStreamStatus(part.state) ? { status: partStreamStatus(part.state) } : {}) };
  }
  if (part.type === "reasoning") {
    return { type: "reasoning", text: part.text, ...(partStreamStatus(part.state) ? { status: partStreamStatus(part.state) } : {}) };
  }
  if (part.type === "file") {
    return part.mediaType.startsWith("image/")
      ? { type: "image", image: part.url, ...(part.filename ? { filename: part.filename } : {}) }
      : { type: "file", data: part.url, mimeType: part.mediaType, ...(part.filename ? { filename: part.filename } : {}) };
  }
  if (part.type === "reasoning-file") {
    return { type: "file", data: part.url, mimeType: part.mediaType };
  }
  if (part.type === "source-url") {
    return {
      type: "source",
      sourceType: "url",
      id: part.sourceId,
      url: part.url,
      ...(part.title ? { title: part.title } : {}),
    };
  }
  if (part.type === "source-document") {
    return {
      type: "source",
      sourceType: "document",
      id: part.sourceId,
      title: part.title,
      mediaType: part.mediaType,
      ...(part.filename ? { filename: part.filename } : {}),
    };
  }
  if (isToolUIPart(part)) return convertToolPart(messageId, part, index);
  if (part.type.startsWith("data-") && "data" in part) {
    return { type: part.type as `data-${string}`, data: part.data };
  }
  return undefined;
}

/**
 * Purely projects the AI SDK conversation model into assistant-ui's external
 * store shape. It deliberately never invokes tools or mutates the source.
 */
export function convertToAssistantUiMessage(
  message: UIMessage,
  options: AssistantUiMessageProjectionOptions = {},
): ThreadMessageLike {
  const content = message.parts.flatMap((part, index) => {
    if (message.role === "assistant" && part.type === "text" && isInternalToolResultEcho(message.parts, index)) {
      return [];
    }
    const converted = convertPart(message.id, part, index);
    return converted ? [converted] : [];
  });

  return {
    id: message.id,
    role: message.role,
    createdAt: messageCreatedAt(message, options.createdAt),
    content,
    ...(message.role === "assistant" ? { status: assistantStatus(options.state, options.error) } : {}),
  };
}
