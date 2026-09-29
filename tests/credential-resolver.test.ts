import { describe, expect, test } from "bun:test";
import {
  CredentialResolutionError,
  createCredentialResolverFromEnvironment
} from "../backend/src/credentials/resolver";

const CREDENTIAL_REF = "9db97593-5568-40fa-b800-8d0febc67907";

describe("backend credential resolver", () => {
  test("fails closed when the native broker is not configured", async () => {
    const resolver = createCredentialResolverFromEnvironment({});
    await expect(resolver.resolve(CREDENTIAL_REF)).rejects.toMatchObject({
      code: "credential_broker_unavailable",
      status: 503
    });
  });

  test("rejects malformed references without contacting the broker", async () => {
    let called = false;
    const resolver = createCredentialResolverFromEnvironment(
      {
        GEOCHAT_CREDENTIAL_BROKER_URL: "http://127.0.0.1:17366/",
        GEOCHAT_CREDENTIAL_BROKER_TOKEN: "broker-token"
      },
      (async () => {
        called = true;
        return new Response();
      }) as typeof fetch
    );

    await expect(resolver.resolve("../../../secret")).rejects.toMatchObject({
      code: "invalid_credential_reference",
      status: 400
    });
    expect(called).toBe(false);
  });

  test("sends only the opaque reference and returns a validated immutable envelope", async () => {
    let captured: Request | undefined;
    const resolver = createCredentialResolverFromEnvironment(
      {
        GEOCHAT_CREDENTIAL_BROKER_URL: "http://127.0.0.1:17366/",
        GEOCHAT_CREDENTIAL_BROKER_TOKEN: "broker-token"
      },
      (async (input, init) => {
        captured = new Request(input, init);
        return Response.json({
          schemaVersion: 1,
          secret: "provider-secret",
          provider: "openai",
          protocol: "openai-compatible",
          canonicalBaseUrl: "https://api.openai.com/"
        }, { headers: { "cache-control": "no-store" } });
      }) as typeof fetch
    );

    await expect(resolver.resolve(CREDENTIAL_REF)).resolves.toEqual({
      schemaVersion: 1,
      secret: "provider-secret",
      provider: "openai",
      protocol: "openai-compatible",
      canonicalBaseUrl: "https://api.openai.com/"
    });
    expect(captured?.url).toBe("http://127.0.0.1:17366/v1/credentials/resolve");
    expect(captured?.headers.get("authorization")).toBe("Bearer broker-token");
    expect(captured?.redirect).toBe("error");
    expect(await captured?.json()).toEqual({ credentialRef: CREDENTIAL_REF });
  });

  test("rejects broker envelopes with unsafe endpoints", async () => {
    const resolver = createCredentialResolverFromEnvironment(
      {
        GEOCHAT_CREDENTIAL_BROKER_URL: "http://127.0.0.1:17366/",
        GEOCHAT_CREDENTIAL_BROKER_TOKEN: "broker-token"
      },
      (async () => Response.json({
        schemaVersion: 1,
        secret: "provider-secret",
        provider: "openai",
        protocol: "openai-compatible",
        canonicalBaseUrl: "http://api.openai.com/?key=leak"
      })) as typeof fetch
    );

    await expect(resolver.resolve(CREDENTIAL_REF)).rejects.toBeInstanceOf(CredentialResolutionError);
    await expect(resolver.resolve(CREDENTIAL_REF)).rejects.toMatchObject({
      code: "credential_broker_invalid_response"
    });
  });

  test("does not expose native broker response messages", async () => {
    const resolver = createCredentialResolverFromEnvironment(
      {
        GEOCHAT_CREDENTIAL_BROKER_URL: "http://127.0.0.1:17366/",
        GEOCHAT_CREDENTIAL_BROKER_TOKEN: "broker-token"
      },
      (async () => Response.json({
        error: "secret_not_found",
        message: "provider-secret-should-not-escape"
      }, { status: 404 })) as typeof fetch
    );

    try {
      await resolver.resolve(CREDENTIAL_REF);
      throw new Error("Expected credential resolution to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialResolutionError);
      expect(String(error)).not.toContain("provider-secret-should-not-escape");
      expect(error).toMatchObject({ code: "secret_not_found", status: 409 });
    }
  });
});
