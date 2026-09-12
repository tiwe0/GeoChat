import type { ChatMessage } from "./messageAdapter";
import { parseConversationSummaries, type ConversationSummary } from "./api";

const LOCAL_CONVERSATIONS_KEY = "geochatDesktopConversations";

type LocalConversation = {
  summary: ConversationSummary;
  messages: ChatMessage[];
};

function readAll(): LocalConversation[] {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_CONVERSATIONS_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const data = item as Record<string, unknown>;
      const summary = parseConversationSummaries([data.summary])[0];
      if (!summary || !Array.isArray(data.messages)) return [];
      return [{ summary, messages: data.messages as ChatMessage[] }];
    });
  } catch {
    return [];
  }
}

function writeAll(conversations: LocalConversation[]) {
  try {
    globalThis.localStorage?.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch {
    // Storage can be unavailable or full; the in-memory chat remains usable.
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
