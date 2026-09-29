import { discoverCredentialModels } from "../../services/model-discovery";
import type { BackendHttpContext } from "../context";
import { json, readJson } from "../response";

export async function handleModelDiscoveryRoute(request: Request, url: URL, context: BackendHttpContext) {
  if (request.method !== "POST" || url.pathname !== "/v1/models/discover") return undefined;
  const result = await discoverCredentialModels(
    await readJson(request),
    context.credentials,
    context.routeLimits,
    { downstreamSignal: request.signal }
  );
  return json(result.body, { status: result.httpStatus });
}
