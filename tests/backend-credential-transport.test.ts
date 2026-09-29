import { describe, expect, test } from "bun:test";
import {
  createBackendLanguageModel,
  createCredentialBoundFetch,
} from "../backend/src/agent/ai-sdk-models";
import { isNativeChatRequest } from "../backend/src/agent/native-chat";
import {
  CredentialResolutionError,
  type CredentialResolver,
  type ResolvedCredentialEnvelope,
} from "../backend/src/credentials/resolver";

const CREDENTIAL_REF = "9db97593-5568-40fa-b800-8d0febc67907";

function envelope(
  secret: string,
  overrides: Partial<ResolvedCredentialEnvelope> = {},
): ResolvedCredentialEnvelope {
  return {
    schemaVersion: 1,
    secret,
    provider: "openai",
    protocol: "openai-compatible",
    canonicalBaseUrl: "https://provider.example/v1",
    ...overrides,
  };
}

function request(model: Record<string, unknown>) {
  return {
    messages: [{ id: "user-1", role: "user", parts: [{ type: "text", text: "hello" }] }],
    runId: "run-1",
    conversationId: "conversation-1",
    model: {
      provider: "openai",
      model: "gpt-test",
      credentialRef: CREDENTIAL_REF,
      ...model,
    },
    locale: "en-US",
    thinking: false,
  };
}

describe("backend credential transport", () => {
  test.each(["apiKey", "customBaseUrl", "url", "headers"])(
    "rejects the legacy or renderer-controlled model field %s",
    (field) => {
      expect(isNativeChatRequest(request({ [field]: field === "headers" ? {} : "untrusted" }))).toBe(false);
      expect(isNativeChatRequest({ ...request({}), [field]: "untrusted" })).toBe(false);
    },
  );

  test("rejects renderer provider and protocol mismatches against the trusted envelope", async () => {
    const credentialResolver: CredentialResolver = {
      resolve: async () => envelope("secret", { provider: "anthropic", protocol: "anthropic" }),
    };
    await expect(createBackendLanguageModel({
      provider: "openai",
      model: "gpt-test",
      credentialRef: CREDENTIAL_REF,
    }, credentialResolver)).rejects.toMatchObject({
      code: "credential_binding_mismatch",
      status: 409,
    });
  });

  test("re-resolves before every upstream fetch and stops immediately after deletion", async () => {
    const resolutions = [envelope("rotated-one"), envelope("rotated-two")];
    let resolveCount = 0;
    const credentialResolver: CredentialResolver = {
      resolve: async () => {
        const result = resolutions[resolveCount++];
        if (!result) throw new CredentialResolutionError("credential_not_found", "The saved credential is unavailable.", 409);
        return result;
      },
    };
    const upstream: Request[] = [];
    const secureFetch = createCredentialBoundFetch({
      credentialRef: CREDENTIAL_REF,
      credentialResolver,
      binding: envelope("ignored"),
      fetchImplementation: (async (input, init) => {
        upstream.push(new Request(input, init));
        return new Response("ok");
      }) as typeof fetch,
    });

    await secureFetch("https://provider.example/v1/responses");
    await secureFetch("https://provider.example/v1/responses");
    await expect(secureFetch("https://provider.example/v1/responses")).rejects.toMatchObject({
      code: "credential_not_found",
    });

    expect(resolveCount).toBe(3);
    expect(upstream).toHaveLength(2);
    expect(upstream.map((item) => item.headers.get("authorization"))).toEqual([
      "Bearer rotated-one",
      "Bearer rotated-two",
    ]);
  });

  test.each([
    ["openai-compatible", "authorization", "Bearer live-secret"],
    ["anthropic", "x-api-key", "live-secret"],
    ["google", "x-goog-api-key", "live-secret"],
  ] as const)("replaces %s authentication and forces redirect error", async (protocol, header, expected) => {
    let captured: Request | undefined;
    const binding = envelope("ignored", { protocol });
    const controller = new AbortController();
    const secureFetch = createCredentialBoundFetch({
      credentialRef: CREDENTIAL_REF,
      binding,
      credentialResolver: { resolve: async () => envelope("live-secret", { protocol }) },
      fetchImplementation: (async (input, init) => {
        captured = new Request(input, init);
        return new Response("ok");
      }) as typeof fetch,
    });

    await secureFetch("https://provider.example/v1/messages?key=renderer-key&safe=1", {
      headers: {
        authorization: "Bearer renderer-secret",
        "x-api-key": "renderer-secret",
        "x-goog-api-key": "renderer-secret",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    expect(captured?.headers.get(header)).toBe(expected);
    expect(captured?.headers.get("authorization")).toBe(protocol === "openai-compatible" ? expected : null);
    expect(captured?.headers.get("x-api-key")).toBe(protocol === "anthropic" ? expected : null);
    expect(captured?.headers.get("x-goog-api-key")).toBe(protocol === "google" ? expected : null);
    expect(captured?.headers.get("anthropic-version")).toBe(protocol === "anthropic" ? "2023-06-01" : null);
    expect(captured?.url).toBe("https://provider.example/v1/messages?safe=1");
    expect(captured?.redirect).toBe("error");
    expect(captured?.signal.aborted).toBe(false);
    controller.abort();
    expect(captured?.signal.aborted).toBe(true);
  });

  test.each([
    "https://attacker.example/v1/responses",
    "https://provider.example/v10/responses",
    "https://provider.example/other/responses",
  ])("blocks destinations outside the trusted origin and base path: %s", async (url) => {
    let resolved = false;
    let fetched = false;
    const secureFetch = createCredentialBoundFetch({
      credentialRef: CREDENTIAL_REF,
      binding: envelope("ignored"),
      credentialResolver: {
        resolve: async () => {
          resolved = true;
          return envelope("secret");
        },
      },
      fetchImplementation: (async () => {
        fetched = true;
        return new Response("unexpected");
      }) as typeof fetch,
    });

    await expect(secureFetch(url)).rejects.toMatchObject({ code: "credential_destination_blocked" });
    expect(resolved).toBe(false);
    expect(fetched).toBe(false);
  });

  test("rejects rebinding between model creation and an actual fetch", async () => {
    let fetched = false;
    const secureFetch = createCredentialBoundFetch({
      credentialRef: CREDENTIAL_REF,
      binding: envelope("ignored"),
      credentialResolver: {
        resolve: async () => envelope("secret", { canonicalBaseUrl: "https://provider.example/v2" }),
      },
      fetchImplementation: (async () => {
        fetched = true;
        return new Response("unexpected");
      }) as typeof fetch,
    });

    await expect(secureFetch("https://provider.example/v1/responses")).rejects.toMatchObject({
      code: "credential_binding_changed",
    });
    expect(fetched).toBe(false);
  });
});
