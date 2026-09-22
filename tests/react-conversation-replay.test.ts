import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import type { ToolExecutionResult } from "@geochat-ai/app/geogebra-protocol";
import {
  extractCanvasReplayActions,
  replayConversationCanvas,
} from "../src/renderer-react/src/features/conversations/replay";

function assistant(parts: UIMessage["parts"]): UIMessage {
  return { id: crypto.randomUUID(), role: "assistant", parts };
}

describe("conversation canvas replay", () => {
  test("extracts completed canvas mutations in transcript order", () => {
    const messages: UIMessage[] = [assistant([
      {
        type: "tool-resetCanvas",
        toolCallId: "reset-1",
        state: "output-available",
        input: { perspective: "G" },
        output: { ok: true },
      } as never,
      {
        type: "tool-executeGeoGebraCommands",
        toolCallId: "execute-1",
        state: "output-available",
        input: { commands: ["A=(0,0)", "B=(1,0)"], perspective: "G" },
        output: { ok: true },
      } as never,
      {
        type: "tool-executeGeoGebraCommands",
        toolCallId: "execute-failed",
        state: "output-error",
        input: { commands: ["bad"] },
        errorText: "failed",
      } as never,
      {
        type: "tool-setPerspective",
        toolCallId: "perspective-1",
        state: "output-available",
        input: { mode: "T" },
        output: { ok: true },
      } as never,
      {
        type: "tool-executeGeoGebraCommands",
        toolCallId: "execute-false-success",
        state: "output-available",
        input: { commands: ["C=(2,2)"] },
        output: { ok: false, error: "provider rejected" },
      } as never,
    ])];

    expect(extractCanvasReplayActions(messages)).toEqual([
      { type: "reset", input: { perspective: "G" } },
      {
        type: "execute",
        input: { commands: ["A=(0,0)", "B=(1,0)"], perspective: "G", resetBefore: false },
        commands: ["A=(0,0)", "B=(1,0)"],
      },
      { type: "perspective", input: { mode: "T" } },
    ]);
  });

  test("does not clear the canvas for a text-only conversation", async () => {
    const calls: unknown[] = [];
    await replayConversationCanvas([], async (toolName, input) => {
      calls.push([toolName, input]);
      return { ok: true } as ToolExecutionResult;
    });
    expect(calls).toEqual([]);
  });

  test("replays intermediate resets instead of flattening all commands", async () => {
    const calls: Array<[string, unknown]> = [];
    await replayConversationCanvas([
      { type: "execute", input: {}, commands: ["A=(0,0)"] },
      { type: "reset", input: { perspective: "T" } },
      { type: "execute", input: {}, commands: ["B=(1,1)"] },
    ], async (toolName, input) => {
      calls.push([toolName, input]);
      return { ok: true } as ToolExecutionResult;
    });

    expect(calls).toEqual([
      ["resetCanvas", {}],
      ["executeGeoGebraCommands", { commands: ["A=(0,0)"], resetBefore: false, restoreOnError: true }],
      ["resetCanvas", { perspective: "T" }],
      ["executeGeoGebraCommands", { commands: ["B=(1,1)"], resetBefore: false, restoreOnError: true }],
    ]);
  });

  test("replays more than 100 commands atomically instead of splitting restore-on-error batches", async () => {
    const calls: unknown[] = [];
    await replayConversationCanvas([{
      type: "execute",
      input: {},
      commands: Array.from({ length: 101 }, (_, index) => `A${index}=(${index},0)`),
    }], async (toolName, input) => {
      calls.push([toolName, input]);
      return { ok: true } as ToolExecutionResult;
    });

    expect(calls.filter(([toolName]) => toolName === "executeGeoGebraCommands")).toHaveLength(1);
    expect(calls[1]).toEqual(["executeGeoGebraCommands", expect.objectContaining({ restoreOnError: true })]);
  });
});
