import {
  type AgentRunLedgerRecord,
  type AgentRunRemoteToolRequest
} from "@geochat-ai/app";
import type { AgentRunRunnerSnapshotService } from "./agent-run-runner-snapshots";

export type RunnerContinuationOutcome = {
  status: 200 | 400 | 409 | 502;
  body: Record<string, unknown>;
};

type RunnerCommitView = {
  run: AgentRunLedgerRecord;
  request?: AgentRunRemoteToolRequest;
  nextRequest?: AgentRunRemoteToolRequest;
};

export async function committedRunnerOutcome(input: {
  status: RunnerContinuationOutcome["status"];
  commit: RunnerCommitView;
  snapshots: AgentRunRunnerSnapshotService;
  responseRequest?: AgentRunRemoteToolRequest;
  error?: string;
  message?: string | null;
  text?: string;
  includeNextRequest?: boolean;
}): Promise<RunnerContinuationOutcome> {
  const body: Record<string, unknown> = {
    run: input.commit.run,
    request: input.commit.request ?? input.responseRequest,
    runner: await input.snapshots.snapshot(input.commit.run)
  };
  if (input.error !== undefined) body.error = input.error;
  if (input.message !== undefined) body.message = input.message;
  if (input.text !== undefined) body.text = input.text;
  if (input.includeNextRequest) body.nextRequest = input.commit.nextRequest;
  return {
    status: input.status,
    body
  };
}

export async function currentRemoteToolTerminalOutcome(input: {
  run: AgentRunLedgerRecord;
  request: AgentRunRemoteToolRequest;
  snapshots: AgentRunRunnerSnapshotService;
}): Promise<RunnerContinuationOutcome> {
  return {
    status: 200,
    body: {
      run: input.run,
      request: input.request,
      runner: await input.snapshots.snapshot(input.run)
    }
  };
}

export async function remoteToolCommitConflictOutcome(input: {
  request?: AgentRunRemoteToolRequest;
  run?: AgentRunLedgerRecord | null;
  snapshots: AgentRunRunnerSnapshotService;
}): Promise<RunnerContinuationOutcome> {
  return {
    status: 409,
    body: {
      error: "tool_request_state_changed",
      message: "Remote tool request changed before the result could be committed.",
      request: input.request,
      runner: input.run ? await input.snapshots.snapshot(input.run) : undefined
    }
  };
}
