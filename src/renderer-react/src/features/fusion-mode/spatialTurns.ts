import type { FusionPoint } from "./geometry";
import type { FusionChatStatus } from "./types";

export type FusionTurnStatus = "active" | "completed" | "error";

export type FusionSpatialTurn = {
  /** Stable for the lifetime of the submitted run, even before messages arrive. */
  id: string;
  anchor: FusionPoint;
  messageIds: readonly string[];
  selectionObjectNames: readonly string[];
  status: FusionTurnStatus;
  collapsed: boolean;
  pinned: boolean;
  dismissed: boolean;
  createdAt: number;
};

export type FusionSpatialState = {
  turns: readonly FusionSpatialTurn[];
  /** The latest run remains selected after completion until another run starts. */
  activeTurnId: string | null;
};

export type FusionMessageIdentity = {
  id: string;
  role: "user" | "assistant" | "system";
};

export const MAX_VISIBLE_FUSION_TURNS = 3;

type FusionMessageGroup = {
  id: string;
  messageIds: string[];
};

export const EMPTY_FUSION_SPATIAL_STATE: FusionSpatialState = {
  turns: [],
  activeTurnId: null,
};

function groupMessages(messages: readonly FusionMessageIdentity[]): FusionMessageGroup[] {
  const groups: FusionMessageGroup[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user" || groups.length === 0) {
      groups.push({ id: message.id, messageIds: [message.id] });
      continue;
    }
    groups.at(-1)!.messageIds.push(message.id);
  }
  return groups;
}

function sameIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function sameTurn(left: FusionSpatialTurn, right: FusionSpatialTurn) {
  return left.id === right.id
    && left.anchor.x === right.anchor.x
    && left.anchor.y === right.anchor.y
    && sameIds(left.messageIds, right.messageIds)
    && sameIds(left.selectionObjectNames, right.selectionObjectNames)
    && left.status === right.status
    && left.collapsed === right.collapsed
    && left.pinned === right.pinned
    && left.dismissed === right.dismissed
    && left.createdAt === right.createdAt;
}

function preserveIdentity(previous: FusionSpatialState, next: FusionSpatialState): FusionSpatialState {
  if (previous.activeTurnId !== next.activeTurnId || previous.turns.length !== next.turns.length) return next;
  return previous.turns.every((turn, index) => sameTurn(turn, next.turns[index]!)) ? previous : next;
}

export function beginFusionSpatialTurn(
  state: FusionSpatialState,
  input: { id: string; anchor: FusionPoint; selectionObjectNames?: readonly string[]; createdAt?: number },
): FusionSpatialState {
  if (state.turns.some((turn) => turn.id === input.id)) return state;
  const currentIndex = state.activeTurnId
    ? state.turns.findIndex((turn) => turn.id === state.activeTurnId)
    : -1;
  const current = currentIndex >= 0 ? state.turns[currentIndex] : undefined;
  if (current && !current.dismissed && !current.pinned) {
    // A spatial turn represents the current conversation, not one backend run.
    // Follow-up submissions therefore reactivate and move the same bubble flow
    // instead of leaving a second toolbar/card pair behind on the canvas.
    const turns = [...state.turns];
    turns[currentIndex] = {
      ...current,
      anchor: input.anchor,
      selectionObjectNames: [...(input.selectionObjectNames ?? [])],
      status: "active",
      collapsed: false,
      dismissed: false,
    };
    return preserveIdentity(state, { turns, activeTurnId: current.id });
  }

  // An explicitly pinned flow is a deliberate snapshot. Only that case opens
  // another spatial flow when the conversation continues elsewhere.
  const turns = [...state.turns];
  turns.push({
    id: input.id,
    anchor: input.anchor,
    messageIds: [],
    selectionObjectNames: [...(input.selectionObjectNames ?? [])],
    status: "active",
    collapsed: false,
    pinned: false,
    dismissed: false,
    createdAt: input.createdAt ?? Date.now(),
  });
  return { turns, activeTurnId: input.id };
}

