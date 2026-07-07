export type ToolRequestResultRoute = {
  runId: string;
  toolCallId: string;
};

export type AgentRunWriteRoute =
  | { kind: "runner-start" }
  | { kind: "start" }
  | { kind: "runner-snapshot"; runId: string }
  | { kind: "tool-event"; runId: string }
  | { kind: "create-tool-request"; runId: string }
  | { kind: "pending-tool-requests"; runId: string }
  | { kind: "tool-result"; runId: string; toolCallId: string }
  | { kind: "finish"; runId: string }
  | { kind: "compatibility-ledger" };

export function agentRunWriteRoute(method: string, pathname: string): AgentRunWriteRoute | undefined {
  if (method === "POST" && pathname === "/v1/agent-runs/runner/start") {
    return { kind: "runner-start" };
  }
  if (method === "POST" && pathname === "/v1/agent-runs/start") {
    return { kind: "start" };
  }
  if (method === "POST" && pathname === "/v1/agent-runs") {
    return { kind: "compatibility-ledger" };
  }

  const runnerSnapshotRunId = childAgentRunPath(pathname, "runner");
  if (method === "GET" && runnerSnapshotRunId) {
    return { kind: "runner-snapshot", runId: runnerSnapshotRunId };
  }

  const pendingToolRequestsRunId = childAgentRunPath(pathname, "tool-requests/pending");
  if (method === "GET" && pendingToolRequestsRunId) {
    return { kind: "pending-tool-requests", runId: pendingToolRequestsRunId };
  }

  const toolResult = toolRequestResultPath(pathname);
  if (method === "POST" && toolResult) {
    return { kind: "tool-result", ...toolResult };
  }

  const toolEventRunId = childAgentRunPath(pathname, "tools");
  if (method === "POST" && toolEventRunId) {
    return { kind: "tool-event", runId: toolEventRunId };
  }

  const createToolRequestRunId = childAgentRunPath(pathname, "tool-requests");
  if (method === "POST" && createToolRequestRunId) {
    return { kind: "create-tool-request", runId: createToolRequestRunId };
  }

  const finishRunId = childAgentRunPath(pathname, "finish");
  if (method === "POST" && finishRunId) {
    return { kind: "finish", runId: finishRunId };
  }

  return undefined;
}

export function childAgentRunPath(pathname: string, child: string) {
  const match = pathname.match(/^\/v1\/agent-runs\/([^/]+)\/(.+)$/);
  if (!match || match[2] !== child) return undefined;
  return decodeURIComponent(match[1]);
}

export function toolRequestResultPath(pathname: string): ToolRequestResultRoute | undefined {
  const match = pathname.match(/^\/v1\/agent-runs\/([^/]+)\/tool-requests\/([^/]+)\/result$/);
  if (!match) return undefined;
  return {
    runId: decodeURIComponent(match[1]),
    toolCallId: decodeURIComponent(match[2])
  };
}

export function conversationDetailPath(pathname: string) {
  const match = pathname.match(/^\/v1\/conversations\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function conversationMessagesPath(pathname: string) {
  const match = pathname.match(/^\/v1\/conversations\/([^/]+)\/messages$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function conversationBlackboardPath(pathname: string) {
  const match = pathname.match(/^\/v1\/conversations\/([^/]+)\/blackboard$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function problemSetProblemsPath(pathname: string) {
  const match = pathname.match(/^\/v1\/problem-sets\/([^/]+)\/problems$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function problemDetailPath(pathname: string) {
  const match = pathname.match(/^\/v1\/problems\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function problemAttemptPath(pathname: string) {
  const match = pathname.match(/^\/v1\/problems\/([^/]+)\/attempts$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function isGeoGebraAssetPath(pathname: string) {
  return pathname.startsWith("/tools/geogebra-assets-v2/") || pathname.startsWith("/tools/geogebra-assets/");
}
