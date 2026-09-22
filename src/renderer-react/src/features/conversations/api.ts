import type { ChatMessageMetadata } from "@geochat-ai/app/contracts";
import type { UIMessage } from "ai";
import { isFunctionCallArgs, isFunctionCallToolName } from "@geochat-ai/app";
import {
  isBlackboardCategory,
  isBlackboardEntryStatus,
  type BlackboardEntry,
} from "@geochat-ai/app/blackboard";

export type ConversationSummary = { id: string; model: string; title: string | null; createdAt: string; updatedAt: string; messageCount: number };
export type StoredConversationPart = UIMessage["parts"][number];
export type StoredConversationMessage = { id: string; clientMessageId: string | null; role: string; content: string; parts: StoredConversationPart[]; usage: ChatMessageMetadata["tokenUsage"] | null };
export type ConversationRestore = { messages: StoredConversationMessage[]; updatedAt: string };

function responseError(data: unknown, fallback: string) {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : fallback;
}

export function parseConversationSummaries(value: unknown): ConversationSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const data = item as Record<string, unknown>;
    if (typeof data.id !== "string") return [];
    return [{ id: data.id, model: typeof data.model === "string" ? data.model : "", title: typeof data.title === "string" ? data.title : null, createdAt: typeof data.createdAt === "string" ? data.createdAt : "", updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "", messageCount: typeof data.messageCount === "number" ? data.messageCount : 0 }];
  });
}

export function parseConversationMessages(value: unknown, apiOrigin?: string): StoredConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const data = item as Record<string, unknown>;
    if (typeof data.id !== "string" || typeof data.role !== "string" || typeof data.content !== "string") return [];
    const payload = data.payload && typeof data.payload === "object" && !Array.isArray(data.payload)
      ? data.payload as Record<string, unknown>
      : {};
    const parts = parseConversationParts(payload.parts ?? data.parts, apiOrigin);
    const usageValue = payload.usage ?? data.usage;
    const usage = isTokenUsage(usageValue) ? usageValue : null;
    return [{ id: data.id, clientMessageId: typeof data.clientMessageId === "string" ? data.clientMessageId : null, role: data.role, content: data.content, parts, usage }];
  });
}

function isTokenUsage(value: unknown): value is NonNullable<ChatMessageMetadata["tokenUsage"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const usage = value as Record<string, unknown>;
  return [usage.inputTokens, usage.outputTokens, usage.totalTokens].every((token) =>
    token === undefined || (typeof token === "number" && Number.isInteger(token) && token >= 0));
}

export function parseConversationParts(value: unknown, apiOrigin?: string): StoredConversationPart[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((part): StoredConversationPart[] => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return [];
    const data = part as Record<string, unknown>;
    if (data.type === "text" && typeof data.text === "string") return [{ ...data, type: "text", text: data.text } as StoredConversationPart];
    if (data.type === "reasoning" && typeof data.text === "string") return [{ ...data, type: "reasoning", text: data.text } as StoredConversationPart];
    if (data.type === "step-start") return [{ ...data, type: "step-start" } as StoredConversationPart];
    if (
      data.type === "file"
      && typeof data.url === "string"
      && /^(?:https?:|data:)/i.test(data.url)
      && typeof data.mediaType === "string"
    ) {
      return [{ ...data, type: "file", url: proxyStoredImageUrl(data.url, apiOrigin), mediaType: data.mediaType, ...(typeof data.filename === "string" ? { filename: data.filename } : {}) } as StoredConversationPart];
    }
    if (typeof data.type === "string" && data.type.startsWith("tool-") && typeof data.toolCallId === "string") {
      const toolName = data.type.slice("tool-".length);
      const allowedStates = new Set(["input-streaming", "input-available", "approval-requested", "approval-responded", "output-available", "output-error", "output-denied"]);
      if (!isFunctionCallToolName(toolName) || !allowedStates.has(String(data.state))) return [];
      if ("input" in data && !isFunctionCallArgs(toolName, data.input)) return [];
      if (data.state === "output-error" && typeof data.errorText !== "string") return [];
      return [data as StoredConversationPart];
    }
    return [];
  });
}

