import { describe, expect, test } from "bun:test";
import {
  credentialCleanupBlocksSave,
  CredentialCleanupRequiredError,
  replaceProviderCredential,
} from "../src/renderer-react/src/features/desktop/settings/ModelSettings";
import type { DesktopProviderCredentialMetadata } from "../src/shared/desktop-api";

const METADATA: DesktopProviderCredentialMetadata = {
  credentialRef: "new-ref",
  provider: "deepseek",
  protocol: "openai-compatible",
  canonicalBaseUrl: "https://api.deepseek.com"
};

function request() {
  return {
    provider: "deepseek",
    protocol: "openai-compatible" as const,
    baseUrl: "https://api.deepseek.com",
    secret: "new-secret"
  };
}

describe("renderer provider credential replacement", () => {
  test("fails closed until the native cleanup queue is loaded and empty", () => {
    expect(credentialCleanupBlocksSave({ status: "loading" })).toBe(true);
    expect(credentialCleanupBlocksSave({ status: "error" })).toBe(true);
    expect(credentialCleanupBlocksSave({ status: "ready", credentialRefs: ["pending-ref"] })).toBe(true);
    expect(credentialCleanupBlocksSave({ status: "ready", credentialRefs: [] })).toBe(false);
  });

  test("clears the transient secret, validates by reference, commits, then deletes the old reference", async () => {
    const events: string[] = [];
    const result = await replaceProviderCredential({
      desktopApi: {
        saveProviderCredential: async () => { events.push("save"); return METADATA; },
        deleteProviderCredential: async (credentialRef) => { events.push(`delete:${credentialRef}`); }
      },
      request: request(),
      previousCredentialRef: "old-ref",
      onCredentialStored: () => events.push("clear"),
      validate: async (credentialRef) => { events.push(`validate:${credentialRef}`); },
      commit: async (metadata) => { events.push(`commit:${metadata.credentialRef}`); }
    });

    expect(events).toEqual([
      "save",
      "clear",
      "validate:new-ref",
      "commit:new-ref",
      "delete:old-ref"
    ]);
    expect(result).toEqual({ metadata: METADATA, cleanup: { status: "complete" } });
  });

  test("deletes an uncommitted new reference when validation fails and leaves the old reference intact", async () => {
    const deleted: string[] = [];
    let committed = false;
    await expect(replaceProviderCredential({
      desktopApi: {
        saveProviderCredential: async () => METADATA,
        deleteProviderCredential: async (credentialRef) => { deleted.push(credentialRef); }
      },
      request: request(),
      previousCredentialRef: "old-ref",
      onCredentialStored: () => undefined,
      validate: async () => { throw new Error("invalid credential"); },
      commit: async () => { committed = true; }
    })).rejects.toThrow("invalid credential");

    expect(committed).toBe(false);
    expect(deleted).toEqual(["new-ref"]);
  });

  test("rolls back the new reference when the config commit fails", async () => {
    const deleted: string[] = [];
    await expect(replaceProviderCredential({
      desktopApi: {
        saveProviderCredential: async () => METADATA,
        deleteProviderCredential: async (credentialRef) => { deleted.push(credentialRef); }
      },
      request: request(),
      previousCredentialRef: "old-ref",
      onCredentialStored: () => undefined,
      validate: async () => undefined,
      commit: async () => { throw new Error("config write failed"); }
    })).rejects.toThrow("config write failed");

    expect(deleted).toEqual(["new-ref"]);
  });

  test("returns the old reference as explicit retryable cleanup when committed replacement cleanup fails", async () => {
    let committed = false;
    await expect(replaceProviderCredential({
      desktopApi: {
        saveProviderCredential: async () => METADATA,
        deleteProviderCredential: async () => { throw new Error("keychain temporarily unavailable"); }
      },
      request: request(),
      previousCredentialRef: "old-ref",
      onCredentialStored: () => undefined,
      validate: async () => undefined,
      commit: async () => { committed = true; }
    })).resolves.toEqual({
      metadata: METADATA,
      cleanup: { status: "retry-required", credentialRef: "old-ref", phase: "replaced" }
    });

    expect(committed).toBe(true);
  });

  test("throws a retryable cleanup error containing the uncommitted new reference when rollback deletion fails", async () => {
    let caught: unknown;
    try {
      await replaceProviderCredential({
        desktopApi: {
          saveProviderCredential: async () => METADATA,
          deleteProviderCredential: async () => { throw new Error("keychain temporarily unavailable"); }
        },
        request: request(),
        previousCredentialRef: "old-ref",
        onCredentialStored: () => undefined,
        validate: async () => { throw new Error("invalid credential"); },
        commit: async () => undefined
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CredentialCleanupRequiredError);
    expect(caught).toMatchObject({
      credentialRef: "new-ref",
      phase: "uncommitted",
      message: "Credential cleanup must be retried before another credential can be saved."
    });
    expect(String(caught)).not.toContain("new-secret");
  });
});
