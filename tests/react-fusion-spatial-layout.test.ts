import { describe, expect, test } from "bun:test";
import { fusionPanelSafeInsets, layoutFusionSpatialTurns } from "../src/renderer-react/src/features/fusion-mode/spatialLayout";

const viewport = { width: 1280, height: 800 };

function rect(layout: ReturnType<typeof layoutFusionSpatialTurns>[number], size: { width: number; height: number }) {
  const left = layout.anchor.x - size.width / 2;
  const top = layout.placement === "above"
    ? layout.anchor.y + 16 - size.height
    : layout.anchor.y + 68;
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

  test("reserves the right side for viewport panels on desktop only", () => {
    expect(fusionPanelSafeInsets(viewport, true).right).toBeGreaterThan(0);
    expect(fusionPanelSafeInsets({ width: 700, height: 800 }, true)).toEqual({});
    expect(fusionPanelSafeInsets(viewport, false)).toEqual({});
  });
});
