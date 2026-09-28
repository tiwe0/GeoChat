import { describe, expect, test } from "bun:test";
import { nextMessageScrollMode } from "../src/renderer-react/src/hooks/useMessageScroll";

describe("conversation scroll state machine", () => {
  test("detaches from streaming output as soon as the user browses upward", () => {
    expect(nextMessageScrollMode("follow", "user-browse")).toBe("browse");
    expect(nextMessageScrollMode("browse", "user-browse")).toBe("browse");
  });

  test("does not resume following until the viewport reaches the bottom", () => {
    expect(nextMessageScrollMode("browse", "reached-bottom")).toBe("follow");
  });

  test("explicit new-turn navigation restores follow mode", () => {
    expect(nextMessageScrollMode("browse", "follow-latest")).toBe("follow");
  });
});
