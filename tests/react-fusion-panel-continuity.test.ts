import { describe, expect, test } from "bun:test";
import {
  fusionPanelFromWindowState,
  windowStateFromFusionPanel,
} from "../src/renderer-react/src/features/fusion-mode/panelContinuity";

describe("fusion business panel continuity", () => {
  test("maps the visible window content into its fusion viewport panel", () => {
    expect(fusionPanelFromWindowState({
      panelView: "user",
      conversationDrawerOpen: false,
      blackboardOpen: false,
      problemBankOpen: false,
    })).toBe("settings");
    expect(fusionPanelFromWindowState({
      panelView: "chat",
      conversationDrawerOpen: false,
      blackboardOpen: false,
      problemBankOpen: true,
    })).toBe("problem-bank");
    expect(fusionPanelFromWindowState({
      panelView: "chat",
      conversationDrawerOpen: false,
      blackboardOpen: true,
      problemBankOpen: false,
    })).toBe("blackboard");
    expect(fusionPanelFromWindowState({
      panelView: "chat",
      conversationDrawerOpen: true,
      blackboardOpen: false,
      problemBankOpen: false,
    })).toBe("history");
  });

  test("maps every fusion viewport panel back to one exclusive window state", () => {
    expect(windowStateFromFusionPanel("settings")).toEqual({
      panelView: "user",
      conversationDrawerOpen: false,
      blackboardOpen: false,
      problemBankOpen: false,
    });
    expect(windowStateFromFusionPanel("history").conversationDrawerOpen).toBeTrue();
    expect(windowStateFromFusionPanel("blackboard").blackboardOpen).toBeTrue();
    expect(windowStateFromFusionPanel("problem-bank").problemBankOpen).toBeTrue();
    expect(windowStateFromFusionPanel("transcript")).toEqual(windowStateFromFusionPanel(null));
  });

  test("keeps mutually exclusive window panels deterministic", () => {
    const panels = [null, "transcript", "history", "blackboard", "problem-bank", "settings"] as const;
    for (const panel of panels) {
      const state = windowStateFromFusionPanel(panel);
      const openCount = Number(state.conversationDrawerOpen)
        + Number(state.blackboardOpen)
        + Number(state.problemBankOpen)
        + Number(state.panelView === "user");
      expect(openCount).toBeLessThanOrEqual(1);
    }
  });
});
