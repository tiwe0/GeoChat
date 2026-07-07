import { describe, expect, test } from "bun:test";
import {
  createAgentRunLedger,
  finishAgentRunLedger,
  upsertAgentRunTool
} from "@geochat-ai/app";
import {
  readAgentRunStartPayload,
  remoteToolClaimOwner,
  remoteToolLeaseMsFor,
  validateAgentRunDates
} from "../backend/src/http/routes/agent-run-write-request";

function createRun() {
  return createAgentRunLedger({
    runId: `write-request-${crypto.randomUUID()}`,
    conversationId: "conversation-1",
    mode: "ai-sdk",
    model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
    prompt: "画一个圆",
    attachmentCount: 0,
    startedAt: "2026-06-06T00:00:00.000Z"
  });
}

function createStartPayload() {
  return {
    runId: `write-request-start-${crypto.randomUUID()}`,
    conversationId: "conversation-1",
    mode: "ai-sdk" as const,
    modelProvider: "openai",
    modelId: "gpt-5.5",
    prompt: "画一个圆",
    attachmentCount: 0,
    startedAt: "2026-06-06T00:00:00.000Z"
  };
}

function jsonRequest(payload: unknown) {
  return new Request("http://127.0.0.1/v1/agent-runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
  });
}

async function errorPayload(response: Response | undefined) {
  expect(response).toBeDefined();
  return {
    status: response?.status,
    body: await response?.json()
  };
}

describe("agent run write request helpers", () => {
  test("normalizes remote tool claim owners", () => {
    expect(remoteToolClaimOwner(new URL("http://127.0.0.1/v1/runs"), "desktop-renderer")).toBe("desktop-renderer");
    expect(remoteToolClaimOwner(new URL("http://127.0.0.1/v1/runs?claimOwner=%20renderer-a%20"), "desktop-renderer")).toBe("renderer-a");
    expect(remoteToolClaimOwner(new URL("http://127.0.0.1/v1/runs?claimOwner=%20%20"), "desktop-renderer")).toBe("desktop-renderer");
  });

  test("uses test lease overrides only in test mode", () => {
    const url = new URL("http://127.0.0.1/v1/runs?testLeaseMs=0");
    expect(remoteToolLeaseMsFor(url, 30_000, "test")).toBe(0);
    expect(remoteToolLeaseMsFor(url, 30_000, "production")).toBe(30_000);
    expect(remoteToolLeaseMsFor(new URL("http://127.0.0.1/v1/runs?testLeaseMs=-1"), 30_000, "test")).toBe(30_000);
    expect(remoteToolLeaseMsFor(new URL("http://127.0.0.1/v1/runs?testLeaseMs=nope"), 30_000, "test")).toBe(30_000);
  });

  test("reads valid agent run start payloads", async () => {
    const payload = createStartPayload();
    const result = await readAgentRunStartPayload(jsonRequest(payload));

    if ("response" in result) {
      throw new Error("Expected valid start payload to pass.");
    }
    expect(result.payload).toEqual(payload);
  });

  test("returns stable invalid request responses for bad payloads", async () => {
    const result = await readAgentRunStartPayload(jsonRequest({ runId: "missing-fields" }));

    if ("payload" in result) {
      throw new Error("Expected invalid start payload to fail.");
    }
    await expect(errorPayload(result.response)).resolves.toEqual({
      status: 400,
      body: { error: "invalid_request", message: "Invalid agent run start payload." }
    });
  });

  test("treats malformed JSON as an invalid write payload", async () => {
    const result = await readAgentRunStartPayload(jsonRequest("{"));

    if ("payload" in result) {
      throw new Error("Expected malformed JSON to fail.");
    }
    await expect(errorPayload(result.response)).resolves.toEqual({
      status: 400,
      body: { error: "invalid_request", message: "Invalid agent run start payload." }
    });
  });

  test("validates durable agent run timestamps before route writes", async () => {
    expect(validateAgentRunDates(createRun())).toBeUndefined();

    await expect(errorPayload(validateAgentRunDates({ ...createRun(), startedAt: "not-a-date" }))).resolves.toEqual({
      status: 400,
      body: { error: "invalid_request", message: "Agent run startedAt must be a valid date string." }
    });

    await expect(errorPayload(validateAgentRunDates({ ...createRun(), completedAt: "not-a-date" }))).resolves.toEqual({
      status: 400,
      body: { error: "invalid_request", message: "Agent run completedAt must be a valid date string." }
    });

    const runWithBadToolDate = upsertAgentRunTool(createRun(), {
      toolCallId: "read-canvas",
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { objects: [] } },
      startedAt: "not-a-date",
      completedAt: "2026-06-06T00:00:01.000Z"
    });
    await expect(errorPayload(validateAgentRunDates(runWithBadToolDate))).resolves.toEqual({
      status: 400,
      body: { error: "invalid_request", message: "Agent run tool timestamps must be valid date strings." }
    });

    const terminalRunWithRunningTool = finishAgentRunLedger(
      upsertAgentRunTool(createRun(), {
        toolCallId: "read-canvas",
        toolName: "getCanvasContext",
        status: "running",
        args: { includeXml: false },
        startedAt: "2026-06-06T00:00:01.000Z"
      }),
      {
        status: "failed",
        error: "manual stop",
        completedAt: "2026-06-06T00:00:02.000Z"
      }
    );
    await expect(errorPayload(validateAgentRunDates(terminalRunWithRunningTool))).resolves.toEqual({
      status: 400,
      body: { error: "invalid_request", message: "Finished agent runs cannot contain running tools." }
    });
  });
});
