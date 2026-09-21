import { afterEach, describe, expect, test } from "bun:test";
import { discoverProviderModels } from "../src/renderer-react/src/features/models/modelDiscovery";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("model settings API key probe", () => {
  test("treats a provider model response as a valid credential", async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { headers: Record<string, string> };
      expect(request.headers.authorization).toBe("Bearer test-key");
      return Response.json({
        status: 200,
        bodyBase64: Buffer.from(JSON.stringify({ data: [{ id: "deepseek-chat" }] })).toString("base64"),
      });
    }) as typeof fetch;

    await expect(discoverProviderModels({
      apiOrigin: "http://127.0.0.1:17382",
      provider: "deepseek",
      apiKey: "test-key",
      force: true,
    })).resolves.toMatchObject({ status: "ok", ids: ["deepseek-chat"] });
  });

  test("reports provider authentication rejection without accepting the key", async () => {
    globalThis.fetch = (async () => Response.json({ status: 401, bodyBase64: "" })) as typeof fetch;

    await expect(discoverProviderModels({
      apiOrigin: "http://127.0.0.1:17382",
      provider: "deepseek",
      apiKey: "wrong-key",
      force: true,
    })).resolves.toEqual({ status: "failed", message: "Provider responded 401" });
  });
});
