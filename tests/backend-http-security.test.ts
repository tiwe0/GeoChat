import { describe, expect, test } from "bun:test";
import { readBackendHttpSecurity } from "../backend/src/http/security";
import {
  createHttpHarness,
  TEST_BACKEND_AUTH_TOKEN
} from "./agent-harness-http-utils";

describe("local backend HTTP security", () => {
  test("fails closed when required authentication has no token", () => {
    expect(() => readBackendHttpSecurity({})).toThrow(
      "GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN is required"
    );
    expect(readBackendHttpSecurity({
      GEOCHAT_DESKTOP_BACKEND_AUTH_MODE: "disabled"
    }).authentication).toEqual({ mode: "disabled" });
  });

  test("keeps health and GeoGebra assets public", async () => {
    const { rawHandleRequest } = await createHttpHarness();
    const health = await rawHandleRequest(new Request("http://127.0.0.1:17365/health"));
    expect(health.status).toBe(200);

    const asset = await rawHandleRequest(new Request(
      "http://127.0.0.1:17365/tools/geogebra-assets-v2/deployggb.js",
      { method: "HEAD" }
    ));
    expect(asset.status).toBe(200);

    const postHealth = await rawHandleRequest(new Request("http://127.0.0.1:17365/health", {
      method: "POST"
    }));
    expect(postHealth.status).toBe(405);

    const removedLegacyAsset = await rawHandleRequest(new Request(
      "http://127.0.0.1:17365/tools/geogebra-assets/deployggb.js"
    ));
    expect(removedLegacyAsset.status).toBe(404);
  });

  test("rejects missing and incorrect tokens before routing", async () => {
    const { rawHandleRequest } = await createHttpHarness();
    const missing = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/skills"));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: "unauthorized" });
    expect(missing.headers.get("www-authenticate")).toBe("Bearer");

    const wrong = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/skills", {
      headers: { authorization: "Bearer wrong-token" }
    }));
    expect(wrong.status).toBe(401);

    const unknown = await rawHandleRequest(new Request("http://127.0.0.1:17365/not-a-route"));
    expect(unknown.status).toBe(404);
  });

  test("accepts the exact bearer token", async () => {
    const { rawHandleRequest } = await createHttpHarness();
    const response = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/skills", {
      headers: { authorization: `Bearer ${TEST_BACKEND_AUTH_TOKEN}` }
    }));
    expect(response.status).toBe(200);
  });

  test("accepts only explicit CORS origins, methods, and headers", async () => {
    const { rawHandleRequest } = await createHttpHarness();
    const allowed = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/skills", {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:1421",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization, x-client-channel"
      }
    }));
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:1421");
    expect(allowed.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(allowed.headers.get("access-control-allow-headers")).toContain("authorization");

    const badOrigin = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/skills", {
      method: "OPTIONS",
      headers: {
        origin: "https://attacker.example",
        "access-control-request-method": "GET"
      }
    }));
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.headers.get("access-control-allow-origin")).toBeNull();

    const badMethod = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/skills", {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:1421",
        "access-control-request-method": "TRACE"
      }
    }));
    expect(badMethod.status).toBe(403);
    expect(await badMethod.json()).toMatchObject({ error: "cors_method_forbidden" });

    const badHeader = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/skills", {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:1421",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization, x-not-allowed"
      }
    }));
    expect(badHeader.status).toBe(403);
    expect(await badHeader.json()).toMatchObject({ error: "cors_header_forbidden" });

    const methodNotRegisteredForRoute = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/skills", {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:1421",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization"
      }
    }));
    expect(methodNotRegisteredForRoute.status).toBe(403);
    expect(await methodNotRegisteredForRoute.json()).toMatchObject({ error: "cors_method_forbidden" });
  });

  test("rejects disallowed origins on actual requests before side effects", async () => {
    const { rawHandleRequest } = await createHttpHarness();
    const response = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/conversations", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "text/plain"
      },
      body: "{}"
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "cors_origin_forbidden" });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
