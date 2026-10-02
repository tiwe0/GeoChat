import { AuiIf, MessagePrimitive, ThreadPrimitive, type MessageState } from "@assistant-ui/react";
import type { ReactNode } from "react";
import {
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
