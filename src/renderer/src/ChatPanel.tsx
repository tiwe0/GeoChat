import {
  ChevronRight,
  Minus,
  PanelLeft,
  Plus,
  Sparkles
} from "lucide-solid";
import { createMemo, createSignal, Show, type JSX } from "solid-js";
import type { BlackboardEntry, DesktopFunctionCall } from "@geochat-ai/app";
import { type Locale, type RendererI18n } from "./i18n";
import { ChatBlackboardPanel } from "./chat-panel/ChatBlackboardPanel";
import { ChatComposer } from "./chat-panel/ChatComposer";
import { ChatHistoryDrawer } from "./chat-panel/ChatHistoryDrawer";
import { ChatMessageTimeline, type ChoiceScenarioPreviewInput, type ChoiceScenarioPreviewResult, type LatexTextComponent } from "./chat-panel/ChatMessageTimeline";
import { IconButton } from "./workbench-ui";
import type { DesktopChatMessage, HistoryItem, ImageAttachment } from "./workbench-types";

export type { ChoiceScenarioPreviewInput, ChoiceScenarioPreviewResult } from "./chat-panel/ChatMessageTimeline";

type LocalPanelState = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

const MIN_PANEL_SIZE = { width: 300, height: 520 } as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function defaultPanelState(): LocalPanelState {
  return {
    x: Math.max(24, globalThis.innerWidth ? globalThis.innerWidth - 392 : 50),
    y: 92,
    width: 380,
    height: 600,
    scale: 0.88
  };
}

