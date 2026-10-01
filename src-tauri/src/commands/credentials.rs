use crate::{
    credentials::{
        CredentialError, CredentialLifecycleJournal, CredentialLifecycleOperation,
        CredentialMetadata, CredentialVault, SaveCredentialRequest,
    },
    DesktopState,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    path::Path,
    sync::{Arc, Mutex},
};
use tauri::State;
use uuid::Uuid;

pub(crate) struct CredentialCommandState {
    vault: Arc<CredentialVault>,
    journal: CredentialLifecycleJournal,
    operation_lock: Arc<Mutex<()>>,
}

impl CredentialCommandState {
    pub(crate) fn new(vault: Arc<CredentialVault>, app_data_dir: &Path) -> Self {
        Self {
            vault,
            journal: CredentialLifecycleJournal::new(app_data_dir),
            operation_lock: Arc::new(Mutex::new(())),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ListCredentialMetadataRequest {
    credential_refs: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BeginCredentialResult {
    operation_id: String,
    metadata: CredentialMetadata,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub(crate) enum CredentialLifecycleStatus {
    Ready,
    Pending { operation_id: String },
}

#[tauri::command]
pub(crate) async fn begin_provider_credential(
    credential_state: State<'_, CredentialCommandState>,
    desktop_state: State<'_, DesktopState>,
    request: SaveCredentialRequest,
) -> Result<BeginCredentialResult, CredentialError> {
    let _guard = credential_state
        .operation_lock
        .lock()
        .map_err(|_| CredentialError::StoreFailure)?;
    let (_, previous_active_refs) = strict_config_snapshot(&desktop_state)?;
    begin_locked(
        &credential_state.vault,
        &credential_state.journal,
        previous_active_refs,
        request,
    )
}

#[tauri::command]
pub(crate) async fn commit_provider_credential(
    credential_state: State<'_, CredentialCommandState>,
    desktop_state: State<'_, DesktopState>,
    operation_id: String,
    expected_config_json: String,
    next_config_json: String,
) -> Result<CredentialLifecycleStatus, CredentialError> {
    let _guard = credential_state
        .operation_lock
        .lock()
        .map_err(|_| CredentialError::StoreFailure)?;
    let operation = credential_state
        .journal
        .load_strict()?
        .ok_or(CredentialError::NotFound)?;
    if operation.operation_id() != operation_id {
        return Err(CredentialError::InvalidReference);
    }
    let (current_config, current_refs) = strict_config_snapshot(&desktop_state)?;
    if current_config == next_config_json {
        return reconcile_locked(&credential_state, &desktop_state, operation);
    }
    if current_config != expected_config_json {
        return Err(CredentialError::InvalidInput);
    }
    let Some(new_ref) = operation.new_ref() else {
        return Err(CredentialError::InvalidInput);
    };
    let next_refs =
        crate::renderer_storage::active_credential_refs_from_raw_config(&next_config_json)
            .map_err(|_| CredentialError::InvalidInput)?;
    if !next_refs.contains(new_ref) || current_refs.contains(new_ref) {
        return Err(CredentialError::InvalidInput);
    }
    commit_config(&desktop_state, &expected_config_json, &next_config_json)?;
    reconcile_locked(&credential_state, &desktop_state, operation)
}

#[tauri::command]
pub(crate) async fn abort_provider_credential(
    credential_state: State<'_, CredentialCommandState>,
    desktop_state: State<'_, DesktopState>,
    operation_id: String,
) -> Result<CredentialLifecycleStatus, CredentialError> {
    let _guard = credential_state
        .operation_lock
        .lock()
        .map_err(|_| CredentialError::StoreFailure)?;
    let operation = credential_state
        .journal
        .load_strict()?
        .ok_or(CredentialError::NotFound)?;
    if operation.operation_id() != operation_id {
        return Err(CredentialError::InvalidReference);
    }
    reconcile_locked(&credential_state, &desktop_state, operation)
}

#[tauri::command]
pub(crate) async fn reconcile_provider_credentials(
    credential_state: State<'_, CredentialCommandState>,
    desktop_state: State<'_, DesktopState>,
) -> Result<CredentialLifecycleStatus, CredentialError> {
    let _guard = credential_state
        .operation_lock
        .lock()
        .map_err(|_| CredentialError::StoreFailure)?;
    let Some(operation) = credential_state.journal.load_strict()? else {
        return Ok(CredentialLifecycleStatus::Ready);
    };
    reconcile_locked(&credential_state, &desktop_state, operation)
}

#[tauri::command]
pub(crate) async fn retire_provider_credential(
    credential_state: State<'_, CredentialCommandState>,
    desktop_state: State<'_, DesktopState>,
    credential_ref: String,
    expected_config_json: String,
    next_config_json: String,
) -> Result<CredentialLifecycleStatus, CredentialError> {
    crate::credentials::validate_credential_ref(&credential_ref)?;
    let _guard = credential_state
        .operation_lock
        .lock()
        .map_err(|_| CredentialError::StoreFailure)?;
    if credential_state.journal.load_strict()?.is_some() {
        return Err(CredentialError::AlreadyExists);
    }
    let (current_config, active_refs) = strict_config_snapshot(&desktop_state)?;
    if current_config != expected_config_json || !active_refs.contains(&credential_ref) {
        return Err(CredentialError::InvalidInput);
    }
    let next_refs =
        crate::renderer_storage::active_credential_refs_from_raw_config(&next_config_json)
            .map_err(|_| CredentialError::InvalidInput)?;
    if next_refs.contains(&credential_ref) {
        return Err(CredentialError::InvalidInput);
    }
    let operation = CredentialLifecycleOperation::retirement(
        Uuid::new_v4().to_string(),
        credential_ref,
        active_refs.into_iter().collect(),
    );
    credential_state.journal.create(&operation)?;
    commit_config(&desktop_state, &expected_config_json, &next_config_json)?;
    reconcile_locked(&credential_state, &desktop_state, operation)
}

fn strict_config_snapshot(
    desktop_state: &DesktopState,
) -> Result<(String, BTreeSet<String>), CredentialError> {
    desktop_state
        .renderer_storage
        .lock()
        .map_err(|_| CredentialError::StoreFailure)?
        .credential_config_snapshot()
        .map_err(|_| CredentialError::CorruptEntry)
}

fn commit_config(
    desktop_state: &DesktopState,
    expected: &str,
    next: &str,
) -> Result<BTreeSet<String>, CredentialError> {
    desktop_state
        .renderer_storage
        .lock()
        .map_err(|_| CredentialError::StoreFailure)?
        .commit_credential_config(expected, next)
        .map_err(|_| CredentialError::StoreFailure)
}

fn begin_locked(
    vault: &CredentialVault,
    journal: &CredentialLifecycleJournal,
    previous_active_refs: BTreeSet<String>,
    request: SaveCredentialRequest,
) -> Result<BeginCredentialResult, CredentialError> {
    if journal.load_strict()?.is_some() {
        return Err(CredentialError::AlreadyExists);
    }
    let prepared = vault.prepare(request)?;
    let operation_id = Uuid::new_v4().to_string();
    let operation = CredentialLifecycleOperation::replacement(
        operation_id.clone(),
        prepared.metadata.clone(),
        previous_active_refs.into_iter().collect(),
    );
    journal.create(&operation)?;
    vault.put_prepared(&prepared)?;
    Ok(BeginCredentialResult {
        operation_id,
        metadata: prepared.metadata,
    })
}

fn reconcile_locked(
    state: &CredentialCommandState,
    desktop_state: &DesktopState,
    operation: CredentialLifecycleOperation,
) -> Result<CredentialLifecycleStatus, CredentialError> {
    let (_, active_refs) = strict_config_snapshot(desktop_state)?;
    reconcile_operation(&state.vault, &state.journal, operation, &active_refs)
}

fn reconcile_operation(
    vault: &CredentialVault,
    journal: &CredentialLifecycleJournal,
    operation: CredentialLifecycleOperation,
    active_refs: &BTreeSet<String>,
) -> Result<CredentialLifecycleStatus, CredentialError> {
    let new_is_active = operation
        .new_ref()
        .is_some_and(|credential_ref| active_refs.contains(credential_ref));
    for credential_ref in operation.cleanup_candidates() {
        let should_delete = match operation.new_ref() {
            Some(new_ref) if !new_is_active => credential_ref == new_ref,
            _ => !active_refs.contains(credential_ref),
        };
        if should_delete {
            match vault.delete(credential_ref) {
                Ok(()) | Err(CredentialError::NotFound) => {}
                Err(_) => {
                    return Ok(CredentialLifecycleStatus::Pending {
                        operation_id: operation.operation_id().to_string(),
                    })
                }
            }
        }
    }
    journal.clear()?;
    Ok(CredentialLifecycleStatus::Ready)
}

#[tauri::command]
pub(crate) async fn list_provider_credential_metadata(
    state: State<'_, CredentialCommandState>,
    request: ListCredentialMetadataRequest,
) -> Result<Vec<CredentialMetadata>, CredentialError> {
    let _guard = state
        .operation_lock
        .lock()
        .map_err(|_| CredentialError::StoreFailure)?;
    state.vault.list_metadata(&request.credential_refs)
}

#[cfg(test)]
mod tests {
    use super::{begin_locked, reconcile_operation, CredentialLifecycleStatus};
    use crate::credentials::{
        CredentialError, CredentialLifecycleJournal, CredentialLifecycleOperation,
        CredentialMetadata, CredentialStore, CredentialVault, SaveCredentialRequest, SecretValue,
    };
    use std::{
        collections::{BTreeSet, HashMap},
        fs,
        path::PathBuf,
        sync::{Arc, Mutex},
    };
    use uuid::Uuid;

    #[derive(Default)]
    struct RecordingStore {
        entries: Mutex<HashMap<String, String>>,
        puts: Mutex<usize>,
        deletes: Mutex<Vec<String>>,
    }

    impl CredentialStore for RecordingStore {
        fn put(&self, credential_ref: &str, value: &SecretValue) -> Result<(), CredentialError> {
            *self.puts.lock().unwrap() += 1;
            self.entries.lock().unwrap().insert(
                credential_ref.to_string(),
                value.expose_secret().to_string(),
            );
            Ok(())
        }
        fn get(&self, credential_ref: &str) -> Result<SecretValue, CredentialError> {
            self.entries
                .lock()
                .unwrap()
                .get(credential_ref)
                .cloned()
                .map(SecretValue::new)
                .ok_or(CredentialError::NotFound)
        }
        fn delete(&self, credential_ref: &str) -> Result<(), CredentialError> {
            self.deletes
                .lock()
                .unwrap()
                .push(credential_ref.to_string());
            self.entries
                .lock()
                .unwrap()
                .remove(credential_ref)
                .map(|_| ())
                .ok_or(CredentialError::NotFound)
        }
        fn exists(&self, credential_ref: &str) -> Result<bool, CredentialError> {
            Ok(self.entries.lock().unwrap().contains_key(credential_ref))
        }
    }

    fn root(label: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("geochat-lifecycle-{label}-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn request() -> SaveCredentialRequest {
        SaveCredentialRequest {
            provider: "deepseek".into(),
            protocol: "openai-compatible".into(),
            base_url: "https://api.deepseek.com".into(),
            secret: SecretValue::new("secret-value".into()),
        }
    }

    fn metadata(credential_ref: String) -> CredentialMetadata {
        CredentialMetadata {
            credential_ref,
            provider: "deepseek".into(),
            protocol: "openai-compatible".into(),
            canonical_base_url: "https://api.deepseek.com/".into(),
        }
    }

    #[test]
    fn journal_prepare_failure_never_puts_the_prepared_credential() {
        let root = root("journal-fail");
        let store = Arc::new(RecordingStore::default());
        let vault = CredentialVault::new(store.clone());
        let journal = CredentialLifecycleJournal::failing_create(&root);
        assert!(matches!(
            begin_locked(&vault, &journal, BTreeSet::new(), request()),
            Err(CredentialError::StoreFailure)
        ));
        assert_eq!(*store.puts.lock().unwrap(), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn pending_operation_rejects_a_second_begin() {
        let root = root("second-begin");
        let store = Arc::new(RecordingStore::default());
        let vault = CredentialVault::new(store.clone());
        let journal = CredentialLifecycleJournal::new(&root);
        begin_locked(&vault, &journal, BTreeSet::new(), request()).unwrap();
        assert!(matches!(
            begin_locked(&vault, &journal, BTreeSet::new(), request()),
            Err(CredentialError::AlreadyExists)
        ));
        assert_eq!(*store.puts.lock().unwrap(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn restart_reconcile_deletes_an_uncommitted_new_credential() {
        let root = root("restart-uncommitted");
        let store = Arc::new(RecordingStore::default());
        let vault = CredentialVault::new(store.clone());
        let journal = CredentialLifecycleJournal::new(&root);
        let begun = begin_locked(&vault, &journal, BTreeSet::new(), request()).unwrap();
        let rebuilt = CredentialLifecycleJournal::new(&root);
        let operation = rebuilt.load_strict().unwrap().unwrap();
        assert_eq!(
            reconcile_operation(&vault, &rebuilt, operation, &BTreeSet::new()),
            Ok(CredentialLifecycleStatus::Ready)
        );
        assert!(!store.exists(&begun.metadata.credential_ref).unwrap());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn committed_response_loss_preserves_new_and_deletes_only_inactive_old() {
        let root = root("response-loss");
        let store = Arc::new(RecordingStore::default());
        let vault = CredentialVault::new(store.clone());
        let old_ref = Uuid::new_v4().to_string();
        let new_ref = Uuid::new_v4().to_string();
        store
            .put(&old_ref, &SecretValue::new("old".into()))
            .unwrap();
        store
            .put(&new_ref, &SecretValue::new("new".into()))
            .unwrap();
        let journal = CredentialLifecycleJournal::new(&root);
        journal
            .create(&CredentialLifecycleOperation::replacement(
                Uuid::new_v4().to_string(),
                metadata(new_ref.clone()),
                vec![old_ref.clone()],
            ))
            .unwrap();
        let active = BTreeSet::from([new_ref.clone()]);
        let operation = journal.load_strict().unwrap().unwrap();
        assert_eq!(
            reconcile_operation(&vault, &journal, operation, &active),
            Ok(CredentialLifecycleStatus::Ready)
        );
        assert!(store.exists(&new_ref).unwrap());
        assert!(!store.exists(&old_ref).unwrap());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn old_reference_still_active_elsewhere_is_not_deleted() {
        let root = root("shared-old");
        let store = Arc::new(RecordingStore::default());
        let vault = CredentialVault::new(store.clone());
        let old_ref = Uuid::new_v4().to_string();
        let new_ref = Uuid::new_v4().to_string();
        store
            .put(&old_ref, &SecretValue::new("old".into()))
            .unwrap();
        store
            .put(&new_ref, &SecretValue::new("new".into()))
            .unwrap();
        let journal = CredentialLifecycleJournal::new(&root);
        journal
            .create(&CredentialLifecycleOperation::replacement(
                Uuid::new_v4().to_string(),
                metadata(new_ref.clone()),
                vec![old_ref.clone()],
            ))
            .unwrap();
        let active = BTreeSet::from([old_ref.clone(), new_ref.clone()]);
        let operation = journal.load_strict().unwrap().unwrap();
        reconcile_operation(&vault, &journal, operation, &active).unwrap();
        assert!(store.exists(&old_ref).unwrap());
        assert!(store.exists(&new_ref).unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
