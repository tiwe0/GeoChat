import { describe, expect, test } from "bun:test";
import {
  clampFusionPoint,
  defaultFusionPoint,
  fusionBubblePlacement,
  fusionConversationLayout,
} from "../src/renderer-react/src/features/fusion-mode/geometry";

describe("fusion mode geometry", () => {
  const viewport = { width: 1280, height: 720 };

  test("keeps a summoned composer inside the safe viewport", () => {
    expect(clampFusionPoint({ x: -100, y: -100 }, viewport)).toEqual({ x: 192, y: 56 });
    expect(clampFusionPoint({ x: 2000, y: 2000 }, viewport)).toEqual({ x: 1088, y: 636 });
  });

  test("aligns the default composer bottom with the 12px message gutter", () => {
    expect(defaultFusionPoint(viewport)).toEqual({ x: 640, y: 636 });
    for (const height of [72, 96, 180]) {
      const point = defaultFusionPoint(viewport, { width: 390, height });
      expect(point.x).toBe(640);
      expect(viewport.height - point.y - height).toBe(12);
    }
  });

  test.each([1024, 1280, 1440, 1920])("leaves a gap beside the default composer at width %i", (width) => {
    const size = { width: 390, height: 96 };
    const layout = fusionConversationLayout({ width, height: 900 }, size, true);
    const composerLeft = width / 2 - size.width / 2;
    expect(layout.width).toBeGreaterThanOrEqual(280);
    expect(layout.width).toBeLessThanOrEqual(430);
    expect(composerLeft - 12 - layout.width).toBeGreaterThanOrEqual(16);
    expect(layout.bottom).toBe(12);
    expect(layout.maxHeight).toBe(788);
  });

  test.each([360, 760, 1000])("stacks messages above the composer on a narrow %ipx viewport", (width) => {
    const viewportSize = { width, height: 720 };
    const size = { width: Math.min(390, width - 24), height: 180 };
    const layout = fusionConversationLayout(viewportSize, size, true);
    const point = defaultFusionPoint(viewportSize, size);
    expect(layout.width).toBe(Math.min(430, width - 24));
    expect(point.y - (viewportSize.height - layout.bottom)).toBe(16);
    expect(layout.maxHeight + layout.bottom).toBe(viewportSize.height - 100);
  });

  test("releases composer space when hidden and never returns negative panel sizes", () => {
    expect(fusionConversationLayout({ width: 760, height: 720 }, { width: 390, height: 96 }, false))
      .toEqual({ width: 430, bottom: 12, maxHeight: 608 });
    const layout = fusionConversationLayout({ width: 360, height: 140 }, { width: 336, height: 100 }, true);
    expect(layout.width).toBe(336);
    expect(layout.maxHeight).toBeGreaterThanOrEqual(0);
  });

  test("preserves spacing when a right-side panel clamps the default composer left", () => {
    const viewportSize = { width: 1280, height: 900 };
    const size = { width: 390, height: 96 };
    const insets = { right: 456 };
    const point = clampFusionPoint(defaultFusionPoint(viewportSize, size), viewportSize, size, insets);
    const layout = fusionConversationLayout(viewportSize, size, true, insets);
    expect(point.x - size.width / 2 - 12 - layout.width).toBe(16);
    expect(layout.bottom).toBe(12);
  });

  test("prefers bubbles above but flips below near the titlebar", () => {
    expect(fusionBubblePlacement({ x: 640, y: 500 }, viewport)).toBe("above");
    expect(fusionBubblePlacement({ x: 640, y: 64 }, viewport)).toBe("below");
  });

  test.each([
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ])("keeps composer and fallback positions recoverable at $width x $height", (size) => {
    const minimum = clampFusionPoint({ x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY }, size);
    const maximum = clampFusionPoint({ x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY }, size);
    const fallback = defaultFusionPoint(size);

    expect(minimum.x).toBeGreaterThanOrEqual(192);
    expect(minimum.y).toBeGreaterThanOrEqual(56);
    expect(maximum.x).toBeLessThanOrEqual(size.width - 192);
    expect(maximum.y).toBeLessThanOrEqual(size.height - 84);
    expect(fallback.x).toBeGreaterThanOrEqual(minimum.x);
    expect(fallback.x).toBeLessThanOrEqual(maximum.x);
    expect(fallback.y).toBeGreaterThanOrEqual(minimum.y);
    expect(fallback.y).toBeLessThanOrEqual(maximum.y);
  });
});
