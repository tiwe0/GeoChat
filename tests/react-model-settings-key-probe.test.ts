import { afterEach, describe, expect, test } from "bun:test";
import { discoverProviderModels } from "../src/renderer-react/src/features/models/modelDiscovery";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("model settings API key probe", () => {
  test("sends only the credential reference and accepts discovered ids", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:17382/v1/models/discover");
      expect(JSON.parse(String(init?.body))).toEqual({ credentialRef: "credential-ref" });
      expect(String(init?.body)).not.toContain("test-key");
      return Response.json({ ids: ["deepseek-chat"] });
    }) as typeof fetch;

    await expect(discoverProviderModels({
      apiOrigin: "http://127.0.0.1:17382",
      credentialRef: "credential-ref",
      force: true,
    })).resolves.toMatchObject({ status: "ok", ids: ["deepseek-chat"] });
  });

  test("reports provider authentication rejection without accepting the key", async () => {
    globalThis.fetch = (async () => Response.json({
      error: "provider_http_error",
      message: "Provider responded with HTTP 401.",
      status: 401,
      bodyBase64: ""
    }, { status: 502 })) as typeof fetch;

    await expect(discoverProviderModels({
      apiOrigin: "http://127.0.0.1:17382",
      credentialRef: "credential-ref",
      force: true,
    })).resolves.toEqual({ status: "failed", message: "Provider responded 401" });
  });

  test("preserves structured discovery failures instead of collapsing them to HTTP 502", async () => {
    globalThis.fetch = (async () => Response.json({
      error: "model_discovery_timeout",
      message: "Model discovery timed out."
    }, { status: 504 })) as typeof fetch;

    await expect(discoverProviderModels({
      apiOrigin: "http://127.0.0.1:17382",
      credentialRef: "credential-ref",
      force: true,
    })).resolves.toEqual({ status: "failed", message: "Model discovery timed out." });
  });
});
