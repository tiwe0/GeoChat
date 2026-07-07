import {
  BookOpen,
  Home,
  Info,
  Maximize2,
  MessageSquareText,
  Minus,
  MoreHorizontal,
  PanelLeft,
  Plus,
  RefreshCw,
  Save,
  Settings,
  X
} from "lucide-solid";
import { Show } from "solid-js";
import { runDesktopWindowControl, shouldShowDesktopWindowControls } from "./desktop-window-controls";
import type { Locale, RendererI18n } from "./i18n";
import { APP_VERSION } from "./platform";
import { IconButton, LanguageSwitcher } from "./workbench-ui";
import type { ConfigTab, ViewMode } from "./workbench-types";

type AppChromeProps = {
  copy: RendererI18n;
  locale: Locale;
  minimized: boolean;
  view: ViewMode;
  historyOpen: boolean;
  moreOpen: boolean;
  isRunning: boolean;
  canvasRebuildBusy: boolean;
  exportBusy: boolean;
  geogebraReady: boolean;
  geogebraLoading: boolean;
  onLocaleChange: (locale: Locale) => void;
  onToggleChatPanel: () => void;
  onCreateConversation: () => void;
  onOpenHistory: () => void;
  onRebuildCanvas: () => void;
  onDownloadGgb: () => void;
  onToggleProblemBank: () => void;
  onToggleMore: () => void;
  onOpenSettings: (tab: ConfigTab) => void;
  onBackToWorkbench: () => void;
};

export function AppChrome(props: AppChromeProps) {
  return (
    <header class="app-chrome" data-tauri-drag-region>
      <div class="chrome-workspace-title" aria-hidden="true" data-tauri-drag-region>
        <strong data-app-bundle-marker={`v${APP_VERSION}`}>GeoChat · v{APP_VERSION}</strong>
        <span>{props.copy.app.subtitle}</span>
      </div>
      <div class="chrome-drag-region" aria-hidden="true" data-tauri-drag-region />
      <LanguageSwitcher locale={props.locale} copy={props.copy} onChange={props.onLocaleChange} />
      <div class="chrome-action-group">
        <IconButton
          title={props.minimized || props.view !== "chat" ? props.copy.app.showChat : props.copy.app.hideChat}
          active={!props.minimized && props.view === "chat"}
          onClick={props.onToggleChatPanel}
        >
          <MessageSquareText size={15} />
        </IconButton>
        <IconButton title={props.copy.app.newConversation} disabled={props.isRunning} onClick={props.onCreateConversation}>
          <Plus size={15} />
        </IconButton>
        <IconButton
          title={props.historyOpen ? props.copy.app.closeHistory : props.copy.app.openHistory}
          active={props.historyOpen}
          ariaControls="chat-history-drawer"
          ariaExpanded={props.historyOpen}
          onClick={props.onOpenHistory}
        >
          <PanelLeft size={15} />
        </IconButton>
        <IconButton
          title={props.canvasRebuildBusy ? props.copy.app.rebuildCanvasBusy : props.copy.app.rebuildCanvas}
          disabled={props.canvasRebuildBusy || props.geogebraLoading || props.isRunning}
          onClick={props.onRebuildCanvas}
        >
          <RefreshCw size={15} />
        </IconButton>
        <button
          class="chrome-text-action"
          type="button"
          disabled={props.exportBusy || !props.geogebraReady || props.isRunning}
          onClick={props.onDownloadGgb}
        >
          <Save size={15} />
          <span>{props.exportBusy ? props.copy.app.exportCanvasBusy : props.copy.app.exportCanvas}</span>
        </button>
      </div>
      <div class="chrome-action-group">
        <button
          classList={{ "chrome-text-action": true, active: props.view === "problem-bank" }}
          type="button"
          aria-label={props.view === "problem-bank" ? props.copy.app.closeProblemBank : props.copy.app.openProblemBank}
          aria-pressed={props.view === "problem-bank"}
          onClick={props.onToggleProblemBank}
        >
          <BookOpen size={15} />
          <span>{props.copy.app.problemBank}</span>
        </button>
      </div>
      <div class="chrome-action-group chrome-menu-anchor">
        <IconButton
          title={props.copy.app.more}
          active={props.moreOpen}
          ariaControls="chrome-more-menu"
          ariaExpanded={props.moreOpen}
          onClick={props.onToggleMore}
        >
          <MoreHorizontal size={16} />
        </IconButton>
        <Show when={props.moreOpen}>
          <div id="chrome-more-menu" class="chrome-menu">
            <button type="button" onClick={() => props.onOpenSettings("model")}><Settings size={15} />{props.copy.app.settings}</button>
            <button type="button" onClick={() => props.onOpenSettings("runs")}><MessageSquareText size={15} />{props.copy.app.runRecords}</button>
            <button type="button" onClick={() => props.onOpenSettings("about")}><Info size={15} />{props.copy.app.aboutGeoChat}</button>
            <button type="button" onClick={props.onBackToWorkbench}><Home size={15} />{props.copy.app.backToWorkbench}</button>
          </div>
        </Show>
      </div>
      <Show when={shouldShowDesktopWindowControls()}>
        <div class="window-control-group" role="group" aria-label="Window controls" data-tauri-no-drag>
          <button
            type="button"
            aria-label={props.copy.app.minimizeWindow}
            title={props.copy.app.minimizeWindow}
            onClick={() => void runDesktopWindowControl("minimize")}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            aria-label={props.copy.app.maximizeWindow}
            title={props.copy.app.maximizeWindow}
            onClick={() => void runDesktopWindowControl("toggleMaximize")}
          >
            <Maximize2 size={13} />
          </button>
          <button
            type="button"
            class="danger"
            aria-label={props.copy.app.closeWindow}
            title={props.copy.app.closeWindow}
            onClick={() => void runDesktopWindowControl("close")}
          >
            <X size={15} />
          </button>
        </div>
      </Show>
    </header>
  );
}
