import { describe, expect, test } from "bun:test";
import {
  advanceBubbleWindowGesture,
  deferBubbleWindowCommitForMeasurement,
  interpolateBubbleWindowLayout,
  routeBubbleWheel,
  selectBubbleIdsForHeight,
  shiftBubbleIdsForHeight,
  shiftBubbleWindowEnd,
} from "../src/renderer-react/src/features/fusion-mode/bubbleHeightWindow";

function select(
  ids: readonly string[],
  heights: Record<string, number>,
  maxHeight: number,
  gap = 6,
  endIndex?: number,
) {
  return selectBubbleIdsForHeight({
    ids,
    maxHeight,
    gap,
    endIndex,
    heightFor: (id) => heights[id] ?? 1,
  });
}

describe("fusion bubble height window", () => {
  test("keeps more than two short cards when their complete shells fit", () => {
    expect(select(
      ["a", "b", "c", "d", "e"],
      { a: 100, b: 100, c: 100, d: 100, e: 100 },
      840,
    )).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("removes whole older cards according to occupied height", () => {
    expect(select(
      ["old", "middle", "latest"],
      { old: 420, middle: 420, latest: 420 },
      846,
    )).toEqual(["middle", "latest"]);
  });

  test("always preserves the latest card when it alone exceeds the space", () => {
    expect(select(["old", "latest"], { old: 100, latest: 420 }, 200)).toEqual(["latest"]);
  });

  test("can reopen a complete older height window without reverting to a count limit", () => {
    expect(select(
      ["a", "b", "c", "d"],
      { a: 120, b: 120, c: 120, d: 120 },
      246,
      6,
      2,
    )).toEqual(["b", "c"]);
  });

  test("moves the height window one card at a time in both directions", () => {
    expect(shiftBubbleWindowEnd({
      direction: "older",
      currentEndIndex: 3,
      firstVisibleIndex: 2,
      lastIndex: 4,
    })).toBe(2);
    expect(shiftBubbleWindowEnd({
      direction: "newer",
      currentEndIndex: 2,
      firstVisibleIndex: 1,
      lastIndex: 4,
    })).toBe(3);
  });

  test("does not move beyond the oldest or newest height window", () => {
    expect(shiftBubbleWindowEnd({ direction: "older", currentEndIndex: 1, firstVisibleIndex: 0, lastIndex: 4 })).toBe(1);
    expect(shiftBubbleWindowEnd({ direction: "newer", currentEndIndex: 4, firstVisibleIndex: 3, lastIndex: 4 })).toBe(4);
  });

  test("introduces only one complete older card when unequal heights free extra space", () => {
    expect(shiftBubbleIdsForHeight({
      ids: ["a", "b", "c", "d"],
      currentIds: ["c", "d"],
      direction: "older",
      maxHeight: 310,
      gap: 6,
      heightFor: (id) => ({ a: 50, b: 50, c: 50, d: 250 })[id] ?? 1,
    })).toEqual(["b", "c"]);
  });

  test("gives every entering card a distinct interpolated position without a threshold jump", () => {
    const heightFor = (id: string) => ({ a: 50, b: 50, c: 50, d: 250 })[id] ?? 1;
    const halfway = interpolateBubbleWindowLayout({
      currentIds: ["c", "d"],
      targetIds: ["b", "c"],
      placement: "above",
      direction: "older",
      progress: 0.5,
      gap: 6,
      heightFor,
    });
    const committed = interpolateBubbleWindowLayout({
      currentIds: ["c", "d"],
      targetIds: ["b", "c"],
      placement: "above",
      direction: "older",
      progress: 1,
      gap: 6,
      heightFor,
    });
    expect(new Set(halfway.items.map((item) => item.y)).size).toBe(halfway.items.length);
    expect(committed.items.find((item) => item.id === "b")).toMatchObject({ y: 0, opacity: 0.86 });
    expect(committed.items.find((item) => item.id === "c")).toMatchObject({ y: 56, opacity: 1 });
    expect(committed.items.find((item) => item.id === "d")?.opacity).toBe(0);

    const settled = interpolateBubbleWindowLayout({
      currentIds: ["b", "c"],
      targetIds: ["b", "c"],
      placement: "above",
      direction: "older",
      progress: 0,
      gap: 6,
      heightFor,
    });
    for (const id of ["b", "c"]) {
      expect(committed.items.find((item) => item.id === id)?.y)
        .toBe(settled.items.find((item) => item.id === id)?.y);
    }
  });

  test("keeps below-composer history interpolation continuous and reversible", () => {
    const heightFor = (id: string) => ({ a: 80, b: 120, c: 160 })[id] ?? 1;
    const halfway = interpolateBubbleWindowLayout({
      currentIds: ["b", "c"],
      targetIds: ["a", "b"],
      placement: "below",
      direction: "older",
      progress: 0.5,
      gap: 6,
      heightFor,
    });
    const reversed = interpolateBubbleWindowLayout({
      currentIds: ["b", "c"],
      targetIds: ["a", "b"],
      placement: "below",
      direction: "older",
      progress: 0,
      gap: 6,
      heightFor,
    });
    const committed = interpolateBubbleWindowLayout({
      currentIds: ["b", "c"],
      targetIds: ["a", "b"],
      placement: "below",
      direction: "older",
      progress: 1,
      gap: 6,
      heightFor,
    });

    expect(new Set(halfway.items.map((item) => item.y)).size).toBe(halfway.items.length);
    expect(reversed.items.find((item) => item.id === "b")?.y).toBe(166);
    expect(reversed.items.find((item) => item.id === "c")?.y).toBe(0);
    expect(committed.items.find((item) => item.id === "b")?.y).toBe(0);
    expect(committed.items.find((item) => item.id === "a")?.y).toBe(126);
  });

  test("keeps scroll-linked progress reversible until a complete-card threshold is crossed", () => {
    let gesture = advanceBubbleWindowGesture({
      offset: 0,
      wheelDelta: -36,
      threshold: 72,
      currentEndIndex: 3,
      firstVisibleIndex: 2,
      lastIndex: 4,
    });
    expect(gesture.progress).toBeCloseTo(0.5);
    expect(gesture.commitEndIndex).toBeNull();

    gesture = advanceBubbleWindowGesture({
      offset: gesture.offset,
      wheelDelta: 18,
      threshold: 72,
      currentEndIndex: 3,
      firstVisibleIndex: 2,
      lastIndex: 4,
    });
    expect(gesture.progress).toBeCloseTo(0.25);

    gesture = advanceBubbleWindowGesture({
      offset: gesture.offset,
      wheelDelta: 18,
      threshold: 72,
      currentEndIndex: 3,
      firstVisibleIndex: 2,
      lastIndex: 4,
    });
    expect(gesture).toMatchObject({ offset: 0, direction: null, progress: 0, commitEndIndex: null });
  });

  test("commits exactly one whole-card history window after the measured threshold", () => {
    const gesture = advanceBubbleWindowGesture({
      offset: -60,
      wheelDelta: -20,
      threshold: 72,
      currentEndIndex: 3,
      firstVisibleIndex: 2,
      lastIndex: 4,
    });
    expect(gesture.commitEndIndex).toBe(2);
    expect(gesture.progress).toBe(1);
  });

  test("previews an unseen card before allowing a large wheel event to commit it", () => {
    const committed = advanceBubbleWindowGesture({
      offset: 0,
      wheelDelta: -500,
      threshold: 420,
      currentEndIndex: 3,
      firstVisibleIndex: 2,
      lastIndex: 4,
    });
    const deferred = deferBubbleWindowCommitForMeasurement({
      gesture: committed,
      measured: false,
      threshold: 420,
    });

    expect(committed).toMatchObject({ progress: 1, commitEndIndex: 2 });
    expect(deferred.commitEndIndex).toBeNull();
    expect(deferred.progress).toBeGreaterThan(0.99);
    expect(deferred.progress).toBeLessThan(1);
    expect(deferBubbleWindowCommitForMeasurement({
      gesture: committed,
      measured: true,
      threshold: 420,
    })).toEqual(committed);
  });

  test("routes wheel input to the card body until it reaches an edge", () => {
    expect(routeBubbleWheel({ deltaY: -30, scrollTop: 80, scrollHeight: 600, clientHeight: 300 })).toBe("inner");
    expect(routeBubbleWheel({ deltaY: -30, scrollTop: 0, scrollHeight: 600, clientHeight: 300 })).toBe("history-older");
    expect(routeBubbleWheel({ deltaY: 30, scrollTop: 300, scrollHeight: 600, clientHeight: 300 })).toBe("history-newer");
  });
});
