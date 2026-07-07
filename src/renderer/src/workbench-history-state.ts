import { createMemo, createResource, createSignal, type Accessor } from "solid-js";
import type { RuntimeInfo } from "@geochat-ai/app";
import {
  deleteConversationRemote,
  fetchConversationDetail,
  fetchConversations,
  upsertConversationMessage
} from "./workbench-api";
import type { DesktopChatMessage, HistoryItem } from "./workbench-types";

export function createConversationHistoryState(input: {
  runtime: Accessor<RuntimeInfo | undefined>;
  onMessagePersisted?: (conversationId: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [activeId, setActiveId] = createSignal<string | undefined>();
  const [revision, setRevision] = createSignal(0);
  const listSource = createMemo(() => {
    const info = input.runtime();
    return info ? { runtime: info, revision: revision() } : undefined;
  });
  const [summaries, { refetch }] = createResource(listSource, (source) => fetchConversations(source.runtime));
  const items = createMemo<HistoryItem[]>(() => summaries() ?? []);

  function markChanged() {
    setRevision((value) => value + 1);
    void refetch();
  }

  async function persistMessage(conversationId: string, message: DesktopChatMessage) {
    const saved = await upsertConversationMessage(input.runtime(), conversationId, message).catch((error) => {
      console.warn("Failed to persist conversation message", error);
      return undefined;
    });
    if (!saved) return;
    markChanged();
    input.onMessagePersisted?.(conversationId);
  }

  async function loadConversation(id: string) {
    return fetchConversationDetail(input.runtime(), id).catch(() => undefined);
  }

  async function deleteConversation(id: string) {
    await deleteConversationRemote(input.runtime(), id).catch(() => undefined);
    markChanged();
    if (activeId() === id) setActiveId(undefined);
  }

  function toggleOpen() {
    setOpen((value) => !value);
  }

  return {
    activeId,
    clearActive: () => setActiveId(undefined),
    close: () => setOpen(false),
    deleteConversation,
    items,
    loadConversation,
    open,
    persistMessage,
    query,
    setActiveId,
    setQuery,
    toggleOpen
  };
}
