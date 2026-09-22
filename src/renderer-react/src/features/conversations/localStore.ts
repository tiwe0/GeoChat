import type { ChatMessage } from "./messageAdapter";
import { parseConversationParts, parseConversationSummaries, type ConversationSummary } from "./api";

const LOCAL_CONVERSATIONS_KEY = "geochatDesktopConversations";
const LOCAL_CONVERSATIONS_VERSION = 1;

type LocalConversation = {
  summary: ConversationSummary;
  messages: ChatMessage[];
};

function readAll(): LocalConversation[] {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_CONVERSATIONS_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    const records = Array.isArray(value)
      ? value
      : value && typeof value === "object" && !Array.isArray(value)
        && (value as Record<string, unknown>).version === LOCAL_CONVERSATIONS_VERSION
        && Array.isArray((value as Record<string, unknown>).conversations)
        ? (value as { conversations: unknown[] }).conversations
        : [];
    return records.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const data = item as Record<string, unknown>;
      const summary = parseConversationSummaries([data.summary])[0];
      const messages = parseLocalMessages(data.messages);
      if (!summary || !messages) return [];
      return [{ summary, messages }];
    });
  } catch (caughtError) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/features/conversations/localStore.ts:24", caughtError);
    return [];
  }
}

function writeAll(conversations: LocalConversation[]) {
  try {
    globalThis.localStorage?.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify({
      version: LOCAL_CONVERSATIONS_VERSION,
      conversations,
    }));
  } catch (caughtError) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/features/conversations/localStore.ts:32", caughtError);
    throw caughtError;
  }
}

export function listLocalConversations() {
  return readAll()
    .map(({ summary }) => summary)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function readLocalConversation(id: string) {
  return readAll().find((conversation) => conversation.summary.id === id) ?? null;
}

export function saveLocalConversation(input: {
  id: string;
  model: string;
  title: string | null;
  messages: ChatMessage[];
}) {
  const now = new Date().toISOString();
  const conversations = readAll();
  const existing = conversations.find((conversation) => conversation.summary.id === input.id);
  const summary: ConversationSummary = {
    id: input.id,
    model: input.model,
    title: input.title,
    createdAt: existing?.summary.createdAt ?? now,
    updatedAt: now,
    messageCount: input.messages.length,
  };
  const next = { summary, messages: input.messages } satisfies LocalConversation;
  writeAll([next, ...conversations.filter((conversation) => conversation.summary.id !== input.id)]);
}

export function deleteLocalConversation(id: string) {
  writeAll(readAll().filter((conversation) => conversation.summary.id !== id));
}

function parseLocalMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages: ChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const message = item as Record<string, unknown>;
    if (
      typeof message.id !== "string"
      || (message.role !== "user" && message.role !== "assistant")
      || !Array.isArray(message.parts)
    ) return null;
    const parts = parseConversationParts(message.parts);
    if (parts.length !== message.parts.length) return null;
    messages.push({ id: message.id, role: message.role, parts } as ChatMessage);
  }
  return messages;
}
