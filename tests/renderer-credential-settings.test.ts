import { describe, expect, test } from "bun:test";
import {
  credentialCleanupCanRetry,
  credentialCleanupBlocksSave,
  CredentialCleanupRequiredError,
  replaceProviderCredential,
} from "../src/renderer-react/src/features/desktop/settings/ModelSettings";
import { DEFAULT_DESKTOP_CONFIG } from "../src/shared/desktop/desktop-config";
import type { DesktopProviderCredentialMetadata } from "../src/shared/desktop-api";

const METADATA: DesktopProviderCredentialMetadata = {
  credentialRef: "new-ref", provider: "deepseek", protocol: "openai-compatible",
  canonicalBaseUrl: "https://api.deepseek.com",
};
const REQUEST = {
  provider: "deepseek", protocol: "openai-compatible" as const,
  baseUrl: "https://api.deepseek.com", secret: "new-secret",
};

function nextConfig(metadata: DesktopProviderCredentialMetadata) {
  return { ...DEFAULT_DESKTOP_CONFIG, model: { ...DEFAULT_DESKTOP_CONFIG.model, credentialRef: metadata.credentialRef } };
}

describe("renderer provider credential replacement", () => {
  test("fails closed while lifecycle state is loading, pending, or errored", () => {
    expect(credentialCleanupBlocksSave({ status: "loading" })).toBe(true);
    expect(credentialCleanupBlocksSave({ status: "error" })).toBe(true);
    expect(credentialCleanupBlocksSave({ status: "pending", operationId: "operation" })).toBe(true);
    expect(credentialCleanupBlocksSave({ status: "ready" })).toBe(false);
    expect(credentialCleanupCanRetry({ status: "loading" })).toBe(false);
    expect(credentialCleanupCanRetry({ status: "ready" })).toBe(false);
    expect(credentialCleanupCanRetry({ status: "error" })).toBe(true);
    expect(credentialCleanupCanRetry({ status: "pending", operationId: "operation" })).toBe(true);
  });

  test("uses begin, validation, and native config CAS without renderer deletion", async () => {
    const events: string[] = [];
    const result = await replaceProviderCredential({
      desktopApi: {
        beginProviderCredential: async () => { events.push("begin"); return { operationId: "operation", metadata: METADATA }; },
        commitProviderCredential: async () => { events.push("commit"); return { status: "ready" }; },
        abortProviderCredential: async () => { events.push("abort"); return { status: "ready" }; },
      },
      request: REQUEST,
      onCredentialStored: () => events.push("clear"),
      validate: async (credentialRef) => events.push(`validate:${credentialRef}`),
      buildNextConfig: nextConfig,
      acceptCommittedConfig: () => events.push("mirror"),
    });
    expect(events).toEqual(["begin", "clear", "validate:new-ref", "commit", "mirror"]);
    expect(result).toEqual({ metadata: METADATA, cleanup: { status: "complete" } });
  });

  test("validation failure aborts the journaled operation", async () => {
    const events: string[] = [];
    await expect(replaceProviderCredential({
      desktopApi: {
        beginProviderCredential: async () => ({ operationId: "operation", metadata: METADATA }),
        commitProviderCredential: async () => ({ status: "ready" }),
        abortProviderCredential: async () => { events.push("abort"); return { status: "ready" }; },
      },
      request: REQUEST,
      onCredentialStored: () => undefined,
      validate: async () => { throw new Error("invalid credential"); },
      buildNextConfig: nextConfig,
      acceptCommittedConfig: () => undefined,
    })).rejects.toThrow("invalid credential");
    expect(events).toEqual(["abort"]);
  });

  test("surfaces retryable native pending state without exposing the secret", async () => {
    let caught: unknown;
    try {
      await replaceProviderCredential({
        desktopApi: {
          beginProviderCredential: async () => ({ operationId: "operation", metadata: METADATA }),
          commitProviderCredential: async () => { throw new Error("config CAS failed"); },
          abortProviderCredential: async () => ({ status: "pending", operationId: "operation" }),
        },
        request: REQUEST,
        onCredentialStored: () => undefined,
        validate: async () => undefined,
        buildNextConfig: nextConfig,
        acceptCommittedConfig: () => undefined,
      });
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(CredentialCleanupRequiredError);
    expect(caught).toMatchObject({ operationId: "operation", phase: "uncommitted" });
    expect(String(caught)).not.toContain("new-secret");
  });
});
