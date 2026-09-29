import { useRef, type Dispatch, type SetStateAction } from "react";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import type { useAgentRunChat } from "../../hooks/useAgentRunChat";
import { createDesktopDebugActionExecutor } from "../desktop/mcpDebugActions";
import {
  clearDeterministicDebugProvider,
  configureDeterministicDebugProvider,
} from "../desktop/deterministicDebugProvider";
import { useMcpState } from "../desktop/useMcpState";
import type { RuntimeModelOption } from "../models/modelCatalog";
import type { AssistantSessionController } from "../session/assistantSessionController";
import { DEFAULT_MCP_STATUS, type DesktopDebugAction } from "../../../../shared/desktop/mcp-debug-actions";
import { readDesktopConfig } from "../../../../shared/desktop/desktop-config";
import type { ModelConfig, RendererMcpStatus } from "../../../../shared/desktop/workbench-types";

const logger = createStructuredLogger("assistant.debug-mcp");
type Messages = ReturnType<typeof useAgentRunChat>["messages"];

type DebugMcpInput = {
  authToken: () => string | undefined;
  conversationId: string | null;
  assistantThreadId: string;
  panelView: "chat" | "user";
  isStreaming: boolean;
  getModelConfig: () => ModelConfig;
  submitPrompt: (content: string, requestedConversationId?: string) => Promise<boolean>;
  setMessages: Dispatch<SetStateAction<Messages>>;
  controller: AssistantSessionController;
  refreshCatalog: (preferredModel?: string) => RuntimeModelOption[];
  showChat: () => void;
};

export function useAssistantDebugMcp(input: DebugMcpInput) {
  const mcpStatusRef = useRef<RendererMcpStatus>(DEFAULT_MCP_STATUS);
  const inputRef = useRef(input);
  inputRef.current = input;
  const executeDebugActionRef = useRef<((action: DesktopDebugAction) => Promise<unknown>) | null>(null);
  const restoreConversationRef = useRef<(conversationId: string) => Promise<unknown>>(async () => {
    throw new Error("Conversation history is not ready.");
  });

  if (!executeDebugActionRef.current) {
    executeDebugActionRef.current = createDesktopDebugActionExecutor({
      getConversationId: () => inputRef.current.conversationId,
      getView: () => inputRef.current.panelView,
      getModelConfig: () => inputRef.current.getModelConfig(),
      getMcpStatus: () => mcpStatusRef.current,
      isRunning: () => inputRef.current.isStreaming,
      sendMessage: (content, requestedConversationId) => {
        const conversationId = requestedConversationId
          ?? inputRef.current.conversationId
          ?? inputRef.current.assistantThreadId;
        void inputRef.current.submitPrompt(content, conversationId).catch((error) => {
          logger.warn("message_submission_failed", "MCP_MESSAGE_SUBMISSION_FAILED", { error, conversationId });
        });
        return conversationId;
      },
      activateConversation: async (conversationId) => {
        if (!conversationId || conversationId === inputRef.current.conversationId) return;
        inputRef.current.setMessages([]);
        inputRef.current.controller.activateForSubmit({ conversationId, title: null });
      },
      restoreConversation: (conversationId) => restoreConversationRef.current(conversationId),
      configureTestProvider: async (baseUrl, model, nonce) => {
        const result = await configureDeterministicDebugProvider(baseUrl, model, nonce);
        inputRef.current.refreshCatalog(model);
        return result;
      },
      clearTestProvider: async (nonce, credentialRef, restoreConfigJson) => {
        const result = await clearDeterministicDebugProvider(nonce, credentialRef, restoreConfigJson);
        const restored = readDesktopConfig().model;
        const models = inputRef.current.refreshCatalog();
        const selected = models.find((candidate) => (
          candidate.provider === restored.provider && candidate.id === restored.model
        ));
        if (selected) inputRef.current.controller.setModel(selected.id);
        return result;
      },
      showChat: () => inputRef.current.showChat(),
    });
  }

  const mcp = useMcpState({
    authToken: () => inputRef.current.authToken(),
    executeDebugAction: (action) => executeDebugActionRef.current!(action),
  });
  mcpStatusRef.current = mcp.status;
  return { mcp, restoreConversationRef };
}
