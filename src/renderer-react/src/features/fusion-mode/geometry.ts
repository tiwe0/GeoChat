import { clamp } from "../../lib/numbers";

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
export const FUSION_BUBBLE_Z_INDEX_BASE = 1320;
export const FUSION_COMPOSER_Z_INDEX = 1330;
const FUSION_CONVERSATION_GAP = 16;
const FUSION_CONVERSATION_MIN_WIDTH = 280;

export function defaultFusionPoint(
  viewport: FusionViewport,
  surface: FusionSurfaceSize = { width: FUSION_COMPOSER_WIDTH, height: FUSION_COMPOSER_HEIGHT },
): FusionPoint {
  return clampFusionPoint({
    x: viewport.width / 2,
    y: viewport.height - FUSION_VIEWPORT_GUTTER - surface.height,
  }, viewport, surface);
}

/** Reserve the default composer slot, without moving messages during manual dragging. */
export function fusionConversationLayout(
  viewport: FusionViewport,
  composer: FusionSurfaceSize,
  composerVisible: boolean,
  insets: FusionSafeInsets = {},
) {
  const viewportWidth = Math.max(0, viewport.width - FUSION_VIEWPORT_GUTTER * 2);
  const defaultPoint = clampFusionPoint(defaultFusionPoint(viewport, composer), viewport, composer, insets);
  const besideWidth = defaultPoint.x - composer.width / 2 - FUSION_VIEWPORT_GUTTER - FUSION_CONVERSATION_GAP;
  const stacked = composerVisible && besideWidth < FUSION_CONVERSATION_MIN_WIDTH;
  const width = Math.min(FUSION_BUBBLE_MAX_WIDTH, viewportWidth, composerVisible && !stacked ? besideWidth : viewportWidth);
  const bottom = stacked
    ? Math.max(FUSION_VIEWPORT_GUTTER, Math.min(viewport.height - FUSION_VIEWPORT_GUTTER, composer.height + FUSION_VIEWPORT_GUTTER + FUSION_CONVERSATION_GAP))
    : FUSION_VIEWPORT_GUTTER;
  // Preserve the existing 100px clearance above the message container.
  return { width, bottom, maxHeight: Math.max(0, viewport.height - bottom - 100) };
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
