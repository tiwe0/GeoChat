import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  isAllowedOrigin,
  type BackendHttpSecurity
} from "./security";

export function corsHeadersFor(request: Request, security: BackendHttpSecurity) {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  });
  if (!isAllowedOrigin(origin, security)) return headers;

  headers.set("access-control-allow-origin", origin!);
  headers.set("access-control-allow-methods", [...CORS_ALLOWED_METHODS, "OPTIONS"].join(","));
  headers.set("access-control-allow-headers", CORS_ALLOWED_HEADERS.join(","));
  headers.set("access-control-expose-headers", "content-type");
  headers.set("access-control-max-age", "86400");
  return headers;
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
    console.error("[ERROR] Caught exception at backend/src/http/response.ts:43", caughtError);
    return undefined;
  }
}
