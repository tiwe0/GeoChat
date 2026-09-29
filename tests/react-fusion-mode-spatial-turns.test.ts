import { describe, expect, test } from "bun:test";
import {
  beginFusionSpatialTurn,
  collapseLatestFusionTurn,
  completeActiveFusionTurn,
  dismissFusionTurn,
  EMPTY_FUSION_SPATIAL_STATE,
  synchronizeFusionSpatialTurns,
  fusionTurnDisplayAnchor,
  fusionTurnVisualOpacity,
  MAX_VISIBLE_FUSION_TURNS,
  selectVisibleFusionTurns,
  failFusionTurn,
  retryFusionTurn,
  toggleFusionTurnCollapsed,
  toggleFusionTurnPinned,
} from "../src/renderer-react/src/features/fusion-mode/spatialTurns";

const anchorA = { x: 120, y: 180 };
const anchorB = { x: 720, y: 420 };

describe("fusion spatial turns", () => {
  test("appends follow-up runs to one conversation flow instead of opening another floating turn", () => {
    let state = beginFusionSpatialTurn(EMPTY_FUSION_SPATIAL_STATE, { id: "run-1", anchor: anchorA, createdAt: 1 });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
      ],
      chatStatus: "ready",
      fallbackAnchor: anchorB,
      now: 2,
    });
    state = completeActiveFusionTurn(state);
    state = beginFusionSpatialTurn(state, { id: "run-2", anchor: anchorB, createdAt: 3 });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
        { id: "user-2", role: "user" },
        { id: "assistant-2", role: "assistant" },
      ],
      chatStatus: "streaming",
      fallbackAnchor: anchorB,
      now: 4,
    });

    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      id: "run-1",
      anchor: anchorB,
      messageIds: ["user-1", "assistant-1", "user-2", "assistant-2"],
      status: "active",
      collapsed: false,
    });
    expect(state.activeTurnId).toBe("run-1");
  });

  test("keeps one stable active run while streaming messages are appended", () => {
    let state = beginFusionSpatialTurn(EMPTY_FUSION_SPATIAL_STATE, { id: "run-stable", anchor: anchorA, createdAt: 1 });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [{ id: "user-1", role: "user" }],
      chatStatus: "submitted",
      fallbackAnchor: anchorB,
    });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
      ],
      chatStatus: "streaming",
      fallbackAnchor: anchorB,
    });

    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      id: "run-stable",
      anchor: anchorA,
      messageIds: ["user-1", "assistant-1"],
      status: "active",
    });
    expect(state.activeTurnId).toBe("run-stable");
  });

  test("does not treat a transient ready status as spatial run completion", () => {
    let state = beginFusionSpatialTurn(EMPTY_FUSION_SPATIAL_STATE, { id: "run-tools", anchor: anchorA });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [{ id: "user-1", role: "user" }, { id: "assistant-1", role: "assistant" }],
      chatStatus: "ready",
      fallbackAnchor: anchorB,
    });
    expect(state.turns[0]).toMatchObject({ id: "run-tools", status: "active" });

    state = completeActiveFusionTurn(state);
    expect(state.turns[0]).toMatchObject({ id: "run-tools", status: "completed" });
  });

  test("does not reactivate an explicitly completed turn while the chat status is settling", () => {
    let state = beginFusionSpatialTurn(EMPTY_FUSION_SPATIAL_STATE, { id: "run-finished", anchor: anchorA });
    const messages = [
      { id: "user-1", role: "user" as const },
      { id: "assistant-1", role: "assistant" as const },
    ];
    state = synchronizeFusionSpatialTurns(state, {
      messages,
      chatStatus: "streaming",
      fallbackAnchor: anchorB,
    });
    state = completeActiveFusionTurn(state);
    state = synchronizeFusionSpatialTurns(state, {
      messages,
      chatStatus: "streaming",
      fallbackAnchor: anchorB,
    });

    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      id: "run-finished",
      messageIds: ["user-1", "assistant-1"],
      status: "completed",
      collapsed: false,
    });
  });

  test("reactivates the same completed flow when a window-mode follow-up adds new messages", () => {
    let state = beginFusionSpatialTurn(EMPTY_FUSION_SPATIAL_STATE, { id: "run-window-follow-up", anchor: anchorA });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [{ id: "user-1", role: "user" }, { id: "assistant-1", role: "assistant" }],
      chatStatus: "streaming",
      fallbackAnchor: anchorA,
    });
    state = completeActiveFusionTurn(state);
    state = synchronizeFusionSpatialTurns(state, {
      messages: [
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
        { id: "user-2", role: "user" },
      ],
      chatStatus: "streaming",
      fallbackAnchor: anchorB,
    });

    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      id: "run-window-follow-up",
      anchor: anchorB,
      messageIds: ["user-1", "assistant-1", "user-2"],
      status: "active",
      collapsed: false,
    });
    expect(state.activeTurnId).toBe("run-window-follow-up");
  });

  test("adopts a window-mode follow-up into the existing conversation flow", () => {
    let state = synchronizeFusionSpatialTurns(EMPTY_FUSION_SPATIAL_STATE, {
      messages: [
        { id: "old-user", role: "user" },
        { id: "old-answer", role: "assistant" },
      ],
      chatStatus: "ready",
      fallbackAnchor: anchorA,
      now: 1,
    });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [
        { id: "old-user", role: "user" },
        { id: "old-answer", role: "assistant" },
        { id: "live-user", role: "user" },
        { id: "live-answer", role: "assistant" },
      ],
      chatStatus: "streaming",
      fallbackAnchor: anchorB,
      now: 2,
    });

    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      id: "message:old-user",
      anchor: anchorB,
      messageIds: ["old-user", "old-answer", "live-user", "live-answer"],
      status: "active",
      collapsed: false,
    });
    expect(state.activeTurnId).toBe("message:old-user");
  });

  test("promotes the matching latest turn when a retry crosses into fusion mode", () => {
    let state = synchronizeFusionSpatialTurns(EMPTY_FUSION_SPATIAL_STATE, {
      messages: [
        { id: "retry-user", role: "user" },
        { id: "retry-answer", role: "assistant" },
      ],
      chatStatus: "ready",
      fallbackAnchor: anchorA,
      now: 1,
    });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [
        { id: "retry-user", role: "user" },
        { id: "retry-answer", role: "assistant" },
      ],
      chatStatus: "streaming",
      fallbackAnchor: anchorB,
      now: 2,
    });

    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      id: "message:retry-user",
      anchor: anchorB,
      status: "active",
      collapsed: false,
    });
    expect(state.activeTurnId).toBe("message:retry-user");
  });

  test("supports completed-turn collapse, pin and close lifecycle", () => {
    let state = beginFusionSpatialTurn(EMPTY_FUSION_SPATIAL_STATE, { id: "run-1", anchor: anchorA });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [{ id: "user-1", role: "user" }, { id: "assistant-1", role: "assistant" }],
      chatStatus: "ready",
      fallbackAnchor: anchorA,
    });
    state = completeActiveFusionTurn(state);

    state = toggleFusionTurnCollapsed(state, "run-1");
    expect(state.turns[0]?.collapsed).toBe(true);
    state = toggleFusionTurnPinned(state, "run-1");
    expect(state.turns[0]).toMatchObject({ pinned: true, collapsed: false, dismissed: false });
    state = dismissFusionTurn(state, "run-1");
    expect(state.turns[0]).toMatchObject({ pinned: true, dismissed: true });
  });

  test("toggles an active response between expanded and collapsed without allowing pin or dismiss", () => {
    const state = beginFusionSpatialTurn(EMPTY_FUSION_SPATIAL_STATE, { id: "run-active", anchor: anchorA });
    const collapsed = toggleFusionTurnCollapsed(state, "run-active");
    expect(collapsed.turns[0]).toMatchObject({ status: "active", collapsed: true });
    const expanded = toggleFusionTurnCollapsed(collapsed, "run-active");
    expect(expanded.turns[0]).toMatchObject({ status: "active", collapsed: false });
    expect(toggleFusionTurnPinned(state, "run-active")).toBe(state);
    expect(dismissFusionTurn(state, "run-active")).toBe(state);
  });

  test("preserves the user-selected collapsed state through streaming updates and completion", () => {
    let state = beginFusionSpatialTurn(EMPTY_FUSION_SPATIAL_STATE, { id: "run-collapsed", anchor: anchorA });
    state = toggleFusionTurnCollapsed(state, "run-collapsed");
    state = synchronizeFusionSpatialTurns(state, {
      messages: [
        { id: "user-collapsed", role: "user" },
        { id: "assistant-collapsed", role: "assistant" },
      ],
      chatStatus: "streaming",
      fallbackAnchor: anchorB,
    });
    expect(state.turns[0]).toMatchObject({ status: "active", collapsed: true });

    state = completeActiveFusionTurn(state);
    expect(state.turns[0]).toMatchObject({ status: "completed", collapsed: true });

    state = toggleFusionTurnCollapsed(state, "run-collapsed");
    expect(state.turns[0]).toMatchObject({ status: "completed", collapsed: false });
  });

  test("preserves a pinned completed turn when the next run starts", () => {
    let state = beginFusionSpatialTurn(EMPTY_FUSION_SPATIAL_STATE, { id: "run-1", anchor: anchorA });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [{ id: "user-1", role: "user" }, { id: "assistant-1", role: "assistant" }],
      chatStatus: "ready",
      fallbackAnchor: anchorA,
    });
    state = completeActiveFusionTurn(state);
    state = toggleFusionTurnPinned(state, "run-1");
    state = beginFusionSpatialTurn(state, { id: "run-2", anchor: anchorB });
    expect(state.turns[0]).toMatchObject({ pinned: true, collapsed: false, dismissed: false });
  });

  test("marks the active run as failed without losing its identity or anchor", () => {
    let state = beginFusionSpatialTurn(EMPTY_FUSION_SPATIAL_STATE, { id: "run-error", anchor: anchorA });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [{ id: "user-error", role: "user" }],
      chatStatus: "error",
      fallbackAnchor: anchorB,
    });
    expect(state.turns[0]).toMatchObject({
      id: "run-error",
      anchor: anchorA,
      messageIds: ["user-error"],
      status: "error",
    });
    expect(state.activeTurnId).toBe("run-error");
  });

  test("imports an existing conversation as one compact historical flow", () => {
    const state = synchronizeFusionSpatialTurns(EMPTY_FUSION_SPATIAL_STATE, {
      messages: [
        { id: "u1", role: "user" },
        { id: "a1", role: "assistant" },
        { id: "u2", role: "user" },
        { id: "a2", role: "assistant" },
      ],
      chatStatus: "ready",
      fallbackAnchor: anchorB,
      now: 10,
    });
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      id: "message:u1",
      messageIds: ["u1", "a1", "u2", "a2"],
      collapsed: true,
      anchor: anchorB,
    });
  });

  test("drops anchors from another conversation when message identities are replaced", () => {
    let state = synchronizeFusionSpatialTurns(EMPTY_FUSION_SPATIAL_STATE, {
      messages: [{ id: "old-user", role: "user" }, { id: "old-answer", role: "assistant" }],
      chatStatus: "ready",
      fallbackAnchor: anchorA,
    });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [{ id: "new-user", role: "user" }, { id: "new-answer", role: "assistant" }],
      chatStatus: "ready",
      fallbackAnchor: anchorB,
    });
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({
      id: "message:new-user",
      anchor: anchorB,
      messageIds: ["new-user", "new-answer"],
    });
  });

  test("resets completed spatial history when a blank conversation is opened", () => {
    let state = synchronizeFusionSpatialTurns(EMPTY_FUSION_SPATIAL_STATE, {
      messages: [{ id: "old-user", role: "user" }],
      chatStatus: "ready",
      fallbackAnchor: anchorA,
    });
    state = synchronizeFusionSpatialTurns(state, {
      messages: [],
      chatStatus: "ready",
      fallbackAnchor: anchorB,
    });
    expect(state).toBe(EMPTY_FUSION_SPATIAL_STATE);
  });

  test("escape-style collapse targets the unified completed conversation flow", () => {
    let state = synchronizeFusionSpatialTurns(EMPTY_FUSION_SPATIAL_STATE, {
      messages: [
        { id: "u1", role: "user" },
        { id: "a1", role: "assistant" },
        { id: "u2", role: "user" },
        { id: "a2", role: "assistant" },
      ],
      chatStatus: "ready",
      fallbackAnchor: anchorA,
    });
    state = toggleFusionTurnCollapsed(state, "message:u1");
    const collapsed = collapseLatestFusionTurn(state);
    expect(collapsed.turns).toHaveLength(1);
    expect(collapsed.turns[0]).toMatchObject({ id: "message:u1", collapsed: true });
  });

  test("caps floating turn windows while preserving active and pinned work", () => {
    const turns = Array.from({ length: 5 }, (_, index) => ({
      id: `turn-${index + 1}`,
      anchor: anchorA,
      messageIds: [`m-${index + 1}`],
      selectionObjectNames: [],
      status: index === 4 ? "active" as const : "completed" as const,
      collapsed: index < 4,
      pinned: index === 1,
      dismissed: false,
      createdAt: index + 1,
    }));
    const visible = selectVisibleFusionTurns(turns);
    expect(visible).toHaveLength(MAX_VISIBLE_FUSION_TURNS);
    expect(visible.map((turn) => turn.id)).toEqual(["turn-2", "turn-4", "turn-5"]);
  });

  test("fades older floating windows progressively and keeps active work opaque", () => {
    expect([
      fusionTurnVisualOpacity(0, 3, false),
      fusionTurnVisualOpacity(1, 3, false),
      fusionTurnVisualOpacity(2, 3, false),
    ]).toEqual([0.44, 0.72, 1]);
    expect(fusionTurnVisualOpacity(0, 3, true)).toBe(1);
  });

  test("attaches only the current turn window to the moving composer", () => {
    const composerPoint = { x: 640, y: 620 };
    const current = {
      id: "turn-current",
      anchor: anchorA,
      messageIds: [],
      selectionObjectNames: [],
      status: "completed" as const,
      collapsed: false,
      pinned: false,
      dismissed: false,
      createdAt: 2,
    };
    const older = { ...current, id: "turn-older", anchor: anchorB, createdAt: 1 };
    expect(fusionTurnDisplayAnchor(current, "turn-current", composerPoint)).toEqual(composerPoint);
    expect(fusionTurnDisplayAnchor(older, "turn-current", composerPoint)).toEqual(anchorB);
  });

  test("moves a failed turn through native retry and explicit stop states", () => {
    let state = beginFusionSpatialTurn(EMPTY_FUSION_SPATIAL_STATE, {
      id: "run-retry",
      anchor: anchorA,
      createdAt: 1,
    });
    state = failFusionTurn(state, "run-retry");
    expect(state.turns[0]).toMatchObject({ status: "error", collapsed: false });

    state = retryFusionTurn(state, "run-retry");
    expect(state).toMatchObject({
      activeTurnId: "run-retry",
      turns: [{ id: "run-retry", status: "active", collapsed: false, dismissed: false }],
    });

    state = completeActiveFusionTurn(state);
    expect(state.turns[0]).toMatchObject({ status: "completed", collapsed: false });
  });
});
