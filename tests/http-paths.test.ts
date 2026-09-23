import { describe, expect, test } from "bun:test";
import {
  agentRunCancelPath,
  benchmarkRunActionPath,
  benchmarkRunPath,
  benchmarkRunResultsPath,
  conversationBlackboardPath,
  conversationDetailPath,
  conversationMessagesPath,
  isGeoGebraAssetPath,
  problemAttemptPath,
  problemDetailPath,
  problemSetProblemsPath,
} from "../backend/src/http/paths";

describe("backend http path helpers", () => {
  test("parses conversation child routes exactly", () => {
    expect(conversationDetailPath("/v1/conversations/thread%201")).toBe("thread 1");
    expect(conversationMessagesPath("/v1/conversations/thread%201/messages")).toBe("thread 1");
    expect(conversationBlackboardPath("/v1/conversations/thread%201/blackboard")).toBe("thread 1");
    expect(conversationDetailPath("/v1/conversations/thread%201/messages")).toBeUndefined();
    expect(conversationMessagesPath("/v1/conversations/thread%201/messages/extra")).toBeUndefined();
  });

  test("parses problem bank routes exactly", () => {
    expect(problemSetProblemsPath("/v1/problem-sets/cambridge%202025/problems")).toBe("cambridge 2025");
    expect(problemDetailPath("/v1/problems/prob%2F1")).toBe("prob/1");
    expect(problemAttemptPath("/v1/problems/prob%2F1/attempts")).toBe("prob/1");
    expect(problemSetProblemsPath("/v1/problem-sets/cambridge%202025")).toBeUndefined();
    expect(problemDetailPath("/v1/problems/prob%2F1/attempts")).toBeUndefined();
  });

  test("recognizes supported GeoGebra asset prefixes", () => {
    expect(isGeoGebraAssetPath("/tools/geogebra-assets-v2/deployggb.js")).toBe(true);
    expect(isGeoGebraAssetPath("/tools/geogebra-assets/deployggb.js")).toBe(true);
    expect(isGeoGebraAssetPath("/tools/geogebra-assets-v3/deployggb.js")).toBe(false);
    expect(isGeoGebraAssetPath("/v1/tools/geogebra-assets/deployggb.js")).toBe(false);
  });

  test("parses the agent-run cancellation route exactly", () => {
    expect(agentRunCancelPath("/v1/agent-runs/run%2F1/cancel")).toBe("run/1");
    expect(agentRunCancelPath("/v1/agent-runs/run-1")).toBeUndefined();
    expect(agentRunCancelPath("/v1/agent-runs/run-1/cancel/extra")).toBeUndefined();
  });

  test("parses benchmark run routes exactly", () => {
    expect(benchmarkRunPath("/v1/benchmark-runs/run%2F1")).toBe("run/1");
    expect(benchmarkRunResultsPath("/v1/benchmark-runs/run%2F1/results")).toBe("run/1");
    expect(benchmarkRunActionPath("/v1/benchmark-runs/run%2F1/complete")).toEqual({
      runId: "run/1",
      action: "complete"
    });
    expect(benchmarkRunPath("/v1/benchmark-runs/run-1/results")).toBeUndefined();
    expect(benchmarkRunActionPath("/v1/benchmark-runs/run-1/retry")).toBeUndefined();
  });
});
