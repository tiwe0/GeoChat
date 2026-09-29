import { useCallback } from "react";
import type { TFunction } from "i18next";
import {
  unwrapAgentRunSubmissionError,
  wasAgentRunMessageAccepted,
} from "../../hooks/useAgentRunChat";
import { areSupportedAgentAttachments } from "../attachments/capabilities";
import { formatAgentRunError } from "../agent-run/errorMessage";
import { resolveGeoChatConversationId, type GeoChatAssistantSubmission } from "../assistant-ui";
import type { AssistantSessionController } from "../session/assistantSessionController";

function compactConversationTitle(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[#>*-]|•)\s+/u, "")
    .trim();
  if (!normalized) return "";
  return normalized.length > 60 ? `${normalized.slice(0, 60).trimEnd()}…` : normalized;
}

type AssistantSubmissionInput = {
  controller: AssistantSessionController;
  assistantThreadId: string;
  currentConversationId: string | null;
  isStreaming: boolean;
  t: TFunction;
  send: (submission: GeoChatAssistantSubmission, conversationId: string) => Promise<unknown>;
  retry: () => Promise<boolean>;
  setError: (error: string | null) => void;
  onConversationStarted?: () => void;
};

export function useAssistantSubmission(input: AssistantSubmissionInput) {
  const submit = useCallback(async (
    submission: GeoChatAssistantSubmission,
    requestedConversationId?: string,
  ): Promise<boolean> => {
    const text = submission.text?.trim() ?? "";
    const files = submission.files ?? [];
    if ((!text && files.length === 0) || input.isStreaming) return false;
    if (!areSupportedAgentAttachments(files)) {
      const unsupported = files.find((part) => !part.mediaType?.startsWith("image/"));
      input.setError(input.t("composer.unsupportedFile", {
        name: unsupported?.filename ?? input.t("common.attachment"),
      }));
      return false;
    }
    const conversationId = resolveGeoChatConversationId(
      input.assistantThreadId,
      input.currentConversationId,
      requestedConversationId,
    );
    const attachmentTitle = files.find((part) => part.filename)?.filename ?? "";
    input.controller.activateForSubmit({
      conversationId,
      title: conversationId === input.currentConversationId
        ? undefined
        : compactConversationTitle(text || attachmentTitle) || input.t("history.newConversation"),
    });
    input.setError(null);
    input.onConversationStarted?.();
    try {
      await input.send({ text, files }, conversationId);
      return true;
    } catch (caughtError) {
      const accepted = wasAgentRunMessageAccepted(caughtError);
      if (!accepted) {
        input.setError(formatAgentRunError(unwrapAgentRunSubmissionError(caughtError), input.t));
      }
      return accepted;
    }
  }, [input]);

  const submitPrompt = useCallback((text: string, requestedConversationId?: string) => (
    submit({ text: text.trim() }, requestedConversationId)
  ), [submit]);

  const retryFailedRun = useCallback(async () => {
    input.setError(null);
    try {
      return await input.retry();
    } catch (caughtError) {
      input.setError(formatAgentRunError(unwrapAgentRunSubmissionError(caughtError), input.t));
      return false;
    }
  }, [input]);

  return { retryFailedRun, submit, submitPrompt };
}
