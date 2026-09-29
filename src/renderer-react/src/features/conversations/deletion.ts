import type { ConversationSummary } from "./api";

export type ConversationDeletionResult = {
  localCleanupError: Error | null;
};

export async function deleteConversationAfterRemoteConfirmation(input: {
  conversation: ConversationSummary;
  deleteRemote: () => Promise<void>;
  deleteLocal: () => void;
  hiddenConversationIds: Set<string>;
  removeFromUi: () => void;
  onDeleted: () => void;
}): Promise<ConversationDeletionResult> {
  await input.deleteRemote();

  // From this point the server is authoritative: hide the derived local cache
  // before attempting its cleanup so a storage failure cannot resurrect the
  // conversation in the current UI or a later history refresh.
  input.hiddenConversationIds.add(input.conversation.id);
  input.removeFromUi();

  let localCleanupError: Error | null = null;
  try {
    input.deleteLocal();
    input.hiddenConversationIds.delete(input.conversation.id);
  } catch (error) {
    localCleanupError = asError(error);
  }

  input.onDeleted();
  return { localCleanupError };
}

export function filterHiddenConversations(
  conversations: ConversationSummary[],
  hiddenConversationIds: ReadonlySet<string>,
) {
  return conversations.filter((conversation) => !hiddenConversationIds.has(conversation.id));
}

export function retryPendingLocalConversationDeletes(
  hiddenConversationIds: Set<string>,
  deleteLocal: (conversationId: string) => void,
) {
  const errors: Error[] = [];
  for (const conversationId of hiddenConversationIds) {
    try {
      deleteLocal(conversationId);
      hiddenConversationIds.delete(conversationId);
    } catch (error) {
      errors.push(asError(error));
    }
  }
  return errors;
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
