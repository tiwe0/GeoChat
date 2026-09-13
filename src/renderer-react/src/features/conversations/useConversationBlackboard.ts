import { useCallback, useEffect, useRef, useState } from "react";
import type { BlackboardEntry } from "@geochat-ai/app/blackboard";
import type { AuthSessionController } from "../local-session/useLocalSession";
import { fetchConversationBlackboard } from "./api";

export function useConversationBlackboard(options: {
  apiOrigin: string;
  authSessionRef: { current: AuthSessionController };
  conversationId: string | null;
  loadFailedMessage: string;
}) {
  const { apiOrigin, authSessionRef, conversationId, loadFailedMessage } = options;
  const [entries, setEntries] = useState<BlackboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    requestVersionRef.current += 1;
    setEntries([]);
    setError(null);
    setLoading(false);
  }, [conversationId]);

  const load = useCallback(async () => {
    const session = authSessionRef.current.snapshot();
    const requestedConversationId = conversationId;
    const requestVersion = ++requestVersionRef.current;
    if (!session.token || !requestedConversationId) {
      setEntries([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const loaded = await fetchConversationBlackboard(apiOrigin, session.token, requestedConversationId);
      if (requestVersionRef.current !== requestVersion || !authSessionRef.current.isCurrent(session)) return;
      setEntries(loaded);
    } catch (caught) {
      if (requestVersionRef.current !== requestVersion || !authSessionRef.current.isCurrent(session)) return;
      setError(caught instanceof Error && caught.message.trim() ? caught.message : loadFailedMessage);
    } finally {
      if (requestVersionRef.current === requestVersion) setLoading(false);
    }
  }, [apiOrigin, authSessionRef, conversationId, loadFailedMessage]);

  return { entries, loading, error, load };
}
