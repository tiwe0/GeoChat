import { finishAgentRunLedger, reviewAgentRunLedger } from "@geochat-ai/app/agent-run";
import { collectGeoGebraCommandUsageStats } from "@geochat-ai/app/geometry";
import {
  agentRunConversationVisibleInScope,
  filterAgentErrorEventsForScope,
  filterAgentRunsForScope
} from "../agent-run-scope";
import type { BackendHttpContext } from "../context";
import { agentRunCancelPath } from "../paths";
import { json } from "../response";
import type { DataScopeResolver } from "../scope";
import { AgentRunLedgerConflictError } from "../../db/agent-run-repository";
import { nativeRunLeaseIsActive } from "../../agent/agent-run-lifecycle";
import { resolveClientSessionId } from "../security";

export async function handleAgentRunObservabilityRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver
) {
  const agentRunRepository = context.repositories.agentRuns;

  const cancelRunId = agentRunCancelPath(url.pathname);
  if (request.method === "POST" && cancelRunId) {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const clientSessionId = resolveClientSessionId(request);
    if (!clientSessionId) {
      return json({ error: "invalid_client_session", message: "A valid client installation id is required." }, { status: 400 });
    }
    const recoveryCancellation = url.searchParams.get("source") === "recovery";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const run = await agentRunRepository.getLedger(cancelRunId);
      if (
        !run ||
        run.clientSessionId !== clientSessionId ||
        !await agentRunConversationVisibleInScope(run, dataScope.scope, context)
      ) {
        return json({ error: "not_found", message: "Agent run was not found." }, { status: 404 });
      }
      if (recoveryCancellation && nativeRunLeaseIsActive(run)) {
        return json({ error: "agent_run_active", message: "Agent run has an active continuation lease." }, { status: 409 });
      }
      if (run.status !== "running") return json({ run });

      const hasFinished = run.tools.some((tool) => tool.toolName === "setFinished" && tool.status === "succeeded");
      const cancelled = finishAgentRunLedger(
        { ...run, continuationLeaseId: null, continuationLeaseExpiresAt: null },
        hasFinished
          ? { status: "succeeded", ...(run.usage ? { usage: run.usage } : {}) }
          : { status: "cancelled", error: "Stopped by user." },
      );
      try {
        return json({ run: await agentRunRepository.compareAndSwapLedger(cancelled, run.revision) });
      } catch (error) {
        if (!(error instanceof AgentRunLedgerConflictError)) throw error;
      }
    }
    return json(
      { error: "agent_run_conflict", message: "Agent run changed while cancellation was being applied." },
      { status: 409 },
    );
  }

  if (request.method === "GET" && url.pathname === "/v1/agent-runs/recoverable") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const clientSessionId = resolveClientSessionId(request);
    if (!clientSessionId) {
      return json({ error: "invalid_client_session", message: "A valid client installation id is required." }, { status: 400 });
    }
    const now = new Date();
    const ownedRuns = await agentRunRepository.listRunningLedgersForClient(clientSessionId);
    const staleRuns = ownedRuns.filter((run) => !nativeRunLeaseIsActive(run, now));
    return json({ runs: await filterAgentRunsForScope(staleRuns, dataScope.scope, context) });
  }

  if (request.method === "GET" && url.pathname === "/v1/agent-runs") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const runs = await agentRunRepository.listLedgers(50);
    const scopedRuns = await filterAgentRunsForScope(runs, dataScope.scope, context);
    return json({
      runs: scopedRuns,
      reviews: Object.fromEntries(scopedRuns.map((run) => [run.runId, reviewAgentRunLedger(run)]))
    });
  }

  if (request.method === "GET" && url.pathname === "/v1/agent-command-usage") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get("limit") ?? 500) || 500));
    const runs = await agentRunRepository.listLedgers(limit);
    return json({
      stats: collectGeoGebraCommandUsageStats(await filterAgentRunsForScope(runs, dataScope.scope, context))
    });
  }

  if (request.method === "GET" && url.pathname === "/v1/agent-error-events") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const runId = url.searchParams.get("runId");
    const conversationId = url.searchParams.get("conversationId");
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));
    const rows = await agentRunRepository.listErrorEvents({ runId, conversationId, limit });
    return json({
      events: await filterAgentErrorEventsForScope(rows, dataScope.scope, context)
    });
  }

  return undefined;
}
