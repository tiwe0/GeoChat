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
  const turns = state.turns.map((turn) => turn.status === "completed" && !turn.pinned
    ? { ...turn, collapsed: true }
    : turn);
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
  const knownMessageIds = new Set(state.turns.flatMap((turn) => turn.messageIds));
  const hasRunningTurn = state.turns.some((turn) => turn.status === "active");
  const hasMessageOverlap = input.messages.some((message) => knownMessageIds.has(message.id));
  if (input.chatStatus === "ready" && !hasRunningTurn && knownMessageIds.size > 0) {
    if (input.messages.length === 0) return EMPTY_FUSION_SPATIAL_STATE;
    if (!hasMessageOverlap) {
      return synchronizeFusionSpatialTurns(EMPTY_FUSION_SPATIAL_STATE, input);
    }
  }

  const groups = groupMessages(input.messages);
  const assignedIds = new Set(state.turns.flatMap((turn) => turn.messageIds));
  let turns = [...state.turns];
  const activeIndex = state.activeTurnId
    ? turns.findIndex((turn) => turn.id === state.activeTurnId && turn.status === "active")
    : -1;

  if (activeIndex >= 0) {
    const active = turns[activeIndex]!;
    const group = groups.find((candidate) => candidate.messageIds.some((id) => active.messageIds.includes(id)))
      ?? [...groups].reverse().find((candidate) => candidate.messageIds.some((id) => !assignedIds.has(id)));
    const nextStatus: FusionTurnStatus = input.chatStatus === "error"
      ? "error"
      : input.chatStatus === "ready" && Boolean(group)
        ? "completed"
        : "active";
    const nextMessageIds = group?.messageIds ?? active.messageIds;
    turns[activeIndex] = {
      ...active,
      messageIds: nextMessageIds,
      status: nextStatus,
      dismissed: nextStatus === "active" ? false : active.dismissed,
    };
    for (const id of nextMessageIds) assignedIds.add(id);
  }

  let activeTurnId = state.activeTurnId;
  const chatIsRunning = input.chatStatus === "submitted" || input.chatStatus === "streaming";
  if (activeIndex < 0 && chatIsRunning) {
    // A run may start in window mode and then cross into fusion mode. In that
    // case no spatial turn was frozen by the fusion composer, so adopt the
    // newest unassigned message group without mutating the previously attached
    // completed turn. Retries can reuse the latest matching turn and anchor.
    const group = [...groups].reverse().find((candidate) => candidate.messageIds.some((id) => !assignedIds.has(id)))
      ?? groups.at(-1);
    const matchingIndex = group
      ? turns.findIndex((turn) => turn.messageIds.some((id) => group.messageIds.includes(id)))
      : -1;
    if (matchingIndex >= 0) {
      const matching = turns[matchingIndex]!;
      turns[matchingIndex] = {
        ...matching,
        messageIds: group!.messageIds,
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
        messageIds: group?.messageIds ?? [],
        selectionObjectNames: [],
        status: "active",
        collapsed: false,
        pinned: false,
        dismissed: false,
        createdAt: input.now ?? Date.now(),
      });
      activeTurnId = id;
    }
    for (const id of group?.messageIds ?? []) assignedIds.add(id);
  }

  for (const group of groups) {
    if (group.messageIds.every((id) => assignedIds.has(id))) continue;
    turns.push({
      id: `message:${group.id}`,
      anchor: input.fallbackAnchor,
      messageIds: group.messageIds,
      selectionObjectNames: [],
      status: "completed",
      collapsed: true,
      pinned: false,
      dismissed: false,
      createdAt: input.now ?? Date.now(),
    });
    for (const id of group.messageIds) assignedIds.add(id);
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
  return updateTurn(state, turnId, (turn) => turn.status === "active"
    ? turn
    : { ...turn, collapsed: !turn.collapsed });
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
 * returned order remains chronological so older cards naturally sit behind
 * and fade before newer cards.
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

export function fusionTurnVisualOpacity(index: number, count: number, active: boolean) {
  if (active || count <= 1) return 1;
  const progress = Math.max(0, Math.min(1, index / (count - 1)));
  return Number((0.44 + progress * 0.56).toFixed(3));
}

/**
 * Keep the latest conversation spatially attached to the composer. Previous
 * turns retain their frozen logical anchors, so moving the composer does not
 * drag the whole conversation history across the canvas.
 */
export function fusionTurnDisplayAnchor(
  turn: FusionSpatialTurn,
  attachedTurnId: string | null,
  composerPoint: FusionPoint,
) {
  return turn.id === attachedTurnId ? composerPoint : turn.anchor;
}

export function clampFusionTurnAnchors(
  state: FusionSpatialState,
  clamp: (point: FusionPoint) => FusionPoint,
) {
  const turns = state.turns.map((turn) => ({ ...turn, anchor: clamp(turn.anchor) }));
  return preserveIdentity(state, { ...state, turns });
}
