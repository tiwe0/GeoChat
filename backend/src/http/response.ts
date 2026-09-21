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

export function ndjsonStream(run: (emit: (event: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  let close: (() => void) | undefined;
  return new Response(
    new ReadableStream({
      start(controller) {
        let closed = false;
        const emit = (event: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch (caughtError) {
            console.error("[ERROR] Caught exception at backend/src/http/response.ts:49", caughtError);
            closed = true;
          }
        };
        emit({ type: "start" });
        const heartbeat = globalThis.setInterval(() => emit({ type: "heartbeat", at: new Date().toISOString() }), 5_000);
        close = () => {
          if (closed) return;
          closed = true;
          globalThis.clearInterval(heartbeat);
          try {
            controller.close();
          } catch (caughtError) {
            console.error("[ERROR] Caught exception at backend/src/http/response.ts:61", caughtError);
            // The client may already have disconnected.
          }
        };
        void run(emit)
          .catch((error) => {
            console.error("[ERROR] Failed while producing the NDJSON stream", error);
            emit({
              type: "error",
              status: 500,
              message: error instanceof Error ? error.message : "Unexpected stream error"
            });
          })
          .finally(close);
      },
      cancel() {
        close?.();
      }
    }),
    {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no"
      }
    }
  );
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch (caughtError) {
    console.error("[ERROR] Caught exception at backend/src/http/response.ts:92", caughtError);
    return undefined;
  }
}
