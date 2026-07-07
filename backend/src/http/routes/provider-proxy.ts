import { proxyProviderFetch } from "../../services/provider-proxy";
import type { BackendHttpContext } from "../context";
import { json, readJson } from "../response";

export async function handleProviderProxyRoute(request: Request, url: URL, context: BackendHttpContext) {
  if (request.method !== "POST" || url.pathname !== "/v1/provider-fetch") return undefined;
  const result = await proxyProviderFetch(await readJson(request), context.routeLimits);
  return json(result.body, { status: result.httpStatus });
}
