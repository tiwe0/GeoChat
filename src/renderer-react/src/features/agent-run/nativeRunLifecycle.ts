import type { AgentRunThinkingEffort } from "@geochat-ai/app/contracts";
import type { BackendRuntimeSnapshot } from "@geochat-ai/app/desktop-contracts";
import { nativeRunHeaders } from "./nativeRunRequest";

export type ActiveNativeRun = { runId: string; conversationId: string };

export type NativeRunLifecycleInput = {
  apiOrigin: string;
  getAuthToken: () => string | null;
  onRestore?: (run: {
    conversationId: string;
    modelProvider: string;
    modelId: string;
    prompt: string;
    thinking: boolean;
    thinkingEffort: AgentRunThinkingEffort | null;
  }) => void;
};

type RecoverableAgentRun = {
  runId: string;
  conversationId: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  modelProvider: string;
  modelId: string;
  prompt: string;
  thinking?: boolean | null;
  thinkingEffort?: AgentRunThinkingEffort | null;
};

export class AgentRunSubmissionError extends Error {
  readonly messageAccepted: boolean;
  readonly originalError: Error;

  constructor(error: unknown, messageAccepted: boolean) {
    const originalError = error instanceof Error ? error : new Error(String(error));
    super(originalError.message, { cause: originalError });
    this.name = "AgentRunSubmissionError";
    this.messageAccepted = messageAccepted;
    this.originalError = originalError;
  }
}

export function wasAgentRunMessageAccepted(error: unknown) {
  return error instanceof AgentRunSubmissionError && error.messageAccepted;
}

export function unwrapAgentRunSubmissionError(error: unknown) {
  return error instanceof AgentRunSubmissionError ? error.originalError : error;
}

export class AgentRunSubmissionLease {
  private owner: symbol | null = null;

  tryAcquire(): symbol | null {
    if (this.owner) return null;
    const owner = Symbol("agent-run-submission");
    this.owner = owner;
    return owner;
  }

  release(owner: symbol) {
    if (this.owner === owner) this.owner = null;
  }

  invalidate() {
    this.owner = null;
  }
}

export function backendRuntimeUnavailable(runtime: BackendRuntimeSnapshot | null | undefined) {
  return runtime?.state === "exited" || runtime?.state === "unreachable" || runtime?.state === "stopped";
}

export type BackendRuntimeRecoveryAction = "interrupt" | "recover" | null;

export class BackendRuntimeRecoveryGate {
  private unavailable = false;

  observe(runtime: BackendRuntimeSnapshot): BackendRuntimeRecoveryAction {
    const unavailable = backendRuntimeUnavailable(runtime);
    if (unavailable === this.unavailable) return null;
    this.unavailable = unavailable;
    return unavailable ? "interrupt" : "recover";
  }
}

