import type {
  DesktopProviderCredentialMetadata,
  DesktopBeginProviderCredentialResult,
  DesktopCredentialLifecycleStatus,
  DesktopProviderCredentialStatus,
  DesktopSaveProviderCredentialRequest,
  GeoChatDesktopApi,
} from "../desktop-api";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export const TAURI_CREDENTIAL_COMMANDS = {
  beginProviderCredential: "begin_provider_credential",
  commitProviderCredential: "commit_provider_credential",
  abortProviderCredential: "abort_provider_credential",
  reconcileProviderCredentials: "reconcile_provider_credentials",
  retireProviderCredential: "retire_provider_credential",
  listProviderCredentialMetadata: "list_provider_credential_metadata",
} as const;

type CredentialBridge = Pick<
  GeoChatDesktopApi,
  | "beginProviderCredential"
  | "commitProviderCredential"
  | "abortProviderCredential"
  | "reconcileProviderCredentials"
  | "retireProviderCredential"
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
    beginProviderCredential: (request: DesktopSaveProviderCredentialRequest) =>
      invoke<DesktopBeginProviderCredentialResult>(TAURI_CREDENTIAL_COMMANDS.beginProviderCredential, { request }),
    commitProviderCredential: (operationId, nextConfigJson) =>
      invoke<DesktopCredentialLifecycleStatus>(TAURI_CREDENTIAL_COMMANDS.commitProviderCredential, {
        operationId, nextConfigJson,
      }),
    abortProviderCredential: (operationId) =>
      invoke<DesktopCredentialLifecycleStatus>(TAURI_CREDENTIAL_COMMANDS.abortProviderCredential, { operationId }),
    reconcileProviderCredentials: () =>
      invoke<DesktopCredentialLifecycleStatus>(TAURI_CREDENTIAL_COMMANDS.reconcileProviderCredentials),
    retireProviderCredential: (credentialRef, nextConfigJson) =>
      invoke<DesktopCredentialLifecycleStatus>(TAURI_CREDENTIAL_COMMANDS.retireProviderCredential, {
        credentialRef, nextConfigJson,
      }),
    getProviderCredentialStatus: async (credentialRef: string): Promise<DesktopProviderCredentialStatus> => {
      const metadata = (await listProviderCredentialMetadata([credentialRef]))[0] ?? null;
      return { credentialRef, configured: metadata !== null, metadata };
    },
    listProviderCredentialMetadata,
  };
}
