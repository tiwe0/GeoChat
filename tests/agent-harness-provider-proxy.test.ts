import { describe, expect, test } from "bun:test";
import {
  getAgentProviderProxyPolicy,
  isAgentProviderProxyHostAllowed,
  normalizeProviderProxyMethod,
  parseProviderProxyUrl,
  providerProxyBase64ByteLength,
  sanitizeProviderProxyHeaders,
  sanitizeProviderProxyResponseHeaders,
  validateProviderProxyBodyBase64,
  validateProviderProxyHeaders,
  validateProviderProxyMethodBody
} from "@geochat-ai/app";
import { sanitizeProviderError } from "../backend/src/agent/provider-error";
import {
  ProviderResponseReadError,
  ProviderResponseTooLargeError,
  proxyProviderFetch,
  readBoundedProviderResponseBody
} from "../backend/src/services/provider-proxy";
import { createHttpHarness } from "./agent-harness-http-utils";

describe("provider proxy policy", () => {
  test("redacts provider secrets before model errors are stored in the AI SDK ledger", () => {
    const message = sanitizeProviderError(
      new Error(
        `401 Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456 api_key=sk-ant-abcdefghijklmnopqrstuvwxyz123456 google=AIzaabcdefghijklmnopqrstuvwxyz123456 ${"x".repeat(700)}`
      )
    );

    expect(message).toContain("Bearer [redacted]");
    expect(message).toContain("api_key=[redacted]");
    expect(message).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
    expect(message).not.toContain("sk-ant-abcdefghijklmnopqrstuvwxyz123456");
    expect(message).not.toContain("AIzaabcdefghijklmnopqrstuvwxyz123456");
    expect(message.length).toBeLessThanOrEqual(600);
  });

  test("allows only registered provider hosts or the explicit custom base URL host", () => {
    expect(parseProviderProxyUrl("https://api.openai.com/v1/responses")?.host).toBe("api.openai.com");
    expect(parseProviderProxyUrl("not a url")).toBeUndefined();
    expect(parseProviderProxyUrl("file:///tmp/model.json")).toBeUndefined();
    expect(getAgentProviderProxyPolicy("openrouter")).toEqual({
      provider: "openrouter",
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      allowedHosts: ["openrouter.ai"]
    });
    expect(getAgentProviderProxyPolicy("qwen")).toEqual({
      provider: "qwen",
      defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      allowedHosts: ["dashscope.aliyuncs.com", "dashscope-us.aliyuncs.com"]
    });
    expect(getAgentProviderProxyPolicy("custom")).toEqual({
      provider: "custom",
      defaultBaseUrl: "",
      allowedHosts: []
    });

    expect(
      isAgentProviderProxyHostAllowed({
        targetUrl: "https://api.openai.com/v1/responses",
        allowedHosts: ["api.openai.com"]
      })
    ).toBe(true);

    expect(
      isAgentProviderProxyHostAllowed({
        targetUrl: "https://evil.example/v1/responses",
        allowedHosts: ["api.openai.com"]
      })
    ).toBe(false);

    expect(
      isAgentProviderProxyHostAllowed({
        targetUrl: "https://openrouter.ai/api/v1/chat/completions",
        allowedHosts: ["openrouter.ai"]
      })
    ).toBe(true);

    expect(
      isAgentProviderProxyHostAllowed({
        targetUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        allowedHosts: ["dashscope.aliyuncs.com", "dashscope-us.aliyuncs.com"]
      })
    ).toBe(true);

    expect(
      isAgentProviderProxyHostAllowed({
        targetUrl: "https://llm.local:8443/v1/chat/completions",
        allowedHosts: [],
        customBaseUrl: "https://llm.local:8443/v1"
      })
    ).toBe(true);
  });

  test("rejects non-http targets and strips browser-only headers", () => {
    expect(
      isAgentProviderProxyHostAllowed({
        targetUrl: "file:///etc/passwd",
        allowedHosts: ["api.openai.com"]
      })
    ).toBe(false);

    expect(
      sanitizeProviderProxyHeaders({
        authorization: "Bearer test",
        cookie: "session=secret",
        origin: "http://localhost:5173",
        referer: "http://localhost:5173/chat",
        "content-length": "10",
        connection: "keep-alive",
        "proxy-authorization": "Basic secret",
        "x-forwarded-for": "127.0.0.1",
        "sec-fetch-site": "same-origin"
      })
    ).toEqual({
      authorization: "Bearer test"
    });
    expect(validateProviderProxyHeaders(undefined)).toBeUndefined();
    expect(validateProviderProxyHeaders({ authorization: "Bearer test", "x-request-id": "req-1" })).toBeUndefined();
    expect(validateProviderProxyHeaders(["x-test"])).toMatchObject({
      error: "provider_headers_invalid"
    });
    expect(validateProviderProxyHeaders({ "bad header": "x" })).toMatchObject({
      error: "provider_headers_invalid"
    });
    expect(validateProviderProxyHeaders({ "x-test": { nested: true } })).toMatchObject({
      error: "provider_headers_invalid"
    });
    expect(validateProviderProxyHeaders({ "x-test": "a\r\nb" })).toMatchObject({
      error: "provider_headers_invalid"
    });
    expect(
      sanitizeProviderProxyResponseHeaders({
        "content-type": "application/json",
        "set-cookie": "session=secret",
        "transfer-encoding": "chunked",
        "x-request-id": "req-1"
      })
    ).toEqual({
      "content-type": "application/json",
      "x-request-id": "req-1"
    });
  });

  test("calculates base64 body byte length", () => {
    expect(providerProxyBase64ByteLength("aGVsbG8=")).toBe(5);
    expect(validateProviderProxyBodyBase64(undefined)).toBeUndefined();
    expect(validateProviderProxyBodyBase64("")).toBeUndefined();
    expect(validateProviderProxyBodyBase64("e30=")).toBeUndefined();
    expect(validateProviderProxyBodyBase64("%%%")).toMatchObject({
      error: "provider_body_invalid"
    });
    expect(validateProviderProxyBodyBase64("abc")).toMatchObject({
      error: "provider_body_invalid"
    });
  });

  test("allows only model-provider request methods through the provider proxy", () => {
    expect(normalizeProviderProxyMethod(undefined)).toBe("GET");
    expect(normalizeProviderProxyMethod("post")).toBe("POST");
    expect(normalizeProviderProxyMethod("  GET  ")).toBe("GET");
    expect(normalizeProviderProxyMethod("DELETE")).toBeUndefined();
    expect(normalizeProviderProxyMethod("PATCH")).toBeUndefined();
  });

  test("rejects request bodies on provider proxy GET requests", () => {
    expect(validateProviderProxyMethodBody({ method: "POST", bodyBase64: "e30=" })).toBeUndefined();
    expect(validateProviderProxyMethodBody({ method: "GET", bodyBase64: undefined })).toBeUndefined();
    expect(validateProviderProxyMethodBody({ method: undefined, bodyBase64: "e30=" })).toMatchObject({
      error: "provider_body_not_allowed"
    });
    expect(validateProviderProxyMethodBody({ method: "GET", bodyBase64: "e30=" })).toMatchObject({
      error: "provider_body_not_allowed"
    });
  });

  test("sanitizes provider proxy response headers", async () => {
    const { handleRequest } = await createHttpHarness();
    let receivedRequestHeaders: Record<string, string> = {};
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: (request) => {
        receivedRequestHeaders = Object.fromEntries(request.headers.entries());
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "set-cookie": "session=secret",
            "x-provider-request-id": "provider-1"
          }
        });
      }
    });

    try {
      const response = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/provider-fetch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            customBaseUrl: `http://127.0.0.1:${fakeProvider.port}/v1`,
            url: `http://127.0.0.1:${fakeProvider.port}/v1/chat/completions`,
            method: "POST",
            headers: {
              authorization: "Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456",
              "proxy-authorization": "Basic proxy-secret",
              "x-forwarded-for": "127.0.0.1",
              "sec-fetch-site": "same-origin"
            },
            bodyBase64: Buffer.from("{}").toString("base64")
          })
        })
      );
      const payload = await response.json() as {
        status?: number;
        headers?: Record<string, string>;
        bodyBase64?: string;
      };

      expect(response.status).toBe(200);
      expect(payload).toMatchObject({
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-provider-request-id": "provider-1"
        }
      });
      expect(receivedRequestHeaders.authorization).toBe("Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456");
      expect(receivedRequestHeaders).not.toHaveProperty("proxy-authorization");
      expect(receivedRequestHeaders).not.toHaveProperty("x-forwarded-for");
      expect(receivedRequestHeaders).not.toHaveProperty("sec-fetch-site");
      expect(payload.headers).not.toHaveProperty("set-cookie");
      expect(JSON.stringify(payload)).not.toContain("session=secret");
      expect(JSON.stringify(payload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
    } finally {
      fakeProvider.stop(true);
    }
  });

  test("returns structured provider proxy failures without leaking request secrets", async () => {
    const { handleRequest } = await createHttpHarness();
    const response = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/provider-fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          customBaseUrl: "http://127.0.0.1:9/v1",
          url: "http://127.0.0.1:9/v1/chat/completions",
          method: "POST",
          headers: {
            authorization: "Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456"
          },
          bodyBase64: Buffer.from("{}").toString("base64")
        })
      })
    );
    const payload = await response.json() as { error?: string; message?: string };

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      error: "provider_fetch_failed"
    });
    expect(payload.message).toContain("Provider proxy request failed");
    expect(JSON.stringify(payload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
  });

  test("rejects invalid provider proxy URLs as structured request errors", async () => {
    const { handleRequest } = await createHttpHarness();
    const response = await handleRequest(
      new Request("http://127.0.0.1:17365/v1/provider-fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          url: "not a url",
          method: "POST",
          headers: {
            authorization: "Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456"
          }
        })
      })
    );
    const payload = await response.json() as { error?: string; message?: string };

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      error: "invalid_url"
    });
    expect(payload.message).toContain("http and https");
    expect(JSON.stringify(payload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
  });

  test("rejects invalid provider proxy base64 bodies before contacting upstream", async () => {
    const { handleRequest } = await createHttpHarness();
    let upstreamHits = 0;
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: () => {
        upstreamHits += 1;
        return Response.json({ ok: true });
      }
    });

    try {
      const response = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/provider-fetch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            customBaseUrl: `http://127.0.0.1:${fakeProvider.port}/v1`,
            url: `http://127.0.0.1:${fakeProvider.port}/v1/chat/completions`,
            method: "POST",
            headers: {
              authorization: "Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456"
            },
            bodyBase64: "%%%"
          })
        })
      );
      const payload = await response.json() as { error?: string; message?: string };

      expect(response.status).toBe(400);
      expect(payload).toMatchObject({
        error: "provider_body_invalid"
      });
      expect(payload.message).toContain("standard base64");
      expect(JSON.stringify(payload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
      expect(upstreamHits).toBe(0);
    } finally {
      fakeProvider.stop(true);
    }
  });

  test("rejects invalid provider proxy headers before contacting upstream", async () => {
    const { handleRequest } = await createHttpHarness();
    let upstreamHits = 0;
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: () => {
        upstreamHits += 1;
        return Response.json({ ok: true });
      }
    });

    try {
      const response = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/provider-fetch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            customBaseUrl: `http://127.0.0.1:${fakeProvider.port}/v1`,
            url: `http://127.0.0.1:${fakeProvider.port}/v1/chat/completions`,
            method: "POST",
            headers: {
              "bad header": "x",
              authorization: "Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456"
            },
            bodyBase64: Buffer.from("{}").toString("base64")
          })
        })
      );
      const payload = await response.json() as { error?: string; message?: string };

      expect(response.status).toBe(400);
      expect(payload).toMatchObject({
        error: "provider_headers_invalid"
      });
      expect(payload.message).toContain("header names");
      expect(JSON.stringify(payload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
      expect(upstreamHits).toBe(0);
    } finally {
      fakeProvider.stop(true);
    }
  });

  test("rejects non-provider proxy methods before contacting upstream", async () => {
    const { handleRequest } = await createHttpHarness();
    let upstreamHits = 0;
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: () => {
        upstreamHits += 1;
        return Response.json({ ok: true });
      }
    });

    try {
      const response = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/provider-fetch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            customBaseUrl: `http://127.0.0.1:${fakeProvider.port}/v1`,
            url: `http://127.0.0.1:${fakeProvider.port}/v1/chat/completions`,
            method: "DELETE",
            headers: {
              authorization: "Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456"
            }
          })
        })
      );
      const payload = await response.json() as { error?: string; message?: string };

      expect(response.status).toBe(405);
      expect(payload).toMatchObject({
        error: "provider_method_blocked"
      });
      expect(payload.message).toContain("GET and POST");
      expect(JSON.stringify(payload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
      expect(upstreamHits).toBe(0);
    } finally {
      fakeProvider.stop(true);
    }
  });

  test("rejects provider proxy GET request bodies before contacting upstream", async () => {
    const { handleRequest } = await createHttpHarness();
    let upstreamHits = 0;
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: () => {
        upstreamHits += 1;
        return Response.json({ ok: true });
      }
    });

    try {
      const response = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/provider-fetch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            customBaseUrl: `http://127.0.0.1:${fakeProvider.port}/v1`,
            url: `http://127.0.0.1:${fakeProvider.port}/v1/models`,
            method: "GET",
            headers: {
              authorization: "Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456"
            },
            bodyBase64: Buffer.from("{}").toString("base64")
          })
        })
      );
      const payload = await response.json() as { error?: string; message?: string };

      expect(response.status).toBe(400);
      expect(payload).toMatchObject({
        error: "provider_body_not_allowed"
      });
      expect(payload.message).toContain("GET requests cannot include");
      expect(JSON.stringify(payload)).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz123456");
      expect(upstreamHits).toBe(0);
    } finally {
      fakeProvider.stop(true);
    }
  });

  test("reads chunked provider responses without content-length at the exact byte limit", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3, 4, 5]));
          controller.close();
        }
      })
    );

    const body = await readBoundedProviderResponseBody(response, 5);

    expect([...body]).toEqual([1, 2, 3, 4, 5]);
  });

  test("cancels and aborts chunked provider responses as soon as they exceed the byte limit", async () => {
    let cancelReason: unknown;
    let abortCalls = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5, 6]));
        },
        cancel(reason) {
          cancelReason = reason;
        }
      })
    );

    await expect(readBoundedProviderResponseBody(response, 5, () => {
      abortCalls += 1;
    })).rejects.toBeInstanceOf(ProviderResponseTooLargeError);
    expect(cancelReason).toBeInstanceOf(ProviderResponseTooLargeError);
    expect(abortCalls).toBe(1);
  });

  test("rejects oversized content-length before pulling the provider response body", async () => {
    let pullCalls = 0;
    let cancelReason: unknown;
    let abortCalls = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          pullCalls += 1;
          controller.enqueue(new Uint8Array([1]));
        },
        cancel(reason) {
          cancelReason = reason;
        }
      }),
      { headers: { "content-length": "6" } }
    );

    await expect(readBoundedProviderResponseBody(response, 5, () => {
      abortCalls += 1;
    })).rejects.toBeInstanceOf(ProviderResponseTooLargeError);
    expect(pullCalls).toBe(0);
    expect(cancelReason).toBeInstanceOf(ProviderResponseTooLargeError);
    expect(abortCalls).toBe(1);
  });

  test("reports provider response stream failures separately from connection failures", async () => {
    const readFailure = new Error("socket closed while reading");
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull() {
          throw readFailure;
        }
      })
    );

    try {
      await readBoundedProviderResponseBody(response, 5);
      throw new Error("Expected provider response reading to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderResponseReadError);
      expect((error as ProviderResponseReadError).cause).toBe(readFailure);
    }
  });

  test("aborts the upstream provider request when the downstream handler request is cancelled", async () => {
    const { handleRequest } = await createHttpHarness();
    const downstreamController = new AbortController();
    let markUpstreamStarted: (() => void) | undefined;
    let markUpstreamAborted: (() => void) | undefined;
    const upstreamStarted = new Promise<void>((resolve) => {
      markUpstreamStarted = resolve;
    });
    const upstreamAborted = new Promise<void>((resolve) => {
      markUpstreamAborted = resolve;
    });
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: (request) => {
        markUpstreamStarted?.();
        return new Promise<Response>((resolve) => {
          request.signal.addEventListener("abort", () => {
            markUpstreamAborted?.();
            resolve(new Response("downstream disconnected"));
          }, { once: true });
        });
      }
    });

    try {
      const responsePromise = handleRequest(
        new Request("http://127.0.0.1:17365/v1/provider-fetch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            customBaseUrl: `http://127.0.0.1:${fakeProvider.port}/v1`,
            url: `http://127.0.0.1:${fakeProvider.port}/v1/models`,
            method: "GET"
          }),
          signal: downstreamController.signal
        })
      );
      await upstreamStarted;

      downstreamController.abort(new DOMException("Renderer request cancelled.", "AbortError"));

      const response = await responsePromise;
      const payload = await response.json() as { error?: string; message?: string };
      await upstreamAborted;
      expect(response.status).toBe(499);
      expect(payload).toEqual({
        error: "provider_request_aborted",
        message: "Provider proxy request was cancelled by the downstream client."
      });
    } finally {
      fakeProvider.stop(true);
    }
  });

  test("times out while waiting for provider response headers", async () => {
    const result = await proxyProviderFetch({
      provider: "openai",
      customBaseUrl: "https://llm.local/v1",
      url: "https://llm.local/v1/models",
      method: "GET"
    }, {
      maxProviderRequestBodyBytes: 1024,
      maxProviderResponseBodyBytes: 1024
    }, {
      timeoutMs: 10,
      fetch: ((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      })) as typeof fetch
    });

    expect(result).toEqual({
      httpStatus: 504,
      body: {
        error: "provider_fetch_timeout",
        message: "Provider proxy request timed out."
      }
    });
  });

  test("times out and aborts while reading a stalled provider response body", async () => {
    let observedAbort = false;
    const result = await proxyProviderFetch({
      provider: "openai",
      customBaseUrl: "https://llm.local/v1",
      url: "https://llm.local/v1/models",
      method: "GET"
    }, {
      maxProviderRequestBodyBytes: 1024,
      maxProviderResponseBodyBytes: 1024
    }, {
      timeoutMs: 10,
      fetch: (async (_url, init) => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            observedAbort = true;
            controller.error(init.signal?.reason);
          }, { once: true });
        }
      }))) as typeof fetch
    });

    expect(observedAbort).toBe(true);
    expect(result).toEqual({
      httpStatus: 504,
      body: {
        error: "provider_fetch_timeout",
        message: "Provider proxy request timed out while reading the response."
      }
    });
  });

  test("maps provider non-2xx responses to a distinct error while preserving status and sanitized headers", async () => {
    const { handleRequest } = await createHttpHarness();
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: () => new Response("upstream unavailable", {
        status: 503,
        statusText: "Service Unavailable",
        headers: {
          "content-type": "text/plain",
          "set-cookie": "session=secret",
          "x-provider-request-id": "provider-failure-1"
        }
      })
    });

    try {
      const response = await handleRequest(
        new Request("http://127.0.0.1:17365/v1/provider-fetch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            customBaseUrl: `http://127.0.0.1:${fakeProvider.port}/v1`,
            url: `http://127.0.0.1:${fakeProvider.port}/v1/models`,
            method: "GET"
          })
        })
      );
      const payload = await response.json() as {
        error?: string;
        status?: number;
        statusText?: string;
        headers?: Record<string, string>;
        bodyBase64?: string;
      };

      expect(response.status).toBe(502);
      expect(payload).toMatchObject({
        error: "provider_http_error",
        status: 503,
        statusText: "Service Unavailable",
        headers: {
          "content-type": "text/plain",
          "x-provider-request-id": "provider-failure-1"
        }
      });
      expect(payload.headers).not.toHaveProperty("set-cookie");
      expect(Buffer.from(payload.bodyBase64 ?? "", "base64").toString()).toBe("upstream unavailable");
    } finally {
      fakeProvider.stop(true);
    }
  });
});
