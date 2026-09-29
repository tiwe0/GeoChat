import type {
  DesktopCredentialMigrationJournal,
  DesktopImportLegacyCredentialRequest,
  DesktopProviderCredentialMetadata,
  DesktopProviderCredentialStatus,
  DesktopSaveProviderCredentialRequest,
  GeoChatDesktopApi,
} from "../desktop-api";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export const TAURI_CREDENTIAL_COMMANDS = {
  saveProviderCredential: "save_provider_credential",
  deleteProviderCredential: "delete_provider_credential",
  listProviderCredentialMetadata: "list_provider_credential_metadata",
  importLegacyCredential: "import_legacy_credential",
  readCredentialMigrationJournal: "read_credential_migration_journal",
  persistCredentialMigrationJournal: "persist_credential_migration_journal",
  deleteCredentialMigrationJournal: "delete_credential_migration_journal",
} as const;

type CredentialBridge = Pick<
  GeoChatDesktopApi,
  | "saveProviderCredential"
  | "deleteProviderCredential"
  | "getProviderCredentialStatus"
  | "listProviderCredentialMetadata"
  | "importLegacyCredential"
  | "readCredentialMigrationJournal"
  | "persistCredentialMigrationJournal"
  | "deleteCredentialMigrationJournal"
>;

export function createTauriCredentialBridge(invoke: TauriInvoke): CredentialBridge {
  const listProviderCredentialMetadata = (credentialRefs: string[]) =>
    invoke<DesktopProviderCredentialMetadata[]>(
      TAURI_CREDENTIAL_COMMANDS.listProviderCredentialMetadata,
      { request: { credentialRefs } },
    );

  return {
    saveProviderCredential: (request: DesktopSaveProviderCredentialRequest) =>
      invoke(TAURI_CREDENTIAL_COMMANDS.saveProviderCredential, { request }),
    deleteProviderCredential: (credentialRef: string) =>
      invoke(TAURI_CREDENTIAL_COMMANDS.deleteProviderCredential, { credentialRef }),
    getProviderCredentialStatus: async (credentialRef: string): Promise<DesktopProviderCredentialStatus> => {
      const metadata = (await listProviderCredentialMetadata([credentialRef]))[0] ?? null;
      return { credentialRef, configured: metadata !== null, metadata };
    },
    listProviderCredentialMetadata,
    importLegacyCredential: (request: DesktopImportLegacyCredentialRequest) =>
      invoke(TAURI_CREDENTIAL_COMMANDS.importLegacyCredential, { request }),
    readCredentialMigrationJournal: () =>
      invoke<DesktopCredentialMigrationJournal | null>(TAURI_CREDENTIAL_COMMANDS.readCredentialMigrationJournal),
    persistCredentialMigrationJournal: (journal: DesktopCredentialMigrationJournal) =>
      invoke(TAURI_CREDENTIAL_COMMANDS.persistCredentialMigrationJournal, { journal }),
    deleteCredentialMigrationJournal: () =>
      invoke(TAURI_CREDENTIAL_COMMANDS.deleteCredentialMigrationJournal),
  };
}
