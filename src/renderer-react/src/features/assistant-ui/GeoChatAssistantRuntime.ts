import {
  useExternalStoreRuntime,
  type AssistantRuntime,
  type AttachmentAdapter,
  type ExternalStoreMessageConverter,
} from "@assistant-ui/react";
import type { UIMessage } from "ai";
import { useMemo } from "react";
import {
  createGeoChatExternalStoreAdapter,
  type GeoChatAssistantOnCancel,
  type GeoChatAssistantOnNew,
} from "./runtimeAdapter";

export type GeoChatAssistantRuntimeOptions<Message extends UIMessage> = {
  threadId?: string;
  messages: readonly Message[];
  isRunning: boolean;
  isSendDisabled?: boolean;
  convertMessage: ExternalStoreMessageConverter<Message>;
  onNew: GeoChatAssistantOnNew;
  onCancel?: GeoChatAssistantOnCancel;
  attachmentAdapter?: AttachmentAdapter;
};

export function useGeoChatAssistantRuntime<Message extends UIMessage>(
  props: GeoChatAssistantRuntimeOptions<Message>,
): AssistantRuntime {
  const adapter = useMemo(
    () => createGeoChatExternalStoreAdapter({
      threadId: props.threadId,
      messages: props.messages,
      isRunning: props.isRunning,
      isSendDisabled: props.isSendDisabled,
      convertMessage: props.convertMessage,
      onNew: props.onNew,
      onCancel: props.onCancel,
      attachmentAdapter: props.attachmentAdapter,
    }),
    [
      props.attachmentAdapter,
      props.convertMessage,
      props.isRunning,
      props.isSendDisabled,
      props.messages,
      props.onCancel,
      props.onNew,
      props.threadId,
    ],
  );
  return useExternalStoreRuntime(adapter);
}
