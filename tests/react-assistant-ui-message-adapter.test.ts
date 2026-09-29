import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import { convertToAssistantUiMessage } from "../src/renderer-react/src/features/assistant-ui/messageAdapter";

describe("assistant-ui message adapter", () => {
  test("projects stable user text, image, and file parts without mutating the source", () => {
    const source = {
      id: "user-1",
      role: "user",
      createdAt: "2026-09-29T08:00:00.000Z",
      parts: [
        { type: "text", text: "画出这个图" },
        { type: "file", mediaType: "image/png", filename: "figure.png", url: "data:image/png;base64,AA==" },
        { type: "file", mediaType: "application/pdf", filename: "problem.pdf", url: "data:application/pdf;base64,AA==" },
      ],
    } as unknown as UIMessage;
    const before = structuredClone(source);

    const projected = convertToAssistantUiMessage(source);

    expect(projected).toEqual({
      id: "user-1",
      role: "user",
      createdAt: new Date("2026-09-29T08:00:00.000Z"),
      content: [
        { type: "text", text: "画出这个图" },
        { type: "image", image: "data:image/png;base64,AA==", filename: "figure.png" },
        { type: "file", data: "data:application/pdf;base64,AA==", mimeType: "application/pdf", filename: "problem.pdf" },
      ],
    });
    expect(source).toEqual(before);
  });

  test("projects assistant text, reasoning, and streaming status", () => {
    const projected = convertToAssistantUiMessage({
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "先分析依赖", state: "streaming" },
        { type: "text", text: "正在构造", state: "done" },
      ],
    }, { state: "streaming" });

    expect(projected).toEqual({
      id: "assistant-1",
      role: "assistant",
      createdAt: new Date(0),
      status: { type: "running" },
      content: [
        { type: "reasoning", text: "先分析依赖", status: { type: "running" } },
        { type: "text", text: "正在构造", status: { type: "complete" } },
      ],
    });
  });

  test("projects static and dynamic tool inputs, outputs, and errors as display-only calls", () => {
    const projected = convertToAssistantUiMessage({
      id: "assistant-tools",
      role: "assistant",
      parts: [
        {
          type: "tool-executeGeoGebraCommands",
          toolCallId: "tool-1",
          state: "output-available",
          input: { commands: ["A=(0,0)"] },
          output: { created: ["A"] },
        },
        {
          type: "dynamic-tool",
          toolName: "inspectGeoGebraObjects",
          toolCallId: "tool-2",
          state: "output-error",
          input: { labels: ["A"] },
          errorText: "object unavailable",
        },
      ],
    } as unknown as UIMessage, { state: "error", error: new Error("run failed") });

    expect(projected.status).toEqual({ type: "incomplete", reason: "error", error: "run failed" });
    expect(projected.content).toEqual([
      {
        type: "tool-call",
        toolCallId: "tool-1",
        toolName: "executeGeoGebraCommands",
        args: { commands: ["A=(0,0)"] },
        argsText: '{"commands":["A=(0,0)"]}',
        result: { created: ["A"] },
      },
      {
        type: "tool-call",
        toolCallId: "tool-2",
        toolName: "inspectGeoGebraObjects",
        args: { labels: ["A"] },
        argsText: '{"labels":["A"]}',
        result: "object unavailable",
        isError: true,
      },
    ]);
  });

  test("keeps id and fallback timestamp stable across repeated projections", () => {
    const message = { id: "stable-1", role: "assistant", parts: [{ type: "text", text: "done" }] } as UIMessage;
    const first = convertToAssistantUiMessage(message);
    const second = convertToAssistantUiMessage(message);

    expect(first.id).toBe("stable-1");
    expect(second.id).toBe("stable-1");
    expect(first.createdAt?.getTime()).toBe(0);
    expect(second.createdAt?.getTime()).toBe(0);
    expect(first.status).toEqual({ type: "complete", reason: "stop" });
  });
});
