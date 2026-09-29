import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
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
import {
  AssistantSessionController,
  AssistantSessionTransitionKind,
} from "../session/assistantSessionController";

const logger = createStructuredLogger("conversations.lifecycle");

export type ConversationRecoveryResult = {
  conversationId: string;
  messageCount: number;
  recovery: {
    messages: "restored";
    canvas: "replayed" | "not_required";
  };
};

export function useConversations(options: {
  apiOrigin: string;
  authSessionRef: { current: AuthSessionController };
  isStreaming: boolean;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  sessionController: AssistantSessionController;
  followLatest: () => void;
  onSelect: (conversation: ConversationSummary) => void;
  onDelete: (conversation: ConversationSummary) => void;
  t: (key: string) => string;
  messages: ChatMessage[];
  conversationId: string | null;
  model: string;
  title: string | null;
}) {
  const { apiOrigin, authSessionRef, isStreaming, setMessages, sessionController, followLatest, onSelect, onDelete, t } = options;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [migrationRecoveryAvailable, setMigrationRecoveryAvailable] = useState(false);
  const migrationPromiseRef = useRef<ReturnType<typeof migrateLegacyConversationCache> | null>(null);
  const migrationSummaryShownRef = useRef(false);
  const sessionTransition = sessionController.getSnapshot().transition;
  const selectingId = sessionTransition.kind === AssistantSessionTransitionKind.SelectConversation
    ? sessionTransition.conversationId
    : null;

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
      logger.debug("index_loaded", "CONVERSATION_INDEX_LOADED", { count: loaded.length });
    } catch (e) {
      logger.warn("index_load_failed", "CONVERSATION_INDEX_LOAD_FAILED", { error: e });
      const loadError = e instanceof Error && e.message.trim() ? e.message : t("history.loadFailed");
      setError(migrationSummary ? `${migrationSummary} ${loadError}` : loadError);
    }
    finally { if (!silent) setLoading(false); }
  }, [apiOrigin, authSessionRef, t]);

  useEffect(() => { void load(); }, [load]);

  const select = useCallback(async (
    conversation: ConversationSummary,
    selectionOptions: { throwOnError?: boolean } = {},
  ) => {
    const session = authSessionRef.current.snapshot();
    if (isStreaming || deletingId) return null;
    const transition = sessionController.beginSelectConversation(conversation.id);
    const isCurrent = () => {
      const snapshot = sessionController.getSnapshot();
      return snapshot.generation === transition.generation
        && snapshot.transition.kind === AssistantSessionTransitionKind.SelectConversation
        && snapshot.transition.conversationId === transition.conversationId;
    };
    setError(null);
    let restoringCanvas = false;
    try {
      const stored = await fetchConversationMessages(apiOrigin, session.token, conversation.id);
      if (!isCurrent() || !authSessionRef.current.isCurrent(session)) return;
      const restoredMessages = restoreConversationMessages(stored.messages);
      const replayActions = extractCanvasReplayActions(restoredMessages);
      restoringCanvas = true;
      await replayConversationCanvas(
        replayActions,
        undefined,
        () => isCurrent() && authSessionRef.current.isCurrent(session),
      );
      if (!isCurrent() || !authSessionRef.current.isCurrent(session)) return null;
      if (!sessionController.commitSelectConversation(transition, {
        title: conversation.title || t("history.untitled"),
        model: conversation.model || undefined,
      })) return null;
      setMessages(restoredMessages); onSelect(conversation); window.requestAnimationFrame(followLatest);
      logger.info("conversation_selected", "CONVERSATION_SELECTED", { conversationId: conversation.id, source: "backend" });
      return {
        conversationId: conversation.id,
        messageCount: restoredMessages.length,
        recovery: {
          messages: "restored",
          canvas: replayActions.length ? "replayed" : "not_required",
        },
      } satisfies ConversationRecoveryResult;
    } catch (e) {
      if (!isCurrent() || !authSessionRef.current.isCurrent(session)) return;
      if (e instanceof DOMException && e.name === "AbortError") {
        sessionController.cancelSelectConversation(transition);
        return null;
      }
      logger.warn("conversation_select_failed", "CONVERSATION_SELECT_FAILED", { error: e, conversationId: conversation.id });
      sessionController.cancelSelectConversation(transition);
      const fallback = t(restoringCanvas ? "history.replayFailed" : "history.loadConversationFailed");
      setError(e instanceof Error && e.message.trim() ? e.message : fallback);
      if (selectionOptions.throwOnError) throw e;
      return null;
    }
  }, [apiOrigin, authSessionRef, deletingId, followLatest, isStreaming, onSelect, sessionController, setMessages, t]);

  const restore = useCallback(async (conversationId: string) => {
    let conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      const session = authSessionRef.current.snapshot();
      const loaded = await fetchConversationSummaries(apiOrigin, session.token);
      if (!authSessionRef.current.isCurrent(session)) return null;
      setConversations(loaded);
      conversation = loaded.find((item) => item.id === conversationId);
    }
    if (!conversation) throw new Error(`Conversation ${conversationId} was not found.`);
    return select(conversation, { throwOnError: true });
  }, [apiOrigin, authSessionRef, conversations, select]);

  const remove = useCallback(async (conversation: ConversationSummary) => {
    const session = authSessionRef.current.snapshot();
    if (isStreaming || selectingId || deletingId) return false;
    setDeletingId(conversation.id);
    setError(null);
    try {
      await deleteConversationAfterRemoteConfirmation({
        conversation,
        deleteRemote: () => deleteConversation(apiOrigin, session.token, conversation.id),
        removeFromUi: () => setConversations((current) => current.filter((item) => item.id !== conversation.id)),
        onDeleted: () => onDelete(conversation),
      });
      logger.info("conversation_deleted", "CONVERSATION_DELETED", { conversationId: conversation.id });
      return true;
    } catch (e) {
      logger.warn("conversation_delete_failed", "CONVERSATION_DELETE_FAILED", { error: e, conversationId: conversation.id });
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
    restore,
    remove,
  };
}
