import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { deleteConversation, fetchConversationMessages, fetchConversationSummaries, type ConversationSummary } from "./api";
import { restoreConversationMessages, type ChatMessage } from "./messageAdapter";
import type { AuthSessionController } from "../local-session/useLocalSession";
import { replayConversationCanvas } from "./replay";
import { deleteLocalConversation, listLocalConversations, readLocalConversation, saveLocalConversation } from "./localStore";

export function useConversations(options: {
  apiOrigin: string;
  authSessionRef: { current: AuthSessionController };
  isStreaming: boolean;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  changeModel: (model: string) => void;
  followLatest: () => void;
  onSelect: (conversation: ConversationSummary) => void;
  onDelete: (conversation: ConversationSummary) => void;
  t: (key: string) => string;
  messages: ChatMessage[];
  conversationId: string | null;
  model: string;
  title: string | null;
}) {
  const { apiOrigin, authSessionRef, isStreaming, setMessages, changeModel, followLatest, onSelect, onDelete, t, messages, conversationId, model, title } = options;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    const session = authSessionRef.current.snapshot();
    const local = listLocalConversations();
    setConversations(local);
    // Desktop conversations are local-first, but the local backend is also
    // available to guest/browser sessions. Send the request without an auth
    // header when no token exists instead of treating that as signed-out.
    if (!silent) setLoading(true); setError(null);
    try {
      const loaded = await fetchConversationSummaries(apiOrigin, session.token);
      if (!authSessionRef.current.isCurrent(session)) return;
      const localById = new Map(local.map((conversation) => [conversation.id, conversation]));
      setConversations([...local, ...loaded.filter((conversation) => !localById.has(conversation.id))]);
      console.debug(`[DEBUG] Conversation index loaded local=${local.length} backend=${loaded.length}`);
    } catch (e) { console.error("[ERROR] Caught exception at src/renderer-react/src/features/conversations/useConversations.ts:43", e); setError(e instanceof Error && e.message.trim() ? e.message : t("history.loadFailed")); }
    finally { if (!silent) setLoading(false); }
  }, [apiOrigin, authSessionRef, t]);

  useEffect(() => { void load(); }, [load]);

  // Keep the current chat available after the app is closed, without making
  // local history depend on an account or a backend request.
  useEffect(() => {
    if (!conversationId || !messages.length) return;
    saveLocalConversation({ id: conversationId, model, title, messages });
    setConversations(listLocalConversations());
  }, [conversationId, messages, model, title]);

  const select = useCallback(async (conversation: ConversationSummary) => {
    const session = authSessionRef.current.snapshot();
    if (isStreaming || selectingId || deletingId) return;
    setSelectingId(conversation.id); setError(null);
    let restoringCanvas = false;
    try {
      const local = readLocalConversation(conversation.id);
      const stored = local ? null : await fetchConversationMessages(apiOrigin, session.token, conversation.id);
      if (session && !authSessionRef.current.isCurrent(session)) return;
      restoringCanvas = true;
      await replayConversationCanvas(stored?.replayCommands ?? []);
      if (session && !authSessionRef.current.isCurrent(session)) return;
      if (conversation.model) changeModel(conversation.model);
      const restoredMessages = local ? local.messages : restoreConversationMessages(stored?.messages ?? []);
      setMessages(restoredMessages); onSelect(conversation); window.requestAnimationFrame(followLatest);
      console.info(`[INFO] Conversation selected conversationId=${conversation.id} source=${local ? "local" : "backend"}`);
    } catch (e) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/features/conversations/useConversations.ts:72", e);
      const fallback = t(restoringCanvas ? "history.replayFailed" : "history.loadConversationFailed");
      setError(e instanceof Error && e.message.trim() ? e.message : fallback);
    }
    finally { setSelectingId(null); }
  }, [apiOrigin, authSessionRef, changeModel, deletingId, followLatest, isStreaming, onSelect, selectingId, setMessages, t]);

  const remove = useCallback(async (conversation: ConversationSummary) => {
    const session = authSessionRef.current.snapshot();
    if (isStreaming || selectingId || deletingId) return false;
    setDeletingId(conversation.id);
    setError(null);
    try {
      deleteLocalConversation(conversation.id);
      await deleteConversation(apiOrigin, session.token, conversation.id);
      if (!authSessionRef.current.isCurrent(session)) return false;
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      onDelete(conversation);
      console.info(`[INFO] Conversation deleted conversationId=${conversation.id}`);
      return true;
    } catch (e) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/features/conversations/useConversations.ts:91", e);
      setError(e instanceof Error && e.message.trim() ? e.message : t("history.deleteFailed"));
      return false;
    } finally {
      setDeletingId(null);
    }
  }, [apiOrigin, authSessionRef, deletingId, isStreaming, onDelete, selectingId, t]);

  return { conversations, loading, error, selectingId, deletingId, setError, load, select, remove };
}
