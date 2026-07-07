import { createSignal } from "solid-js";
import type { ConfigTab, ViewMode } from "./workbench-types";

export function createWorkbenchShellState() {
  const [configOpen, setConfigOpen] = createSignal(false);
  const [configInitialTab, setConfigInitialTab] = createSignal<ConfigTab>("model");
  const [view, setView] = createSignal<ViewMode>("chat");
  const [moreOpen, setMoreOpen] = createSignal(false);
  const [introVisible, setIntroVisible] = createSignal(true);
  const [introDissolving, setIntroDissolving] = createSignal(false);

  function showChat() {
    setView("chat");
  }

  function showProblemBank() {
    setView("problem-bank");
  }

  function toggleProblemBankView() {
    setMoreOpen(false);
    setView(view() === "problem-bank" ? "chat" : "problem-bank");
  }

  function backToWorkbenchFromMenu() {
    setView("chat");
    setMoreOpen(false);
  }

  function toggleMore() {
    setMoreOpen((value) => !value);
  }

  function openSettings(tab: ConfigTab = "model") {
    setConfigInitialTab(tab);
    setConfigOpen(true);
    setMoreOpen(false);
  }

  function startIntroDissolve(delayMs = 680) {
    if (!introVisible() || introDissolving()) return;
    setIntroDissolving(true);
    globalThis.setTimeout(() => setIntroVisible(false), delayMs);
  }

  function hideIntro() {
    setIntroVisible(false);
    setIntroDissolving(false);
  }

  function resetIntro() {
    setIntroVisible(true);
    setIntroDissolving(false);
  }

  return {
    configOpen,
    setConfigOpen,
    configInitialTab,
    setConfigInitialTab,
    view,
    moreOpen,
    introVisible,
    introDissolving,
    showChat,
    showProblemBank,
    toggleProblemBankView,
    backToWorkbenchFromMenu,
    toggleMore,
    openSettings,
    startIntroDissolve,
    hideIntro,
    resetIntro
  };
}
