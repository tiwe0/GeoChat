import { describe, expect, test } from "bun:test";
import {
  RunCancelledError,
  isRunCancelledError,
  throwIfRunCancelled
} from "../src/renderer/src/run-cancellation";

describe("run cancellation", () => {
  test("throws when the run signal is aborted", () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => throwIfRunCancelled(controller.signal)).toThrow(RunCancelledError);
  });

  test("detects abort-style cancellation errors", () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    expect(isRunCancelledError(new RunCancelledError())).toBe(true);
    expect(isRunCancelledError(abortError)).toBe(true);
    expect(isRunCancelledError(new Error("network failed"))).toBe(false);
  });
});
