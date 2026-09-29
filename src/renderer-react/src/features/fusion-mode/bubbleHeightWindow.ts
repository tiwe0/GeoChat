export function selectBubbleIdsForHeight(input: {
  ids: readonly string[];
  maxHeight: number;
  gap: number;
  heightFor: (id: string) => number;
  endIndex?: number;
}) {
  const selected: string[] = [];
  let usedHeight = 0;
  const endIndex = Math.min(
    input.ids.length - 1,
    Math.max(0, input.endIndex ?? input.ids.length - 1),
  );

  for (let index = endIndex; index >= 0; index -= 1) {
    const id = input.ids[index];
    if (!id) continue;
    const height = Math.max(1, input.heightFor(id));
    const nextHeight = selected.length === 0
      ? height
      : usedHeight + input.gap + height;

    // Always keep the window's newest card. Earlier cards are admitted only
    // when their complete shell fits; nothing is retained by an arbitrary
    // card count.
    if (selected.length > 0 && nextHeight > input.maxHeight) break;
    selected.push(id);
    usedHeight = nextHeight;
  }

  return selected.reverse();
}

function bubbleWindowHeight(input: {
  ids: readonly string[];
  gap: number;
  heightFor: (id: string) => number;
}) {
  return input.ids.reduce((height, id, index) => (
    height + Math.max(1, input.heightFor(id)) + (index === 0 ? 0 : input.gap)
  ), 0);
}

/**
 * Move a contiguous height window by one conversation card. One gesture may
 * evict several cards when the entering card is tall, but it never introduces
 * more than one new card. This keeps history navigation visually incremental
 * even when neighbouring cards have very different heights.
 */
export function shiftBubbleIdsForHeight(input: {
  ids: readonly string[];
  currentIds: readonly string[];
  direction: "older" | "newer";
  maxHeight: number;
  gap: number;
  heightFor: (id: string) => number;
}) {
  if (input.currentIds.length === 0) return [...input.currentIds];
  const firstIndex = input.ids.indexOf(input.currentIds[0]!);
  const lastIndex = input.ids.indexOf(input.currentIds.at(-1)!);
  if (firstIndex < 0 || lastIndex < 0) return [...input.currentIds];

  if (input.direction === "older") {
    const entering = input.ids[firstIndex - 1];
    if (!entering) return [...input.currentIds];
    const next = [entering, ...input.currentIds];
    while (
      next.length > 1
      && bubbleWindowHeight({ ids: next, gap: input.gap, heightFor: input.heightFor }) > input.maxHeight
    ) next.pop();
    return next;
  }

  const entering = input.ids[lastIndex + 1];
  if (!entering) return [...input.currentIds];
  const next = [...input.currentIds, entering];
  while (
    next.length > 1
    && bubbleWindowHeight({ ids: next, gap: input.gap, heightFor: input.heightFor }) > input.maxHeight
  ) next.shift();
  return next;
}

export function shiftBubbleWindowEnd(input: {
  direction: "older" | "newer";
  currentEndIndex: number;
  firstVisibleIndex: number;
  lastIndex: number;
}) {
  if (input.direction === "older") {
    return input.firstVisibleIndex > 0
      ? Math.max(0, input.currentEndIndex - 1)
      : input.currentEndIndex;
  }
  return input.currentEndIndex < input.lastIndex
    ? Math.min(input.lastIndex, input.currentEndIndex + 1)
    : input.currentEndIndex;
}

export type BubbleWindowGesture = {
  offset: number;
  direction: "older" | "newer" | null;
  progress: number;
  commitEndIndex: number | null;
};

export function advanceBubbleWindowGesture(input: {
  offset: number;
  wheelDelta: number;
  threshold: number;
  currentEndIndex: number;
  firstVisibleIndex: number;
  lastIndex: number;
}): BubbleWindowGesture {
  const threshold = Math.max(1, input.threshold);
  const offset = input.offset + input.wheelDelta;
  const direction = offset < 0 ? "older" : offset > 0 ? "newer" : null;
  if (!direction) return { offset: 0, direction: null, progress: 0, commitEndIndex: null };

  const nextEndIndex = shiftBubbleWindowEnd({
    direction,
    currentEndIndex: input.currentEndIndex,
    firstVisibleIndex: input.firstVisibleIndex,
    lastIndex: input.lastIndex,
  });
  if (nextEndIndex === input.currentEndIndex) {
    return { offset: 0, direction: null, progress: 0, commitEndIndex: null };
  }

  const progress = Math.min(1, Math.abs(offset) / threshold);
  return {
    offset,
    direction,
    progress,
    commitEndIndex: progress >= 1 ? nextEndIndex : null,
  };
}

