import { describe, expect, test } from "bun:test";
import type { CredentialResolver, ResolvedCredentialEnvelope } from "../backend/src/credentials/resolver";
import { discoverCredentialModels } from "../backend/src/services/model-discovery";
import {
  ProviderResponseReadError,
  ProviderResponseTooLargeError,
  readBoundedProviderResponseBody
} from "../backend/src/services/provider-proxy";
import { createHttpHarness } from "./agent-harness-http-utils";

const CREDENTIAL_REF = "123e4567-e89b-42d3-a456-426614174000";

function credentialResolver(envelope: Partial<ResolvedCredentialEnvelope> = {}): CredentialResolver {
  return {
    resolve: async () => ({
      schemaVersion: 1,
      secret: "provider-secret",
      provider: "openai",
      protocol: "openai-compatible",
      canonicalBaseUrl: "https://api.openai.com",
      ...envelope
    })
  };
}

const limits = { maxProviderResponseBodyBytes: 1024 };

describe("credential-backed model discovery", () => {
  test("constructs a fixed provider request from the resolved envelope", async () => {
    let receivedUrl = "";
    let receivedInit: RequestInit | undefined;
    const result = await discoverCredentialModels(
      { credentialRef: CREDENTIAL_REF },
      credentialResolver(),
      limits,
      {
        fetch: (async (input, init) => {
          receivedUrl = String(input);
          receivedInit = init;
          return Response.json({ data: [{ id: "gpt-5.5" }] });
        }) as typeof fetch
      }
    );

    expect(result).toEqual({ httpStatus: 200, body: { ids: ["gpt-5.5"] } });
    expect(receivedUrl).toBe("https://api.openai.com/v1/models");
    expect(receivedInit).toMatchObject({ method: "GET", redirect: "error" });
    expect(new Headers(receivedInit?.headers).get("authorization")).toBe("Bearer provider-secret");
  });

  test("uses provider-specific authentication without accepting renderer auth material", async () => {
    const captures: Array<{ url: string; headers: Headers }> = [];
    const fetchImplementation = (async (input, init) => {
      captures.push({ url: String(input), headers: new Headers(init?.headers) });
      return Response.json({ models: [{ name: "models/gemini-3-pro" }] });
    }) as typeof fetch;

    const result = await discoverCredentialModels(
      { credentialRef: CREDENTIAL_REF },
      credentialResolver({
        provider: "google",
        protocol: "google",
        canonicalBaseUrl: "https://generativelanguage.googleapis.com"
      }),
      limits,
      { fetch: fetchImplementation }
    );

    expect(result).toEqual({ httpStatus: 200, body: { ids: ["gemini-3-pro"] } });
    expect(captures[0]?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models?key=provider-secret");
    expect(captures[0]?.headers.get("authorization")).toBeNull();

    let fetchCalls = 0;
    const rejected = await discoverCredentialModels(
      { credentialRef: CREDENTIAL_REF, url: "https://evil.example", headers: { authorization: "Bearer renderer-secret" } },
      credentialResolver(),
      limits,
      { fetch: (async () => { fetchCalls += 1; return Response.json({}); }) as typeof fetch }
    );
    expect(rejected).toEqual({
      httpStatus: 400,
      body: {
        error: "invalid_request",
        errorCode: "model_discovery_request_invalid",
        message: "Model discovery requires exactly one credentialRef."
      }
    });
    expect(fetchCalls).toBe(0);
  });

  test("returns stable errors for upstream HTTP and malformed catalog responses", async () => {
    const rejected = await discoverCredentialModels(
      { credentialRef: CREDENTIAL_REF },
      credentialResolver(),
      limits,
      { fetch: (async () => new Response("no", { status: 401 })) as typeof fetch }
    );
    expect(rejected).toEqual({
      httpStatus: 502,
      body: {
        error: "provider_http_error",
        message: "Provider responded with HTTP 401.",
        status: 401
      }
    });

    const malformed = await discoverCredentialModels(
      { credentialRef: CREDENTIAL_REF },
      credentialResolver(),
      limits,
      { fetch: (async () => new Response("not json")) as typeof fetch }
    );
    expect(malformed).toEqual({
      httpStatus: 502,
      body: {
        error: "model_discovery_invalid_response",
        message: "The provider returned an invalid model catalog."
      }
    });
  });

  test("times out and cancels the fixed upstream request", async () => {
    let observedAbort = false;
    const result = await discoverCredentialModels(
      { credentialRef: CREDENTIAL_REF },
      credentialResolver(),
      limits,
      {
        timeoutMs: 10,
        fetch: ((_input, init) => new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            observedAbort = true;
            reject(init.signal?.reason);
          }, { once: true });
        })) as typeof fetch
      }
    );
    expect(observedAbort).toBe(true);
    expect(result).toEqual({
      httpStatus: 504,
      body: { error: "model_discovery_timeout", message: "Model discovery timed out." }
    });
  });

  test("cancels the upstream request when the downstream client aborts", async () => {
    const downstreamController = new AbortController();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const resultPromise = discoverCredentialModels(
      { credentialRef: CREDENTIAL_REF },
      credentialResolver(),
      limits,
      {
        downstreamSignal: downstreamController.signal,
        fetch: ((_input, init) => new Promise((_resolve, reject) => {
          markStarted?.();
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        })) as typeof fetch
      }
    );
    await started;
    downstreamController.abort(new DOMException("Renderer request cancelled.", "AbortError"));

    expect(await resultPromise).toEqual({
      httpStatus: 499,
      body: {
        error: "model_discovery_aborted",
        message: "Model discovery was cancelled by the downstream client."
      }
    });
  });

  test("maps bounded catalog responses to a stable discovery error", async () => {
    const result = await discoverCredentialModels(
      { credentialRef: CREDENTIAL_REF },
      credentialResolver(),
      { maxProviderResponseBodyBytes: 4 },
      { fetch: (async () => new Response("12345")) as typeof fetch }
    );

    expect(result).toEqual({
      httpStatus: 502,
      body: {
        error: "model_discovery_response_too_large",
        message: "The provider model catalog response was too large."
      }
    });
  });

  test("registers only the authenticated discovery route and retires provider-fetch", async () => {
    const { context, handleRequest } = await createHttpHarness();
    const fakeProvider = Bun.serve({
      port: 0,
      fetch: () => Response.json({ data: [{ id: "local-model" }] })
    });
    context.credentials.resolve = async () => ({
      schemaVersion: 1,
      secret: "provider-secret",
      provider: "openai",
      protocol: "openai-compatible",
      canonicalBaseUrl: `http://127.0.0.1:${fakeProvider.port}/v1`
    });

    try {
      const discovered = await handleRequest(new Request("http://127.0.0.1:17365/v1/models/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credentialRef: CREDENTIAL_REF })
      }));
      expect(discovered.status).toBe(200);
      expect(await discovered.json()).toEqual({ ids: ["local-model"] });

      const retired = await handleRequest(new Request("http://127.0.0.1:17365/v1/provider-fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `http://127.0.0.1:${fakeProvider.port}/v1/models` })
      }));
      expect(retired.status).toBe(404);
    } finally {
      fakeProvider.stop(true);
    }
  });
});

