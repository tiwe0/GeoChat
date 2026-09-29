import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  assistantUiToolStatus,
  formatToolPayload,
  summarizeToolInput,
} from "../src/renderer-react/src/features/assistant-ui/toolPresentation";

const rendererRoot = join(import.meta.dir, "../src/renderer-react/src");
const messagePartsPath = join(rendererRoot, "features/assistant-ui/GeoChatMessageParts.tsx");

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("assistant-ui process grouping", () => {
  test("keeps the spinner on the active tool row instead of the process header", () => {
    const source = readFileSync(messagePartsPath, "utf8");
    expect(source).toContain('if (status === "running") return <CircularProgress');
    expect(source).toContain("<ToolStatusIcon status={status} />");
    expect(source).not.toContain("active ? <CircularProgress");
    expect(source).toContain("reasoningCount > 0");
  });

  test("groups reasoning and operational tools through GroupedParts children", () => {
    const source = readFileSync(messagePartsPath, "utf8");
    expect(source).toContain("groupPartByType");
    expect(source).toContain('reasoning: ["group-process", "group-reasoning"]');
    expect(source).toContain('"tool-call": ["group-process", "group-tools"]');
    expect(source).toContain("{({ part, children }) => {");
    expect(source).toContain("<AssistantProcessGroup indices={part.indices} status={part.status}>{children}</AssistantProcessGroup>");
    expect(source).not.toContain("collectAssistantProcessRuns");
  });

  test("keeps failed or unfinished process evidence expanded", () => {
    const source = readFileSync(messagePartsPath, "utf8");
    expect(source).toContain('const hasFailure = groupedParts.some((part) => part.status.type === "incomplete")');
    expect(source).toContain("useState(() => active || hasFailure || !hasFinalContent)");
    expect(source).toContain("if (hasFailure) setExpanded(true)");
    expect(assistantUiToolStatus({ type: "incomplete", reason: "error", error: "timeout" })).toBe("failed");
  });

  test("collapses a completed process only when later final content exists", () => {
    const source = readFileSync(messagePartsPath, "utf8");
    expect(source).toContain("const hasFinalContent = parts.some((part, index) => {");
    expect(source).toContain("if (index <= lastIndex) return false");
    expect(source).toContain("else if (wasActive.current && !active) setExpanded(!hasFinalContent)");
  });

  test("keeps display tools as process boundaries and renders them separately", () => {
    const source = readFileSync(messagePartsPath, "utf8");
    expect(source).toContain("GEOCHAT_DISPLAY_TOOL_NAMES.map");
    expect(source).toContain("[`tool-call:${name}`, [] as const]");
    expect(source).toContain("isGeoChatDisplayToolName(part.toolName)");
    expect(source).toContain("<GeoChatDisplayToolPart {...part} />");
  });

  test("shows compact safe argument previews and omits binary payloads", () => {
    expect(summarizeToolInput({ commands: ["A=(0,0)", "B=(1,0)"] })).toBe("commands: 2");
    expect(formatToolPayload({ imageData: "abc", query: "circle" })).toContain("[content omitted]");
  });

  test("keeps production sources free of the legacy assistant-process module", () => {
    const activeSources = sourceFiles(rendererRoot)
      .filter((path) => !path.endsWith("/components/AssistantProcess.tsx"))
      .filter((path) => !path.endsWith("/features/chat/assistantProcess.ts"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(activeSources).not.toContain("chat/assistantProcess");
    expect(activeSources).not.toContain("components/AssistantProcess");
    expect(activeSources).not.toContain("collectAssistantProcessRuns");
    expect(existsSync(join(rendererRoot, "components/AssistantProcess.tsx"))).toBe(false);
    expect(existsSync(join(rendererRoot, "features/chat/assistantProcess.ts"))).toBe(false);
    expect(existsSync(join(rendererRoot, "components/MessageAttachment.tsx"))).toBe(false);
    expect(existsSync(join(rendererRoot, "components/AgentToolResult.tsx"))).toBe(false);
  });
});
