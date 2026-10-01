import { describe, expect, test } from "bun:test";
import { clamp } from "../src/renderer-react/src/lib/numbers";

describe("shared renderer number geometry", () => {
  test("clamps values to the inclusive range", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(4, 0, 10)).toBe(4);
    expect(clamp(12, 0, 10)).toBe(10);
  });

  test("collapses an inverted range to its minimum", () => {
    expect(clamp(5, 10, 2)).toBe(10);
  });
});
