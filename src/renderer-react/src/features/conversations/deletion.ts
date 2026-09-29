import type { ConversationSummary } from "./api";

export async function deleteConversationAfterRemoteConfirmation(input: {
  conversation: ConversationSummary;
  deleteRemote: () => Promise<void>;
  removeFromUi: () => void;
  onDeleted: () => void;
}): Promise<void> {
  await input.deleteRemote();
  input.removeFromUi();
  input.onDeleted();
}
