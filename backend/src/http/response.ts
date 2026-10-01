import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  isAllowedOrigin,
  type BackendHttpSecurity
} from "./security";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { CORRELATION_ID_HEADER } from "@geochat-ai/app/request-correlation";

const logger = createStructuredLogger("http.response");

export function corsHeadersFor(request: Request, security: BackendHttpSecurity) {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  });
  if (!isAllowedOrigin(origin, security)) return headers;

  headers.set("access-control-allow-origin", origin!);
  headers.set("access-control-allow-methods", [...CORS_ALLOWED_METHODS, "OPTIONS"].join(","));
  headers.set("access-control-allow-headers", CORS_ALLOWED_HEADERS.join(","));
  headers.set("access-control-expose-headers", `content-type,${CORRELATION_ID_HEADER}`);
  headers.set("access-control-max-age", "86400");
  return headers;
}

export function withCorrelationId(response: Response, correlationId: string) {
  const headers = new Headers(response.headers);
  headers.set(CORRELATION_ID_HEADER, correlationId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function withCors(response: Response, request: Request, security: BackendHttpSecurity) {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeadersFor(request, security)) {
    headers.set(key, value);
  }
  headers.set("cross-origin-resource-policy", "cross-origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers
    }
  });
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch (caughtError) {
    logger.debug("request_json_parse_failed", "HTTP_REQUEST_JSON_INVALID", { error: caughtError });
    return undefined;
  }
}