export function synchronizeFusionSpatialTurns(
  state: FusionSpatialState,
  input: {
    messages: readonly FusionMessageIdentity[];
    chatStatus: FusionChatStatus;
    fallbackAnchor: FusionPoint;
    now?: number;
  },
): FusionSpatialState {
  const visibleMessages = input.messages.filter((message) => message.role !== "system");
  const visibleMessageIds = visibleMessages.map((message) => message.id);
  const knownMessageIds = new Set(state.turns.flatMap((turn) => turn.messageIds));
  const hasRunningTurn = state.turns.some((turn) => turn.status === "active");
  const hasMessageOverlap = input.messages.some((message) => knownMessageIds.has(message.id));
  if (input.chatStatus === "ready" && !hasRunningTurn && knownMessageIds.size > 0) {
    if (input.messages.length === 0) return EMPTY_FUSION_SPATIAL_STATE;
    if (!hasMessageOverlap) {
      return synchronizeFusionSpatialTurns(EMPTY_FUSION_SPATIAL_STATE, input);
    }
  }

  const groups = groupMessages(visibleMessages);
  const assignedIds = new Set(state.turns.flatMap((turn) => turn.messageIds));
  let turns = [...state.turns];
  const activeIndex = state.activeTurnId
    ? turns.findIndex((turn) => turn.id === state.activeTurnId && turn.status === "active")
    : -1;
  const chatIsRunning = input.chatStatus === "submitted" || input.chatStatus === "streaming";
  let activeTurnId = state.activeTurnId;
  let resumedSelectedTurn = false;
  let settledSelectedGroupId: string | null = null;

  if (activeIndex >= 0) {
    const active = turns[activeIndex]!;
    const group = active.messageIds.length === 0
      ? [...groups].reverse().find((candidate) => candidate.messageIds.some((id) => !assignedIds.has(id)))
      : undefined;
    // `ready` is not a reliable terminal signal while AI SDK is handing a
    // renderer tool result back into an automatically continued run. Keep the
    // spatial turn active until the chat lifecycle emits its explicit finish
    // event (or the user stops it) so the card cannot flicker completed and
    // active between tool steps.
    const nextStatus: FusionTurnStatus = input.chatStatus === "error" ? "error" : "active";
    const nextMessageIds = active.messageIds.length > 0
      ? visibleMessageIds
      : group?.messageIds ?? active.messageIds;
    turns[activeIndex] = {
      ...active,
      messageIds: nextMessageIds,
      status: nextStatus,
      dismissed: nextStatus === "active" ? false : active.dismissed,
    };
    for (const id of nextMessageIds) assignedIds.add(id);
  }

  if (activeIndex < 0 && state.activeTurnId) {
    const selectedIndex = turns.findIndex((turn) => turn.id === state.activeTurnId);
    const selected = selectedIndex >= 0 ? turns[selectedIndex] : undefined;
    const overlapsSelected = selected?.messageIds.some((id) => visibleMessageIds.includes(id));
    if (selected && selected.status !== "active" && overlapsSelected) {
      const hasNewMessages = visibleMessageIds.some((id) => !selected.messageIds.includes(id));
      if (chatIsRunning && hasNewMessages) {
        turns[selectedIndex] = {
          ...selected,
          anchor: input.fallbackAnchor,
          messageIds: visibleMessageIds,
          status: "active",
          collapsed: false,
          dismissed: false,
        };
        activeTurnId = selected.id;
        resumedSelectedTurn = true;
      } else {
      // `onFinish` can settle the spatial turn one React commit before the AI
      // SDK publishes its final status/message snapshot. Merge that last
      // snapshot into the completed turn, but never reopen it as a fresh run.
        turns[selectedIndex] = sameIds(selected.messageIds, visibleMessageIds)
          ? selected
          : { ...selected, messageIds: visibleMessageIds };
        settledSelectedGroupId = groups[0]?.id ?? null;
        for (const id of visibleMessageIds) assignedIds.add(id);
      }
    }
  }

  if (activeIndex < 0 && chatIsRunning && !resumedSelectedTurn) {
    // A run may start in window mode and then cross into fusion mode. Reuse a
    // matching conversation flow when possible; only a genuinely unrelated
    // message history receives a new spatial identity.
    const group = [...groups].reverse().find((candidate) => (
      candidate.id !== settledSelectedGroupId
      && candidate.messageIds.some((id) => !assignedIds.has(id))
    )) ?? (settledSelectedGroupId ? undefined : groups.at(-1));
    if (!group) return preserveIdentity(state, { turns, activeTurnId });
    const matchingIndex = turns.findIndex((turn) => (
      !turn.dismissed && turn.messageIds.some((id) => visibleMessageIds.includes(id))
    ));
    if (matchingIndex >= 0) {
      const matching = turns[matchingIndex]!;
      turns[matchingIndex] = {
        ...matching,
        anchor: input.fallbackAnchor,
        messageIds: visibleMessageIds,
        status: "active",
        collapsed: false,
        dismissed: false,
      };
      activeTurnId = matching.id;
    } else {
      const id = group ? `message:${group.id}` : "message:active-run";
      turns.push({
        id,
        anchor: input.fallbackAnchor,
        messageIds: group.messageIds,
        selectionObjectNames: [],
        status: "active",
        collapsed: false,
        pinned: false,
        dismissed: false,
        createdAt: input.now ?? Date.now(),
      });
      activeTurnId = id;
    }
    for (const id of visibleMessageIds) assignedIds.add(id);
  }

  if (turns.length === 0 && visibleMessageIds.length > 0) {
    const firstGroup = groups[0];
    turns.push({
      id: `message:${firstGroup?.id ?? visibleMessageIds[0]}`,
      anchor: input.fallbackAnchor,
      messageIds: visibleMessageIds,
      selectionObjectNames: [],
      status: "completed",
      // Restored messages should be immediately readable; collapse is a user action.
      collapsed: false,
      pinned: false,
      dismissed: false,
      createdAt: input.now ?? Date.now(),
    });
  }

  return preserveIdentity(state, { turns, activeTurnId });
}

