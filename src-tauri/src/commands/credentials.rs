use crate::{
    credentials::{
        CredentialError, CredentialLifecycleJournal, CredentialLifecycleOperation,
        CredentialMetadata, CredentialVault, SaveCredentialRequest,
    },
    DesktopState,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
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
    config_json: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub(crate) enum CredentialLifecycleStatus {
    Ready {
        config_json: String,
    },
    Pending {
        operation_id: String,
        config_json: String,
    },
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
    let (config_json, _) = strict_config_snapshot(&desktop_state)?;
    begin_locked(
        &credential_state.vault,
        &credential_state.journal,
        config_json,
        request,
    )
}

#[tauri::command]
pub(crate) async fn commit_provider_credential(
    credential_state: State<'_, CredentialCommandState>,
    desktop_state: State<'_, DesktopState>,
    operation_id: String,
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
    let (current_config, _) = strict_config_snapshot(&desktop_state)?;
    if current_config == next_config_json {
        validate_operation_transition(&operation, &next_config_json)?;
        return reconcile_locked(&credential_state, &desktop_state, operation);
    }
    if current_config != operation.starting_config_json() {
        return Err(CredentialError::InvalidInput);
    }
    validate_operation_transition(&operation, &next_config_json)?;
    commit_config(
        &desktop_state,
        operation.starting_config_json(),
        &next_config_json,
    )?;
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
        let (config_json, _) = strict_config_snapshot(&desktop_state)?;
        return Ok(CredentialLifecycleStatus::Ready { config_json });
    };
    reconcile_locked(&credential_state, &desktop_state, operation)
}

