import { createSignal } from "solid-js";
import type { DesktopConversationDetail } from "@geochat-ai/app";
import type { Locale } from "./i18n";
import { createRendererId } from "./ids";
import type { DesktopChatActivity, DesktopChatMessage, ImageAttachment } from "./workbench-types";
import {
  assistantUiMessage,
  desktopMessageFromConversationMessage,
  nowLabel,
  type RendererUiMessage,
  uiMessagesFromDesktopMessages,
  userUiMessage
} from "./workbench-messages";

export function createWorkbenchConversationState(input: {
  initialAssistantContent: string;
  initialLocale: Locale;
}) {
  const [messages, setMessages] = createSignal<DesktopChatMessage[]>([
    createAssistantMessage(input.initialAssistantContent, input.initialLocale)
  ]);
  const [conversationId, setConversationId] = createSignal(createRendererId());
  const [aiMessages, setAiMessages] = createSignal<RendererUiMessage[]>([]);

  function createAssistantMessage(content: string, locale: Locale, activity?: DesktopChatActivity): DesktopChatMessage {
    const createdAtIso = new Date().toISOString();
    return {
      id: createRendererId(),
      role: "assistant",
      content,
      createdAt: nowLabel(locale),
      createdAtIso,
      activity
    };
  }

  function createUserMessage(content: string, attachments: ImageAttachment[] | undefined, locale: Locale): DesktopChatMessage {
    const createdAtIso = new Date().toISOString();
    return {
      id: createRendererId(),
      role: "user",
      content,
      attachments,
      createdAt: nowLabel(locale),
      createdAtIso
    };
  }

  function appendMessage(message: DesktopChatMessage) {
    setMessages((current) => [...current, message]);
  }

  function appendMessages(nextMessages: DesktopChatMessage[]) {
    setMessages((current) => [...current, ...nextMessages]);
  }

  function updateMessage(id: string, update: (message: DesktopChatMessage) => DesktopChatMessage) {
    setMessages((current) => current.map((message) => (message.id === id ? update(message) : message)));
  }

  function findMessage(id: string) {
    return messages().find((message) => message.id === id);
  }

  function appendUserUiMessage(content: string) {
    setAiMessages((current) => [...current, userUiMessage(content)]);
  }

  function appendAssistantUiMessage(content: string) {
    setAiMessages((current) => [...current, assistantUiMessage(content)]);
  }

  function clear(nextConversationId: string) {
    setConversationId(nextConversationId);
    setMessages([]);
    setAiMessages([]);
  }

  function restore(conversation: DesktopConversationDetail) {
    const restoredMessages = conversation.messages.map(desktopMessageFromConversationMessage);
    setConversationId(conversation.id);
    setMessages(restoredMessages);
    setAiMessages(uiMessagesFromDesktopMessages(restoredMessages));
    return restoredMessages;
  }

  function reset(content: string, locale: Locale) {
    setConversationId(createRendererId());
    setAiMessages([]);
    setMessages([createAssistantMessage(content, locale)]);
  }

  return {
    aiMessages,
    appendAssistantUiMessage,
    appendMessage,
    appendMessages,
    appendUserUiMessage,
    clear,
    createAssistantMessage,
    createUserMessage,
    findMessage,
    id: conversationId,
    messages,
    reset,
    restore,
    setId: setConversationId,
    updateMessage
  };
}

export type WorkbenchConversationState = ReturnType<typeof createWorkbenchConversationState>;
