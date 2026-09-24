import {
  FUSION_TITLEBAR_SAFE_TOP,
  FUSION_VIEWPORT_GUTTER,
  fusionBubblePlacement,
  type FusionPlacement,
  type FusionPoint,
  type FusionSafeInsets,
  type FusionSurfaceSize,
  type FusionViewport,
} from "./geometry";

export type FusionSpatialLayoutInput = {
  id: string;
  anchor: FusionPoint;
  collapsed: boolean;
  pinned: boolean;
  active: boolean;
  createdAt: number;
  size?: FusionSurfaceSize;
};

export type FusionSpatialLayout = {
  id: string;
  anchor: FusionPoint;
  placement: FusionPlacement;
};

type Rect = { left: number; top: number; right: number; bottom: number };

const DEFAULT_EXPANDED_SIZE = { width: 420, height: 300 };
const DEFAULT_COLLAPSED_SIZE = { width: 300, height: 56 };
// The current conversation and composer form one visual cluster. The bubble
// scroll area carries transparent shadow padding, so its outer box overlaps
// the gap while the visible card remains 8px away from the composer.
const BUBBLE_OUTER_BOTTOM_OFFSET = 16;
const COMPOSER_CLEARANCE = 68;
const COLLISION_GAP = 10;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function safeBounds(viewport: FusionViewport, insets: FusionSafeInsets) {
  return {
    left: Math.max(FUSION_VIEWPORT_GUTTER, insets.left ?? FUSION_VIEWPORT_GUTTER),
    top: Math.max(FUSION_TITLEBAR_SAFE_TOP, insets.top ?? FUSION_TITLEBAR_SAFE_TOP),
    right: viewport.width - Math.max(FUSION_VIEWPORT_GUTTER, insets.right ?? FUSION_VIEWPORT_GUTTER),
    bottom: viewport.height - Math.max(FUSION_VIEWPORT_GUTTER, insets.bottom ?? FUSION_VIEWPORT_GUTTER),
  };
}

function normalizedSize(input: FusionSpatialLayoutInput, viewport: FusionViewport, insets: FusionSafeInsets) {
  const bounds = safeBounds(viewport, insets);
  const fallback = input.collapsed ? DEFAULT_COLLAPSED_SIZE : DEFAULT_EXPANDED_SIZE;
  return {
    width: Math.min(Math.max(1, input.size?.width ?? fallback.width), Math.max(1, bounds.right - bounds.left)),
    height: Math.min(Math.max(1, input.size?.height ?? fallback.height), Math.max(1, bounds.bottom - bounds.top)),
  };
}

function rectFor(anchor: FusionPoint, placement: FusionPlacement, size: FusionSurfaceSize): Rect {
  const left = anchor.x - size.width / 2;
  const top = placement === "above"
    ? anchor.y + BUBBLE_OUTER_BOTTOM_OFFSET - size.height
    : anchor.y + COMPOSER_CLEARANCE;
  return { left, top, right: left + size.width, bottom: top + size.height };
}

function anchorForRect(rect: Rect, placement: FusionPlacement, size: FusionSurfaceSize): FusionPoint {
  return {
    x: rect.left + size.width / 2,
    y: placement === "above" ? rect.bottom - BUBBLE_OUTER_BOTTOM_OFFSET : rect.top - COMPOSER_CLEARANCE,
  };
}

function clampRect(rect: Rect, viewport: FusionViewport, insets: FusionSafeInsets): Rect {
  const bounds = safeBounds(viewport, insets);
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const left = clamp(rect.left, bounds.left, Math.max(bounds.left, bounds.right - width));
  const top = clamp(rect.top, bounds.top, Math.max(bounds.top, bounds.bottom - height));
  return { left, top, right: left + width, bottom: top + height };
}

function overlaps(left: Rect, right: Rect) {
  return left.left < right.right + COLLISION_GAP
    && left.right + COLLISION_GAP > right.left
    && left.top < right.bottom + COLLISION_GAP
    && left.bottom + COLLISION_GAP > right.top;
}

function overlapArea(left: Rect, right: Rect) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

function distance(left: FusionPoint, right: FusionPoint) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function candidates(
  input: FusionSpatialLayoutInput,
  size: FusionSurfaceSize,
  viewport: FusionViewport,
  insets: FusionSafeInsets,
) {
  const preferred = fusionBubblePlacement(input.anchor, viewport, size.height);
  const placements: FusionPlacement[] = preferred === "above" ? ["above", "below"] : ["below", "above"];
  const offsets = [0, -72, 72, -144, 144, -216, 216, -288, 288];
  const result: Array<{ anchor: FusionPoint; placement: FusionPlacement; rect: Rect; score: number }> = [];
  for (const placement of placements) {
    for (const y of offsets) {
      for (const x of [0, -96, 96, -192, 192]) {
        const requestedAnchor = { x: input.anchor.x + x, y: input.anchor.y + y };
        const rect = clampRect(rectFor(requestedAnchor, placement, size), viewport, insets);
        const anchor = anchorForRect(rect, placement, size);
        result.push({
          anchor,
          placement,
          rect,
          score: distance(anchor, input.anchor) + (placement === preferred ? 0 : 120),
        });
      }
    }
  }
  return result;
}

/**
 * Resolve visible bubble stacks into the current safe viewport. Active and
 * pinned turns keep priority; completed capsules yield first when space is
 * tight. This is display-only and never mutates the frozen logical anchor.
 */
export function layoutFusionSpatialTurns(
  turns: readonly FusionSpatialLayoutInput[],
  viewport: FusionViewport,
  insets: FusionSafeInsets = {},
): FusionSpatialLayout[] {
  const prioritized = [...turns].sort((left, right) => {
    const priority = (turn: FusionSpatialLayoutInput) => (turn.active ? 3 : turn.pinned ? 2 : 1);
    return priority(right) - priority(left) || right.createdAt - left.createdAt;
  });
  const placed: Array<{ id: string; rect: Rect }> = [];
  const layouts = new Map<string, FusionSpatialLayout>();

  for (const turn of prioritized) {
    const size = normalizedSize(turn, viewport, insets);
    const options = candidates(turn, size, viewport, insets);
    let best = options[0]!;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const option of options) {
      const collisionPenalty = placed.reduce((sum, item) => {
        if (!overlaps(option.rect, item.rect)) return sum;
        return sum + 100_000 + overlapArea(option.rect, item.rect);
      }, 0);
      const score = option.score + collisionPenalty;
      if (score < bestScore) {
        best = option;
        bestScore = score;
      }
      if (collisionPenalty === 0 && option.score === 0) break;
    }
    placed.push({ id: turn.id, rect: best.rect });
    layouts.set(turn.id, { id: turn.id, anchor: best.anchor, placement: best.placement });
  }

  return turns.map((turn) => layouts.get(turn.id) ?? {
    id: turn.id,
    anchor: turn.anchor,
    placement: fusionBubblePlacement(turn.anchor, viewport),
  });
}

export function fusionPanelSafeInsets(viewport: FusionViewport, panelOpen: boolean): FusionSafeInsets {
  if (!panelOpen || viewport.width <= 760) return {};
  return { right: Math.min(456, viewport.width * 0.46) };
}