export class BackendRuntimeListener {
  private handler: ((runtime: BackendRuntimeSnapshot) => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private registration: { epoch: number; promise: Promise<void> } | null = null;
  private epoch = 0;
  private started = false;

  updateHandler(handler: (runtime: BackendRuntimeSnapshot) => void) {
    this.handler = handler;
  }

  start(subscribe: (handler: (runtime: BackendRuntimeSnapshot) => void) => Promise<() => void>) {
    if (this.started) return this.registration?.promise ?? Promise.resolve();
    this.started = true;
    const epoch = ++this.epoch;
    let subscription: Promise<() => void>;
    try {
      subscription = subscribe((runtime) => {
        if (this.started && this.epoch === epoch) this.handler?.(runtime);
      });
    } catch (error) {
      this.started = false;
      return Promise.reject(error);
    }
    const promise = subscription
      .then((unsubscribe) => {
        if (!this.started || this.epoch !== epoch) {
          unsubscribe();
          return;
        }
        this.unsubscribe = unsubscribe;
      })
      .catch((error) => {
        if (this.epoch === epoch) {
          this.started = false;
          this.registration = null;
        }
        throw error;
      })
      .finally(() => {
        if (this.registration?.epoch === epoch) this.registration = null;
      });
    this.registration = { epoch, promise };
    return promise;
  }

  notify(runtime: BackendRuntimeSnapshot) {
    if (this.started) this.handler?.(runtime);
  }

  stop() {
    this.started = false;
    this.epoch += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.registration = null;
  }
}

export function invalidateNativeRunAfterBackendLoss(input: {
  activeRunRef: { current: ActiveNativeRun | null };
  runGenerationRef: { current: number };
  submissionLease: AgentRunSubmissionLease;
}) {
  const active = input.activeRunRef.current;
  input.activeRunRef.current = null;
  input.runGenerationRef.current += 1;
  input.submissionLease.invalidate();
  return active;
}

export async function stopActiveNativeRun(
  active: ActiveNativeRun | null,
  stopChat: () => Promise<unknown>,
  terminalize: (run: ActiveNativeRun) => Promise<unknown>,
) {
  await stopChat();
  if (active) await terminalize(active);
}

export async function activateNativeRun(activeRunRef: { current: ActiveNativeRun | null }, run: ActiveNativeRun) {
  activeRunRef.current = run;
}

export async function terminalizeInterruptedNativeRun(
  active: ActiveNativeRun,
  input: NativeRunLifecycleInput,
  installationIdRef: { current: string | null },
) {
  await cancelNativeRun(active, input, installationIdRef);
}

export async function recoverInterruptedNativeRun(
  input: NativeRunLifecycleInput,
  installationIdRef: { current: string | null },
  request: typeof fetch = fetch,
  isCurrent: () => boolean = () => true,
) {
  const response = await request(new URL("/v1/agent-runs", input.apiOrigin), {
    cache: "no-store",
    headers: await nativeRunHeaders(input, installationIdRef),
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Agent run recovery failed with HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as { runs?: unknown };
  const run = parseRecoverableAgentRun(payload.runs);
  if (!run) return null;
  if (!isCurrent()) return null;
  input.onRestore?.({
    conversationId: run.conversationId,
    modelProvider: run.modelProvider,
    modelId: run.modelId,
    prompt: run.prompt,
    thinking: run.thinking === true,
    thinkingEffort: run.thinkingEffort ?? null,
  });
  if (run.status === "running") {
    await cancelNativeRun({ runId: run.runId, conversationId: run.conversationId }, input, installationIdRef, request);
  }
  if (!isCurrent()) return null;
  return run;
}

async function cancelNativeRun(
  active: ActiveNativeRun,
  input: NativeRunLifecycleInput,
  installationIdRef: { current: string | null },
  request: typeof fetch = fetch,
) {
  const headers = await nativeRunHeaders(input, installationIdRef, active.runId);
  const response = await request(
    new URL(`/v1/agent-runs/${encodeURIComponent(active.runId)}/cancel`, input.apiOrigin),
    {
      method: "POST",
      headers,
    },
  );
  if (!response.ok && response.status !== 404)
    throw new Error(`Agent run cancellation failed with HTTP ${response.status}.`);
}

function parseRecoverableAgentRun(value: unknown): RecoverableAgentRun | null {
  if (!Array.isArray(value)) return null;
  const candidate = value.find(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as Record<string, unknown>).status === "running",
  );
  if (!candidate) return null;
  const run = candidate as Record<string, unknown>;
  if (
    typeof run.runId !== "string" ||
    typeof run.conversationId !== "string" ||
    typeof run.modelProvider !== "string" ||
    typeof run.modelId !== "string" ||
    typeof run.prompt !== "string" ||
    (run.status !== "running" && run.status !== "succeeded" && run.status !== "failed" && run.status !== "cancelled")
  )
    return null;
  const effort = run.thinkingEffort;
  return {
    runId: run.runId,
    conversationId: run.conversationId,
    status: run.status,
    modelProvider: run.modelProvider,
    modelId: run.modelId,
    prompt: run.prompt,
    thinking: typeof run.thinking === "boolean" ? run.thinking : null,
    thinkingEffort: effort === "light" || effort === "standard" || effort === "extended" ? effort : null,
  };
}
