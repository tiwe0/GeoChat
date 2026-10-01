import { describe, expect, test } from "bun:test";
import {
  CORRELATION_ID_HEADER,
  normalizeCorrelationId,
  resolveCorrelationId,
} from "@geochat-ai/app/request-correlation";
import { createCredentialResolverFromEnvironment } from "../backend/src/credentials/resolver";
import { nativeRunHeaders } from "../src/renderer-react/src/features/agent-run/nativeRunRequest";
import {
  createHttpHarness,
  TEST_BACKEND_AUTH_TOKEN,
} from "./agent-harness-http-utils";

const CREDENTIAL_REF = "9db97593-5568-40fa-b800-8d0febc67907";

describe("request correlation", () => {
  test("accepts bounded opaque identifiers and rejects user-shaped text", () => {
    expect(normalizeCorrelationId("run_abc-123:retry.2")).toBe("run_abc-123:retry.2");
    expect(normalizeCorrelationId(" user prompt ")).toBeUndefined();
    expect(normalizeCorrelationId(`run_${"a".repeat(200)}`)).toBeUndefined();
    expect(resolveCorrelationId(undefined, "run_fallback")).toBe("run_fallback");
    expect(resolveCorrelationId(undefined)).toMatch(/^request_[0-9a-f]{32}$/);
  });

  test("echoes a valid HTTP correlation id and generates one when absent", async () => {
    const { rawHandleRequest } = await createHttpHarness();
    const correlated = await rawHandleRequest(new Request("http://127.0.0.1:17365/health", {
      headers: { [CORRELATION_ID_HEADER]: "request_health_1" },
    }));
    expect(correlated.headers.get(CORRELATION_ID_HEADER)).toBe("request_health_1");

    const generated = await rawHandleRequest(new Request("http://127.0.0.1:17365/health"));
    expect(generated.headers.get(CORRELATION_ID_HEADER)).toMatch(/^request_[0-9a-f]{32}$/);
  });

  test("uses the run id for native chat even when a different request id is supplied", async () => {
    const { rawHandleRequest } = await createHttpHarness();
    const response = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/chat", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TEST_BACKEND_AUTH_TOKEN}`,
        "content-type": "application/json",
        [CORRELATION_ID_HEADER]: "request_other",
      },
      body: JSON.stringify({
        messages: [{ id: "user-1", role: "user", parts: [{ type: "text", text: "hello" }] }],
        runId: "run_correlation_1",
        conversationId: "conversation-correlation-1",
        model: {
          provider: "openai",
          model: "gpt-test",
          credentialRef: CREDENTIAL_REF,
        },
        locale: "en-US",
        thinking: false,
      }),
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe("run_correlation_1");
  });

  test("allows the correlation header in CORS preflight and exposes it", async () => {
    const { rawHandleRequest } = await createHttpHarness();
    const response = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/skills", {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:1421",
        "access-control-request-method": "GET",
        "access-control-request-headers": `authorization, ${CORRELATION_ID_HEADER}`,
      },
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain(CORRELATION_ID_HEADER);
    expect(response.headers.get("access-control-expose-headers")).toContain(CORRELATION_ID_HEADER);
  });

  test("renderer run requests reuse the run id", async () => {
    const headers = await nativeRunHeaders(
      { getAuthToken: () => "backend-token" },
      { current: null },
      "run_renderer_1",
    );
    expect(headers[CORRELATION_ID_HEADER]).toBe("run_renderer_1");
    expect(headers.Authorization).toBe("Bearer backend-token");
  });

  test("credential broker receives correlation context without changing its opaque payload", async () => {
    let captured: Request | undefined;
    const resolver = createCredentialResolverFromEnvironment({
      GEOCHAT_CREDENTIAL_BROKER_URL: "http://127.0.0.1:17366/",
      GEOCHAT_CREDENTIAL_BROKER_TOKEN: "broker-token",
    }, (async (input, init) => {
      captured = new Request(input, init);
      return Response.json({
        schemaVersion: 1,
        secret: "provider-secret",
        provider: "openai",
        protocol: "openai-compatible",
        canonicalBaseUrl: "https://api.openai.com/",
      });
    }) as typeof fetch);

    await resolver.resolve(CREDENTIAL_REF, undefined, { correlationId: "run_broker_1" });

    expect(captured?.headers.get(CORRELATION_ID_HEADER)).toBe("run_broker_1");
    expect(await captured?.json()).toEqual({ credentialRef: CREDENTIAL_REF });
  });

  test("keeps one correlation id across a renderer request and a broker failure without logging sensitive input", async () => {
    const runId = "run_failure_chain_1";
    const promptCanary = "prompt-body-must-not-be-logged";
    const queryCanary = "query-secret-must-not-be-logged";
    const brokerTokenCanary = "broker-token-must-not-be-logged";
    const brokerMessageCanary = "broker-message-must-not-be-logged";
    let brokerRequest: Request | undefined;
    const rendererHeaders = await nativeRunHeaders(
      { getAuthToken: () => TEST_BACKEND_AUTH_TOKEN },
      { current: null },
      runId,
    );
    const { context, rawHandleRequest } = await createHttpHarness();
    context.credentials = createCredentialResolverFromEnvironment({
      GEOCHAT_CREDENTIAL_BROKER_URL: "http://127.0.0.1:17366/",
      GEOCHAT_CREDENTIAL_BROKER_TOKEN: brokerTokenCanary,
    }, (async (input, init) => {
      brokerRequest = new Request(input, init);
      return Response.json({
        error: "credential_not_found",
        message: brokerMessageCanary,
      }, { status: 404 });
    }) as typeof fetch);

    const logged: string[] = [];
    const originalInfo = console.info;
    console.info = (...values) => logged.push(values.map(String).join(" "));
    try {
      const response = await rawHandleRequest(new Request(
        `http://127.0.0.1:17365/v1/chat?api_key=${queryCanary}`,
        {
          method: "POST",
          headers: {
            ...rendererHeaders,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ id: "user-1", role: "user", parts: [{ type: "text", text: promptCanary }] }],
            runId,
            conversationId: "conversation-correlation-failure",
            model: {
              provider: "openai",
              model: "gpt-test",
              credentialRef: CREDENTIAL_REF,
            },
            locale: "en-US",
            thinking: false,
          }),
        },
      ));

      expect(response.status).toBe(409);
      expect(response.headers.get(CORRELATION_ID_HEADER)).toBe(runId);
      expect(await response.json()).toEqual({
        error: "invalid_request",
        message: "The saved credential is unavailable.",
      });
    } finally {
      console.info = originalInfo;
    }

    expect(brokerRequest?.headers.get(CORRELATION_ID_HEADER)).toBe(runId);
    expect(brokerRequest?.headers.get("authorization")).toBe(`Bearer ${brokerTokenCanary}`);
    expect(await brokerRequest?.json()).toEqual({ credentialRef: CREDENTIAL_REF });

    const records = logged.map((line) => JSON.parse(line) as {
      event: string;
      errorCode: string;
      context?: Record<string, unknown>;
    });
    expect(records).toContainEqual(expect.objectContaining({
      event: "request_completed",
      errorCode: "HTTP_REQUEST_COMPLETED",
      context: expect.objectContaining({
        correlationId: runId,
        method: "POST",
        path: "/v1/chat",
        status: 409,
      }),
    }));
    const serializedLogs = JSON.stringify(records);
    for (const canary of [
      promptCanary,
      queryCanary,
      brokerTokenCanary,
      brokerMessageCanary,
      CREDENTIAL_REF,
    ]) expect(serializedLogs).not.toContain(canary);
  });
});
