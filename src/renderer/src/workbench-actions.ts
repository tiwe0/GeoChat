import { createSignal, type Accessor } from "solid-js";
import type { DesktopFunctionCall, ProblemDetail } from "@geochat-ai/app";
import type { createGeoGebraController } from "./geogebra";
import { interpolate, type Locale, type RendererI18n } from "./i18n";
import { problemDisplayPrompt } from "./problem-bank-utils";
import {
  collectCommandsThroughToolCall,
  collectConversationReplayCommands,
  commandReplayKey
} from "./workbench-command-replay";
import type { createBlackboardState } from "./workbench-blackboard-state";
import type { WorkbenchConversationState } from "./workbench-conversation-state";
import type { createConversationHistoryState } from "./workbench-history-state";
import type { createWorkbenchShellState } from "./workbench-shell-state";
import type { DesktopChatMessage } from "./workbench-types";

type GeoGebraController = ReturnType<typeof createGeoGebraController>;
type BlackboardState = ReturnType<typeof createBlackboardState>;
type ConversationHistoryState = ReturnType<typeof createConversationHistoryState>;
type WorkbenchShellState = ReturnType<typeof createWorkbenchShellState>;

export function createWorkbenchActions(input: {
  isRunning: Accessor<boolean>;
  setDraft: (value: string) => void;
  conversation: WorkbenchConversationState;
  history: ConversationHistoryState;
  blackboard: BlackboardState;
  shell: WorkbenchShellState;
  geogebra: GeoGebraController;
  copy: Accessor<RendererI18n>;
  locale: Accessor<Locale>;
  expandPanel: () => void;
  togglePanelMinimized: () => void;
  sendMessage: (text?: string) => Promise<void>;
}) {
  const [exportBusy, setExportBusy] = createSignal(false);
  const [exportNotice, setExportNotice] = createSignal("");
  const [canvasRebuildBusy, setCanvasRebuildBusy] = createSignal(false);
  const [canvasRebuildNotice, setCanvasRebuildNotice] = createSignal("");
  const [commandReplayBusyId, setCommandReplayBusyId] = createSignal<string | null>(null);
  const [commandReplayNotice, setCommandReplayNotice] = createSignal("");
  let exportNoticeTimer: number | undefined;
  let canvasRebuildNoticeTimer: number | undefined;
  let commandReplayNoticeTimer: number | undefined;
  let conversationReplaySerial = 0;

  function showExportNotice(message: string) {
    setExportNotice(message);
    if (exportNoticeTimer) window.clearTimeout(exportNoticeTimer);
    exportNoticeTimer = window.setTimeout(() => setExportNotice(""), 2400);
  }

  function showCanvasRebuildNotice(message: string) {
    setCanvasRebuildNotice(message);
    if (canvasRebuildNoticeTimer) window.clearTimeout(canvasRebuildNoticeTimer);
    canvasRebuildNoticeTimer = window.setTimeout(() => setCanvasRebuildNotice(""), 2400);
  }

  function showCommandReplayNotice(message: string) {
    setCommandReplayNotice(message);
    if (commandReplayNoticeTimer) window.clearTimeout(commandReplayNoticeTimer);
    commandReplayNoticeTimer = window.setTimeout(() => setCommandReplayNotice(""), 2600);
  }

  async function replayCommands(commands: string[], busyId: string, emptyMessage: string) {
    if (commandReplayBusyId()) return;
    setCommandReplayBusyId(busyId);
    showCommandReplayNotice(input.copy().app.commandReplayRunning);
    try {
      await input.geogebra.reset();
      if (!commands.length) {
        showCommandReplayNotice(emptyMessage);
        return;
      }
      const result = await input.geogebra.executeCommands(commands, {
        restoreOnError: false
      });
      showCommandReplayNotice(
        result.ok
          ? interpolate(input.copy().app.commandReplayDone, { count: commands.length })
          : interpolate(input.copy().app.commandReplayFailed, { error: result.error ?? "GeoGebra command failed" })
      );
    } catch (error) {
      showCommandReplayNotice(interpolate(input.copy().app.commandReplayFailed, { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setCommandReplayBusyId(null);
    }
  }

  async function replayConversationCanvas(messages: DesktopChatMessage[]) {
    const serial = ++conversationReplaySerial;
    const commands = collectConversationReplayCommands(messages);
    await replayCommands(commands, "conversation", input.copy().app.commandReplayEmptyAfterClear);
    if (serial !== conversationReplaySerial) return;
  }

  async function replayToolCommands(call: DesktopFunctionCall) {
    const commands = collectCommandsThroughToolCall(input.conversation.messages(), call);
    await replayCommands(commands, commandReplayKey(call), input.copy().app.commandReplayEmpty);
  }

  async function activateDebugConversation(nextConversationId: string | undefined) {
    if (!nextConversationId || nextConversationId === input.conversation.id()) return;
    const loadedConversation = await input.history.loadConversation(nextConversationId);
    if (!loadedConversation) {
      input.history.setActiveId(nextConversationId);
      input.conversation.clear(nextConversationId);
      input.shell.hideIntro();
      void input.blackboard.refresh(nextConversationId);
      void replayConversationCanvas([]);
      return;
    }
    const restoredMessages = input.conversation.restore(loadedConversation);
    input.history.setActiveId(loadedConversation.id);
    input.shell.hideIntro();
    input.blackboard.hydrate(loadedConversation.id, loadedConversation.blackboardEntries);
    void input.blackboard.refresh(loadedConversation.id);
    void replayConversationCanvas(restoredMessages);
  }

  async function selectHistoryConversation(id: string) {
    if (input.isRunning()) return;
    const loadedConversation = await input.history.loadConversation(id);
    if (!loadedConversation) return;
    input.shell.showChat();
    input.expandPanel();
    const restoredMessages = input.conversation.restore(loadedConversation);
    input.history.setActiveId(loadedConversation.id);
    input.blackboard.hydrate(loadedConversation.id, loadedConversation.blackboardEntries);
    void input.blackboard.refresh(loadedConversation.id);
    input.shell.hideIntro();
    input.history.close();
    void replayConversationCanvas(restoredMessages);
  }

  async function deleteHistoryConversation(id: string) {
    if (input.isRunning()) return;
    await input.history.deleteConversation(id);
    if (input.conversation.id() === id) {
      createConversation();
    }
  }

  function createConversation() {
    input.shell.showChat();
    input.expandPanel();
    input.blackboard.resetForNewConversation();
    input.shell.resetIntro();
    input.conversation.reset(input.copy().chat.newConversationCreated, input.locale());
    input.history.clearActive();
  }

  function toggleChatPanel() {
    if (input.shell.view() !== "chat") {
      input.shell.showChat();
      input.expandPanel();
      return;
    }
    input.togglePanelMinimized();
  }

  function openHistoryFromChrome() {
    input.shell.showChat();
    input.expandPanel();
    input.history.toggleOpen();
  }

  function useProblem(problem: ProblemDetail, mode: "draft" | "send") {
    input.shell.showChat();
    input.expandPanel();
    const prompt = mode === "draft" ? problemDisplayPrompt(problem.prompt) : problem.prompt;
    if (mode === "draft") {
      input.setDraft(prompt);
      return;
    }
    void input.sendMessage(prompt);
  }

  async function downloadGgb() {
    if (exportBusy()) return;
    setExportBusy(true);
    try {
      const result = await input.geogebra.exportCanvas();
      showExportNotice(result.format === "ggb" ? input.copy().app.exportCanvasDoneGgb : input.copy().app.exportCanvasDonePng);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showExportNotice(interpolate(input.copy().app.exportCanvasFailed, { error: message }));
      input.conversation.appendMessage(input.conversation.createAssistantMessage(message, input.locale()));
    } finally {
      setExportBusy(false);
    }
  }

  async function rebuildCanvas() {
    if (canvasRebuildBusy()) return;
    setCanvasRebuildBusy(true);
    showCanvasRebuildNotice(input.copy().app.rebuildCanvasBusy);
    try {
      await input.geogebra.rebuild();
      showCanvasRebuildNotice(input.copy().app.rebuildCanvasDone);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showCanvasRebuildNotice(interpolate(input.copy().app.rebuildCanvasFailed, { error: message }));
    } finally {
      setCanvasRebuildBusy(false);
    }
  }

  return {
    activateDebugConversation,
    canvasRebuildBusy,
    canvasRebuildNotice,
    commandReplayBusyId,
    commandReplayNotice,
    createConversation,
    deleteHistoryConversation,
    downloadGgb,
    exportBusy,
    exportNotice,
    openHistoryFromChrome,
    rebuildCanvas,
    replayToolCommands,
    selectHistoryConversation,
    toggleChatPanel,
    useProblem
  };
}
