import type { GeoChatDesktopApi } from "../desktop-api";
import { CONFIG_STORAGE_KEY } from "./desktop-config";
import {
  hasLegacyPlaintextCredentials,
  parseRawDesktopConfig,
  planLegacyDesktopCredentialMigrationAsync,
  runLegacyDesktopCredentialMigration,
  type LegacyCredentialIdentity,
} from "./desktop-credentials";

export const CREDENTIAL_MIGRATION_BACKUP_KEY = `${CONFIG_STORAGE_KEY}:credential-migration-backup:v1`;

type MigrationApi = Pick<
  GeoChatDesktopApi,
  | "deleteCredentialMigrationJournal"
  | "getProviderCredentialStatus"
  | "importLegacyCredential"
  | "persistCredentialMigrationJournal"
  | "readCredentialMigrationJournal"
>;

type MigrationStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

async function sha256Fingerprint(identity: LegacyCredentialIdentity) {
  const input = new TextEncoder().encode(JSON.stringify([
    identity.provider,
    identity.secret,
    identity.canonicalBaseUrl,
    identity.protocol,
  ]));
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hex = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}

function createCredentialRef() {
  if (typeof crypto.randomUUID !== "function") {
    throw new Error("Secure credential migration requires crypto.randomUUID");
  }
  return crypto.randomUUID();
}

/**
 * Migrates legacy renderer plaintext before any configuration consumer runs.
 * The native journal is the recovery authority; the local backup is retained
 * only while a migration is incomplete and is deleted on successful recovery.
 */
export async function migrateLegacyDesktopCredentialsBeforeConfigLoad(
  storage: MigrationStorage = localStorage,
  api?: MigrationApi,
) {
  const desktopApi = api;
  const rawJson = storage.getItem(CONFIG_STORAGE_KEY) ?? "{}";
  const rawConfig = parseRawDesktopConfig(rawJson);
  const containsPlaintext = hasLegacyPlaintextCredentials(rawConfig);

  if (!desktopApi) {
    if (containsPlaintext) {
      throw new Error("Legacy provider credentials require the desktop secure credential store");
    }
    return;
  }

  const previousJournal = await desktopApi.readCredentialMigrationJournal();
  if (!containsPlaintext && !previousJournal) {
    storage.removeItem(CREDENTIAL_MIGRATION_BACKUP_KEY);
    return;
  }

  const plan = await planLegacyDesktopCredentialMigrationAsync(rawJson, {
    fingerprint: sha256Fingerprint,
    createCredentialRef,
    previousJournal: previousJournal ?? undefined,
  });
  if (plan.conflicts.length) {
    throw new Error(`Legacy credential migration has ${plan.conflicts.length} unresolved conflict(s)`);
  }
  if (plan.journal.entries.some((entry) => entry.phase === "planned") && plan.items.length === 0) {
    throw new Error("Legacy credential migration journal cannot resume without its plaintext source");
  }

  if (storage.getItem(CREDENTIAL_MIGRATION_BACKUP_KEY) === null) {
    storage.setItem(CREDENTIAL_MIGRATION_BACKUP_KEY, rawJson);
  }

  await runLegacyDesktopCredentialMigration(plan, {
    persistJournal: (journal) => desktopApi.persistCredentialMigrationJournal(journal),
    credentialExists: async (credentialRef) =>
      (await desktopApi.getProviderCredentialStatus(credentialRef)).configured,
    storeCredential: async (credential) => {
      await desktopApi.importLegacyCredential({
        credentialRef: credential.credentialRef,
        provider: credential.provider,
        protocol: credential.protocol,
        baseUrl: credential.canonicalBaseUrl,
        secret: credential.secret,
      });
    },
    writeSanitizedConfig: (nextRawJson) => storage.setItem(CONFIG_STORAGE_KEY, nextRawJson),
    readConfig: () => storage.getItem(CONFIG_STORAGE_KEY) ?? "{}",
    deleteJournal: () => desktopApi.deleteCredentialMigrationJournal(),
  });
  storage.removeItem(CREDENTIAL_MIGRATION_BACKUP_KEY);
}
