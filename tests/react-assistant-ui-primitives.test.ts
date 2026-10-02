import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assistantUiToolStatus,
  formatToolPayload,
  isGeoChatDisplayToolName,
  summarizeToolInput,
} from "../src/renderer-react/src/features/assistant-ui/toolPresentation";

const root = join(import.meta.dir, "../src/renderer-react/src/features/assistant-ui");

describe("assistant-ui shared primitives", () => {
  test("owns tool presentation without invoking or resuming tools", () => {
    expect(assistantUiToolStatus({ type: "running" })).toBe("running");
    expect(assistantUiToolStatus({ type: "complete" })).toBe("done");
    expect(assistantUiToolStatus({ type: "incomplete", reason: "error", error: "failed" })).toBe("failed");
    expect(assistantUiToolStatus({ type: "complete" }, true)).toBe("failed");
    expect(isGeoChatDisplayToolName("showSolutionSteps")).toBe(true);
    expect(isGeoChatDisplayToolName("executeGeoGebraCommands")).toBe(false);
    expect(summarizeToolInput({ commands: ["A=(0,0)", "B=(1,0)"] })).toBe("commands: 2");
    expect(formatToolPayload({ imageData: "abc", query: "circle" })).toContain("[content omitted]");
  });

  test("delegates all message content to GroupedParts children and shared renderers", () => {
    const source = readFileSync(join(root, "GeoChatMessageParts.tsx"), "utf8");
    expect(source).toContain('from "@assistant-ui/react"');
    expect(source).toContain("<MessagePrimitive.GroupedParts");
    expect(source).toContain("groupBy={GROUP_ASSISTANT_PROCESS_PARTS}");
    expect(source).toContain("{({ part, children }) => {");
    expect(source).toContain("<MessagePrimitive.Error>");
    expect(source).toContain("StaticMessageMarkdown");
    expect(source).toContain("AgentDisplayToolResult");
    expect(source).toContain('part.type === "group-process"');
    expect(source).toContain('part.type === "group-reasoning"');
    expect(source).toContain('part.type === "group-tools"');
    expect(source).toContain('part.type === "source"');
    expect(source).toContain('part.type === "tool-call"');
    expect(source).not.toContain("<MessagePrimitive.Parts");
    expect(source).not.toContain("../chat/assistantProcess");
    expect(source).not.toContain("AssistantProcessCard");
    expect(source).not.toContain("addResult(");
    expect(source).not.toContain("resume(");
  });

  test("keeps display tool leaves outside the grouped process card", () => {
    const source = readFileSync(join(root, "GeoChatMessageParts.tsx"), "utf8");
    expect(source).toContain("GEOCHAT_DISPLAY_TOOL_NAMES.map");
    expect(source).toContain("[`tool-call:${name}`, [] as const]");
    expect(source).toContain("return showDisplayTools ? <GeoChatDisplayToolPart {...part} /> : <></>");
    expect(source).toContain("<AssistantProcessGroup indices={part.indices} status={part.status}>{children}</AssistantProcessGroup>");
  });

  test("provides the shared thread with injectable styling and message filtering", () => {
    const source = readFileSync(join(root, "GeoChatThread.tsx"), "utf8");
    expect(source).toContain("<ThreadPrimitive.Root");
    expect(source).toContain("<ThreadPrimitive.Viewport");
    expect(source).toContain("<ThreadPrimitive.Messages>");
    expect(source).toContain("<AuiIf condition={(state) => state.thread.isEmpty}");
    expect(source).not.toContain("<ThreadPrimitive.Empty>");
    expect(source).not.toContain("<ThreadPrimitive.Unstable_MessageById");
    expect(source).toContain("renderMessage ? renderMessage(message) : defaultMessage(message)");
    expect(source).toContain("classNames.userMessage");
    expect(source).toContain("classNames.assistantMessage");
    expect(source).toContain('surface = "window"');
  });
});