#[tauri::command]
pub(crate) async fn retire_provider_credential(
    credential_state: State<'_, CredentialCommandState>,
    desktop_state: State<'_, DesktopState>,
    credential_ref: String,
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
    if !active_refs.contains(&credential_ref) {
        return Err(CredentialError::InvalidInput);
    }
    let operation = CredentialLifecycleOperation::retirement(
        Uuid::new_v4().to_string(),
        current_config.clone(),
        credential_ref,
    );
    validate_operation_transition(&operation, &next_config_json)?;
    credential_state.journal.create(&operation)?;
    commit_config(&desktop_state, &current_config, &next_config_json)?;
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

fn parse_config(raw: &str) -> Result<Value, CredentialError> {
    crate::renderer_storage::active_credential_refs_from_raw_config(raw)
        .map_err(|_| CredentialError::InvalidInput)?;
    serde_json::from_str(raw).map_err(|_| CredentialError::InvalidInput)
}

fn target_credential_refs(
    raw: &str,
    target_provider: &str,
) -> Result<BTreeSet<String>, CredentialError> {
    crate::renderer_storage::target_credential_refs_from_raw_config(raw, target_provider)
        .map_err(|_| CredentialError::InvalidInput)
}

fn validate_operation_transition(
    operation: &CredentialLifecycleOperation,
    next_config_json: &str,
) -> Result<(), CredentialError> {
    let previous_refs = crate::renderer_storage::active_credential_refs_from_raw_config(
        operation.starting_config_json(),
    )
    .map_err(|_| CredentialError::CorruptEntry)?;
    let next_refs =
        crate::renderer_storage::active_credential_refs_from_raw_config(next_config_json)
            .map_err(|_| CredentialError::InvalidInput)?;
    let previous_bindings = credential_ref_bindings(operation.starting_config_json())?;
    let next_bindings = credential_ref_bindings(next_config_json)?;
    match operation {
        CredentialLifecycleOperation::Replacement {
            target_provider,
            new_credential,
            previous_target_refs,
            ..
        } => {
            let previous_config = parse_config(operation.starting_config_json())?;
            let next_config = parse_config(next_config_json)?;
            if previous_bindings.iter().any(|(binding, previous)| {
                next_bindings.get(binding).is_none_or(|next| {
                    previous != next
                        && !binding_targets_provider(&previous_config, binding, target_provider)
                        && !binding_targets_provider(&next_config, binding, target_provider)
                })
            }) || next_bindings
                .keys()
                .any(|binding| !previous_bindings.contains_key(binding))
            {
                return Err(CredentialError::InvalidInput);
            }
            let recorded_target_refs: BTreeSet<_> = previous_target_refs.iter().cloned().collect();
            if target_credential_refs(operation.starting_config_json(), target_provider)?
                != recorded_target_refs
                || previous_refs.contains(&new_credential.credential_ref)
                || target_credential_refs(next_config_json, target_provider)?
                    != BTreeSet::from([new_credential.credential_ref.clone()])
            {
                return Err(CredentialError::InvalidInput);
            }
            let mut expected_refs = previous_refs;
            for reference in previous_target_refs {
                expected_refs.remove(reference);
            }
            expected_refs.insert(new_credential.credential_ref.clone());
            if next_refs != expected_refs
                || !target_metadata_matches(next_config_json, target_provider, new_credential)?
            {
                return Err(CredentialError::InvalidInput);
            }
        }
        CredentialLifecycleOperation::Retirement {
            retiring_credential_ref,
            ..
        } => {
            if !previous_refs.contains(retiring_credential_ref) {
                return Err(CredentialError::CorruptEntry);
            }
            let mut expected_refs = previous_refs;
            expected_refs.remove(retiring_credential_ref);
            let mut expected_bindings = previous_bindings;
            for reference in expected_bindings.values_mut() {
                if reference == retiring_credential_ref {
                    reference.clear();
                }
            }
            if next_refs != expected_refs || next_bindings != expected_bindings {
                return Err(CredentialError::InvalidInput);
            }
        }
    }
    Ok(())
}

fn target_metadata_matches(
    raw: &str,
    target_provider: &str,
    metadata: &CredentialMetadata,
) -> Result<bool, CredentialError> {
    let config = parse_config(raw)?;
    let binding = if target_provider == "custom" {
        config.get("customProvider")
    } else {
        config
            .get("providerCredentials")
            .and_then(Value::as_object)
            .and_then(|credentials| credentials.get(target_provider))
    };
    let Some(binding) = binding.and_then(Value::as_object) else {
        return Ok(false);
    };
    let base_url = binding
        .get("baseUrl")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let canonical = crate::credentials::canonicalize_endpoint(base_url).ok();
    Ok(binding.get("credentialRef").and_then(Value::as_str)
        == Some(metadata.credential_ref.as_str())
        && binding.get("protocol").and_then(Value::as_str) == Some(metadata.protocol.as_str())
        && canonical.as_deref() == Some(metadata.canonical_base_url.as_str())
        && base_url == metadata.canonical_base_url)
}

fn credential_ref_bindings(raw: &str) -> Result<BTreeMap<String, String>, CredentialError> {
    let config = parse_config(raw)?;
    let mut bindings = BTreeMap::new();
    for model_key in ["model", "visionModel"] {
        let reference = config
            .get(model_key)
            .and_then(|model| model.get("credentialRef"))
            .and_then(Value::as_str)
            .ok_or(CredentialError::InvalidInput)?;
        bindings.insert(model_key.to_string(), reference.to_string());
    }
    let custom = config
        .pointer("/customProvider/credentialRef")
        .and_then(Value::as_str)
        .ok_or(CredentialError::InvalidInput)?;
    bindings.insert("customProvider".into(), custom.to_string());
    let providers = config
        .get("providerCredentials")
        .and_then(Value::as_object)
        .ok_or(CredentialError::InvalidInput)?;
    for (provider, value) in providers {
        let reference = value
            .get("credentialRef")
            .and_then(Value::as_str)
            .ok_or(CredentialError::InvalidInput)?;
        bindings.insert(
            format!("providerCredentials.{provider}"),
            reference.to_string(),
        );
    }
    Ok(bindings)
}

fn binding_targets_provider(config: &Value, binding: &str, target_provider: &str) -> bool {
    match binding {
        "customProvider" => target_provider == "custom",
        "model" | "visionModel" => {
            config
                .get(binding)
                .and_then(|model| model.get("provider"))
                .and_then(Value::as_str)
                == Some(target_provider)
        }
        _ => binding == format!("providerCredentials.{target_provider}"),
    }
}

fn begin_locked(
    vault: &CredentialVault,
    journal: &CredentialLifecycleJournal,
    config_json: String,
    request: SaveCredentialRequest,
) -> Result<BeginCredentialResult, CredentialError> {
    if journal.load_strict()?.is_some() {
        return Err(CredentialError::AlreadyExists);
    }
    let target_provider = request.provider.clone();
    let previous_target_refs = target_credential_refs(&config_json, &target_provider)?;
    let prepared = vault.prepare(request)?;
    let operation_id = Uuid::new_v4().to_string();
    let operation = CredentialLifecycleOperation::replacement(
        operation_id.clone(),
        target_provider,
        config_json.clone(),
        prepared.metadata.clone(),
        previous_target_refs.into_iter().collect(),
    );
    journal.create(&operation)?;
    vault.put_prepared(&prepared)?;
    Ok(BeginCredentialResult {
        operation_id,
        metadata: prepared.metadata,
        config_json,
    })
}

fn reconcile_locked(
    state: &CredentialCommandState,
    desktop_state: &DesktopState,
    operation: CredentialLifecycleOperation,
) -> Result<CredentialLifecycleStatus, CredentialError> {
    let (config_json, active_refs) = strict_config_snapshot(desktop_state)?;
    if config_json != operation.starting_config_json() {
        validate_operation_transition(&operation, &config_json)?;
    }
    let committed = match &operation {
        CredentialLifecycleOperation::Replacement { new_credential, .. } => {
            active_refs.contains(&new_credential.credential_ref)
        }
        CredentialLifecycleOperation::Retirement {
            retiring_credential_ref,
            ..
        } => !active_refs.contains(retiring_credential_ref),
    };
    if committed {
        desktop_state
            .renderer_storage
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?
            .synchronize_credential_config(&config_json)
            .map_err(|_| CredentialError::StoreFailure)?;
    }
    reconcile_operation(
        &state.vault,
        &state.journal,
        operation,
        &active_refs,
        config_json,
    )
}

fn reconcile_operation(
    vault: &CredentialVault,
    journal: &CredentialLifecycleJournal,
    operation: CredentialLifecycleOperation,
    active_refs: &BTreeSet<String>,
    config_json: String,
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
                        config_json,
                    })
                }
            }
        }
    }
    journal.clear()?;
    Ok(CredentialLifecycleStatus::Ready { config_json })
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
    use super::{
        begin_locked, reconcile_operation, validate_operation_transition, CredentialLifecycleStatus,
    };
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

    fn config_json() -> String {
        serde_json::to_string(&serde_json::json!({
            "schemaVersion": 1,
            "model": { "provider": "deepseek", "model": "deepseek-flash", "credentialRef": "" },
            "visionModel": { "provider": "openrouter", "model": "vision", "credentialRef": "", "protocol": "openai-compatible", "supportsImages": true, "maxToolSteps": null },
            "providerCredentials": {
                "deepseek": { "credentialRef": "", "baseUrl": "https://api.deepseek.com", "protocol": "openai-compatible" },
                "openrouter": { "credentialRef": "", "baseUrl": "https://openrouter.ai/api/v1", "protocol": "openai-compatible" }
            },
            "customProvider": { "name": "", "baseUrl": "", "credentialRef": "", "protocol": "openai-compatible", "models": [] },
            "skills": { "enabled": true, "autoActivate": true, "enabledSkillNames": ["function-graph"], "visualProfile": "choice-comparison" },
            "interaction": { "mode": "fusion" },
            "debug": { "modelStepTimeoutMs": 120000 },
            "locale": "zh-CN"
        })).unwrap()
    }

    fn config_with_deepseek_ref(credential_ref: &str) -> String {
        let mut config: serde_json::Value = serde_json::from_str(&config_json()).unwrap();
        config["model"]["credentialRef"] = serde_json::json!(credential_ref);
        config["providerCredentials"]["deepseek"]["credentialRef"] =
            serde_json::json!(credential_ref);
        serde_json::to_string(&config).unwrap()
    }

    #[derive(Default)]
    struct RecordingStore {
        entries: Mutex<HashMap<String, String>>,
        puts: Mutex<usize>,
        deletes: Mutex<Vec<String>>,
        fail_deletes: Mutex<usize>,
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
            let mut failures = self.fail_deletes.lock().unwrap();
            if *failures > 0 {
                *failures -= 1;
                return Err(CredentialError::StoreFailure);
            }
            drop(failures);
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
            canonical_base_url: "https://api.deepseek.com".into(),
        }
    }

    #[test]
    fn journal_prepare_failure_never_puts_the_prepared_credential() {
        let root = root("journal-fail");
        let store = Arc::new(RecordingStore::default());
        let vault = CredentialVault::new(store.clone());
        let journal = CredentialLifecycleJournal::failing_create(&root);
        assert!(matches!(
            begin_locked(&vault, &journal, config_json(), request()),
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
        begin_locked(&vault, &journal, config_json(), request()).unwrap();
        assert!(matches!(
            begin_locked(&vault, &journal, config_json(), request()),
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
        let config = config_json();
        let begun = begin_locked(&vault, &journal, config.clone(), request()).unwrap();
        let rebuilt = CredentialLifecycleJournal::new(&root);
        let operation = rebuilt.load_strict().unwrap().unwrap();
        assert_eq!(
            reconcile_operation(
                &vault,
                &rebuilt,
                operation,
                &BTreeSet::new(),
                config.clone()
            ),
            Ok(CredentialLifecycleStatus::Ready {
                config_json: config
            })
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
        let starting = config_with_deepseek_ref(&old_ref);
        journal
            .create(&CredentialLifecycleOperation::replacement(
                Uuid::new_v4().to_string(),
                "deepseek".into(),
                starting.clone(),
                metadata(new_ref.clone()),
                vec![old_ref.clone()],
            ))
            .unwrap();
        let active = BTreeSet::from([new_ref.clone()]);
        let operation = journal.load_strict().unwrap().unwrap();
        assert_eq!(
            reconcile_operation(&vault, &journal, operation, &active, "committed".into()),
            Ok(CredentialLifecycleStatus::Ready {
                config_json: "committed".into()
            })
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
        let starting = config_with_deepseek_ref(&old_ref);
        journal
            .create(&CredentialLifecycleOperation::replacement(
                Uuid::new_v4().to_string(),
                "deepseek".into(),
                starting,
                metadata(new_ref.clone()),
                vec![old_ref.clone()],
            ))
            .unwrap();
        let active = BTreeSet::from([old_ref.clone(), new_ref.clone()]);
        let operation = journal.load_strict().unwrap().unwrap();
        reconcile_operation(&vault, &journal, operation, &active, "committed".into()).unwrap();
        assert!(store.exists(&old_ref).unwrap());
        assert!(store.exists(&new_ref).unwrap());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn replacement_rejects_removing_an_unrelated_provider_reference() {
        let old_ref = Uuid::new_v4().to_string();
        let unrelated_ref = Uuid::new_v4().to_string();
        let new_ref = Uuid::new_v4().to_string();
        let mut starting: serde_json::Value =
            serde_json::from_str(&config_with_deepseek_ref(&old_ref)).unwrap();
        starting["visionModel"]["credentialRef"] = serde_json::json!(unrelated_ref);
        starting["providerCredentials"]["openrouter"]["credentialRef"] =
            serde_json::json!(unrelated_ref);
        let starting = serde_json::to_string(&starting).unwrap();
        let mut next: serde_json::Value = serde_json::from_str(&starting).unwrap();
        next["model"]["credentialRef"] = serde_json::json!(new_ref);
        next["providerCredentials"]["deepseek"] = serde_json::json!({
            "credentialRef": new_ref,
            "baseUrl": "https://api.deepseek.com",
            "protocol": "openai-compatible"
        });
        next["visionModel"]["credentialRef"] = serde_json::json!("");
        next["providerCredentials"]["openrouter"]["credentialRef"] = serde_json::json!("");
        let operation = CredentialLifecycleOperation::replacement(
            Uuid::new_v4().to_string(),
            "deepseek".into(),
            starting,
            metadata(new_ref),
            vec![old_ref],
        );
        assert_eq!(
            validate_operation_transition(&operation, &serde_json::to_string(&next).unwrap()),
            Err(CredentialError::InvalidInput)
        );
    }

    #[test]
    fn retirement_removes_only_the_requested_reference_and_introduces_none() {
        let retiring_ref = Uuid::new_v4().to_string();
        let unrelated_ref = Uuid::new_v4().to_string();
        let mut starting: serde_json::Value =
            serde_json::from_str(&config_with_deepseek_ref(&retiring_ref)).unwrap();
        starting["visionModel"]["credentialRef"] = serde_json::json!(unrelated_ref);
        starting["providerCredentials"]["openrouter"]["credentialRef"] =
            serde_json::json!(unrelated_ref);
        let starting = serde_json::to_string(&starting).unwrap();
        let operation = CredentialLifecycleOperation::retirement(
            Uuid::new_v4().to_string(),
            starting.clone(),
            retiring_ref,
        );
        let mut next: serde_json::Value = serde_json::from_str(&starting).unwrap();
        next["model"]["credentialRef"] = serde_json::json!("");
        next["providerCredentials"]["deepseek"]["credentialRef"] = serde_json::json!("");
        assert!(
            validate_operation_transition(&operation, &serde_json::to_string(&next).unwrap())
                .is_ok()
        );

        next["providerCredentials"]["openrouter"]["credentialRef"] = serde_json::json!("");
        assert_eq!(
            validate_operation_transition(&operation, &serde_json::to_string(&next).unwrap()),
            Err(CredentialError::InvalidInput)
        );
    }

    #[test]
    fn pending_delete_is_retryable_and_response_loss_returns_authoritative_config() {
        let root = root("pending-delete");
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
        *store.fail_deletes.lock().unwrap() = 1;
        let journal = CredentialLifecycleJournal::new(&root);
        journal
            .create(&CredentialLifecycleOperation::replacement(
                Uuid::new_v4().to_string(),
                "deepseek".into(),
                config_with_deepseek_ref(&old_ref),
                metadata(new_ref.clone()),
                vec![old_ref.clone()],
            ))
            .unwrap();
        let active = BTreeSet::from([new_ref]);
        let operation = journal.load_strict().unwrap().unwrap();
        assert!(matches!(
            reconcile_operation(&vault, &journal, operation, &active, "authoritative".into()),
            Ok(CredentialLifecycleStatus::Pending { config_json, .. }) if config_json == "authoritative"
        ));
        let operation = journal.load_strict().unwrap().unwrap();
        assert_eq!(
            reconcile_operation(&vault, &journal, operation, &active, "authoritative".into()),
            Ok(CredentialLifecycleStatus::Ready {
                config_json: "authoritative".into()
            })
        );
        assert!(!store.exists(&old_ref).unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
