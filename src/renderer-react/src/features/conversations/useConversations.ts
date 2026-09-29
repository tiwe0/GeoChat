import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { deleteConversation, fetchConversationMessages, fetchConversationSummaries, type ConversationSummary } from "./api";
import { restoreConversationMessages, type ChatMessage } from "./messageAdapter";
import type { AuthSessionController } from "../local-session/useLocalSession";
import { extractCanvasReplayActions, replayConversationCanvas } from "./replay";
import { deleteConversationAfterRemoteConfirmation } from "./deletion";
import {
  exportLegacyConversationRecovery,
  formatLegacyConversationMigrationSummary,
  migrateLegacyConversationCache,
} from "./legacyMigration";

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
  const { apiOrigin, authSessionRef, isStreaming, setMessages, changeModel, followLatest, onSelect, onDelete, t } = options;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [migrationRecoveryAvailable, setMigrationRecoveryAvailable] = useState(false);
  const selectionGenerationRef = useRef(0);
  const migrationPromiseRef = useRef<ReturnType<typeof migrateLegacyConversationCache> | null>(null);
  const migrationSummaryShownRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    const session = authSessionRef.current.snapshot();
    let migrationSummary: string | null = null;
    if (!silent) setLoading(true);
    setError(null);
    try {
      migrationPromiseRef.current ??= migrateLegacyConversationCache({ apiOrigin, token: session.token });
      const pendingMigration = migrationPromiseRef.current;
      const migration = await pendingMigration.finally(() => {
        if (migrationPromiseRef.current === pendingMigration) migrationPromiseRef.current = null;
      });
      if (migration.requiresUserAction && !migrationSummaryShownRef.current) {
        migrationSummaryShownRef.current = true;
        migrationSummary = formatLegacyConversationMigrationSummary(migration);
        setError(migrationSummary);
      }
      setMigrationRecoveryAvailable(migration.requiresUserAction);
      const loaded = await fetchConversationSummaries(apiOrigin, session.token);
      if (!authSessionRef.current.isCurrent(session)) return;
      setConversations(loaded);
      console.debug(`[DEBUG] Conversation index loaded backend=${loaded.length}`);
    } catch (e) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/features/conversations/useConversations.ts:43", e);
      const loadError = e instanceof Error && e.message.trim() ? e.message : t("history.loadFailed");
      setError(migrationSummary ? `${migrationSummary} ${loadError}` : loadError);
    }
    finally { if (!silent) setLoading(false); }
  }, [apiOrigin, authSessionRef, t]);

  useEffect(() => { void load(); }, [load]);

  const select = useCallback(async (conversation: ConversationSummary) => {
    const session = authSessionRef.current.snapshot();
    if (isStreaming || deletingId) return;
    const generation = ++selectionGenerationRef.current;
    const isCurrent = () => selectionGenerationRef.current === generation;
    setSelectingId(conversation.id); setError(null);
    let restoringCanvas = false;
    try {
      const stored = await fetchConversationMessages(apiOrigin, session.token, conversation.id);
      if (!isCurrent() || !authSessionRef.current.isCurrent(session)) return;
      const restoredMessages = restoreConversationMessages(stored.messages);
      restoringCanvas = true;
      await replayConversationCanvas(
        extractCanvasReplayActions(restoredMessages),
        undefined,
        () => isCurrent() && authSessionRef.current.isCurrent(session),
      );
      if (!isCurrent() || !authSessionRef.current.isCurrent(session)) return;
      if (conversation.model) changeModel(conversation.model);
      setMessages(restoredMessages); onSelect(conversation); window.requestAnimationFrame(followLatest);
      console.info(`[INFO] Conversation selected conversationId=${conversation.id} source=backend`);
    } catch (e) {
      if (!isCurrent() || !authSessionRef.current.isCurrent(session) || (e instanceof DOMException && e.name === "AbortError")) return;
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
      await deleteConversationAfterRemoteConfirmation({
        conversation,
        deleteRemote: () => deleteConversation(apiOrigin, session.token, conversation.id),
        removeFromUi: () => setConversations((current) => current.filter((item) => item.id !== conversation.id)),
        onDeleted: () => onDelete(conversation),
      });
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

  const exportMigrationRecovery = useCallback(() => {
    if (!migrationRecoveryAvailable) return;
    const url = URL.createObjectURL(new Blob([exportLegacyConversationRecovery()], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `geochat-legacy-conversation-recovery-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [migrationRecoveryAvailable]);

  return {
    conversations,
    loading,
    error,
    selectingId,
    deletingId,
    migrationRecoveryAvailable,
    exportMigrationRecovery,
    setError,
    load,
    select,
    remove,
  };
}
