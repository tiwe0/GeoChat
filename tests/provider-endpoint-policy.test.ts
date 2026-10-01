import { describe, expect, test } from "bun:test";
import { isValidProviderEndpoint } from "../src/shared/desktop/provider-endpoint";
import loopbackPolicy from "./fixtures/credential-loopback-policy.json";

describe("renderer provider endpoint policy", () => {
  test.each(loopbackPolicy)("matches the native loopback policy for $url", ({ url, allowed }) => {
    expect(isValidProviderEndpoint(url)).toBe(allowed);
  });

  test("rejects query strings and fragments, including empty delimiters", () => {
    for (const endpoint of [
      "https://example.com/v1?token=x",
      "https://example.com/v1#fragment",
      "https://example.com/v1?",
      "https://example.com/v1#",
    ]) {
      expect(isValidProviderEndpoint(endpoint), endpoint).toBe(false);
    }
  });

  test("matches native scheme, credential, and scheme-less behavior", () => {
    expect(isValidProviderEndpoint(" API.Example.COM:443//v1/// ")).toBe(true);
    expect(isValidProviderEndpoint("https://api.example.com/v1")).toBe(true);
    expect(isValidProviderEndpoint("http://api.example.com/v1")).toBe(false);
    expect(isValidProviderEndpoint("https://user:pass@example.com/v1")).toBe(false);
    expect(isValidProviderEndpoint("file:///tmp/socket")).toBe(false);
  });
});
