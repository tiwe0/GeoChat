import { discoverCredentialModels } from "../../services/model-discovery";
import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId
} from "@geochat-ai/app/request-correlation";
import type { BackendHttpContext } from "../context";
import { json, readJson, withCorrelationId } from "../response";

export async function handleModelDiscoveryRoute(request: Request, url: URL, context: BackendHttpContext) {
  if (request.method !== "POST" || url.pathname !== "/v1/models/discover") return undefined;
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_ID_HEADER));
  const result = await discoverCredentialModels(
    await readJson(request),
    context.credentials,
    context.routeLimits,
    { downstreamSignal: request.signal, correlationId }
  );
  return withCorrelationId(json(result.body, { status: result.httpStatus }), correlationId);
}
