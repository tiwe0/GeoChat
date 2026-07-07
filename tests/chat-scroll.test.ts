import { describe, expect, test } from "bun:test";
import {
  CHAT_AUTO_SCROLL_BOTTOM_THRESHOLD,
  isScrolledNearBottom,
  scrollBottomDistance
} from "../src/renderer/src/chat-scroll";

describe("chat auto-scroll helpers", () => {
  test("measures the distance from the visible viewport to the scroll bottom", () => {
    expect(scrollBottomDistance({ scrollTop: 320, clientHeight: 480, scrollHeight: 1000 })).toBe(200);
  });

  test("treats exact bottom and small drift as bottom", () => {
    expect(isScrolledNearBottom({ scrollTop: 520, clientHeight: 480, scrollHeight: 1000 })).toBe(true);
    expect(isScrolledNearBottom({
      scrollTop: 520 - CHAT_AUTO_SCROLL_BOTTOM_THRESHOLD,
      clientHeight: 480,
      scrollHeight: 1000
    })).toBe(true);
  });

  test("detects when the user has intentionally scrolled away from the bottom", () => {
    expect(isScrolledNearBottom({
      scrollTop: 520 - CHAT_AUTO_SCROLL_BOTTOM_THRESHOLD - 1,
      clientHeight: 480,
      scrollHeight: 1000
    })).toBe(false);
  });
});
