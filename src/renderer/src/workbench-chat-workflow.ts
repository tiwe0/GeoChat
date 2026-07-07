import type { Accessor } from "solid-js";
import type { AgentModelRegistrySchema, RuntimeInfo } from "@geochat-ai/app";
import type { createGeoGebraController } from "./geogebra";
import type { Locale, RendererI18n } from "./i18n";
import { hasConfiguredApiKey, modelConfigForRun, promptWithSkillPolicy } from "./desktop-config";
import { runBackendAgent } from "./workbench-backend-runner";
import type { createBlackboardState } from "./workbench-blackboard-state";
import type { WorkbenchConversationState } from "./workbench-conversation-state";
import type { createConversationHistoryState } from "./workbench-history-state";
import type { createImageAttachmentState } from "./workbench-image-attachments";
import type {
  DesktopChatMessage,
  DesktopConfig
} from "./workbench-types";

type GeoGebraController = ReturnType<typeof createGeoGebraController>;
type BlackboardState = ReturnType<typeof createBlackboardState>;
type ConversationHistoryState = ReturnType<typeof createConversationHistoryState>;
type ImageAttachmentState = ReturnType<typeof createImageAttachmentState>;

function promptWithSelectedObjects(content: string, selectedObjects: string[], locale: Locale) {
  const names = selectedObjects.map((name) => name.trim()).filter(Boolean).slice(0, 12);
  if (!names.length) return content;
  const selectedContext = locale === "en-US"
    ? [
      "[Current GeoGebra selection]",
      `The user has selected these canvas objects: ${names.join(", ")}.`,
      "Treat follow-up references such as this, it, these objects, this point, or this line as referring to these selected object labels unless the user says otherwise."
    ].join("\n")
    : [
      "【当前 GeoGebra 选中对象】",
      `用户当前在画板中选中了这些对象：${names.join("、")}。`,
      "如果用户追问“这个点”“这条线”“它”“这些对象”等，请默认指向这些 GeoGebra 对象名，除非用户另有说明。"
    ].join("\n");
  return `${content}\n\n${selectedContext}`;
}

export function createWorkbenchChatWorkflow(input: {
  draft: Accessor<string>;
  setDraft: (value: string) => void;
  isRunning: Accessor<boolean>;
  setIsRunning: (value: boolean) => void;
  config: Accessor<DesktopConfig>;
  modelRegistrySchema?: Accessor<AgentModelRegistrySchema | undefined>;
  runtime: Accessor<RuntimeInfo | undefined>;
  geogebra: GeoGebraController;
  conversation: WorkbenchConversationState;
  blackboard: BlackboardState;
  history: ConversationHistoryState;
  imageAttachments: ImageAttachmentState;
  copy: Accessor<RendererI18n>;
  locale: Accessor<Locale>;
  startIntroDissolve: () => void;
  expandPanel: () => void;
  persistChatMessage: (conversationId: string, message: DesktopChatMessage) => Promise<void>;
}) {
  let activeRunController: AbortController | undefined;

  function stopCurrentRun() {
    if (!input.isRunning()) return;
    activeRunController?.abort();
    input.setIsRunning(false);
  }

  async function sendMessage(text = input.draft()) {
    const content = text.trim();
    const attachments = input.imageAttachments.attachments();
    if ((!content && !attachments.length) || input.isRunning()) return;
    if (attachments.length && !input.imageAttachments.enabled()) {
      input.conversation.appendMessage(input.conversation.createAssistantMessage(input.imageAttachments.disabledReason(), input.locale()));
      return;
    }
    const runModelConfig = modelConfigForRun(input.config(), attachments.length, input.modelRegistrySchema?.());
    if (attachments.length && !hasConfiguredApiKey(runModelConfig)) {
      input.conversation.appendMessage(input.conversation.createAssistantMessage(input.copy().chat.uploadNeedsVisionKey, input.locale()));
      return;
    }
    const visibleContent = content || input.copy().chat.imageAnalysisPrompt;
    const promptContent = promptWithSkillPolicy(
      promptWithSelectedObjects(visibleContent, input.geogebra.selectedObjects(), input.locale()),
      input.config(),
      input.locale()
    );
    const previousMessages = input.conversation.messages();
    const runController = new AbortController();
    activeRunController = runController;
    input.setDraft("");
    input.imageAttachments.clear();
    input.setIsRunning(true);
    input.startIntroDissolve();

    const activeConversationId = input.conversation.id();
    const userMessage = input.conversation.createUserMessage(visibleContent, attachments, input.locale());
    input.conversation.appendMessage(userMessage);
    input.history.setActiveId(activeConversationId);
    input.conversation.appendUserUiMessage(visibleContent);
    void input.persistChatMessage(activeConversationId, userMessage);

    try {
      if (hasConfiguredApiKey(runModelConfig)) {
        const persistedBlackboard = await input.blackboard.fetchSnapshot(activeConversationId);
        await runBackendAgent({
          promptContent,
          attachments,
          userMessageId: userMessage.id,
          previousMessages,
          persistedBlackboard,
          conversation: input.conversation,
          conversationId: input.conversation.id,
          copy: input.copy,
          locale: input.locale,
          modelConfig: () => runModelConfig,
          runtime: input.runtime,
          geogebra: input.geogebra,
          isRunning: input.isRunning,
          setIsRunning: (value) => {
            if (activeRunController === runController) input.setIsRunning(value);
          },
          signal: runController.signal,
          expandPanel: input.expandPanel,
          setActiveHistoryId: input.history.setActiveId,
          refreshBlackboard: input.blackboard.refresh,
          persistChatMessage: input.persistChatMessage
        });
        return;
      }

      const assistantMessage = input.conversation.createAssistantMessage(input.copy().chat.modelKeyRequired, input.locale());
      input.conversation.appendMessage(assistantMessage);
      input.conversation.appendAssistantUiMessage(assistantMessage.content);
      void input.persistChatMessage(activeConversationId, assistantMessage);
    } finally {
      if (activeRunController === runController) {
        activeRunController = undefined;
        input.setIsRunning(false);
      }
    }
  }

  return {
    sendMessage,
    stopCurrentRun
  };
}
