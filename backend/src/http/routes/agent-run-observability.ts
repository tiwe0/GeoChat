import { collectGeoGebraCommandUsageStats, reviewAgentRunLedger } from "@geochat-ai/app";
import {
  filterAgentErrorEventsForScope,
  filterAgentRunsForScope
} from "../agent-run-scope";
import type { BackendHttpContext } from "../context";
import { json } from "../response";
import type { DataScopeResolver } from "../scope";

export async function handleAgentRunObservabilityRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver
) {
  const agentRunRepository = context.repositories.agentRuns;

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
