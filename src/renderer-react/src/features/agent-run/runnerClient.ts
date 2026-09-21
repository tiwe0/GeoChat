import { AgentRunCoordinatorError, type AgentRunRemoteToolRequest, type AgentRunRunnerSnapshot, type createAgentRunCoordinator } from "@geochat-ai/app/client";

export async function claimRemoteTools(
  coordinator: ReturnType<typeof createAgentRunCoordinator>,
  runId: string,
  claimOwner: string,
): Promise<{ requests: AgentRunRemoteToolRequest[]; terminalRunner?: AgentRunRunnerSnapshot }> {
  try {
    return { requests: await coordinator.pendingToolRequests(runId, { claimOwner }) };
  } catch (error) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/features/agent-run/runnerClient.ts:10", error);
    if (!(error instanceof AgentRunCoordinatorError) || error.code !== "run_closed") throw error;
    const runner = await coordinator.runnerSnapshot(runId);
    if (!runner || runner.run.status === "running") throw error;
    return { requests: [], terminalRunner: runner };
  }
}

/**
 * Pause between polls of the durable pending-tool API.
 *
 * The hosted build subscribed to a server-sent runner event stream and treated
 * this delay as the fallback when that stream was unavailable. The local
 * backend exposes no such stream, so the fallback is the whole mechanism:
 * claimRemoteTools is already the source of truth, and this only decides how
 * often the controller asks it.
 */
export async function waitForRunnerEvent(signal: AbortSignal) {
  await delay(POLL_INTERVAL_MS, signal);
}

const POLL_INTERVAL_MS = 500;

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
