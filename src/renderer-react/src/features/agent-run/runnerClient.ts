import { AgentRunCoordinatorError, type AgentRunRemoteToolRequest, type AgentRunRunnerSnapshot, type createAgentRunCoordinator } from "@geogebra-copilot/shared/client";

export async function claimRemoteTools(
  coordinator: ReturnType<typeof createAgentRunCoordinator>,
  runId: string,
  claimOwner: string,
): Promise<{ requests: AgentRunRemoteToolRequest[]; terminalRunner?: AgentRunRunnerSnapshot }> {
  try {
    return { requests: await coordinator.pendingToolRequests(runId, { claimOwner }) };
  } catch (error) {
    if (!(error instanceof AgentRunCoordinatorError) || error.code !== "run_closed") throw error;
    const runner = await coordinator.runnerSnapshot(runId);
    if (!runner || runner.run.status === "running") throw error;
    return { requests: [], terminalRunner: runner };
  }
}

/**
 * Wait for a server-side Runner notification. SSE is an optimization over
 * the durable pending-tool API: if it is unavailable, return after a short
 * delay so the controller can continue its polling fallback.
 */
export async function waitForRunnerEvent(
  coordinator: ReturnType<typeof createAgentRunCoordinator>,
  runId: string,
  signal: AbortSignal,
) {
  try {
    await coordinator.subscribeRunnerEvents(runId, {
      signal,
      stopWhen: (event) => event.event === "runner.updated" || event.event === "runner.terminal",
    });
  } catch (error) {
    if (signal.aborted) return;
    // Authentication, canvas binding, and other run-scope conflicts are real
    // failures. A 404/5xx can also mean an older backend or a transient SSE
    // transport problem, so those cases use the existing polling path.
    if (error instanceof AgentRunCoordinatorError && [401, 403, 409].includes(error.status)) throw error;
    await delay(500, signal);
  }
}

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
