import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  assistantToolStatus,
  collectAssistantProcessRuns,
  formatToolPayload,
  shouldExpandAssistantProcess,
  summarizeToolInput,
} from "../src/renderer-react/src/features/chat/assistantProcess";

const isDisplayTool = (part: unknown) => (
  Boolean(part) && typeof part === "object" && (part as { type?: string }).type === "tool-showSolutionSteps"
);

describe("assistant process grouping", () => {
  test("keeps the spinner on the active tool row instead of the process header", () => {
    const source = readFileSync(
      new URL("../src/renderer-react/src/components/AssistantProcess.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('if (status === "running") return <CircularProgress');
    expect(source).toContain("<ToolStatusIcon status={status} />");
    expect(source).not.toContain("active ? <CircularProgress");
    expect(source).toContain("process.reasoningCount > 0");
  });

  test("groups reasoning and operational tools but leaves answer cards visible", () => {
    const [process] = collectAssistantProcessRuns([
      { type: "reasoning", text: "先读取画板" },
      { type: "tool-getCanvasContext", state: "output-available", input: {} },
      { type: "tool-showSolutionSteps", state: "output-available", output: { title: "步骤" } },
      { type: "text", text: "构造已经完成。" },
    ], isDisplayTool);

    expect(process.entries.map(({ index }) => index)).toEqual([0, 1]);
    expect(process.reasoningCount).toBe(1);
    expect(process.toolCount).toBe(1);
    expect(process.hasFinalContent).toBe(true);
  });

  test("keeps failed process evidence identifiable when there is no answer", () => {
    const [process] = collectAssistantProcessRuns([
      { type: "tool-executeGeoGebraCommands", state: "output-error", errorText: "timeout" },
    ], isDisplayTool);

    expect(process.hasFailure).toBe(true);
    expect(process.hasFinalContent).toBe(false);
    expect(assistantToolStatus(process.entries[0].part)).toBe("failed");
    expect(shouldExpandAssistantProcess(process, false)).toBe(true);
  });

  test("expands while running and collapses a successful process after the final answer", () => {
    const [process] = collectAssistantProcessRuns([
      { type: "reasoning", text: "先构造圆心" },
      { type: "tool-executeGeoGebraCommands", state: "output-available", input: { commands: ["c=Circle((0,0),3)"] } },
      { type: "text", text: "圆已经画好。" },
    ], isDisplayTool);

    expect(shouldExpandAssistantProcess(process, true)).toBe(true);
    expect(shouldExpandAssistantProcess(process, false)).toBe(false);
  });

  test("keeps later tool runs at their original positions after visible text", () => {
    const runs = collectAssistantProcessRuns([
      { type: "reasoning", text: "先检查画板" },
      { type: "tool-getCanvasContext", state: "output-available" },
      { type: "text", text: "检查完成。" },
      { type: "tool-executeGeoGebraCommands", state: "output-available" },
      { type: "text", text: "作图完成。" },
    ], isDisplayTool);

    expect(runs.map((run) => ({
      firstIndex: run.firstIndex,
      indexes: run.entries.map(({ index }) => index),
    }))).toEqual([
      { firstIndex: 0, indexes: [0, 1] },
      { firstIndex: 3, indexes: [3] },
    ]);
    expect(runs.every((run) => run.hasFinalContent)).toBe(true);
  });

  test("keeps display tools inline as process-run boundaries", () => {
    const runs = collectAssistantProcessRuns([
      { type: "tool-getCanvasContext", state: "output-available" },
      { type: "tool-showSolutionSteps", state: "output-available" },
      { type: "tool-executeGeoGebraCommands", state: "output-available" },
    ], isDisplayTool);

    expect(runs.map((run) => run.entries.map(({ index }) => index))).toEqual([[0], [2]]);
    expect(runs[0].hasFinalContent).toBe(true);
    expect(runs[1].hasFinalContent).toBe(false);
  });

  test("ignored tool-result echoes do not move or split process runs", () => {
    const runs = collectAssistantProcessRuns([
      { type: "tool-getCanvasContext", state: "output-available" },
      { type: "text", text: "{\"ok\":true}" },
      { type: "tool-executeGeoGebraCommands", state: "output-available" },
    ], isDisplayTool, (_part, index) => index === 1);

    expect(runs.map((run) => run.entries.map(({ index }) => index))).toEqual([[0, 2]]);
    expect(runs[0].hasFinalContent).toBe(false);
  });

  test("shows compact safe argument previews and omits binary payloads", () => {
    expect(summarizeToolInput({ commands: ["A=(0,0)", "B=(1,0)"] })).toBe("commands: 2");
    expect(formatToolPayload({ imageData: "abc", query: "circle" })).toContain("[content omitted]");
  });
});
