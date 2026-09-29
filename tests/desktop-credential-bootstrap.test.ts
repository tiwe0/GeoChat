import { describe, expect, test } from "bun:test";
import type { CredentialMigrationJournal } from "../src/shared/desktop/desktop-credentials";
import {
  CREDENTIAL_MIGRATION_BACKUP_KEY,
  migrateLegacyDesktopCredentialsBeforeConfigLoad,
} from "../src/shared/desktop/desktop-credential-bootstrap";
import { CONFIG_STORAGE_KEY } from "../src/shared/desktop/desktop-config";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    values,
  };
}

function legacyRawConfig() {
  return JSON.stringify({
    locale: "zh-CN",
    model: {
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "legacy-secret",
      customBaseUrl: "https://api.deepseek.com",
    },
  });
}

describe("desktop credential startup migration", () => {
  test("stores secrets natively before replacing plaintext config and removes recovery data", async () => {
    const original = legacyRawConfig();
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: original });
    const stored = new Set<string>();
    let journal: CredentialMigrationJournal | null = null;

    await migrateLegacyDesktopCredentialsBeforeConfigLoad(storage, {
      readCredentialMigrationJournal: async () => journal,
      persistCredentialMigrationJournal: async (next) => { journal = structuredClone(next); },
      deleteCredentialMigrationJournal: async () => { journal = null; },
      getProviderCredentialStatus: async (credentialRef) => ({
        credentialRef,
        configured: stored.has(credentialRef),
        metadata: null,
      }),
      importLegacyCredential: async (request) => {
        expect(journal?.entries.some((entry) => entry.credentialRef === request.credentialRef)).toBe(true);
        expect(request.secret).toBe("legacy-secret");
        stored.add(request.credentialRef);
        return {
          credentialRef: request.credentialRef,
          provider: request.provider,
          protocol: request.protocol,
          canonicalBaseUrl: request.baseUrl,
        };
      },
    });

    const migrated = JSON.parse(storage.getItem(CONFIG_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    expect(JSON.stringify(migrated)).not.toContain("legacy-secret");
    expect(JSON.stringify(migrated)).not.toContain("apiKey");
    expect(migrated).toMatchObject({ locale: "zh-CN", model: { credentialRef: expect.any(String) } });
    expect(stored.size).toBe(1);
    expect(journal).toBeNull();
    expect(storage.getItem(CREDENTIAL_MIGRATION_BACKUP_KEY)).toBeNull();
  });

  test("preserves the original backup and journal when native storage fails", async () => {
    const original = legacyRawConfig();
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: original });
    let journal: CredentialMigrationJournal | null = null;

    await expect(migrateLegacyDesktopCredentialsBeforeConfigLoad(storage, {
      readCredentialMigrationJournal: async () => journal,
      persistCredentialMigrationJournal: async (next) => { journal = structuredClone(next); },
      deleteCredentialMigrationJournal: async () => { journal = null; },
      getProviderCredentialStatus: async (credentialRef) => ({ credentialRef, configured: false, metadata: null }),
      importLegacyCredential: async () => { throw new Error("native store unavailable"); },
    })).rejects.toThrow("native store unavailable");

    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(original);
    expect(storage.getItem(CREDENTIAL_MIGRATION_BACKUP_KEY)).toBe(original);
    expect(journal?.entries.every((entry) => entry.phase === "planned")).toBe(true);
  });

  test("fails closed when plaintext exists without the desktop secure store", async () => {
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: legacyRawConfig() });
    await expect(migrateLegacyDesktopCredentialsBeforeConfigLoad(storage, undefined))
      .rejects.toThrow("desktop secure credential store");
  });

  test("removes a stale plaintext backup after a completed migration", async () => {
    const storage = memoryStorage({
      [CONFIG_STORAGE_KEY]: JSON.stringify({ model: { provider: "deepseek", credentialRef: crypto.randomUUID() } }),
      [CREDENTIAL_MIGRATION_BACKUP_KEY]: legacyRawConfig(),
    });
    await migrateLegacyDesktopCredentialsBeforeConfigLoad(storage, {
      readCredentialMigrationJournal: async () => null,
      persistCredentialMigrationJournal: async () => {},
      deleteCredentialMigrationJournal: async () => {},
      getProviderCredentialStatus: async (credentialRef) => ({ credentialRef, configured: true, metadata: null }),
      importLegacyCredential: async () => { throw new Error("not expected"); },
    });
    expect(storage.getItem(CREDENTIAL_MIGRATION_BACKUP_KEY)).toBeNull();
  });
});
