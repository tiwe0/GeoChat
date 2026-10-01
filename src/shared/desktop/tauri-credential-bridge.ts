import type {
  DesktopProviderCredentialMetadata,
  DesktopProviderCredentialStatus,
  DesktopSaveProviderCredentialRequest,
  GeoChatDesktopApi,
} from "../desktop-api";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export const TAURI_CREDENTIAL_COMMANDS = {
  saveProviderCredential: "save_provider_credential",
  deleteProviderCredential: "delete_provider_credential",
  listPendingCredentialCleanup: "list_pending_credential_cleanup",
  listProviderCredentialMetadata: "list_provider_credential_metadata",
} as const;

type CredentialBridge = Pick<
  GeoChatDesktopApi,
  | "saveProviderCredential"
  | "deleteProviderCredential"
  | "listPendingCredentialCleanup"
  | "getProviderCredentialStatus"
  | "listProviderCredentialMetadata"
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
    listPendingCredentialCleanup: () =>
      invoke<string[]>(TAURI_CREDENTIAL_COMMANDS.listPendingCredentialCleanup),
    getProviderCredentialStatus: async (credentialRef: string): Promise<DesktopProviderCredentialStatus> => {
      const metadata = (await listProviderCredentialMetadata([credentialRef]))[0] ?? null;
      return { credentialRef, configured: metadata !== null, metadata };
    },
    listProviderCredentialMetadata,
  };
}
