import { describe, expect, test } from "bun:test";
import {
  assistantToolStatus,
  collectAssistantProcess,
  formatToolPayload,
  shouldExpandAssistantProcess,
  summarizeToolInput,
} from "../src/renderer-react/src/features/chat/assistantProcess";

const isDisplayTool = (part: unknown) => (
  Boolean(part) && typeof part === "object" && (part as { type?: string }).type === "tool-showSolutionSteps"
);

describe("assistant process grouping", () => {
  test("groups reasoning and operational tools but leaves answer cards visible", () => {
    const process = collectAssistantProcess([
      { type: "reasoning", text: "先读取画板" },
      { type: "tool-getCanvasContext", state: "output-available", input: {} },
      { type: "tool-showSolutionSteps", state: "output-available", output: { title: "步骤" } },
      { type: "text", text: "构造已经完成。" },
    ], isDisplayTool);

    expect(process?.entries.map(({ index }) => index)).toEqual([0, 1]);
    expect(process?.reasoningCount).toBe(1);
    expect(process?.toolCount).toBe(1);
    expect(process?.hasFinalContent).toBe(true);
  });

  test("keeps failed process evidence identifiable when there is no answer", () => {
    const process = collectAssistantProcess([
      { type: "tool-executeGeoGebraCommands", state: "output-error", errorText: "timeout" },
    ], isDisplayTool);

    expect(process?.hasFailure).toBe(true);
    expect(process?.hasFinalContent).toBe(false);
    expect(assistantToolStatus(process!.entries[0].part)).toBe("failed");
    expect(shouldExpandAssistantProcess(process!, false)).toBe(true);
  });

  test("expands while running and collapses a successful process after the final answer", () => {
    const process = collectAssistantProcess([
      { type: "reasoning", text: "先构造圆心" },
      { type: "tool-executeGeoGebraCommands", state: "output-available", input: { commands: ["c=Circle((0,0),3)"] } },
      { type: "text", text: "圆已经画好。" },
    ], isDisplayTool)!;

    expect(shouldExpandAssistantProcess(process, true)).toBe(true);
    expect(shouldExpandAssistantProcess(process, false)).toBe(false);
  });

  test("shows compact safe argument previews and omits binary payloads", () => {
    expect(summarizeToolInput({ commands: ["A=(0,0)", "B=(1,0)"] })).toBe("commands: 2");
    expect(formatToolPayload({ imageData: "abc", query: "circle" })).toContain("[content omitted]");
  });
});
