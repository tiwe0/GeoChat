import { describe, expect, test } from "bun:test";
import {
  FUSION_BUBBLE_ABOVE_OFFSET,
  FUSION_BUBBLE_BELOW_OFFSET,
  FUSION_BUBBLE_COMPOSER_GAP,
  FUSION_COMPOSER_HEIGHT,
  fusionActiveBubbleSize,
  fusionAttachedBubbleLayout,
} from "../src/renderer-react/src/features/fusion-mode/geometry";
import { fusionPanelSafeInsets, layoutFusionSpatialTurns } from "../src/renderer-react/src/features/fusion-mode/spatialLayout";

const viewport = { width: 1280, height: 800 };

function rect(layout: ReturnType<typeof layoutFusionSpatialTurns>[number], size: { width: number; height: number }) {
  const left = layout.anchor.x - size.width / 2;
  const top = layout.placement === "above"
    ? layout.anchor.y + FUSION_BUBBLE_ABOVE_OFFSET - size.height
    : layout.anchor.y + FUSION_BUBBLE_BELOW_OFFSET;
  return { left, top, right: left + size.width, bottom: top + size.height };
}

function intersects(left: ReturnType<typeof rect>, right: ReturnType<typeof rect>) {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

describe("fusion spatial layout", () => {
  test("keeps measured bubbles in the visible safe area", () => {
    const size = { width: 420, height: 300 };
    const [layout] = layoutFusionSpatialTurns([{
      id: "edge",
      anchor: { x: 1260, y: 70 },
      collapsed: false,
      pinned: false,
      active: true,
      createdAt: 1,
      size,
    }], viewport);
    const bounds = rect(layout!, size);
    expect(bounds.left).toBeGreaterThanOrEqual(12);
    expect(bounds.top).toBeGreaterThanOrEqual(56);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width - 12);
    expect(bounds.bottom).toBeLessThanOrEqual(viewport.height - 12);
  });

  test("moves overlapping turns without mutating their logical anchors", () => {
    const size = { width: 360, height: 180 };
    const turns = [
      { id: "old", anchor: { x: 640, y: 500 }, collapsed: false, pinned: false, active: false, createdAt: 1, size },
      { id: "active", anchor: { x: 640, y: 500 }, collapsed: false, pinned: false, active: true, createdAt: 2, size },
    ];
    const layouts = layoutFusionSpatialTurns(turns, viewport);
    expect(intersects(rect(layouts[0]!, size), rect(layouts[1]!, size))).toBe(false);
    expect(turns[0]!.anchor).toEqual({ x: 640, y: 500 });
    expect(turns[1]!.anchor).toEqual({ x: 640, y: 500 });
  });

  test("keeps the composer-attached turn at its requested anchor ahead of older pinned cards", () => {
    const size = { width: 360, height: 320 };
    const requestedAnchor = { x: 640, y: 500 };
    const layouts = layoutFusionSpatialTurns([
      { id: "pinned-old", anchor: requestedAnchor, collapsed: false, pinned: true, active: false, createdAt: 1, size },
      { id: "attached-latest", anchor: requestedAnchor, collapsed: false, pinned: false, active: true, createdAt: 2, size },
    ], viewport);

    expect(layouts[1]).toMatchObject({ id: "attached-latest", anchor: requestedAnchor });
    expect(layouts[0]!.anchor).not.toEqual(requestedAnchor);
  });

  test("keeps the responsive active bubble clear of its composer", () => {
    const compactViewport = { width: 960, height: 600 };
    const requestedAnchor = { x: 380, y: 448 };
    const size = fusionActiveBubbleSize(compactViewport);
    const [layout] = layoutFusionSpatialTurns([{
      id: "attached-active",
      anchor: requestedAnchor,
      collapsed: false,
      pinned: false,
      active: true,
      createdAt: 1,
      size,
    }], compactViewport);
    const bubble = rect(layout!, size);
    const composer = {
      left: requestedAnchor.x - 195,
      top: requestedAnchor.y,
      right: requestedAnchor.x + 195,
      bottom: requestedAnchor.y + FUSION_COMPOSER_HEIGHT,
    };

    expect(layout!.anchor).toEqual(requestedAnchor);
    expect(intersects(bubble, composer)).toBe(false);
    expect(composer.top - bubble.bottom).toBeGreaterThanOrEqual(FUSION_BUBBLE_COMPOSER_GAP);
  });

  test("shrinks an attached live response instead of moving it over the composer", () => {
    const compactViewport = { width: 960, height: 600 };
    const requestedAnchor = { x: 480, y: 300 };
    const attached = fusionAttachedBubbleLayout(requestedAnchor, compactViewport);
    const [layout] = layoutFusionSpatialTurns([{
      id: "space-constrained-active",
      anchor: requestedAnchor,
      collapsed: false,
      pinned: false,
      active: true,
      createdAt: 1,
      size: attached.size,
    }], compactViewport);
    const bubble = rect(layout!, attached.size);

    expect(layout).toMatchObject({ anchor: requestedAnchor, placement: attached.placement });
    expect(requestedAnchor.y - bubble.bottom).toBeGreaterThanOrEqual(FUSION_BUBBLE_COMPOSER_GAP);
    expect(bubble.top).toBeGreaterThanOrEqual(56);
  });

  test("reserves the right side for viewport panels on desktop only", () => {
    expect(fusionPanelSafeInsets(viewport, true).right).toBeGreaterThan(0);
    expect(fusionPanelSafeInsets({ width: 700, height: 800 }, true)).toEqual({});
    expect(fusionPanelSafeInsets(viewport, false)).toEqual({});
  });
});
