import { describe, expect, test } from "bun:test";
import {
  cancelGeoChatAssistantTurn,
  submitGeoChatAssistantTurn,
  type GeoChatAssistantSubmission,
} from "../src/renderer-react/src/features/assistant-ui";

const submission: GeoChatAssistantSubmission = { text: "画一个圆" };

describe("assistant-ui lifecycle coordination", () => {
  test("creates a Fusion turn only after assistant-ui has produced a valid submission", async () => {
    const events: string[] = [];

    await submitGeoChatAssistantTurn({
      submission,
      prepareTurn: () => {
        events.push("prepare-turn");
        return "turn-1";
      },
      submit: async () => {
        events.push("submit");
        return true;
      },
      failTurn: () => events.push("fail-turn"),
    });

    expect(events).toEqual(["prepare-turn", "submit"]);
  });

  test("fails the prepared Fusion turn when the business submission is rejected", async () => {
    const events: string[] = [];

    await expect(submitGeoChatAssistantTurn({
      submission,
      prepareTurn: () => {
        events.push("prepare-turn");
        return "turn-1";
      },
      submit: async () => {
        events.push("submit");
        return false;
      },
      failTurn: (turnId) => events.push(`fail:${turnId}`),
    })).rejects.toThrow("did not accept");

    expect(events).toEqual(["prepare-turn", "submit", "fail:turn-1"]);
  });

  test("fails the prepared Fusion turn when submission throws", async () => {
    const failure = new Error("transport unavailable");
    const failedTurns: string[] = [];

    await expect(submitGeoChatAssistantTurn({
      submission,
      prepareTurn: () => "turn-1",
      submit: async () => {
        throw failure;
      },
      failTurn: (turnId) => failedTurns.push(turnId),
    })).rejects.toBe(failure);

    expect(failedTurns).toEqual(["turn-1"]);
  });

  test("does not create a Fusion turn for a window-mode submission", async () => {
    let failed = false;

    await submitGeoChatAssistantTurn({
      submission,
      submit: async () => true,
      failTurn: () => {
        failed = true;
      },
    });

    expect(failed).toBe(false);
  });

  test("marks cancellation complete only after the run acknowledges stop", async () => {
    const events: string[] = [];

    await cancelGeoChatAssistantTurn({
      stop: async () => {
        events.push("stop-start");
        await Promise.resolve();
        events.push("stop-complete");
      },
      completeTurn: () => events.push("complete-turn"),
    });

    expect(events).toEqual(["stop-start", "stop-complete", "complete-turn"]);
  });

  test("does not mark a turn complete when cancellation fails", async () => {
    let completed = false;

    await expect(cancelGeoChatAssistantTurn({
      stop: async () => {
        throw new Error("cancel failed");
      },
      completeTurn: () => {
        completed = true;
      },
    })).rejects.toThrow("cancel failed");

    expect(completed).toBe(false);
  });
});
