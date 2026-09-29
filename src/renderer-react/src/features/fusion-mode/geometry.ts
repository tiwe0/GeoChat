export type FusionPoint = { x: number; y: number };
export type FusionPlacement = "above" | "below";

export type FusionViewport = {
  width: number;
  height: number;
};

export type FusionSurfaceSize = {
  width: number;
  height: number;
};

export type FusionSafeInsets = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export const FUSION_VIEWPORT_GUTTER = 12;
export const FUSION_TITLEBAR_SAFE_TOP = 56;
export const FUSION_COMPOSER_WIDTH = 360;
export const FUSION_COMPOSER_HEIGHT = 72;
export const FUSION_BUBBLE_MAX_WIDTH = 430;
export const FUSION_BUBBLE_CARD_MAX_HEIGHT = 420;
// Reserve enough outer space for two maximum-height cards plus their gap,
// transparent shell padding, and the optional turn controls above the flow.
export const FUSION_BUBBLE_STACK_CHROME_ALLOWANCE = 96;
export const FUSION_BUBBLE_MAX_HEIGHT = (
  FUSION_BUBBLE_CARD_MAX_HEIGHT * 2
) + FUSION_BUBBLE_STACK_CHROME_ALLOWANCE;
export const FUSION_BUBBLE_COMPOSER_GAP = 12;
export const FUSION_BUBBLE_ABOVE_OFFSET = -FUSION_BUBBLE_COMPOSER_GAP;
export const FUSION_BUBBLE_BELOW_OFFSET = FUSION_COMPOSER_HEIGHT + FUSION_BUBBLE_COMPOSER_GAP;
export const FUSION_BUBBLE_Z_INDEX_BASE = 1320;
export const FUSION_COMPOSER_Z_INDEX = 1330;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function defaultFusionPoint(viewport: FusionViewport): FusionPoint {
  return clampFusionPoint({ x: viewport.width / 2, y: viewport.height - 116 }, viewport);
}

export function fusionActiveBubbleSize(viewport: FusionViewport): FusionSurfaceSize {
  return {
    width: Math.min(FUSION_BUBBLE_MAX_WIDTH, Math.max(1, viewport.width - 8)),
    height: Math.min(
      FUSION_BUBBLE_MAX_HEIGHT,
      Math.max(1, viewport.height - FUSION_TITLEBAR_SAFE_TOP - FUSION_VIEWPORT_GUTTER),
    ),
  };
}

/**
 * Size the live response against the space around its composer. Keeping the
 * shared anchor fixed is important: moving only the response to fit the
 * viewport would place it over the composer that it visually belongs to.
 */
export function fusionAttachedBubbleLayout(
  point: FusionPoint,
  viewport: FusionViewport,
  insets: FusionSafeInsets = {},
  composerSize: FusionSurfaceSize = { width: FUSION_COMPOSER_WIDTH, height: FUSION_COMPOSER_HEIGHT },
): { placement: FusionPlacement; size: FusionSurfaceSize } {
  const naturalSize = fusionActiveBubbleSize(viewport);
  const safeTop = Math.max(FUSION_TITLEBAR_SAFE_TOP, insets.top ?? FUSION_TITLEBAR_SAFE_TOP);
  const safeBottom = viewport.height - Math.max(FUSION_VIEWPORT_GUTTER, insets.bottom ?? FUSION_VIEWPORT_GUTTER);
  const availableAbove = Math.max(1, point.y - FUSION_BUBBLE_COMPOSER_GAP - safeTop);
  const availableBelow = Math.max(
    1,
    safeBottom - point.y - composerSize.height - FUSION_BUBBLE_COMPOSER_GAP,
  );
  const placement = availableAbove >= Math.min(naturalSize.height, 220)
    ? "above"
    : availableBelow > availableAbove ? "below" : "above";
  return {
    placement,
    size: {
      ...naturalSize,
      height: Math.min(naturalSize.height, placement === "above" ? availableAbove : availableBelow),
    },
  };
}

export function clampFusionPoint(
  point: FusionPoint,
  viewport: FusionViewport,
  surface: FusionSurfaceSize = { width: FUSION_COMPOSER_WIDTH, height: FUSION_COMPOSER_HEIGHT },
  insets: FusionSafeInsets = {},
): FusionPoint {
  const left = Math.max(FUSION_VIEWPORT_GUTTER, insets.left ?? FUSION_VIEWPORT_GUTTER);
  const right = Math.max(FUSION_VIEWPORT_GUTTER, insets.right ?? FUSION_VIEWPORT_GUTTER);
  const top = Math.max(FUSION_TITLEBAR_SAFE_TOP, insets.top ?? FUSION_TITLEBAR_SAFE_TOP);
  const bottom = Math.max(FUSION_VIEWPORT_GUTTER, insets.bottom ?? FUSION_VIEWPORT_GUTTER);
  const availableWidth = Math.max(0, viewport.width - left - right);
  const halfWidth = Math.min(surface.width / 2, availableWidth / 2);
  return {
    x: clamp(point.x, left + halfWidth, viewport.width - right - halfWidth),
    y: clamp(point.y, top, viewport.height - bottom - surface.height),
  };
}

export function fusionBubblePlacement(
  point: FusionPoint,
  viewport: FusionViewport,
  bubbleHeight = 260,
): FusionPlacement {
  const availableAbove = point.y - FUSION_TITLEBAR_SAFE_TOP;
  const availableBelow = viewport.height - point.y - FUSION_COMPOSER_HEIGHT - FUSION_VIEWPORT_GUTTER;
  if (availableAbove >= Math.min(bubbleHeight, 220)) return "above";
  return availableBelow > availableAbove ? "below" : "above";
}
