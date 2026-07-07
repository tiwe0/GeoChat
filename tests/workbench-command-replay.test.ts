import { describe, expect, test } from "bun:test";
import type { DesktopFunctionCall } from "@geochat-ai/app";
import {
  collectCommandsThroughToolCall,
  collectConversationReplayCommands,
  commandsFromToolCall,
  isSuccessfulReplayCall
} from "../src/renderer/src/workbench-command-replay";
import type { DesktopChatMessage } from "../src/renderer/src/workbench-types";

function executeCall(input: {
  id: string;
  commands: string[];
  ok?: boolean;
  status?: DesktopFunctionCall["status"];
  error?: string | null;
}): DesktopFunctionCall<"executeGeoGebraCommands"> {
  return {
    id: input.id,
    callId: input.id,
    toolName: "executeGeoGebraCommands",
    args: { commands: input.commands },
    status: input.status ?? "done",
    error: input.error ?? null,
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    result: {
      ok: input.ok ?? true,
      results: input.commands.map((command) => ({ command, success: input.ok ?? true }))
    }
  };
}

function message(toolCalls: DesktopFunctionCall[]): DesktopChatMessage {
  return {
    id: "message",
    role: "assistant",
    content: "",
    createdAt: "00:00",
    createdAtIso: "2026-06-26T00:00:00.000Z",
    toolCalls
  };
}

describe("workbench command replay", () => {
  test("extracts commands from execution result with args fallback", () => {
    const withResult = executeCall({ id: "a", commands: ["A = (0, 0)"] });
    const withoutResult = { ...withResult, id: "b", callId: "b", result: undefined };
    expect(commandsFromToolCall(withResult)).toEqual(["A = (0, 0)"]);
    expect(commandsFromToolCall(withoutResult)).toEqual(["A = (0, 0)"]);
  });

  test("auto conversation replay uses only successful completed command calls", () => {
    const success = executeCall({ id: "success", commands: ["A = (0, 0)"] });
    const failed = executeCall({ id: "failed", commands: ["BadCommand()"], ok: false, status: "error", error: "failed" });
    const running = executeCall({ id: "running", commands: ["B = (1, 1)"], status: "running" });
    expect(isSuccessfulReplayCall(success)).toBe(true);
    expect(isSuccessfulReplayCall(failed)).toBe(false);
    expect(isSuccessfulReplayCall(running)).toBe(false);
    expect(collectConversationReplayCommands([message([success, failed, running])])).toEqual(["A = (0, 0)"]);
  });

  test("manual replay includes successful context before the selected call", () => {
    const first = executeCall({ id: "first", commands: ["A = (0, 0)"] });
    const second = executeCall({ id: "second", commands: ["B = (1, 1)"] });
    const selected = executeCall({ id: "selected", commands: ["Segment(A, B)"], ok: false, status: "error", error: "failed" });
    expect(collectCommandsThroughToolCall([message([first, second, selected])], selected)).toEqual([
      "A = (0, 0)",
      "B = (1, 1)",
      "Segment(A, B)"
    ]);
  });
});
