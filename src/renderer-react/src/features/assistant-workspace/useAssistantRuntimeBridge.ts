import { useCallback, useMemo, useRef, type MutableRefObject } from "react";
import type { TFunction } from "i18next";
import type { AssistantRuntime } from "@assistant-ui/react";
import type { useAgentRunChat } from "../../hooks/useAgentRunChat";
import {
  cancelGeoChatAssistantTurn,
  convertToAssistantUiMessage,
  createGeoChatAttachmentAdapter,
  submitGeoChatAssistantTurn,
  useGeoChatAssistantRuntime,
  type GeoChatAssistantSubmission,
} from "../assistant-ui";
import type { useFusionModeController } from "../fusion-mode";

type ChatState = ReturnType<typeof useAgentRunChat>;
type FusionController = ReturnType<typeof useFusionModeController>;

type RuntimeBridgeInput = {
  threadId: string;
  messages: ChatState["messages"];
  status: ChatState["status"];
  error: ChatState["error"];
  isStreaming: boolean;
  stop: ChatState["stop"];
  submit: (submission: GeoChatAssistantSubmission, requestedConversationId?: string) => Promise<boolean>;
  fusionController: Pick<FusionController, "freezeTurnAnchor" | "failTurn" | "completeActiveTurn">;
  t: TFunction;
  runtimeRef: MutableRefObject<AssistantRuntime | null>;
  pendingFusionSelectionRef: MutableRefObject<readonly string[] | null>;
};

export function useAssistantRuntimeBridge(input: RuntimeBridgeInput) {
  const attachmentAdapter = useMemo(() => createGeoChatAttachmentAdapter({
    duplicateFile: (name) => input.t("composer.duplicateFile", { name }),
    fileReadFailed: input.t("composer.fileReadFailed"),
    fileTooLarge: (name) => input.t("composer.fileTooLarge", { name }),
    tooManyFiles: (count) => input.t("composer.tooManyFiles", { count }),
    totalTooLarge: input.t("composer.totalTooLarge"),
    unsupportedFile: (name) => input.t("composer.unsupportedFile", { name }),
  }), [input.t]);

  const projectionRef = useRef({
    messageCount: input.messages.length,
    status: input.status,
    error: input.error,
  });
  projectionRef.current = {
    messageCount: input.messages.length,
    status: input.status,
    error: input.error,
  };

  const actionsRef = useRef({
    submit: input.submit,
    freezeTurnAnchor: input.fusionController.freezeTurnAnchor,
    failTurn: input.fusionController.failTurn,
    completeActiveTurn: input.fusionController.completeActiveTurn,
    stop: input.stop,
  });
  actionsRef.current = {
    submit: input.submit,
    freezeTurnAnchor: input.fusionController.freezeTurnAnchor,
    failTurn: input.fusionController.failTurn,
    completeActiveTurn: input.fusionController.completeActiveTurn,
    stop: input.stop,
  };

  const convertMessage = useCallback((message: ChatState["messages"][number], index: number) => {
    const projection = projectionRef.current;
    return convertToAssistantUiMessage(message, {
      state: message.role === "assistant" && index === projection.messageCount - 1
        ? projection.status
        : "ready",
      error: projection.error,
    });
  }, []);

  const handleNew = useCallback(async (submission: GeoChatAssistantSubmission) => {
    const pendingSelection = input.pendingFusionSelectionRef.current;
    input.pendingFusionSelectionRef.current = null;
    await submitGeoChatAssistantTurn({
      submission,
      prepareTurn: pendingSelection
        ? () => actionsRef.current.freezeTurnAnchor(undefined, pendingSelection)
        : undefined,
      submit: actionsRef.current.submit,
      failTurn: actionsRef.current.failTurn,
    });
  }, []);

  const handleCancel = useCallback(async () => {
    input.pendingFusionSelectionRef.current = null;
    await cancelGeoChatAssistantTurn({
      stop: actionsRef.current.stop,
      completeTurn: actionsRef.current.completeActiveTurn,
    });
  }, []);

  const runtime = useGeoChatAssistantRuntime({
    threadId: input.threadId,
    messages: input.messages,
    isRunning: input.isStreaming,
    isSendDisabled: input.isStreaming,
    convertMessage,
    onNew: handleNew,
    onCancel: handleCancel,
    attachmentAdapter,
  });
  input.runtimeRef.current = runtime;

  return runtime;
}
