import { describe, expect, test } from "bun:test";
import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, stepCountIs, streamText, tool } from "ai";
import { createDeterministicProviderHandler } from "../tools/desktop-debug-e2e/fake-openai-provider";
import { startDeterministicFakeProvider } from "../tools/desktop-debug-e2e/fake-openai-provider";

describe("deterministic desktop E2E provider", () => {
  test("always requests one fixed GeoGebra construction before the final answer", async () => {
    const state = { requests: [] };
    const fetch = createDeterministicProviderHandler(state);
    const first = await fetch(new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer local-test" },
      body: JSON.stringify({ messages: [{ role: "user", content: "draw" }] }),
    }));
    const firstBody = await first.text();
    expect(first.headers.get("content-type")).toContain("text/event-stream");
    expect(firstBody).toContain('"name":"executeGeoGebraCommands"');
    expect(firstBody).toContain('A=(1,2)');
    expect(firstBody).toContain('"finish_reason":"tool_calls"');
    expect(state.requests[0]?.skillPolicyPresent).toBe(false);

    await fetch(new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "draw\n\n【Agent Skill 策略】transient" }] }),
    }));
    expect(state.requests[1]?.skillPolicyPresent).toBe(true);

    const second = await fetch(new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [
        { role: "user", content: "draw" },
        { role: "assistant", tool_calls: [] },
        { role: "tool", content: "ok" },
      ] }),
    }));
    const secondBody = await second.text();
    expect(secondBody).toContain("Deterministic desktop E2E completed.");
    expect(secondBody).toContain('"finish_reason":"stop"');
    expect(state.requests.map((request) => request.responseKind)).toEqual(["tool_call", "tool_call", "final"]);
  });

  test("serves a model catalog without network access", async () => {
    const state = { requests: [] };
    const response = await createDeterministicProviderHandler(state)(
      new Request("http://127.0.0.1/v1/models"),
    );
    expect(await response.json()).toEqual({
      object: "list",
      data: [{ id: "geochat-deterministic-e2e", object: "model" }],
    });
  });

  test("speaks the real AI SDK OpenAI-compatible streaming protocol", async () => {
    const provider = startDeterministicFakeProvider();
    try {
      const model = createOpenAI({ apiKey: "local-test", baseURL: provider.baseUrl }).chat(provider.model);
      const executed: unknown[] = [];
      const result = streamText({
        model,
        prompt: "Draw the deterministic point.",
        stopWhen: stepCountIs(2),
        tools: {
          executeGeoGebraCommands: tool({
            inputSchema: jsonSchema({
              type: "object",
              required: ["commands"],
              properties: { commands: { type: "array", items: { type: "string" } } },
            }),
            execute: async (input) => {
              executed.push(input);
              return { ok: true };
            },
          }),
        },
      });
      expect(await result.text).toBe(provider.finalText);
      expect(executed).toEqual([{ commands: ["A=(1,2)"], resetBefore: true, restoreOnError: true }]);
      expect(provider.state.requests.map((request) => request.responseKind)).toEqual(["tool_call", "final"]);
    } finally {
      provider.stop();
    }
  });
});
