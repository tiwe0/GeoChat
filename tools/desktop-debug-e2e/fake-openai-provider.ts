const MODEL_ID = "geochat-deterministic-e2e";
const TOOL_CALL_ID = "geochat-e2e-tool-1";
const FINAL_TEXT = "Deterministic desktop E2E completed.";
const SKILL_POLICY_MARKER = "【Agent Skill 策略】";

type FakeProviderState = {
  requests: Array<{
    path: string;
    authorizationPresent: boolean;
    messageRoles: string[];
    skillPolicyPresent: boolean;
    responseKind: "tool_call" | "final" | "models";
  }>;
};

export type DeterministicFakeProvider = {
  baseUrl: string;
  model: string;
  finalText: string;
  state: FakeProviderState;
  stop: () => void;
};

export function createDeterministicProviderHandler(state: FakeProviderState) {
  return async function fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/v1/models") {
      state.requests.push({
        path: url.pathname,
        authorizationPresent: request.headers.has("authorization"),
        messageRoles: [],
        skillPolicyPresent: false,
        responseKind: "models",
      });
      return Response.json({ object: "list", data: [{ id: MODEL_ID, object: "model" }] });
    }
    if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
      return Response.json({ error: { message: "Not found" } }, { status: 404 });
    }
    const body = await request.json() as { messages?: Array<{ role?: unknown; content?: unknown }> };
    const messageRoles = Array.isArray(body.messages)
      ? body.messages.flatMap((message) => typeof message.role === "string" ? [message.role] : [])
      : [];
    const hasToolResult = messageRoles.includes("tool");
    state.requests.push({
      path: url.pathname,
      authorizationPresent: request.headers.has("authorization"),
      messageRoles,
      skillPolicyPresent: body.messages?.some((message) => (
        message.role === "user" && contentIncludes(message.content, SKILL_POLICY_MARKER)
      )) ?? false,
      responseKind: hasToolResult ? "final" : "tool_call",
    });
    return openAiEventStream(hasToolResult ? finalChunks() : toolCallChunks());
  };
}

function contentIncludes(content: unknown, marker: string): boolean {
  if (typeof content === "string") return content.includes(marker);
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    if (!part || typeof part !== "object") return false;
    const text = (part as { text?: unknown }).text;
    return typeof text === "string" && text.includes(marker);
  });
}

export function startDeterministicFakeProvider(port = 0): DeterministicFakeProvider {
  const state: FakeProviderState = { requests: [] };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: createDeterministicProviderHandler(state),
  });
  return {
    baseUrl: `http://127.0.0.1:${server.port}/v1`,
    model: MODEL_ID,
    finalText: FINAL_TEXT,
    state,
    stop: () => server.stop(true),
  };
}

function toolCallChunks() {
  return [
    completionChunk({
      role: "assistant",
      tool_calls: [{
        index: 0,
        id: TOOL_CALL_ID,
        type: "function",
        function: {
          name: "executeGeoGebraCommands",
          arguments: JSON.stringify({
            commands: ["A=(1,2)"],
            resetBefore: true,
            restoreOnError: true,
          }),
        },
      }],
    }, null),
    completionChunk({}, "tool_calls"),
  ];
}

function finalChunks() {
  return [
    completionChunk({ role: "assistant", content: FINAL_TEXT }, null),
    completionChunk({}, "stop"),
  ];
}

function completionChunk(delta: Record<string, unknown>, finishReason: string | null) {
  return {
    id: "chatcmpl-geochat-e2e",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: MODEL_ID,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...(finishReason ? {
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    } : {}),
  };
}

function openAiEventStream(chunks: readonly Record<string, unknown>[]) {
  const body = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
