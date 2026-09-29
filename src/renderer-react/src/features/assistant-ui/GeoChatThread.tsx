import { AuiIf, MessagePrimitive, ThreadPrimitive, type MessageState } from "@assistant-ui/react";
import { type ComponentType, type ReactNode, useMemo } from "react";
import {
  GeoChatDisplayToolPart,
  GeoChatMessageContent,
  type GeoChatMessageSurface,
} from "./GeoChatMessageParts";

export type GeoChatThreadClassNames = {
  root?: string;
  viewport?: string;
  footer?: string;
  userMessage?: string;
  assistantMessage?: string;
  systemMessage?: string;
  messageContent?: string;
};

export type GeoChatMessageProps = {
  className?: string;
  contentClassName?: string;
  role: MessageState["role"];
  showDisplayTools?: boolean;
  surface?: GeoChatMessageSurface;
};

export function GeoChatMessage({
  className,
  contentClassName,
  role,
  showDisplayTools = true,
  surface = "window",
}: GeoChatMessageProps) {
  return (
    <MessagePrimitive.Root
      className={className}
      data-geochat-message="true"
      data-message-role={role}
      data-message-surface={surface}
    >
      <GeoChatMessageContent
        className={contentClassName}
        showDisplayTools={showDisplayTools}
        surface={surface}
      />
    </MessagePrimitive.Root>
  );
}

export type GeoChatThreadProps = {
  ariaLabel?: string;
  autoScroll?: boolean;
  children?: ReactNode;
  classNames?: GeoChatThreadClassNames;
  empty?: ReactNode;
  footer?: ReactNode;
  renderMessage?: (message: MessageState) => ReactNode;
  surface?: GeoChatMessageSurface;
  turnAnchor?: "top" | "bottom";
};

export function GeoChatThread({
  ariaLabel,
  autoScroll = true,
  children,
  classNames = {},
  empty = null,
  footer = null,
  renderMessage,
  surface = "window",
  turnAnchor = "bottom",
}: GeoChatThreadProps) {
  const defaultMessage = (message: MessageState) => (
    <GeoChatMessage
      role={message.role}
      surface={surface}
      className={
        message.role === "user"
          ? classNames.userMessage
          : message.role === "assistant"
            ? classNames.assistantMessage
            : classNames.systemMessage
      }
      contentClassName={classNames.messageContent}
    />
  );

  return (
    <ThreadPrimitive.Root
      className={classNames.root}
      data-geochat-thread="true"
      data-message-surface={surface}
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
    >
      <ThreadPrimitive.Viewport
        autoScroll={autoScroll}
        turnAnchor={turnAnchor}
        className={classNames.viewport}
      >
        <AuiIf condition={(state) => state.thread.isEmpty}>{empty}</AuiIf>
        <ThreadPrimitive.Messages>
          {({ message }) => renderMessage ? renderMessage(message) : defaultMessage(message)}
        </ThreadPrimitive.Messages>
        {children}
        {footer && (
          <ThreadPrimitive.ViewportFooter className={classNames.footer}>
            {footer}
          </ThreadPrimitive.ViewportFooter>
        )}
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

type GeoChatMessageByIdProps = Omit<GeoChatMessageProps, "role"> & {
  messageId: string;
};

function messageComponent(
  role: MessageState["role"],
  props: Omit<GeoChatMessageByIdProps, "messageId">,
): ComponentType {
  return function BoundGeoChatMessage() {
    return <GeoChatMessage {...props} role={role} />;
  };
}

export function GeoChatMessageById({ messageId, ...messageProps }: GeoChatMessageByIdProps) {
  const components = useMemo(() => ({
    UserMessage: messageComponent("user", messageProps),
    AssistantMessage: messageComponent("assistant", messageProps),
    SystemMessage: messageComponent("system", messageProps),
  }), [
    messageProps.className,
    messageProps.contentClassName,
    messageProps.showDisplayTools,
    messageProps.surface,
  ]);

  return (
    <ThreadPrimitive.Unstable_MessageById
      messageId={messageId}
      components={components}
    />
  );
}

type GeoChatDisplayToolByIdProps = {
  messageId: string;
  partIndex: number;
};

function BoundDisplayToolMessage({ partIndex }: { partIndex: number }) {
  return (
    <MessagePrimitive.Root
      data-geochat-message="true"
      data-message-role="assistant"
      data-message-surface="spatial"
    >
      <MessagePrimitive.PartByIndex
        index={partIndex}
        components={{ tools: { Override: GeoChatDisplayToolPart } }}
      />
    </MessagePrimitive.Root>
  );
}

export function GeoChatDisplayToolById({ messageId, partIndex }: GeoChatDisplayToolByIdProps) {
  const components = useMemo(() => ({
    UserMessage: () => null,
    SystemMessage: () => null,
    AssistantMessage: () => <BoundDisplayToolMessage partIndex={partIndex} />,
  }), [partIndex]);

  return (
    <ThreadPrimitive.Unstable_MessageById
      messageId={messageId}
      components={components}
    />
  );
}
