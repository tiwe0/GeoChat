use crate::credentials::{
    CredentialError, CredentialMetadata, CredentialVault, ImportLegacyCredentialRequest,
    SaveCredentialRequest,
};
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use tauri::State;

pub(crate) struct CredentialCommandState {
    vault: Arc<CredentialVault>,
    operation_lock: Arc<Mutex<()>>,
}

impl CredentialCommandState {
    pub(crate) fn new(vault: Arc<CredentialVault>) -> Self {
        Self {
            vault,
            operation_lock: Arc::new(Mutex::new(())),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ListCredentialMetadataRequest {
    credential_refs: Vec<String>,
}

#[tauri::command]
pub(crate) async fn save_provider_credential(
    state: State<'_, CredentialCommandState>,
    request: SaveCredentialRequest,
) -> Result<CredentialMetadata, CredentialError> {
    let vault = state.vault.clone();
    let operation_lock = state.operation_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = operation_lock
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?;
        vault.save(request)
    })
    .await
    .map_err(|_| CredentialError::TaskFailure)?
}

#[tauri::command]
pub(crate) async fn delete_provider_credential(
    state: State<'_, CredentialCommandState>,
    credential_ref: String,
) -> Result<(), CredentialError> {
    let vault = state.vault.clone();
    let operation_lock = state.operation_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = operation_lock
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?;
        vault.delete(&credential_ref)
    })
    .await
    .map_err(|_| CredentialError::TaskFailure)?
}

#[tauri::command]
pub(crate) async fn list_provider_credential_metadata(
    state: State<'_, CredentialCommandState>,
    request: ListCredentialMetadataRequest,
) -> Result<Vec<CredentialMetadata>, CredentialError> {
    let vault = state.vault.clone();
    let operation_lock = state.operation_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = operation_lock
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?;
        vault.list_metadata(&request.credential_refs)
    })
    .await
    .map_err(|_| CredentialError::TaskFailure)?
}

/// One-way legacy migration command. The integration layer must stop
/// registering or accepting this command after the supported migration window.
#[tauri::command]
pub(crate) async fn import_legacy_credential(
    state: State<'_, CredentialCommandState>,
    request: ImportLegacyCredentialRequest,
) -> Result<CredentialMetadata, CredentialError> {
    let vault = state.vault.clone();
    let operation_lock = state.operation_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = operation_lock
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?;
        vault.import_if_absent(request)
    })
    .await
    .map_err(|_| CredentialError::TaskFailure)?
}
