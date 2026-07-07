import {
  isAgentRunRemoteToolRequest,
  type AgentRunRemoteToolRequest,
  type AgentRunRemoteToolRequestInput,
  type AgentRunRemoteToolResultInput
} from "./remote-tool";
import { isAgentRunRunnerSnapshot, type AgentRunRunnerSnapshot, type AgentRunRunnerStartInput } from "./runner";
import { isAgentRunLedgerRecord, type AgentRunFinishInput, type AgentRunLedgerRecord, type AgentRunToolRecord } from "./run-ledger";

type AgentRunCoordinatorHeaders = Headers | Record<string, string> | Array<[string, string]>;

export type AgentRunCoordinatorOptions = {
  backendBaseUrl?: string;
  fetch?: typeof fetch;
  headers?: AgentRunCoordinatorHeaders | (() => AgentRunCoordinatorHeaders | undefined);
  sqliteBusyRetryDelayMs?: number;
  sqliteBusyRetryAttempts?: number;
};

export class AgentRunCoordinatorError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly payload?: unknown;

  constructor(message: string, input: { status: number; code?: string; payload?: unknown }) {
    super(message);
    this.name = "AgentRunCoordinatorError";
    this.status = input.status;
    this.code = input.code;
    this.payload = input.payload;
  }
}

export type AgentRunToolResultResponse = {
  run?: AgentRunLedgerRecord;
  request?: AgentRunRemoteToolRequest;
  nextRequest?: AgentRunRemoteToolRequest;
  runner?: AgentRunRunnerSnapshot;
  text?: string;
};

export type AgentRunToolResultStreamOptions = {
  onTextDelta?: (text: string) => void;
  signal?: AbortSignal;
};

export function agentRunStartPayload(record: AgentRunLedgerRecord) {
  return {
    runId: record.runId,
    conversationId: record.conversationId,
    userMessageId: record.userMessageId,
    assistantMessageId: record.assistantMessageId,
    mode: record.mode,
    modelProvider: record.modelProvider,
    modelId: record.modelId,
    maxToolSteps: record.maxToolSteps ?? null,
    modelStepTimeoutMs: record.modelStepTimeoutMs ?? null,
    locale: record.locale,
    prompt: record.prompt,
    attachmentCount: record.attachmentCount,
    startedAt: record.startedAt
  };
}