/**
 * An unseen history card is rendered as part of the preview so ResizeObserver
 * can discover its real height. Do not let one large wheel event commit that
 * card while layout still uses the estimate; hold just below the boundary and
 * let the next event use the measured geometry.
 */
export function deferBubbleWindowCommitForMeasurement(input: {
  gesture: BubbleWindowGesture;
  measured: boolean;
  threshold: number;
}): BubbleWindowGesture {
  if (input.measured || input.gesture.commitEndIndex === null || !input.gesture.direction) {
    return input.gesture;
  }
  const threshold = Math.max(1, input.threshold);
  const heldOffset = Math.max(0.5, threshold - 1);
  return {
    ...input.gesture,
    offset: input.gesture.direction === "older" ? -heldOffset : heldOffset,
    progress: Math.min(0.999, heldOffset / threshold),
    commitEndIndex: null,
  };
}

export type BubbleWindowLayoutItem = {
  id: string;
  y: number;
  height: number;
  opacity: number;
  scale: number;
  entering: boolean;
  exiting: boolean;
};

export type BubbleWindowLayout = {
  height: number;
  items: BubbleWindowLayoutItem[];
};

function windowOpacity(ids: readonly string[], id: string) {
  const index = ids.indexOf(id);
  if (index < 0) return 0;
  const distanceFromLatest = ids.length - index - 1;
  return Math.max(0.72, 1 - distanceFromLatest * 0.14);
}

function visualWindowLayout(input: {
  ids: readonly string[];
  placement: "above" | "below";
  gap: number;
  heightFor: (id: string) => number;
}) {
  const visualIds = input.placement === "below" ? [...input.ids].reverse() : [...input.ids];
  const positions = new Map<string, { y: number; height: number }>();
  let y = 0;
  for (const id of visualIds) {
    const height = Math.max(1, input.heightFor(id));
    positions.set(id, { y, height });
    y += height + input.gap;
  }
  return {
    positions,
    height: visualIds.length > 0 ? y - input.gap : 0,
  };
}

/**
 * Interpolate every complete card between the current and target height
 * windows. Shared cards move between their real layouts, entering cards have
 * distinct target positions, and exiting cards fade from their own positions.
 * Consequently stopping or reversing the wheel also stops or reverses the UI.
 */
export function interpolateBubbleWindowLayout(input: {
  currentIds: readonly string[];
  targetIds: readonly string[];
  placement: "above" | "below";
  direction: "older" | "newer";
  progress: number;
  gap: number;
  heightFor: (id: string) => number;
}): BubbleWindowLayout {
  const progress = Math.min(1, Math.max(0, input.progress));
  const current = visualWindowLayout({ ...input, ids: input.currentIds });
  const target = visualWindowLayout({ ...input, ids: input.targetIds });
  const ids = [...new Set([...input.currentIds, ...input.targetIds])];
  const enteringSign = input.direction === "older"
    ? input.placement === "above" ? -1 : 1
    : input.placement === "above" ? 1 : -1;
  const lerp = (from: number, to: number) => from + ((to - from) * progress);

  const items = ids.map((id) => {
    const from = current.positions.get(id);
    const to = target.positions.get(id);
    const height = to?.height ?? from?.height ?? Math.max(1, input.heightFor(id));
    const travel = Math.min(48, Math.max(18, height * 0.22));
    const fromY = from?.y ?? ((to?.y ?? 0) + enteringSign * travel);
    const toY = to?.y ?? ((from?.y ?? 0) - enteringSign * travel);
    const fromOpacity = from ? windowOpacity(input.currentIds, id) : 0;
    const toOpacity = to ? windowOpacity(input.targetIds, id) : 0;
    return {
      id,
      y: lerp(fromY, toY),
      height,
      opacity: lerp(fromOpacity, toOpacity),
      scale: lerp(from ? 1 : 0.975, to ? 1 : 0.975),
      entering: !from && Boolean(to),
      exiting: Boolean(from) && !to,
    };
  }).sort((left, right) => left.y - right.y);

  return {
    height: lerp(current.height, target.height),
    items,
  };
}

export type BubbleWheelRoute = "inner" | "history-older" | "history-newer";

export function routeBubbleWheel(input: {
  deltaY: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}): BubbleWheelRoute {
  const bottomDistance = Math.max(0, input.scrollHeight - input.scrollTop - input.clientHeight);
  if (input.deltaY < 0 && input.scrollTop > 1) return "inner";
  if (input.deltaY > 0 && bottomDistance > 1) return "inner";
  return input.deltaY < 0 ? "history-older" : "history-newer";
}
