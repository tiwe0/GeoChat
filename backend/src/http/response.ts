const corsMethods = "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS";

export function corsHeadersFor(request: Request) {
  return {
    "access-control-allow-origin": request.headers.get("origin") ?? "*",
    "access-control-allow-methods": corsMethods,
    "access-control-allow-headers": request.headers.get("access-control-request-headers") ?? "*",
    "access-control-expose-headers": "*",
    "access-control-max-age": "86400",
    "vary": "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  };
}

export function withCors(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeadersFor(request))) {
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