export function createAgentRunCoordinator(options: AgentRunCoordinatorOptions) {
  const backendBaseUrl = options.backendBaseUrl?.replace(/\/+$/, "");
  const transport = options.fetch ?? fetch;
  const sqliteBusyRetryAttempts = Math.max(1, options.sqliteBusyRetryAttempts ?? 5);
  const sqliteBusyRetryDelayMs = Math.max(0, options.sqliteBusyRetryDelayMs ?? 120);

  function requestHeaders(body?: unknown) {
    const dynamicHeaders = typeof options.headers === "function" ? options.headers() : options.headers;
    return {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headersRecord(dynamicHeaders)
    };
  }

  async function request(path: string, body?: unknown) {
    if (!backendBaseUrl) return undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < sqliteBusyRetryAttempts; attempt += 1) {
      const response = await transport(`${backendBaseUrl}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: requestHeaders(body),
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await readResponsePayload(response);
      if (response.ok) {
        return payload as {
          run?: AgentRunLedgerRecord;
          runs?: AgentRunLedgerRecord[];
          request?: AgentRunRemoteToolRequest;
          nextRequest?: AgentRunRemoteToolRequest;
          requests?: AgentRunRemoteToolRequest[];
          runner?: AgentRunRunnerSnapshot;
          text?: string;
        } | undefined;
      }
      lastError = coordinatorErrorFromPayload(response.status, payload);
      if (!isSqliteBusyError(lastError) || attempt === sqliteBusyRetryAttempts - 1) break;
      await sleep(sqliteBusyRetryDelayMs * (attempt + 1));
    }
    throw lastError;
  }

  return {
    async list() {
      const payload = await request("/v1/agent-runs");
      return validAgentRuns(payload?.runs);
    },
    async activeRunnerSnapshots() {
      const payload = await request("/v1/agent-runs");
      const activeRuns = validAgentRuns(payload?.runs).filter((run) => run.status === "running");
      const snapshots = await Promise.all(
        activeRuns.map(async (run) => {
          const snapshotPayload = await request(`/v1/agent-runs/${encodeURIComponent(run.runId)}/runner`).catch(() => undefined);
          return snapshotPayload?.runner;
        })
      );
      return snapshots.filter(isAgentRunRunnerSnapshot);
    },
    async start(record: AgentRunLedgerRecord) {
      const payload = await request("/v1/agent-runs/start", agentRunStartPayload(record));
      return validAgentRun(payload?.run) ?? record;
    },
    async recordTool(runId: string, tool: AgentRunToolRecord) {
      const payload = await request(`/v1/agent-runs/${encodeURIComponent(runId)}/tools`, tool);
      return validAgentRun(payload?.run);
    },
    async finish(runId: string, input: AgentRunFinishInput) {
      const payload = await request(`/v1/agent-runs/${encodeURIComponent(runId)}/finish`, input);
      return validAgentRun(payload?.run);
    },
    async createToolRequest(runId: string, input: AgentRunRemoteToolRequestInput) {
      const payload = await request(`/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests`, input);
      return validRemoteToolRequest(payload?.request);
    },
    async pendingToolRequests(runId: string, options?: { claimOwner?: string }) {
      const claimOwner = options?.claimOwner?.trim();
      const query = claimOwner ? `?claimOwner=${encodeURIComponent(claimOwner)}` : "";
      const payload = await request(`/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/pending${query}`);
      return validRemoteToolRequests(payload?.requests);
    },
    async submitToolResult(runId: string, toolCallId: string, input: AgentRunRemoteToolResultInput) {
      const payload = await request(`/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/${encodeURIComponent(toolCallId)}/result`, input);
      return validToolResultResponse(payload);
    },
    async submitToolResultStream(runId: string, toolCallId: string, input: AgentRunRemoteToolResultInput, options?: AgentRunToolResultStreamOptions) {
      if (!backendBaseUrl) return undefined;
      const response = await transport(
        `${backendBaseUrl}/v1/agent-runs/${encodeURIComponent(runId)}/tool-requests/${encodeURIComponent(toolCallId)}/result?stream=1`,
        {
          method: "POST",
          headers: requestHeaders(input),
          body: JSON.stringify(input),
          signal: options?.signal
        }
      );
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/x-ndjson") || !response.body) {
        const payload = await readResponsePayload(response);
        if (!response.ok) throw coordinatorErrorFromPayload(response.status, payload);
        return validToolResultResponse(payload);
      }

      let doneStatus = response.status;
      let donePayload: unknown;
      for await (const event of readNdjsonEvents(response.body)) {
        if (!event || typeof event !== "object") continue;
        const payload = event as Record<string, unknown>;
        if (payload.type === "text-delta" && typeof payload.text === "string") {
          options?.onTextDelta?.(payload.text);
          continue;
        }
        if (payload.type === "done") {
          doneStatus = typeof payload.status === "number" ? payload.status : response.status;
          donePayload = payload.payload;
          continue;
        }
        if (payload.type === "error") {
          throw coordinatorErrorFromPayload(typeof payload.status === "number" ? payload.status : 500, payload);
        }
      }
      if (donePayload === undefined) {
        throw new AgentRunCoordinatorError("Agent run stream ended without a final response.", { status: 502, code: "stream_incomplete" });
      }
      if (doneStatus < 200 || doneStatus >= 300) throw coordinatorErrorFromPayload(doneStatus, donePayload);
      return validToolResultResponse(donePayload);
    },
    async startPausedRunner(input: AgentRunRunnerStartInput) {
      const payload = await request("/v1/agent-runs/runner/start", input);
      return validRunnerSnapshot(payload?.runner);
    },
    async runnerSnapshot(runId: string) {
      const payload = await request(`/v1/agent-runs/${encodeURIComponent(runId)}/runner`);
      return validRunnerSnapshot(payload?.runner);
    }
  };
}

function headersRecord(headers: AgentRunCoordinatorHeaders | undefined) {
  if (!headers) return {};
  const record: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function validAgentRun(value: unknown) {
  return isAgentRunLedgerRecord(value) ? value : undefined;
}

function validAgentRuns(value: unknown) {
  return Array.isArray(value) ? value.filter(isAgentRunLedgerRecord) : [];
}

function validRemoteToolRequest(value: unknown) {
  return isAgentRunRemoteToolRequest(value) ? value : undefined;
}

function validRemoteToolRequests(value: unknown) {
  return Array.isArray(value) ? value.filter(isAgentRunRemoteToolRequest) : [];
}

function validRunnerSnapshot(value: unknown) {
  return isAgentRunRunnerSnapshot(value) ? value : undefined;
}

function validToolResultResponse(value: unknown): AgentRunToolResultResponse | undefined {
  if (!value || typeof value !== "object") return undefined;
  const payload = value as Record<string, unknown>;
  const response: AgentRunToolResultResponse = {};
  const run = validAgentRun(payload.run);
  const request = validRemoteToolRequest(payload.request);
  const nextRequest = validRemoteToolRequest(payload.nextRequest);
  const runner = validRunnerSnapshot(payload.runner);
  if (run) response.run = run;
  if (request) response.request = request;
  if (nextRequest) response.nextRequest = nextRequest;
  if (runner) response.runner = runner;
  if (typeof payload.text === "string") response.text = payload.text;
  return Object.keys(response).length ? response : undefined;
}

async function readResponsePayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function* readNdjsonEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) yield parseNdjsonEvent(line);
        newlineIndex = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) yield parseNdjsonEvent(tail);
  } finally {
    reader.releaseLock();
  }
}

function parseNdjsonEvent(line: string) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function coordinatorErrorFromPayload(status: number, payload: unknown) {
  const code = payload && typeof payload === "object" && "error" in payload ? String((payload as { error: unknown }).error) : undefined;
  const message =
    payload && typeof payload === "object" && "message" in payload
      ? String((payload as { message: unknown }).message)
      : `Agent run coordinator request failed: ${status}`;
  return new AgentRunCoordinatorError(message, { status, code, payload });
}

function isSqliteBusyError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("database is locked");
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
