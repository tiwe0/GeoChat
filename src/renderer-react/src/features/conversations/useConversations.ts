import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { deleteConversation, fetchConversationMessages, fetchConversationSummaries, type ConversationSummary } from "./api";
import { restoreConversationMessages, type ChatMessage } from "./messageAdapter";
import type { AuthSessionController } from "../local-session/useLocalSession";
import { replayConversationCanvas } from "./replay";

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
}) {
  const { apiOrigin, authSessionRef, isStreaming, setMessages, changeModel, followLatest, onSelect, onDelete, t } = options;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    const session = authSessionRef.current.snapshot();
    if (!session) { setConversations([]); return; }
    if (!silent) setLoading(true); setError(null);
    try {
      const loaded = await fetchConversationSummaries(apiOrigin, session.token);
      if (!authSessionRef.current.isCurrent(session)) return;
      setConversations(loaded);
    } catch (e) { setError(e instanceof Error ? e.message : t("history.loadFailed")); }
    finally { if (!silent) setLoading(false); }
  }, [apiOrigin, authSessionRef, t]);

  useEffect(() => { if (authSessionRef.current.token) void load(); else setConversations([]); }, [authSessionRef.current.token, load]);

  const select = useCallback(async (conversation: ConversationSummary) => {
    const session = authSessionRef.current.snapshot();
    if (!session || isStreaming || selectingId || deletingId) return;
    setSelectingId(conversation.id); setError(null);
    let restoringCanvas = false;
    try {
      const stored = await fetchConversationMessages(apiOrigin, session.token, conversation.id);
      if (!authSessionRef.current.isCurrent(session)) return;
      restoringCanvas = true;
      await replayConversationCanvas(stored.replayCommands);
      if (!authSessionRef.current.isCurrent(session)) return;
      if (conversation.model) changeModel(conversation.model);
      setMessages(restoreConversationMessages(stored.messages)); onSelect(conversation); window.requestAnimationFrame(followLatest);
    } catch (e) {
      const fallback = t(restoringCanvas ? "history.replayFailed" : "history.loadConversationFailed");
      setError(e instanceof Error ? `${fallback} ${e.message}` : fallback);
    }
    finally { setSelectingId(null); }
  }, [apiOrigin, authSessionRef, changeModel, deletingId, followLatest, isStreaming, onSelect, selectingId, setMessages, t]);

  const remove = useCallback(async (conversation: ConversationSummary) => {
    const session = authSessionRef.current.snapshot();
    if (!session || isStreaming || selectingId || deletingId) return false;
    setDeletingId(conversation.id);
    setError(null);
    try {
      await deleteConversation(apiOrigin, session.token, conversation.id);
      if (!authSessionRef.current.isCurrent(session)) return false;
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      onDelete(conversation);
      return true;
    } catch (e) {
      setError(e instanceof Error ? `${t("history.deleteFailed")} ${e.message}` : t("history.deleteFailed"));
      return false;
    } finally {
      setDeletingId(null);
    }
  }, [apiOrigin, authSessionRef, deletingId, isStreaming, onDelete, selectingId, t]);

  return { conversations, loading, error, selectingId, deletingId, setError, load, select, remove };
}
