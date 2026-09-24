import { describe, expect, test } from "bun:test";
import {
  clampFusionPoint,
  defaultFusionPoint,
  fusionBubblePlacement,
} from "../src/renderer-react/src/features/fusion-mode/geometry";

describe("fusion mode geometry", () => {
  const viewport = { width: 1280, height: 720 };

  test("keeps a summoned composer inside the safe viewport", () => {
    expect(clampFusionPoint({ x: -100, y: -100 }, viewport)).toEqual({ x: 192, y: 56 });
    expect(clampFusionPoint({ x: 2000, y: 2000 }, viewport)).toEqual({ x: 1088, y: 636 });
  });

  test("uses a stable bottom-center fallback", () => {
    expect(defaultFusionPoint(viewport)).toEqual({ x: 640, y: 604 });
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
