import {
  isAgentRunFinishInput,
  isAgentRunLedgerRecord,
  isAgentRunRemoteToolRequestInput,
  isAgentRunRemoteToolResultInput,
  isAgentRunRunnerStartInput,
  isAgentRunStartInput,
  isAgentRunTimestamp,
  isAgentRunToolRecord,
  type AgentRunFinishInput,
  type AgentRunLedgerRecord,
  type AgentRunRemoteToolRequestInput,
  type AgentRunRemoteToolResultInput,
  type AgentRunRunnerStartInput,
  type AgentRunStartInput,
  type AgentRunToolRecord
} from "@geochat-ai/app";
import { json, readJson } from "../response";

export type AgentRunWritePayloadResult<T> =
  | { payload: T }
  | { response: Response };

export async function readAgentRunWritePayload<T>(
  request: Request,
  isValid: (payload: unknown) => payload is T,
  invalidMessage: string
): Promise<AgentRunWritePayloadResult<T>> {
  const payload = await readJson(request);
  if (!isValid(payload)) {
    return {
      response: json({ error: "invalid_request", message: invalidMessage }, { status: 400 })
    };
  }
  return { payload };
}

export function readAgentRunnerStartPayload(request: Request) {
  return readAgentRunWritePayload<AgentRunRunnerStartInput>(
    request,
    isAgentRunRunnerStartInput,
    "Invalid agent runner start payload."
  );
}

export function readAgentRunStartPayload(request: Request) {
  return readAgentRunWritePayload<AgentRunStartInput>(
    request,
    isAgentRunStartInput,
    "Invalid agent run start payload."
  );
}

export function readAgentRunToolPayload(request: Request) {
  return readAgentRunWritePayload<AgentRunToolRecord>(
    request,
    isAgentRunToolRecord,
    "Invalid agent run tool payload."
  );
}

export function readRemoteToolRequestPayload(request: Request) {
  return readAgentRunWritePayload<AgentRunRemoteToolRequestInput>(
    request,
    isAgentRunRemoteToolRequestInput,
    "Invalid remote tool request payload."
  );
}

export function readRemoteToolResultPayload(request: Request) {
  return readAgentRunWritePayload<AgentRunRemoteToolResultInput>(
    request,
    isAgentRunRemoteToolResultInput,
    "Invalid remote tool result payload."
  );
}

export function readAgentRunFinishPayload(request: Request) {
  return readAgentRunWritePayload<AgentRunFinishInput>(
    request,
    isAgentRunFinishInput,
    "Invalid agent run finish payload."
  );
}

export function readCompatibilityLedgerPayload(request: Request) {
  return readAgentRunWritePayload<AgentRunLedgerRecord>(
    request,
    isAgentRunLedgerRecord,
    "Invalid agent run ledger payload."
  );
}

export function remoteToolClaimOwner(url: URL, defaultRemoteToolClaimOwner: string) {
  const value = url.searchParams.get("claimOwner")?.trim();
  return value || defaultRemoteToolClaimOwner;
}

export function remoteToolLeaseMsFor(
  url: URL,
  remoteToolLeaseMs: number,
  nodeEnv = Bun.env.NODE_ENV
) {
  if (nodeEnv !== "test") return remoteToolLeaseMs;
  const param = url.searchParams.get("testLeaseMs");
  if (param === null) return remoteToolLeaseMs;
  const value = Number(param);
  return Number.isFinite(value) && value >= 0 ? value : remoteToolLeaseMs;
}

export function validateAgentRunDates(record: AgentRunLedgerRecord) {
  if (!isAgentRunTimestamp(record.startedAt)) {
    return json({ error: "invalid_request", message: "Agent run startedAt must be a valid date string." }, { status: 400 });
  }
  if (record.completedAt && !isAgentRunTimestamp(record.completedAt)) {
    return json({ error: "invalid_request", message: "Agent run completedAt must be a valid date string." }, { status: 400 });
  }
  for (const tool of record.tools) {
    if (!isAgentRunTimestamp(tool.startedAt) || (tool.completedAt && !isAgentRunTimestamp(tool.completedAt))) {
      return json({ error: "invalid_request", message: "Agent run tool timestamps must be valid date strings." }, { status: 400 });
    }
    if (record.status !== "running" && tool.status === "running") {
      return json({ error: "invalid_request", message: "Finished agent runs cannot contain running tools." }, { status: 400 });
    }
  }
  return undefined;
}
