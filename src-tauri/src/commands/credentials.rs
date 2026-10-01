use crate::credentials::{
    CredentialCleanupQueue, CredentialError, CredentialMetadata, CredentialVault,
    SaveCredentialRequest,
};
use serde::Deserialize;
use std::{
    path::Path,
    sync::{Arc, Mutex},
};
use tauri::State;

pub(crate) struct CredentialCommandState {
    vault: Arc<CredentialVault>,
    cleanup_queue: Arc<CredentialCleanupQueue>,
    operation_lock: Arc<Mutex<()>>,
}

impl CredentialCommandState {
    pub(crate) fn new(vault: Arc<CredentialVault>, app_data_dir: &Path) -> Self {
        Self {
            vault,
            cleanup_queue: Arc::new(CredentialCleanupQueue::new(app_data_dir)),
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
    let cleanup_queue = state.cleanup_queue.clone();
    let operation_lock = state.operation_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = operation_lock
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?;
        delete_and_update_cleanup(&vault, &cleanup_queue, &credential_ref)
    })
    .await
    .map_err(|_| CredentialError::TaskFailure)?
}

fn delete_and_update_cleanup(
    vault: &CredentialVault,
    cleanup_queue: &CredentialCleanupQueue,
    credential_ref: &str,
) -> Result<(), CredentialError> {
    match vault.delete(credential_ref) {
        Ok(()) | Err(CredentialError::NotFound) => {
            cleanup_queue.remove(credential_ref)?;
            Ok(())
        }
        Err(error) => {
            cleanup_queue.track(credential_ref)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub(crate) async fn list_pending_credential_cleanup(
    state: State<'_, CredentialCommandState>,
) -> Result<Vec<String>, CredentialError> {
    let cleanup_queue = state.cleanup_queue.clone();
    let operation_lock = state.operation_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = operation_lock
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?;
        cleanup_queue.list()
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

#[cfg(test)]
mod tests {
    use super::delete_and_update_cleanup;
    use crate::credentials::{
        CredentialCleanupQueue, CredentialError, CredentialStore, CredentialVault,
        InMemoryCredentialStore, SecretValue,
    };
    use std::{fs, path::PathBuf, sync::Arc};
    use uuid::Uuid;

    struct FailingDeleteStore;

    impl CredentialStore for FailingDeleteStore {
        fn put(&self, _: &str, _: &SecretValue) -> Result<(), CredentialError> {
            Err(CredentialError::StoreFailure)
        }

        fn get(&self, _: &str) -> Result<SecretValue, CredentialError> {
            Err(CredentialError::NotFound)
        }

        fn delete(&self, _: &str) -> Result<(), CredentialError> {
            Err(CredentialError::StoreUnavailable)
        }

        fn exists(&self, _: &str) -> Result<bool, CredentialError> {
            Ok(false)
        }
    }

    fn temporary_directory(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "geochat-credential-command-{label}-{}",
            Uuid::new_v4()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn failed_delete_is_recoverable_after_command_state_reconstruction() {
        let root = temporary_directory("restart");
        let credential_ref = Uuid::new_v4().to_string();
        let vault = CredentialVault::new(Arc::new(FailingDeleteStore));
        let queue = CredentialCleanupQueue::new(&root);

        assert_eq!(
            delete_and_update_cleanup(&vault, &queue, &credential_ref),
            Err(CredentialError::StoreUnavailable)
        );
        assert_eq!(
            CredentialCleanupQueue::new(&root).list().unwrap(),
            vec![credential_ref]
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn already_missing_credential_is_successfully_dequeued() {
        let root = temporary_directory("idempotent");
        let credential_ref = Uuid::new_v4().to_string();
        let queue = CredentialCleanupQueue::new(&root);
        queue.track(&credential_ref).unwrap();
        let vault = CredentialVault::new(Arc::new(InMemoryCredentialStore::default()));

        delete_and_update_cleanup(&vault, &queue, &credential_ref).unwrap();

        assert!(CredentialCleanupQueue::new(&root)
            .list()
            .unwrap()
            .is_empty());
        fs::remove_dir_all(root).unwrap();
    }
}