function proxyStoredImageUrl(value: string, apiOrigin?: string) {
  if (!apiOrigin || !/^https?:\/\//i.test(value)) return value;
  try {
    const parsed = new URL(value);
    const prefix = "/v1/images/";
    if (!parsed.pathname.startsWith(prefix)) return value;
    const key = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return `${apiOrigin.replace(/\/$/, "")}/api/media/images/${encodeURIComponent(key)}`;
  } catch (caughtError) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/features/conversations/api.ts:68", caughtError);
    return value;
  }
}

export function parseBlackboardEntries(value: unknown): BlackboardEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const data = item as Record<string, unknown>;
    if (
      typeof data.id !== "string"
      || typeof data.conversationId !== "string"
      || typeof data.key !== "string"
      || !isBlackboardCategory(data.category)
      || typeof data.value !== "string"
      || !isBlackboardEntryStatus(data.status)
      || typeof data.confidence !== "number"
      || !Number.isFinite(data.confidence)
      || typeof data.reason !== "string"
      || typeof data.createdAt !== "string"
      || typeof data.updatedAt !== "string"
    ) return [];
    return [data as BlackboardEntry];
  });
}

function conversationHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { "x-client-channel": "desktop-workbench" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function fetchConversationSummaries(apiOrigin: string, token: string | null, request: typeof fetch = fetch) {
  const response = await request(`${apiOrigin}/v1/conversations`, {
    headers: conversationHeaders(token),
  });
  const data = await response.json() as { conversations?: unknown; error?: unknown; message?: unknown };
  if (!response.ok || !Array.isArray(data.conversations)) throw new Error(responseError(data, "Unable to load conversation history."));
  return parseConversationSummaries(data.conversations);
}

export async function fetchConversationMessages(apiOrigin: string, token: string | null, conversationId: string, request: typeof fetch = fetch) {
  const response = await request(`${apiOrigin}/v1/conversations/${encodeURIComponent(conversationId)}`, {
    headers: conversationHeaders(token),
  });
  const data = await response.json() as { conversation?: { messages?: unknown }; error?: unknown; message?: unknown };
  if (!response.ok || !data.conversation || !Array.isArray(data.conversation.messages)) {
    throw new Error(responseError(data, "Unable to load this conversation."));
  }
  return {
    messages: parseConversationMessages(data.conversation.messages, apiOrigin),
    updatedAt: typeof (data.conversation as Record<string, unknown>).updatedAt === "string"
      ? (data.conversation as Record<string, unknown>).updatedAt as string
      : "",
  } satisfies ConversationRestore;
}

export async function deleteConversation(apiOrigin: string, token: string | null, conversationId: string, request: typeof fetch = fetch) {
  const response = await request(`${apiOrigin}/v1/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
    headers: conversationHeaders(token),
  });
  if (response.status === 204) return;
  // Local-first conversations may not have a corresponding server record.
  // DELETE is idempotent for the history UI, so an already-missing record is
  // a successful end state rather than an error shown to the user.
  if (response.status === 404) return;
  const data = await response.json() as { deleted?: unknown; error?: unknown; message?: unknown };
  if (!response.ok) throw new Error(responseError(data, "Unable to delete this conversation."));
}

export async function fetchConversationBlackboard(apiOrigin: string, token: string | null, conversationId: string, request: typeof fetch = fetch) {
  const response = await request(`${apiOrigin}/v1/conversations/${encodeURIComponent(conversationId)}/blackboard`, {
    cache: "no-store",
    headers: conversationHeaders(token),
  });
  const data = await response.json() as { entries?: unknown; error?: unknown };
  if (!response.ok || !Array.isArray(data.entries)) throw new Error(responseError(data, "Unable to load working memory."));
  return parseBlackboardEntries(data.entries);
}
