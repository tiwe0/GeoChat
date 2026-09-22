import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { deleteConversation, fetchConversationMessages, fetchConversationSummaries, type ConversationSummary } from "./api";
import { restoreConversationMessages, type ChatMessage } from "./messageAdapter";
import type { AuthSessionController } from "../local-session/useLocalSession";
import { extractCanvasReplayActions, replayConversationCanvas } from "./replay";
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
  const selectionGenerationRef = useRef(0);

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
      setConversations(mergeConversationSummaries(local, loaded));
      console.debug(`[DEBUG] Conversation index loaded local=${local.length} backend=${loaded.length}`);
    } catch (e) { console.error("[ERROR] Caught exception at src/renderer-react/src/features/conversations/useConversations.ts:43", e); setError(e instanceof Error && e.message.trim() ? e.message : t("history.loadFailed")); }
    finally { if (!silent) setLoading(false); }
  }, [apiOrigin, authSessionRef, t]);

  useEffect(() => { void load(); }, [load]);

  // Keep the current chat available after the app is closed, without making
  // local history depend on an account or a backend request. During a stream,
  // do not mirror every AI SDK message snapshot into React state: that creates
  // an unrelated render for each chunk and can defeat the SDK's publication
  // throttle on slower WebKit builds. Persist the final coherent snapshot as
  // soon as the run becomes terminal instead.
  useEffect(() => {
    if (isStreaming || !conversationId || !messages.length) return;
    try {
      saveLocalConversation({ id: conversationId, model, title, messages });
      setConversations((current) => mergeConversationSummaries(listLocalConversations(), current));
    } catch (caughtError) {
      console.error("[ERROR] Failed to persist local conversation snapshot", caughtError);
      setError(caughtError instanceof Error && caughtError.message.trim() ? caughtError.message : t("history.saveFailed"));
    }
  }, [conversationId, isStreaming, messages, model, title]);

  const select = useCallback(async (conversation: ConversationSummary) => {
    const session = authSessionRef.current.snapshot();
    if (isStreaming || deletingId) return;
    const generation = ++selectionGenerationRef.current;
    const isCurrent = () => selectionGenerationRef.current === generation;
    setSelectingId(conversation.id); setError(null);
    let restoringCanvas = false;
    try {
      const local = readLocalConversation(conversation.id);
      let stored: Awaited<ReturnType<typeof fetchConversationMessages>> | null = null;
      try {
        stored = await fetchConversationMessages(apiOrigin, session.token, conversation.id);
      } catch (backendError) {
        if (!local) throw backendError;
        console.warn(`[WARN] Falling back to local conversation snapshot conversationId=${conversation.id}`);
      }
      if (!isCurrent() || !authSessionRef.current.isCurrent(session)) return;
      const useLocal = Boolean(local && (!stored?.updatedAt || local.summary.updatedAt > stored.updatedAt));
      const restoredMessages = useLocal ? local!.messages : restoreConversationMessages(stored?.messages ?? []);
      restoringCanvas = true;
      await replayConversationCanvas(extractCanvasReplayActions(restoredMessages), undefined, isCurrent);
      if (!isCurrent() || !authSessionRef.current.isCurrent(session)) return;
      if (conversation.model) changeModel(conversation.model);
      setMessages(restoredMessages); onSelect(conversation); window.requestAnimationFrame(followLatest);
      console.info(`[INFO] Conversation selected conversationId=${conversation.id} source=${useLocal ? "local" : "backend"}`);
    } catch (e) {
      if (!isCurrent() || (e instanceof DOMException && e.name === "AbortError")) return;
      console.error("[ERROR] Caught exception at src/renderer-react/src/features/conversations/useConversations.ts:72", e);
      const fallback = t(restoringCanvas ? "history.replayFailed" : "history.loadConversationFailed");
      setError(e instanceof Error && e.message.trim() ? e.message : fallback);
    }
    finally { if (isCurrent()) setSelectingId(null); }
  }, [apiOrigin, authSessionRef, changeModel, deletingId, followLatest, isStreaming, onSelect, setMessages, t]);

  const remove = useCallback(async (conversation: ConversationSummary) => {
    const session = authSessionRef.current.snapshot();
    if (isStreaming || selectingId || deletingId) return false;
    selectionGenerationRef.current += 1;
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

export function mergeConversationSummaries(local: ConversationSummary[], backend: ConversationSummary[]) {
  const merged = new Map<string, ConversationSummary>();
  for (const conversation of [...local, ...backend]) {
    const current = merged.get(conversation.id);
    if (!current || conversation.updatedAt > current.updatedAt || (
      conversation.updatedAt === current.updatedAt && conversation.messageCount > current.messageCount
    )) merged.set(conversation.id, conversation);
  }
  return [...merged.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