export function FloatingChatPanel(props: {
  messages: DesktopChatMessage[];
  blackboardEntries: BlackboardEntry[];
  blackboardError?: string | null;
  LatexText: LatexTextComponent;
  blackboardOpen: boolean;
  draft: string;
  isRunning: boolean;
  imageUploadEnabled: boolean;
  imageUploadDisabledReason: string;
  attachments: ImageAttachment[];
  minimized: boolean;
  showDrawer: boolean;
  historyItems: HistoryItem[];
  activeHistoryId?: string;
  historyQuery: string;
  replayingCallId?: string | null;
  copy: RendererI18n;
  locale: Locale;
  onToggleBlackboard: () => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onAddImages: (files: FileList | File[]) => void;
  onRemoveImage: (id: string) => void;
  onUploadBlocked: () => void;
  onToggleMinimized: () => void;
  onToggleDrawer: () => void;
  onCreateConversation: () => void;
  onHistoryQueryChange: (value: string) => void;
  onSelectHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
  onPreviewChoiceScenario?: (input: ChoiceScenarioPreviewInput) => Promise<ChoiceScenarioPreviewResult>;
  onReplayCommands?: (call: DesktopFunctionCall) => void;
}) {
  const [dragging, setDragging] = createSignal(false);
  const [resizing, setResizing] = createSignal(false);
  const [panel, setPanel] = createSignal(defaultPanelState());
  const scaledSize = createMemo(() => ({
    width: Math.round(panel().width * panel().scale),
    height: Math.round(panel().height * panel().scale)
  }));
  const panelStyle = createMemo(
    () =>
      ({
        left: `${panel().x}px`,
        top: `${panel().y}px`,
        width: `${scaledSize().width}px`,
        height: `${scaledSize().height}px`
      }) satisfies JSX.CSSProperties
  );

  function boundedPosition(x: number, y: number, width = scaledSize().width, height = scaledSize().height) {
    return {
      x: clamp(x, 8, Math.max(8, globalThis.innerWidth - width - 8)),
      y: clamp(y, 8, Math.max(8, globalThis.innerHeight - height - 8))
    };
  }

  function beginDrag(event: PointerEvent) {
    if ((event.target as HTMLElement).closest("button,input,textarea,select,a")) return;
    event.preventDefault();
    setDragging(true);
    const startPanel = panel();
    const start = { x: event.clientX, y: event.clientY, panelX: startPanel.x, panelY: startPanel.y };
    const move = (moveEvent: PointerEvent) => {
      const next = boundedPosition(start.panelX + moveEvent.clientX - start.x, start.panelY + moveEvent.clientY - start.y);
      setPanel((current) => ({ ...current, ...next }));
    };
    const stop = () => {
      setDragging(false);
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", stop);
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", stop, { once: true });
  }

  function beginResize(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    setResizing(true);
    const startPanel = panel();
    const start = { x: event.clientX, y: event.clientY, width: startPanel.width, height: startPanel.height, scale: startPanel.scale };
    const move = (moveEvent: PointerEvent) => {
      const current = panel();
      const width = Math.max(MIN_PANEL_SIZE.width, Math.round(start.width + (moveEvent.clientX - start.x) / start.scale));
      const height = Math.max(MIN_PANEL_SIZE.height, Math.round(start.height + (moveEvent.clientY - start.y) / start.scale));
      const scaledWidth = Math.round(width * start.scale);
      const scaledHeight = Math.round(height * start.scale);
      const nextPosition = boundedPosition(current.x, current.y, scaledWidth, scaledHeight);
      setPanel({ ...current, width, height, ...nextPosition });
    };
    const stop = () => {
      setResizing(false);
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", stop);
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", stop, { once: true });
  }

  return (
      <aside
        classList={{
          "floating-panel": true,
          "history-open": props.showDrawer,
          dragging: dragging(),
          resizing: resizing(),
          minimized: props.minimized
        }}
        style={panelStyle()}
        aria-hidden={props.minimized}
      >
        <div class="panel-shine" />
        <div class="panel-toolbar" onPointerDown={beginDrag}>
          <div class="panel-leading">
            <IconButton
              title={props.showDrawer ? props.copy.app.closeHistory : props.copy.app.openHistory}
              active={props.showDrawer}
              ariaControls="chat-history-drawer"
              ariaExpanded={props.showDrawer}
              onClick={props.onToggleDrawer}
            >
              {props.showDrawer ? <PanelLeft size={17} /> : <ChevronRight size={17} />}
            </IconButton>
            <div class="panel-title">
              <strong>{props.copy.chat.assistantName}</strong>
            </div>
          </div>
          <div class="toolbar-actions">
            <IconButton
              title={props.blackboardOpen ? props.copy.blackboard.closeDrawer : props.copy.blackboard.openDrawer}
              active={props.blackboardOpen}
              ariaControls="chat-blackboard-drawer"
              ariaExpanded={props.blackboardOpen}
              onClick={props.onToggleBlackboard}
            >
              <Sparkles size={15} />
            </IconButton>
            <IconButton title={props.copy.app.newConversation} disabled={props.isRunning} onClick={props.onCreateConversation} class="primary-soft">
              <Plus size={15} />
            </IconButton>
            <IconButton title={props.copy.app.hideChat} onClick={props.onToggleMinimized}>
              <Minus size={15} />
            </IconButton>
          </div>
        </div>
        <div class="chat-body">
          <ChatBlackboardPanel
            entries={props.blackboardEntries}
            error={props.blackboardError}
            LatexText={props.LatexText}
            open={props.blackboardOpen}
            copy={props.copy}
            locale={props.locale}
            onToggle={props.onToggleBlackboard}
          />
          <ChatMessageTimeline
            messages={props.messages}
            isRunning={props.isRunning}
            copy={props.copy}
            locale={props.locale}
            LatexText={props.LatexText}
            replayingCallId={props.replayingCallId}
            onPreviewChoiceScenario={props.onPreviewChoiceScenario}
            onReplayCommands={props.onReplayCommands}
          />
          <div id="chat-history-drawer" classList={{ "history-layer": true, open: props.showDrawer }} aria-hidden={!props.showDrawer}>
            <button class="history-scrim" type="button" onClick={props.onToggleDrawer} aria-label={props.copy.history.scrimAria} />
            <Show when={props.showDrawer}>
              <ChatHistoryDrawer
                items={props.historyItems}
                activeId={props.activeHistoryId}
                disabled={props.isRunning}
                query={props.historyQuery}
                copy={props.copy}
                locale={props.locale}
                onQueryChange={props.onHistoryQueryChange}
                onSelect={props.onSelectHistory}
                onDelete={props.onDeleteHistory}
                onClose={props.onToggleDrawer}
              />
            </Show>
          </div>
        </div>
        <ChatComposer
          draft={props.draft}
          isRunning={props.isRunning}
          imageUploadEnabled={props.imageUploadEnabled}
          imageUploadDisabledReason={props.imageUploadDisabledReason}
          attachments={props.attachments}
          copy={props.copy}
          onDraft={props.onDraft}
          onSend={props.onSend}
          onStop={props.onStop}
          onAddImages={props.onAddImages}
          onRemoveImage={props.onRemoveImage}
          onUploadBlocked={props.onUploadBlocked}
        />
        <div class="panel-resize-handle" onPointerDown={beginResize} title={props.copy.composer.resizePanel} />
      </aside>
  );
}
