import { describe, expect, test } from "bun:test";
import { modelMessagesFromRun } from "../backend/src/agent/model-runner-context";

describe("model runner context", () => {
  test("replays model reasoning before a tool call", () => {
    const run = {
      prompt: "画一个圆",
      locale: "zh-CN",
      tools: [
        {
          toolCallId: "call-1",
          toolName: "executeGeoGebraCommands",
          args: { commands: ["Circle((0,0), 3)"] },
          status: "succeeded",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z"
        }
      ]
    } as never;
    const messages = modelMessagesFromRun(run, [], [
      {
        outputToolCallId: "call-1",
        reasoningText: "先确认圆心和半径，再调用 GeoGebra。"
      }
    ] as never);

    expect(messages[1]).toEqual({
      role: "assistant",
      content: [
        { type: "reasoning", text: "先确认圆心和半径，再调用 GeoGebra。" },
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "executeGeoGebraCommands",
          input: { commands: ["Circle((0,0), 3)"] }
        }
      ]
    });
  });

  test("keeps an explicit empty reasoning part for DeepSeek policy tool turns", () => {
    const run = {
      prompt: "读取画布",
      modelProvider: "deepseek",
      thinking: true,
      tools: [
        {
          toolCallId: "policy-read",
          toolName: "getCanvasContext",
          args: { includeXml: false },
          status: "succeeded",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z"
        }
      ]
    } as never;

    expect(modelMessagesFromRun(run, [])[1]).toMatchObject({
      role: "assistant",
      content: [{ type: "reasoning", text: "" }]
    });
  });
});
