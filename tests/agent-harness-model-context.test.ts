import { describe, expect, test } from "bun:test";
import type { AgentRunLedgerRecord } from "@geochat-ai/app";
import { modelMessagesFromRun } from "../backend/src/agent/model-runner-context";

function toolRecord(
  overrides: Partial<AgentRunLedgerRecord["tools"][number]> & { toolCallId: string; toolName: string }
): AgentRunLedgerRecord["tools"][number] {
  return {
    status: "succeeded",
    args: {},
    startedAt: "2026-06-06T00:00:00.000Z",
    completedAt: "2026-06-06T00:00:01.000Z",
    ...overrides
  } as AgentRunLedgerRecord["tools"][number];
}

function runWith(tools: AgentRunLedgerRecord["tools"]): AgentRunLedgerRecord {
  return { prompt: "求作三角形的外接圆。", locale: "zh-CN", tools } as AgentRunLedgerRecord;
}

/** Pulls the tool-result output for a given tool call out of the built messages. */
function outputFor(messages: ReturnType<typeof modelMessagesFromRun>, toolCallId: string) {
  for (const message of messages) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type === "tool-result" && part.toolCallId === toolCallId) return part.output;
    }
  }
  throw new Error(`no tool-result for ${toolCallId}`);
}

describe("model context assembly", () => {
  test("sends only the most recent canvas snapshot in full", () => {
    const messages = modelMessagesFromRun(
      runWith([
        toolRecord({
          toolCallId: "read-1",
          toolName: "getCanvasContext",
          canvasBefore: { objects: ["stale-before"] },
          canvasAfter: { objects: ["stale-after"] }
        }),
        toolRecord({
          toolCallId: "read-2",
          toolName: "getCanvasContext",
          canvasBefore: { objects: ["current-before"] },
          canvasAfter: { objects: ["A", "B", "C"] }
        })
      ]),
      []
    );

    const stale = outputFor(messages, "read-1");
    expect(stale.type).toBe("json");
    expect(JSON.stringify(stale)).not.toContain("stale-after");
    expect(JSON.stringify(stale)).toContain("canvasSuperseded");

    const current = outputFor(messages, "read-2");
    expect(JSON.stringify(current)).toContain("\"A\"");
  });

  test("never sends canvasBefore", () => {
    const messages = modelMessagesFromRun(
      runWith([
        toolRecord({
          toolCallId: "write-1",
          toolName: "executeGeoGebraCommands",
          canvasBefore: { objects: ["before-only-marker"] },
          canvasAfter: { objects: ["after"] }
        })
      ]),
      []
    );
    expect(JSON.stringify(messages)).not.toContain("before-only-marker");
  });

  test("promotes the current screenshot to an image part when the model reads images", () => {
    const messages = modelMessagesFromRun(
      runWith([
        toolRecord({
          toolCallId: "png-1",
          toolName: "getPNGBase64",
          result: { base64: "AAAA", mediaType: "image/png", byteEstimate: 4 }
        })
      ]),
      [],
      { supportsImages: true }
    );

    const output = outputFor(messages, "png-1");
    expect(output.type).toBe("content");
    expect(JSON.stringify(output)).toContain("image-data");
  });

  test("drops superseded screenshots and never inlines base64 as text", () => {
    const messages = modelMessagesFromRun(
      runWith([
        toolRecord({
          toolCallId: "png-old",
          toolName: "getPNGBase64",
          result: { base64: "OLDBLOB", mediaType: "image/png" }
        }),
        toolRecord({
          toolCallId: "png-new",
          toolName: "getPNGBase64",
          result: { base64: "NEWBLOB", mediaType: "image/png" }
        })
      ]),
      [],
      { supportsImages: true }
    );

    expect(JSON.stringify(messages)).not.toContain("OLDBLOB");
    expect(JSON.stringify(outputFor(messages, "png-old"))).toContain("screenshotSuperseded");
  });

  test("explains the gap instead of sending a blob to a text-only model", () => {
    const messages = modelMessagesFromRun(
      runWith([
        toolRecord({
          toolCallId: "png-1",
          toolName: "getPNGBase64",
          result: { base64: "BLOB", mediaType: "image/png" }
        })
      ]),
      [],
      { supportsImages: false }
    );

    const output = outputFor(messages, "png-1");
    expect(output.type).toBe("json");
    expect(JSON.stringify(output)).not.toContain("BLOB");
    expect(JSON.stringify(output)).toContain("screenshotUnavailable");
  });
});
