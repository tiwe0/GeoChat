export type FusionPanelId = "transcript" | "history" | "blackboard" | "problem-bank" | "settings";

export type WindowBusinessPanelState = {
  panelView: "chat" | "user";
  conversationDrawerOpen: boolean;
  blackboardOpen: boolean;
  problemBankOpen: boolean;
};

export function fusionPanelFromWindowState(state: WindowBusinessPanelState): FusionPanelId | null {
  if (state.panelView === "user") return "settings";
  if (state.problemBankOpen) return "problem-bank";
  if (state.blackboardOpen) return "blackboard";
  if (state.conversationDrawerOpen) return "history";
  return null;
}

export function windowStateFromFusionPanel(panel: FusionPanelId | null): WindowBusinessPanelState {
  return {
    panelView: panel === "settings" ? "user" : "chat",
    conversationDrawerOpen: panel === "history",
    blackboardOpen: panel === "blackboard",
    problemBankOpen: panel === "problem-bank",
  };
}
