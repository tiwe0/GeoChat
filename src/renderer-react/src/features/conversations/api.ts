import { decodeDesktopConversationDetailResponse } from "@geochat-ai/app/desktop-contracts";
import {
  isBlackboardCategory,
  isBlackboardEntryStatus,
  type BlackboardEntry,
} from "@geochat-ai/app/blackboard";
import {
  decodeStoredConversationMessages,
  decodeStoredConversationParts,
  type StoredConversationMessage,
  type StoredConversationPart,
} from "./messageDecoder";

export type { StoredConversationMessage, StoredConversationPart } from "./messageDecoder";

export type ConversationSummary = { id: string; model: string; title: string | null; createdAt: string; updatedAt: string; messageCount: number };
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
  return decodeStoredConversationMessages(value, apiOrigin);
}

export function parseConversationParts(value: unknown, apiOrigin?: string): StoredConversationPart[] {
  return decodeStoredConversationParts(value, apiOrigin);
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
  const data = await readRuntimeJson(response, "conversation_restore_invalid", "The conversation restore response was not valid JSON.");
  if (!response.ok) {
    throw new Error(responseError(data, "Unable to load this conversation."));
  }
  const decoded = decodeDesktopConversationDetailResponse(data);
  if (!decoded.ok) {
    throw Object.assign(new Error("The conversation restore response did not match the runtime contract."), {
      errorCode: decoded.errorCode
    });
  }
  return {
    messages: parseConversationMessages(decoded.value.conversation.messages, apiOrigin),
    updatedAt: decoded.value.conversation.updatedAt,
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

async function readRuntimeJson(response: Response, errorCode: string, message: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw Object.assign(new Error(message), { errorCode });
  }
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
