import { afterEach, describe, expect, test } from "bun:test";
import { discoverProviderModels } from "../src/renderer-react/src/features/models/modelDiscovery";

const originalFetch = globalThis.fetch;
const originalBrowser = Object.getOwnPropertyDescriptor(globalThis, "browser");

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBrowser) Object.defineProperty(globalThis, "browser", originalBrowser);
  else delete (globalThis as { browser?: unknown }).browser;
});

describe("model settings API key probe", () => {
  test("reads and writes the catalog through the browser storage adapter", async () => {
    const values = new Map<string, unknown>();
    Object.defineProperty(globalThis, "browser", {
      configurable: true,
      value: {
        storage: {
          local: {
            get: async (key: string) => ({ [key]: values.get(key) }),
            set: async (entries: Record<string, unknown>) => {
              for (const [key, value] of Object.entries(entries)) values.set(key, value);
            }
          }
        }
      }
    });
    globalThis.fetch = (async () => Response.json({ ids: ["deepseek-chat"] })) as typeof fetch;

    const first = await discoverProviderModels({
      apiOrigin: "http://127.0.0.1:17382",
      credentialRef: "credential-ref",
      force: true
    });
    expect(first).toMatchObject({ status: "ok", ids: ["deepseek-chat"], fromCache: false });

    globalThis.fetch = (async () => {
      throw new Error("cache miss");
    }) as typeof fetch;
    await expect(discoverProviderModels({
      apiOrigin: "http://127.0.0.1:17382",
      credentialRef: "credential-ref"
    })).resolves.toMatchObject({ status: "ok", ids: ["deepseek-chat"], fromCache: true });
  });

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
    })).resolves.toEqual({ status: "failed", message: "Provider responded 401", errorCode: "provider_http_error" });
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
    })).resolves.toEqual({ status: "failed", message: "Model discovery timed out.", errorCode: "model_discovery_timeout" });
  });

  test("reports malformed provider responses with a stable contract error code", async () => {
    globalThis.fetch = (async () => new Response("not-json")) as typeof fetch;

    await expect(discoverProviderModels({
      apiOrigin: "http://127.0.0.1:17382",
      credentialRef: "credential-ref",
      force: true,
    })).resolves.toEqual({
      status: "failed",
      message: "The provider model discovery response did not match the runtime contract.",
      errorCode: "model_discovery_response_invalid"
    });
  });
});