describe("bounded provider response reader", () => {
  test("reads chunked responses at the exact byte limit", async () => {
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4, 5]));
        controller.close();
      }
    }));

    expect([...(await readBoundedProviderResponseBody(response, 5))]).toEqual([1, 2, 3, 4, 5]);
  });

  test("cancels and aborts a chunked response when it exceeds the limit", async () => {
    let cancelReason: unknown;
    let abortCalls = 0;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
      },
      cancel(reason) { cancelReason = reason; }
    }));

    await expect(readBoundedProviderResponseBody(response, 5, () => { abortCalls += 1; }))
      .rejects.toBeInstanceOf(ProviderResponseTooLargeError);
    expect(cancelReason).toBeInstanceOf(ProviderResponseTooLargeError);
    expect(abortCalls).toBe(1);
  });

  test("rejects oversized content-length before pulling the body", async () => {
    let pullCalls = 0;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCalls += 1;
        controller.enqueue(new Uint8Array([1]));
      }
    }), { headers: { "content-length": "6" } });

    await expect(readBoundedProviderResponseBody(response, 5))
      .rejects.toBeInstanceOf(ProviderResponseTooLargeError);
    expect(pullCalls).toBe(0);
  });

  test("reports provider response stream failures distinctly", async () => {
    const failure = new Error("socket closed while reading");
    const response = new Response(new ReadableStream<Uint8Array>({ pull() { throw failure; } }));

    try {
      await readBoundedProviderResponseBody(response, 5);
      throw new Error("Expected provider response reading to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderResponseReadError);
      expect((error as ProviderResponseReadError).cause).toBe(failure);
    }
  });
});
