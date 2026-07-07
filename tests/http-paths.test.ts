import { describe, expect, test } from "bun:test";
import {
  agentRunWriteRoute,
  childAgentRunPath,
  conversationBlackboardPath,
  conversationDetailPath,
  conversationMessagesPath,
  isGeoGebraAssetPath,
  problemAttemptPath,
  problemDetailPath,
  problemSetProblemsPath,
  toolRequestResultPath
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

  test("parses agent run child routes exactly", () => {
    expect(childAgentRunPath("/v1/agent-runs/run%201/runner", "runner")).toBe("run 1");
    expect(childAgentRunPath("/v1/agent-runs/run%201/tool-requests/pending", "tool-requests/pending")).toBe("run 1");
    expect(childAgentRunPath("/v1/agent-runs/run%201/tool-requests", "runner")).toBeUndefined();
    expect(toolRequestResultPath("/v1/agent-runs/run%201/tool-requests/call%2F1/result")).toEqual({
      runId: "run 1",
      toolCallId: "call/1"
    });
    expect(toolRequestResultPath("/v1/agent-runs/run%201/tool-requests/call%2F1")).toBeUndefined();
  });

  test("classifies agent run write routes exactly", () => {
    expect(agentRunWriteRoute("POST", "/v1/agent-runs/runner/start")).toEqual({ kind: "runner-start" });
    expect(agentRunWriteRoute("POST", "/v1/agent-runs/start")).toEqual({ kind: "start" });
    expect(agentRunWriteRoute("POST", "/v1/agent-runs")).toEqual({ kind: "compatibility-ledger" });
    expect(agentRunWriteRoute("GET", "/v1/agent-runs/run%201/runner")).toEqual({
      kind: "runner-snapshot",
      runId: "run 1"
    });
    expect(agentRunWriteRoute("POST", "/v1/agent-runs/run%201/tools")).toEqual({
      kind: "tool-event",
      runId: "run 1"
    });
    expect(agentRunWriteRoute("POST", "/v1/agent-runs/run%201/tool-requests")).toEqual({
      kind: "create-tool-request",
      runId: "run 1"
    });
    expect(agentRunWriteRoute("GET", "/v1/agent-runs/run%201/tool-requests/pending")).toEqual({
      kind: "pending-tool-requests",
      runId: "run 1"
    });
    expect(agentRunWriteRoute("POST", "/v1/agent-runs/run%201/tool-requests/call%2F1/result")).toEqual({
      kind: "tool-result",
      runId: "run 1",
      toolCallId: "call/1"
    });
    expect(agentRunWriteRoute("POST", "/v1/agent-runs/run%201/finish")).toEqual({
      kind: "finish",
      runId: "run 1"
    });
    expect(agentRunWriteRoute("GET", "/v1/agent-runs")).toBeUndefined();
    expect(agentRunWriteRoute("POST", "/v1/agent-runs/run%201/tool-requests/pending")).toBeUndefined();
    expect(agentRunWriteRoute("POST", "/v1/agent-runs/run%201/tool-requests/call%2F1")).toBeUndefined();
  });

  test("recognizes supported GeoGebra asset prefixes", () => {
    expect(isGeoGebraAssetPath("/tools/geogebra-assets-v2/deployggb.js")).toBe(true);
    expect(isGeoGebraAssetPath("/tools/geogebra-assets/deployggb.js")).toBe(true);
    expect(isGeoGebraAssetPath("/tools/geogebra-assets-v3/deployggb.js")).toBe(false);
    expect(isGeoGebraAssetPath("/v1/tools/geogebra-assets/deployggb.js")).toBe(false);
  });
});
