import { describe, expect, test } from "bun:test";
import { replaceProviderCredential } from "../src/renderer-react/src/features/desktop/settings/ModelSettings";
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
  test("clears the transient secret, validates by reference, commits, then deletes the old reference", async () => {
    const events: string[] = [];
    await replaceProviderCredential({
      desktopApi: {
        saveProviderCredential: async () => { events.push("save"); return METADATA; },
        deleteProviderCredential: async (credentialRef) => { events.push(`delete:${credentialRef}`); }
      },
      request: request(),
      previousCredentialRef: "old-ref",
      onCredentialStored: () => events.push("clear"),
      validate: async (credentialRef) => { events.push(`validate:${credentialRef}`); },
      commit: (metadata) => { events.push(`commit:${metadata.credentialRef}`); }
    });

    expect(events).toEqual([
      "save",
      "clear",
      "validate:new-ref",
      "commit:new-ref",
      "delete:old-ref"
    ]);
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
      commit: () => { committed = true; }
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
      commit: () => { throw new Error("config write failed"); }
    })).rejects.toThrow("config write failed");

    expect(deleted).toEqual(["new-ref"]);
  });

  test("keeps a committed replacement when best-effort cleanup of the old reference fails", async () => {
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
      commit: () => { committed = true; }
    })).resolves.toEqual(METADATA);

    expect(committed).toBe(true);
  });
});
