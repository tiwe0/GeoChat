use crate::{
    credential_migration::{CredentialMigrationJournal, CredentialMigrationJournalStore},
    credentials::{
        CredentialError, CredentialMetadata, CredentialVault, ImportLegacyCredentialRequest,
        SaveCredentialRequest,
    },
};
use serde::Deserialize;
use std::{
    path::Path,
    sync::{Arc, Mutex},
};
use tauri::State;

pub(crate) struct CredentialCommandState {
    vault: Arc<CredentialVault>,
    operation_lock: Arc<Mutex<()>>,
    migration_journal: Arc<CredentialMigrationJournalStore>,
}

impl CredentialCommandState {
    pub(crate) fn new(vault: Arc<CredentialVault>, app_data_dir: &Path) -> Self {
        Self {
            vault,
            operation_lock: Arc::new(Mutex::new(())),
            migration_journal: Arc::new(CredentialMigrationJournalStore::new(app_data_dir)),
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
    let migration_journal = state.migration_journal.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = operation_lock
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?;
        let import_allowed = migration_journal
            .read()
            .map_err(|_| CredentialError::StoreFailure)?
            .is_some_and(|journal| journal.allows_import(request.credential_ref()));
        if !import_allowed {
            return Err(CredentialError::MigrationDisabled);
        }
        vault.import_if_absent(request)
    })
    .await
    .map_err(|_| CredentialError::TaskFailure)?
}

#[tauri::command]
pub(crate) async fn read_credential_migration_journal(
    state: State<'_, CredentialCommandState>,
) -> Result<Option<CredentialMigrationJournal>, String> {
    let migration_journal = state.migration_journal.clone();
    let operation_lock = state.operation_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = operation_lock
            .lock()
            .map_err(|_| "credential_migration_lock_failed".to_owned())?;
        migration_journal.read()
    })
    .await
    .map_err(|_| "credential_migration_task_failed".to_owned())?
}

#[tauri::command]
pub(crate) async fn persist_credential_migration_journal(
    state: State<'_, CredentialCommandState>,
    journal: CredentialMigrationJournal,
) -> Result<(), String> {
    let migration_journal = state.migration_journal.clone();
    let operation_lock = state.operation_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = operation_lock
            .lock()
            .map_err(|_| "credential_migration_lock_failed".to_owned())?;
        migration_journal.persist(&journal)
    })
    .await
    .map_err(|_| "credential_migration_task_failed".to_owned())?
}

#[tauri::command]
pub(crate) async fn delete_credential_migration_journal(
    state: State<'_, CredentialCommandState>,
) -> Result<(), String> {
    let migration_journal = state.migration_journal.clone();
    let operation_lock = state.operation_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = operation_lock
            .lock()
            .map_err(|_| "credential_migration_lock_failed".to_owned())?;
        migration_journal.delete()
    })
    .await
    .map_err(|_| "credential_migration_task_failed".to_owned())?
}
