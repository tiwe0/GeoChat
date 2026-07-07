import {
  createAgentRunLedgerFromStart,
  isAgentRunRemoteToolRequestLeaseExpired,
  isTerminalAgentRunStatus
} from "@geochat-ai/app";
import { createAgentRunWriteController } from "../controllers/agent-run-write-controller";
import type { BackendHttpContext } from "../context";
import { agentRunWriteRoute } from "../paths";
import { json, ndjsonStream } from "../response";
import type { DataScopeResolver } from "../scope";
import {
  readAgentRunnerStartPayload,
  readAgentRunFinishPayload,
  readAgentRunStartPayload,
  readAgentRunToolPayload,
  readCompatibilityLedgerPayload,
  readRemoteToolRequestPayload,
  readRemoteToolResultPayload,
  remoteToolClaimOwner,
  remoteToolLeaseMsFor,
  validateAgentRunDates
} from "./agent-run-write-request";

export async function handleAgentRunWriteRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver
) {
  const route = agentRunWriteRoute(request.method, url.pathname);
  if (!route) return undefined;
  const controller = createAgentRunWriteController(context, authenticatedDataScope);

  if (route.kind === "runner-start") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const payloadResult = await readAgentRunnerStartPayload(request);
    if ("response" in payloadResult) return payloadResult.response;
    const payload = payloadResult.payload;

    const record = createAgentRunLedgerFromStart(payload.run);
    const dateError = validateAgentRunDates(record);
    if (dateError) return dateError;
    if (!await controller.agentRunVisibleInScope(record, dataScope.scope)) {
      return json({ error: "not_found", message: "Conversation was not found." }, { status: 404 });
    }
    const outcome = await controller.agentRunStarts.startRunner({
      record,
      model: payload.model,
      attachments: payload.attachments,
      firstTool: payload.firstTool
    });
    return json(outcome.body, { status: outcome.status });
  }

  if (route.kind === "start") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const payloadResult = await readAgentRunStartPayload(request);
    if ("response" in payloadResult) return payloadResult.response;
    const payload = payloadResult.payload;

    const record = createAgentRunLedgerFromStart(payload);
    const dateError = validateAgentRunDates(record);
    if (dateError) return dateError;
    if (!await controller.agentRunVisibleInScope(record, dataScope.scope)) {
      return json({ error: "not_found", message: "Conversation was not found." }, { status: 404 });
    }
    await controller.agentRunCommits.saveAgentRunLedger(record);
    return json({ run: record }, { status: 201 });
  }

  if (route.kind === "runner-snapshot") {
    const scoped = await controller.scopedAgentRunRecord(request, route.runId);
    if ("response" in scoped) return scoped.response;
    const record = scoped.record;
    return json({ runner: await controller.agentRunRunnerSnapshots.snapshot(record) });
  }

  if (route.kind === "tool-event") {
    const scoped = await controller.scopedAgentRunRecord(request, route.runId);
    if ("response" in scoped) return scoped.response;
    const record = scoped.record;
    const payloadResult = await readAgentRunToolPayload(request);
    if ("response" in payloadResult) return payloadResult.response;
    const payload = payloadResult.payload;
    const outcome = await controller.agentRunManualWrites.saveManualToolEvent(record, payload);
    return json(outcome.body, { status: outcome.status });
  }

  if (route.kind === "create-tool-request") {
    const scoped = await controller.scopedAgentRunRecord(request, route.runId);
    if ("response" in scoped) return scoped.response;
    const record = scoped.record;
    const payloadResult = await readRemoteToolRequestPayload(request);
    if ("response" in payloadResult) return payloadResult.response;
    const payload = payloadResult.payload;
    const outcome = await controller.agentRunManualWrites.createManualRemoteToolRequest(record, payload);
    return json(outcome.body, { status: outcome.status });
  }

  if (route.kind === "pending-tool-requests") {
    const scoped = await controller.scopedAgentRunRecord(request, route.runId);
    if ("response" in scoped) return scoped.response;
    const record = scoped.record;
    if (isTerminalAgentRunStatus(record.status)) {
      return json({ error: "run_closed", message: `Agent run is already ${record.status}.` }, { status: 409 });
    }
    const claimOwner = remoteToolClaimOwner(url, controller.defaultRemoteToolClaimOwner);
    const now = new Date().toISOString();
    const claim = await controller.agentRunRemoteTools.claimRemoteToolRequests(record, {
      claimOwner,
      now,
      leaseMs: remoteToolLeaseMsFor(url, controller.remoteToolLeaseMs)
    });
    return json({
      requests: claim.requests.filter(
        (item) =>
          item.status === "running" &&
          !isAgentRunRemoteToolRequestLeaseExpired(item, now) &&
          (!item.claimedBy || item.claimedBy === claimOwner)
      ),
      runner: await controller.agentRunRunnerSnapshots.snapshot(claim.run, claim.requests)
    });
  }

  if (route.kind === "tool-result") {
    const scoped = await controller.scopedAgentRunRecord(request, route.runId);
    if ("response" in scoped) return scoped.response;
    const record = scoped.record;
    const payloadResult = await readRemoteToolResultPayload(request);
    if ("response" in payloadResult) return payloadResult.response;
    const payload = payloadResult.payload;
    if (url.searchParams.get("stream") === "1") {
      return ndjsonStream(async (emit) => {
        const outcome = await controller.agentRunRemoteToolResults.submitRemoteToolResult({
          record,
          toolCallId: route.toolCallId,
          payload,
          onModelTextDelta: (text) => emit({ type: "text-delta", text })
        });
        emit({
          type: "done",
          status: outcome.status,
          payload: outcome.body
        });
      });
    }
    const outcome = await controller.agentRunRemoteToolResults.submitRemoteToolResult({
      record,
      toolCallId: route.toolCallId,
      payload
    });
    return json(outcome.body, { status: outcome.status });
  }

  if (route.kind === "finish") {
    const scoped = await controller.scopedAgentRunRecord(request, route.runId);
    if ("response" in scoped) return scoped.response;
    const record = scoped.record;

    const payloadResult = await readAgentRunFinishPayload(request);
    if ("response" in payloadResult) return payloadResult.response;
    const payload = payloadResult.payload;
    const outcome = await controller.agentRunLifecycleWrites.finishAgentRun(record, payload);
    return json(outcome.body, { status: outcome.status });
  }

  if (route.kind === "compatibility-ledger") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const payloadResult = await readCompatibilityLedgerPayload(request);
    if ("response" in payloadResult) return payloadResult.response;
    const payload = payloadResult.payload;
    if (!await controller.agentRunVisibleInScope(payload, dataScope.scope)) {
      return json({ error: "not_found", message: "Conversation was not found." }, { status: 404 });
    }
    const outcome = await controller.agentRunLifecycleWrites.saveCompatibilityLedger(payload);
    return json(outcome.body, { status: outcome.status });
  }

  return undefined;
}
