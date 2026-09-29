import { describe, expect, test } from "bun:test";
import {
  fusionCardScrollEventForViewport,
  nextFusionCardScrollMode,
} from "../src/renderer-react/src/features/fusion-mode/useFusionCardScroll";

describe("conversation scroll state machine", () => {
  test("detaches from streaming output as soon as the user browses upward", () => {
    expect(nextFusionCardScrollMode("follow", "user-browse")).toBe("browse");
    expect(nextFusionCardScrollMode("browse", "user-browse")).toBe("browse");
  });

  test("does not resume following until the viewport reaches the bottom", () => {
    expect(nextFusionCardScrollMode("browse", "reached-bottom")).toBe("follow");
  });

  test("explicit new-turn navigation restores follow mode", () => {
    expect(nextFusionCardScrollMode("browse", "follow-latest")).toBe("follow");
  });

  test("does not mistake streaming layout scroll events for user browsing", () => {
    expect(fusionCardScrollEventForViewport("follow", false)).toBeNull();
    expect(fusionCardScrollEventForViewport("follow", true)).toBeNull();
    expect(fusionCardScrollEventForViewport("browse", false)).toBeNull();
    expect(fusionCardScrollEventForViewport("browse", true)).toBe("reached-bottom");
  });
});
