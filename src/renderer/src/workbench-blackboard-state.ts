import type { BlackboardEntry, RuntimeInfo } from "@geochat-ai/app";
import { createEffect, createSignal, type Accessor } from "solid-js";
import { fetchConversationBlackboard } from "./workbench-api";

export function createBlackboardState(input: {
  runtime: Accessor<RuntimeInfo | undefined>;
  conversationId: Accessor<string>;
}) {
  const [entries, setEntries] = createSignal<BlackboardEntry[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [open, setOpen] = createSignal(false);
  let requestSeq = 0;

  async function fetchSnapshot(conversationIdValue: string) {
    const info = input.runtime();
    if (!info) return [] satisfies BlackboardEntry[];
    try {
      const snapshot = await fetchConversationBlackboard(info, conversationIdValue);
      setError(null);
      return snapshot;
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
      setError(message);
      console.warn("Failed to fetch conversation blackboard", fetchError);
      return [] satisfies BlackboardEntry[];
    }
  }

  async function refresh(conversationIdValue = input.conversationId()) {
    const info = input.runtime();
    if (!info) {
      clear();
      return;
    }
    const currentRequestSeq = ++requestSeq;
    let nextEntries: BlackboardEntry[] | undefined;
    try {
      nextEntries = await fetchConversationBlackboard(info, conversationIdValue);
      setError(null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
      setError(message);
      console.warn("Failed to refresh conversation blackboard", fetchError);
      return;
    }
    if (currentRequestSeq !== requestSeq || conversationIdValue !== input.conversationId()) return;
    setEntries(nextEntries);
  }

  function clear() {
    requestSeq += 1;
    setEntries([]);
    setError(null);
  }

  function hydrate(conversationIdValue: string, nextEntries: BlackboardEntry[] | undefined) {
    requestSeq += 1;
    if (conversationIdValue !== input.conversationId()) return;
    setEntries(nextEntries ?? []);
    setError(null);
  }

  function resetForNewConversation() {
    clear();
    setOpen(false);
  }

  function toggleOpen() {
    setOpen((value) => !value);
  }

  createEffect(() => {
    const info = input.runtime();
    const id = input.conversationId();
    if (!info) {
      clear();
      return;
    }
    void refresh(id);
  });

  return {
    clear,
    entries,
    error,
    fetchSnapshot,
    hydrate,
    open,
    refresh,
    resetForNewConversation,
    toggleOpen
  };
}
