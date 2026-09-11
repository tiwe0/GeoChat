import type { ChatMessageMetadata } from "@geochat-ai/app/contracts";
import {
  isBlackboardCategory,
  isBlackboardEntryStatus,
  type BlackboardEntry,
} from "@geochat-ai/app/blackboard";

export type ConversationSummary = { id: string; model: string; title: string | null; createdAt: string; updatedAt: string; messageCount: number };
export type StoredConversationPart =
  | { type: "text"; text: string }
  | { type: "file"; url: string; mediaType: string; filename?: string };
export type StoredConversationMessage = { id: string; clientMessageId: string | null; role: string; content: string; parts: StoredConversationPart[]; usage: ChatMessageMetadata["tokenUsage"] | null; credits: number | null };
export type ConversationRestore = { messages: StoredConversationMessage[]; replayCommands: string[] };

function responseError(data: unknown, fallback: string) {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : fallback;
}

export function parseConversationSummaries(value: unknown): ConversationSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const data = item as Record<string, unknown>;
    if (typeof data.id !== "string" || typeof data.model !== "string") return [];
    return [{ id: data.id, model: data.model, title: typeof data.title === "string" ? data.title : null, createdAt: typeof data.createdAt === "string" ? data.createdAt : "", updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "", messageCount: typeof data.messageCount === "number" ? data.messageCount : 0 }];
  });
}

export function parseConversationMessages(value: unknown, apiOrigin?: string): StoredConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const data = item as Record<string, unknown>;
    if (typeof data.id !== "string" || typeof data.role !== "string" || typeof data.content !== "string") return [];
    const parts = parseConversationParts(data.parts, apiOrigin);
    const usage = data.usage && typeof data.usage === "object" && !Array.isArray(data.usage) ? data.usage as ChatMessageMetadata["tokenUsage"] : null;
    const credits = typeof data.credits === "number" && Number.isFinite(data.credits) && data.credits >= 0 ? data.credits : null;
    return [{ id: data.id, clientMessageId: typeof data.clientMessageId === "string" ? data.clientMessageId : null, role: data.role, content: data.content, parts, usage, credits }];
  });
}

function parseConversationParts(value: unknown, apiOrigin?: string): StoredConversationPart[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((part): StoredConversationPart[] => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return [];
    const data = part as Record<string, unknown>;
    if (data.type === "text" && typeof data.text === "string") return [{ type: "text", text: data.text }];
    if (
      data.type === "file"
      && typeof data.url === "string"
      && /^(?:https?:|data:)/i.test(data.url)
      && typeof data.mediaType === "string"
    ) {
      return [{ type: "file", url: proxyStoredImageUrl(data.url, apiOrigin), mediaType: data.mediaType, ...(typeof data.filename === "string" ? { filename: data.filename } : {}) }];
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
  } catch {
    return value;
  }
}

export function parseReplayCommands(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((command): command is string => typeof command === "string" && command.trim().length > 0);
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

export async function fetchConversationSummaries(apiOrigin: string, token: string, request: typeof fetch = fetch) {
  const conversations: ConversationSummary[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const response = await request(`${apiOrigin}/api/user/conversations?${query}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json() as { conversations?: unknown; nextCursor?: unknown; error?: unknown };
    if (!response.ok || !Array.isArray(data.conversations)) throw new Error(responseError(data, "Unable to load conversation history."));
    conversations.push(...parseConversationSummaries(data.conversations));
    const next = typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null;
    if (next === cursor) break;
    cursor = next;
  } while (cursor);
  return conversations;
}

export async function fetchConversationMessages(apiOrigin: string, token: string, conversationId: string, request: typeof fetch = fetch) {
  const messages: StoredConversationMessage[] = [];
  const replayCommands = new Set<string>();
  let cursor: string | null = null;
  let firstError: unknown = null;
  do {
    const query = new URLSearchParams({ limit: "500" });
    if (cursor) query.set("cursor", cursor);
    const response = await request(`${apiOrigin}/api/user/conversations/${encodeURIComponent(conversationId)}/messages?${query}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json() as { messages?: unknown; replayCommands?: unknown; nextCursor?: unknown; error?: unknown };
    if (!response.ok || !Array.isArray(data.messages)) {
      firstError = data;
      break;
    }
    messages.push(...parseConversationMessages(data.messages, apiOrigin));
    for (const command of parseReplayCommands(data.replayCommands)) replayCommands.add(command);
    const next = typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null;
    if (next === cursor) break;
    cursor = next;
  } while (cursor);
  if (firstError) throw new Error(responseError(firstError, "Unable to load this conversation."));
  return {
    messages,
    replayCommands: [...replayCommands],
  } satisfies ConversationRestore;
}

export async function deleteConversation(apiOrigin: string, token: string, conversationId: string, request: typeof fetch = fetch) {
  const response = await request(`${apiOrigin}/api/user/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json() as { deleted?: unknown; error?: unknown };
  if (!response.ok || data.deleted !== true) throw new Error(responseError(data, "Unable to delete this conversation."));
}

export async function fetchConversationBlackboard(apiOrigin: string, token: string, conversationId: string, request: typeof fetch = fetch) {
  const response = await request(`${apiOrigin}/api/user/conversations/${encodeURIComponent(conversationId)}/blackboard`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json() as { entries?: unknown; error?: unknown };
  if (!response.ok || !Array.isArray(data.entries)) throw new Error(responseError(data, "Unable to load working memory."));
  return parseBlackboardEntries(data.entries);
}