function updateTurn(
  state: FusionSpatialState,
  turnId: string,
  update: (turn: FusionSpatialTurn) => FusionSpatialTurn,
) {
  const turns = state.turns.map((turn) => turn.id === turnId ? update(turn) : turn);
  return preserveIdentity(state, { ...state, turns });
}

export function toggleFusionTurnCollapsed(state: FusionSpatialState, turnId: string) {
  return updateTurn(state, turnId, (turn) => ({ ...turn, collapsed: !turn.collapsed }));
}

export function toggleFusionTurnPinned(state: FusionSpatialState, turnId: string) {
  return updateTurn(state, turnId, (turn) => turn.status === "active"
    ? turn
    : {
      ...turn,
      pinned: !turn.pinned,
      collapsed: turn.pinned ? turn.collapsed : false,
      dismissed: false,
    });
}

export function dismissFusionTurn(state: FusionSpatialState, turnId: string) {
  return updateTurn(state, turnId, (turn) => turn.status === "active"
    ? turn
    : { ...turn, dismissed: true });
}

export function retryFusionTurn(state: FusionSpatialState, turnId: string): FusionSpatialState {
  const turn = state.turns.find((candidate) => candidate.id === turnId);
  if (!turn || turn.status !== "error") return state;
  return {
    turns: state.turns.map((candidate) => candidate.id === turnId
      ? { ...candidate, status: "active" as const, collapsed: false, dismissed: false }
      : candidate),
    activeTurnId: turnId,
  };
}

export function failFusionTurn(state: FusionSpatialState, turnId: string) {
  return updateTurn(state, turnId, (turn) => turn.status === "completed"
    ? turn
    : { ...turn, status: "error", collapsed: false, dismissed: false });
}

export function completeActiveFusionTurn(state: FusionSpatialState) {
  if (!state.activeTurnId) return state;
  return updateTurn(state, state.activeTurnId, (turn) => turn.status === "active"
    ? { ...turn, status: "completed" }
    : turn);
}

export function collapseLatestFusionTurn(state: FusionSpatialState) {
  const turn = [...state.turns]
    .reverse()
    .find((candidate) => candidate.status !== "active" && !candidate.dismissed && !candidate.collapsed);
  return turn ? updateTurn(state, turn.id, (candidate) => ({ ...candidate, collapsed: true })) : state;
}

/**
 * Keep the canvas calm even after a long conversation. Active work wins,
 * followed by explicitly pinned turns, then the newest remaining turns. The
 * returned order remains chronological without fading older cards.
 */
export function selectVisibleFusionTurns(
  turns: readonly FusionSpatialTurn[],
  limit = MAX_VISIBLE_FUSION_TURNS,
) {
  if (limit <= 0) return [];
  const candidates = turns.filter((turn) => !turn.dismissed);
  if (candidates.length <= limit) return candidates;
  const prioritized = [...candidates].sort((left, right) => {
    const priority = (turn: FusionSpatialTurn) => turn.status === "active" ? 3 : turn.pinned ? 2 : 1;
    return priority(right) - priority(left) || right.createdAt - left.createdAt;
  });
  const selected = new Set(prioritized.slice(0, limit).map((turn) => turn.id));
  return candidates.filter((turn) => selected.has(turn.id));
}

export function clampFusionTurnAnchors(
  state: FusionSpatialState,
  clamp: (point: FusionPoint) => FusionPoint,
) {
  const turns = state.turns.map((turn) => ({ ...turn, anchor: clamp(turn.anchor) }));
  return preserveIdentity(state, { ...state, turns });
}
