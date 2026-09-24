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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function defaultFusionPoint(viewport: FusionViewport): FusionPoint {
  return clampFusionPoint({ x: viewport.width / 2, y: viewport.height - 116 }, viewport);
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
