use crate::{
    atomic_json_file::{AtomicJsonFile, AtomicJsonFileLock},
    credentials::canonicalize_endpoint,
};
use serde_json::{Map, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub(crate) const RENDERER_STORAGE_FILE_NAME: &str = "renderer-state.json";
const RENDERER_STORAGE_LOCK_NAME: &str = ".renderer-state.lock";
const MAX_RENDERER_STORAGE_ENTRIES: usize = 16;
const MAX_RENDERER_STORAGE_KEY_BYTES: usize = 512;
const MAX_RENDERER_STORAGE_VALUE_BYTES: usize = 8 * 1024 * 1024;
const MAX_RENDERER_STORAGE_TOTAL_BYTES: usize = 32 * 1024 * 1024;
pub(crate) const DESKTOP_CONFIG_KEY: &str = "geochat-desktop-ui-config";
const LANGUAGE_KEY: &str = "geogebraCopilotLanguage";
const SELECTED_MODEL_KEY: &str = "geochatSelectedModel";
const THINKING_ENABLED_KEY: &str = "geogebraCopilotThinkingEnabled";
const THINKING_EFFORT_KEY: &str = "geogebraCopilotThinkingEffort";
const ONBOARDING_TOUR_KEY: &str = "geogebraCopilotOnboardingTourCompleted";
const PANEL_WINDOW_KEY: &str = "geogebraCopilotPanelWindow";
const INSTALLATION_ID_KEY: &str = "geogebraCopilotInstallationId";
const LEGAL_CONSENT_KEY: &str = "geochatLegalConsent";
const CONFIG_QUARANTINE_KEY_PREFIX: &str = "geochat-desktop-ui-config:quarantine:v1:";
const MAX_CONFIG_QUARANTINE_VALUE_BYTES: usize = 256 * 1024;
const MAX_CONFIG_IDENTIFIER_BYTES: usize = 128;
const MAX_CONFIG_LABEL_BYTES: usize = 256;
const MAX_CONFIG_URL_BYTES: usize = 2 * 1024;
const MAX_CONFIG_PROVIDER_CREDENTIALS: usize = 16;
const MAX_CONFIG_CUSTOM_MODELS: usize = 50;
const MAX_CONFIG_ENABLED_SKILLS: usize = 128;
const CREDENTIAL_LIFECYCLE_WRITE_ERROR: &str =
    "Credential bindings can only be changed through the native credential lifecycle";

#[derive(Debug)]
pub(crate) struct RendererStorage {
    file: AtomicJsonFile,
    path: PathBuf,
    entries: Map<String, Value>,
}

impl RendererStorage {
    pub(crate) fn load(app_data_dir: &Path) -> Result<Self, String> {
        let path = app_data_dir.join(RENDERER_STORAGE_FILE_NAME);
        let file =
            AtomicJsonFile::new(path.clone(), RENDERER_STORAGE_LOCK_NAME, "renderer storage");
        let lock = file.lock()?;
        scrub_sensitive_storage_artifacts(app_data_dir, &path)?;
        let entries = load_and_repair_entries(&file, &lock)?;
        drop(lock);
        Ok(Self {
            file,
            path,
            entries,
        })
    }

    pub(crate) fn all(&self) -> Map<String, Value> {
        self.entries.clone()
    }

    pub(crate) fn get(&mut self, keys: Option<Vec<String>>) -> Result<Map<String, Value>, String> {
        let lock = self.file.lock()?;
        scrub_sensitive_storage_artifacts(storage_parent(&self.path)?, &self.path)?;
        self.entries = load_and_repair_entries(&self.file, &lock)?;
        let Some(keys) = keys else {
            return Ok(self.all());
        };
        for key in &keys {
            validate_preference_key(key)?;
        }
        Ok(keys
            .into_iter()
            .filter_map(|key| self.entries.get(&key).cloned().map(|value| (key, value)))
            .collect())
    }

    pub(crate) fn set_batch(&mut self, values: Map<String, Value>) -> Result<(), String> {
        let lock = self.file.lock()?;
        scrub_sensitive_storage_artifacts(storage_parent(&self.path)?, &self.path)?;
        let mut candidate = load_and_repair_entries(&self.file, &lock)?;
        let previous_credential_bindings = active_credential_bindings_from_entries(&candidate)?;
        candidate.extend(values);
        validate_candidate(&candidate)?;
        let next_credential_bindings = active_credential_bindings_from_entries(&candidate)
            .map_err(|_| CREDENTIAL_LIFECYCLE_WRITE_ERROR.to_string())?;
        if next_credential_bindings != previous_credential_bindings {
            return Err(CREDENTIAL_LIFECYCLE_WRITE_ERROR.to_string());
        }
        if let Err(error) = self.persist_candidate(&lock, &candidate) {
            return reconcile_after_persist_error(
                &self.file,
                &mut self.entries,
                &lock,
                &candidate,
                error,
            );
        }
        self.entries = candidate;
        Ok(())
    }

    pub(crate) fn remove_batch(&mut self, keys: Vec<String>) -> Result<(), String> {
        let lock = self.file.lock()?;
        scrub_sensitive_storage_artifacts(storage_parent(&self.path)?, &self.path)?;
        let mut candidate = load_and_repair_entries(&self.file, &lock)?;
        let previous_credential_bindings = active_credential_bindings_from_entries(&candidate)?;
        for key in keys {
            validate_preference_key(&key)?;
            candidate.remove(&key);
        }
        validate_candidate(&candidate)?;
        let next_credential_bindings = active_credential_bindings_from_entries(&candidate)
            .map_err(|_| CREDENTIAL_LIFECYCLE_WRITE_ERROR.to_string())?;
        if next_credential_bindings != previous_credential_bindings {
            return Err(CREDENTIAL_LIFECYCLE_WRITE_ERROR.to_string());
        }
        if let Err(error) = self.persist_candidate(&lock, &candidate) {
            return reconcile_after_persist_error(
                &self.file,
                &mut self.entries,
                &lock,
                &candidate,
                error,
            );
        }
        self.entries = candidate;
        Ok(())
    }

    /// Reads the durable current configuration without backup recovery. This
    /// is the authority used for credential deletion decisions.
    pub(crate) fn credential_config_snapshot(
        &mut self,
    ) -> Result<(String, BTreeSet<String>), String> {
        let lock = self.file.lock()?;
        let entries = self.read_current_entries_strict(&lock)?;
        let raw = entries
            .get(DESKTOP_CONFIG_KEY)
            .and_then(Value::as_str)
            .ok_or_else(|| "The durable desktop configuration is missing".to_string())?
            .to_string();
        let refs = active_credential_refs_from_raw_config(&raw)?;
        self.entries = entries;
        Ok((raw, refs))
    }

    /// Credential-only CAS. The second identical write synchronizes the
    /// `.previous` snapshot before any now-inactive credential is deleted.
    pub(crate) fn commit_credential_config(
        &mut self,
        expected_config_json: &str,
        next_config_json: &str,
    ) -> Result<BTreeSet<String>, String> {
        let lock = self.file.lock()?;
        let mut candidate = self.read_current_entries_strict(&lock)?;
        let current = candidate
            .get(DESKTOP_CONFIG_KEY)
            .and_then(Value::as_str)
            .ok_or_else(|| "The durable desktop configuration is missing".to_string())?;
        if current != expected_config_json {
            return Err(
                "The durable desktop configuration changed before credential commit".to_string(),
            );
        }
        let next_value = Value::String(next_config_json.to_string());
        validate_preference_value(DESKTOP_CONFIG_KEY, &next_value)?;
        let active_refs = active_credential_refs_from_raw_config(next_config_json)?;
        candidate.insert(DESKTOP_CONFIG_KEY.to_string(), next_value);
        validate_candidate(&candidate)?;
        self.file.write_strict(&lock, &candidate)?;
        // AtomicJsonFile keeps a previous snapshot. Write the same candidate a
        // second time so both current and previous carry the committed refs.
        self.file.write_strict(&lock, &candidate)?;
        self.entries = candidate;
        Ok(active_refs)
    }

    /// Rewrites an already-committed config with strict durability so the
    /// `.previous` snapshot is guaranteed to match current before secrets are
    /// removed. This is also required when retrying after response loss or a
    /// crash between the two commit writes.
    pub(crate) fn synchronize_credential_config(
        &mut self,
        expected_config_json: &str,
    ) -> Result<BTreeSet<String>, String> {
        let lock = self.file.lock()?;
        let candidate = self.read_current_entries_strict(&lock)?;
        let current = candidate
            .get(DESKTOP_CONFIG_KEY)
            .and_then(Value::as_str)
            .ok_or_else(|| "The durable desktop configuration is missing".to_string())?;
        if current != expected_config_json {
            return Err(
                "The durable desktop configuration changed during credential reconciliation"
                    .to_string(),
            );
        }
        let refs = active_credential_refs_from_raw_config(current)?;
        self.file.write_strict(&lock, &candidate)?;
        self.entries = candidate;
        Ok(refs)
    }

    #[cfg(test)]
    pub(crate) fn fail_strict_write_on_call(&self, call: usize) {
        self.file.fail_strict_write_on_call(call);
    }

    #[cfg(test)]
    pub(crate) fn clear_strict_write_failure(&self) {
        self.file.clear_strict_write_failure();
    }

    fn read_current_entries_strict(
        &self,
        _lock: &AtomicJsonFileLock,
    ) -> Result<Map<String, Value>, String> {
        let bytes = fs::read(&self.path).map_err(|error| {
            format!(
                "Failed to read the current renderer storage {}: {error}",
                self.path.display()
            )
        })?;
        let entries: Map<String, Value> = serde_json::from_slice(&bytes)
            .map_err(|error| format!("The current renderer storage is corrupt: {error}"))?;
        validate_candidate(&entries)?;
        Ok(entries)
    }

    fn persist_candidate(
        &self,
        lock: &AtomicJsonFileLock,
        candidate: &Map<String, Value>,
    ) -> Result<(), String> {
        validate_candidate(candidate)?;
        self.file.write(lock, candidate)
    }
}

pub(crate) fn active_credential_refs_from_raw_config(
    raw: &str,
) -> Result<BTreeSet<String>, String> {
    Ok(credential_binding_ownership_from_raw_config(raw)?
        .into_values()
        .map(|binding| binding.credential_ref)
        .collect())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct CredentialBindingOwnership {
    pub(crate) credential_ref: String,
    pub(crate) provider: String,
    pub(crate) protocol: String,
    pub(crate) canonical_base_url: String,
}

pub(crate) fn credential_binding_ownership_from_raw_config(
    raw: &str,
) -> Result<BTreeMap<String, CredentialBindingOwnership>, String> {
    let config: Value = serde_json::from_str(raw)
        .map_err(|error| format!("Desktop configuration is not valid JSON: {error}"))?;
    if !validate_desktop_config(&config) {
        return Err("Desktop configuration has an invalid schema".to_string());
    }

    let mut ownership = BTreeMap::new();
    let providers = config
        .get("providerCredentials")
        .and_then(Value::as_object)
        .ok_or_else(|| "Desktop configuration has invalid provider credentials".to_string())?;
    for provider in [
        "deepseek",
        "openai",
        "anthropic",
        "google",
        "openrouter",
        "qwen",
    ] {
        let Some(binding) = providers.get(provider).and_then(Value::as_object) else {
            continue;
        };
        insert_active_credential_ownership(
            &mut ownership,
            format!("providerCredentials.{provider}"),
            provider,
            binding,
        )?;
    }
    let custom = config
        .get("customProvider")
        .and_then(Value::as_object)
        .ok_or_else(|| "Desktop configuration has an invalid custom provider".to_string())?;
    insert_active_credential_ownership(
        &mut ownership,
        "customProvider".to_string(),
        "custom",
        custom,
    )?;

    for model_key in ["model", "visionModel"] {
        let model = config
            .get(model_key)
            .and_then(Value::as_object)
            .ok_or_else(|| "Desktop configuration has an invalid model binding".to_string())?;
        let credential_ref = model
            .get("credentialRef")
            .and_then(Value::as_str)
            .ok_or_else(|| "Desktop configuration has an invalid model credential".to_string())?;
        if credential_ref.is_empty() {
            continue;
        }
        let provider = model
            .get("provider")
            .and_then(Value::as_str)
            .ok_or_else(|| "Desktop configuration has an invalid model provider".to_string())?;
        let provider_slot = if provider == "custom" {
            "customProvider".to_string()
        } else {
            format!("providerCredentials.{provider}")
        };
        let provider_ownership = ownership.get(&provider_slot).ok_or_else(|| {
            "A model credential must match an active provider credential".to_string()
        })?;
        let protocol = model
            .get("protocol")
            .and_then(Value::as_str)
            .unwrap_or(&provider_ownership.protocol);
        if credential_ref != provider_ownership.credential_ref
            || provider != provider_ownership.provider
            || protocol != provider_ownership.protocol
        {
            return Err("A model credential must match its provider binding".to_string());
        }
        ownership.insert(
            model_key.to_string(),
            CredentialBindingOwnership {
                credential_ref: credential_ref.to_string(),
                provider: provider.to_string(),
                protocol: protocol.to_string(),
                canonical_base_url: provider_ownership.canonical_base_url.clone(),
            },
        );
    }
    Ok(ownership)
}

fn insert_active_credential_ownership(
    ownership: &mut BTreeMap<String, CredentialBindingOwnership>,
    slot: String,
    provider: &str,
    binding: &Map<String, Value>,
) -> Result<(), String> {
    let credential_ref = binding
        .get("credentialRef")
        .and_then(Value::as_str)
        .ok_or_else(|| "Desktop configuration has an invalid credential reference".to_string())?;
    if credential_ref.is_empty() {
        return Ok(());
    }
    let protocol = binding
        .get("protocol")
        .and_then(Value::as_str)
        .ok_or_else(|| "Desktop configuration has an invalid credential protocol".to_string())?;
    let base_url = binding
        .get("baseUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| "Desktop configuration has an invalid credential endpoint".to_string())?;
    let canonical_base_url = canonicalize_endpoint(base_url)
        .map_err(|_| "Desktop configuration has an invalid credential endpoint".to_string())?;
    if canonical_base_url != base_url {
        return Err("Desktop credential endpoints must already be canonical".to_string());
    }
    ownership.insert(
        slot,
        CredentialBindingOwnership {
            credential_ref: credential_ref.to_string(),
            provider: provider.to_string(),
            protocol: protocol.to_string(),
            canonical_base_url,
        },
    );
    Ok(())
}

pub(crate) fn credential_ref_bindings_from_raw_config(
    raw: &str,
) -> Result<BTreeMap<String, String>, String> {
    let config: Value = serde_json::from_str(raw)
        .map_err(|error| format!("Desktop configuration is not valid JSON: {error}"))?;
    if !validate_desktop_config(&config) {
        return Err("Desktop configuration has an invalid schema".to_string());
    }
    let mut bindings = BTreeMap::new();
    for model_key in ["model", "visionModel"] {
        let reference = config
            .get(model_key)
            .and_then(|model| model.get("credentialRef"))
            .and_then(Value::as_str)
            .ok_or_else(|| "Desktop configuration has an invalid credential binding".to_string())?;
        bindings.insert(model_key.to_string(), reference.to_string());
    }
    let custom = config
        .pointer("/customProvider/credentialRef")
        .and_then(Value::as_str)
        .ok_or_else(|| "Desktop configuration has an invalid credential binding".to_string())?;
    bindings.insert("customProvider".to_string(), custom.to_string());
    let providers = config
        .get("providerCredentials")
        .and_then(Value::as_object)
        .ok_or_else(|| "Desktop configuration has invalid provider credentials".to_string())?;
    for provider in [
        "deepseek",
        "openai",
        "anthropic",
        "google",
        "openrouter",
        "qwen",
    ] {
        let reference = providers
            .get(provider)
            .and_then(|credential| credential.get("credentialRef"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        bindings.insert(
            format!("providerCredentials.{provider}"),
            reference.to_string(),
        );
    }
    Ok(bindings)
}

pub(crate) fn target_credential_refs_from_raw_config(
    raw: &str,
    target_provider: &str,
) -> Result<BTreeSet<String>, String> {
    let config: Value = serde_json::from_str(raw)
        .map_err(|error| format!("Desktop configuration is not valid JSON: {error}"))?;
    if !validate_desktop_config(&config) {
        return Err("Desktop configuration has an invalid schema".to_string());
    }
    let mut refs = BTreeSet::new();
    let mut collect = |value: Option<&Value>| {
        if let Some(reference) = value
            .and_then(Value::as_str)
            .filter(|reference| !reference.is_empty())
        {
            refs.insert(reference.to_string());
        }
    };
    if target_provider == "custom" {
        collect(config.pointer("/customProvider/credentialRef"));
    } else {
        let credential = config
            .get("providerCredentials")
            .and_then(Value::as_object)
            .and_then(|credentials| credentials.get(target_provider));
        collect(credential.and_then(|credential| credential.get("credentialRef")));
    }
    for model_key in ["model", "visionModel"] {
        let model = config.get(model_key).and_then(Value::as_object);
        if model
            .and_then(|model| model.get("provider"))
            .and_then(Value::as_str)
            == Some(target_provider)
        {
            collect(model.and_then(|model| model.get("credentialRef")));
        }
    }
    Ok(refs)
}

fn active_credential_bindings_from_entries(
    entries: &Map<String, Value>,
) -> Result<BTreeMap<String, CredentialBindingOwnership>, String> {
    match entries.get(DESKTOP_CONFIG_KEY) {
        Some(Value::String(raw)) => credential_binding_ownership_from_raw_config(raw),
        Some(_) => Err("Desktop configuration must use the string transport".to_string()),
        None => Ok(BTreeMap::new()),
    }
}

fn storage_parent(path: &Path) -> Result<&Path, String> {
    path.parent()
        .ok_or_else(|| "Renderer storage path has no parent directory".to_string())
}

fn load_and_repair_entries(
    file: &AtomicJsonFile,
    lock: &AtomicJsonFileLock,
) -> Result<Map<String, Value>, String> {
    let entries: Map<String, Value> = file.read_or_recover(lock)?.unwrap_or_default();
    let repaired = repair_disk_candidate(entries);
    validate_candidate(&repaired.entries)?;
    if repaired.changed {
        if let Err(error) = replace_repaired_file(file, lock, &repaired.entries) {
            log::error!(
                target: "geochat::storage",
                "Could not persist repaired renderer storage; continuing with the safe in-memory state: {error}"
            );
        }
    }
    Ok(repaired.entries)
}

struct RepairedCandidate {
    entries: Map<String, Value>,
    changed: bool,
}

fn repair_disk_candidate(candidate: Map<String, Value>) -> RepairedCandidate {
    let mut entries = Map::new();
    let mut changed = false;
    for (key, value) in candidate {
        if validate_preference_value(&key, &value).is_ok() {
            entries.insert(key, value);
            continue;
        }
        changed = true;
        if key == DESKTOP_CONFIG_KEY && !value_may_contain_sensitive_data(&value) {
            if let Some(raw) = value.as_str().filter(|raw| {
                !raw.is_empty()
                    && raw.len() <= MAX_CONFIG_QUARANTINE_VALUE_BYTES
                    && !raw_may_contain_sensitive_key(raw)
            }) {
                entries.insert(new_config_quarantine_key(), Value::String(raw.to_string()));
            }
        }
        log::warn!(
            target: "geochat::storage",
            "Removed invalid renderer preference {key} while loading native storage"
        );
    }
    RepairedCandidate { entries, changed }
}

fn replace_repaired_file(
    file: &AtomicJsonFile,
    lock: &AtomicJsonFileLock,
    entries: &Map<String, Value>,
) -> Result<(), String> {
    file.write(lock, entries)
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Failed to remove unsafe renderer storage artifact {}: {error}",
            path.display()
        )),
    }
}

fn scrub_sensitive_storage_artifacts(app_data_dir: &Path, path: &Path) -> Result<(), String> {
    let mut candidates = vec![path.to_path_buf(), path.with_extension("previous")];
    match fs::read_dir(app_data_dir) {
        Ok(entries) => {
            for entry in entries {
                let entry = entry.map_err(|error| {
                    format!("Failed to inspect renderer storage artifacts: {error}")
                })?;
                let name = entry.file_name();
                if name
                    .to_string_lossy()
                    .starts_with(&format!("{RENDERER_STORAGE_FILE_NAME}.corrupt-"))
                {
                    candidates.push(entry.path());
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Failed to inspect renderer storage directory {}: {error}",
                app_data_dir.display()
            ));
        }
    }
    for candidate in candidates {
        let bytes = match fs::read(&candidate) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(format!(
                    "Failed to inspect renderer storage artifact {}: {error}",
                    candidate.display()
                ));
            }
        };
        if raw_may_contain_sensitive_key(&String::from_utf8_lossy(&bytes)) {
            remove_if_exists(&candidate)?;
            log::warn!(
                target: "geochat::storage",
                "Deleted secret-bearing renderer storage artifact {}",
                candidate.display()
            );
        }
    }
    Ok(())
}

fn new_config_quarantine_key() -> String {
    format!(
        "{CONFIG_QUARANTINE_KEY_PREFIX}{}-{}",
        current_unix_millis(),
        Uuid::new_v4()
    )
}

fn current_unix_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn reconcile_after_persist_error(
    file: &AtomicJsonFile,
    entries: &mut Map<String, Value>,
    lock: &AtomicJsonFileLock,
    candidate: &Map<String, Value>,
    persist_error: String,
) -> Result<(), String> {
    *entries = file
        .read_or_recover(lock)
        .map_err(|read_error| {
            format!("{persist_error}; renderer storage reconciliation also failed: {read_error}")
        })?
        .unwrap_or_default();
    if entries == candidate {
        Ok(())
    } else {
        Err(persist_error)
    }
}

fn validate_candidate(candidate: &Map<String, Value>) -> Result<(), String> {
    if candidate.len() > MAX_RENDERER_STORAGE_ENTRIES {
        return Err("Renderer storage contains too many entries".to_string());
    }
    let mut total_bytes = 0usize;
    for (key, value) in candidate {
        if key.len() > MAX_RENDERER_STORAGE_KEY_BYTES {
            return Err(format!(
                "Renderer storage key is too large: {} bytes",
                key.len()
            ));
        }
        let value_bytes = serde_json::to_vec(value)
            .map_err(|error| format!("Failed to measure renderer storage value: {error}"))?;
        if value_bytes.len() > MAX_RENDERER_STORAGE_VALUE_BYTES {
            return Err(format!("Renderer storage value for {key} is too large"));
        }
        total_bytes = total_bytes
            .saturating_add(key.len())
            .saturating_add(value_bytes.len());
        if total_bytes > MAX_RENDERER_STORAGE_TOTAL_BYTES {
            return Err("Renderer storage exceeds the total size limit".to_string());
        }
        validate_preference_value(key, value)?;
    }
    Ok(())
}

fn validate_preference_key(key: &str) -> Result<(), String> {
    match key {
        DESKTOP_CONFIG_KEY | LANGUAGE_KEY | SELECTED_MODEL_KEY | THINKING_ENABLED_KEY
        | THINKING_EFFORT_KEY | ONBOARDING_TOUR_KEY | PANEL_WINDOW_KEY | INSTALLATION_ID_KEY
        | LEGAL_CONSENT_KEY => Ok(()),
        _ if valid_config_quarantine_key(key) => Ok(()),
        _ => Err(format!("{key} is not an allowed renderer preference")),
    }
}

fn valid_config_quarantine_key(key: &str) -> bool {
    let Some(suffix) = key.strip_prefix(CONFIG_QUARANTINE_KEY_PREFIX) else {
        return false;
    };
    let Some((timestamp, id)) = suffix.split_once('-') else {
        return false;
    };
    !timestamp.is_empty()
        && timestamp.bytes().all(|byte| byte.is_ascii_digit())
        && Uuid::parse_str(id).is_ok()
}

fn decode_preference_value(key: &str, value: &Value) -> Result<Value, String> {
    validate_preference_key(key)?;
    let encoded = value
        .as_str()
        .ok_or_else(|| format!("Renderer preference {key} must use the string transport"))?;
    serde_json::from_str(encoded)
        .map_err(|error| format!("Renderer preference {key} is not valid JSON: {error}"))
}

fn validate_preference_value(key: &str, value: &Value) -> Result<(), String> {
    if valid_config_quarantine_key(key) {
        return value
            .as_str()
            .filter(|raw| {
                !raw.is_empty()
                    && raw.len() <= MAX_CONFIG_QUARANTINE_VALUE_BYTES
                    && !raw_may_contain_sensitive_key(raw)
            })
            .map(|_| ())
            .ok_or_else(|| format!("Renderer preference {key} has an invalid value"));
    }
    let decoded = decode_preference_value(key, value)?;
    if value_may_contain_sensitive_data(&decoded) {
        return Err(format!(
            "Renderer preference {key} contains a forbidden sensitive field"
        ));
    }
    let valid = match key {
        LANGUAGE_KEY => matches!(decoded.as_str(), Some("zh-CN" | "en")),
        SELECTED_MODEL_KEY => decoded
            .as_str()
            .is_some_and(|model| !model.trim().is_empty() && model.len() <= 512),
        THINKING_ENABLED_KEY => decoded.is_boolean(),
        THINKING_EFFORT_KEY => {
            matches!(decoded.as_str(), Some("light" | "standard" | "extended"))
        }
        ONBOARDING_TOUR_KEY => decoded.as_u64().is_some_and(|version| version > 0),
        INSTALLATION_ID_KEY => decoded
            .as_str()
            .is_some_and(|value| Uuid::parse_str(value).is_ok()),
        LEGAL_CONSENT_KEY => validate_legal_consent(&decoded),
        PANEL_WINDOW_KEY => validate_panel_window(&decoded),
        DESKTOP_CONFIG_KEY => validate_desktop_config(&decoded),
        _ => false,
    };
    valid
        .then_some(())
        .ok_or_else(|| format!("Renderer preference {key} has an invalid value"))
}

fn validate_legal_consent(value: &Value) -> bool {
    let Some(record) = value.as_object() else {
        return false;
    };
    record.len() == 2
        && record.get("version").and_then(Value::as_u64) == Some(1)
        && record
            .get("acceptedAt")
            .and_then(Value::as_str)
            .is_some_and(is_canonical_utc_timestamp)
}

fn is_canonical_utc_timestamp(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 24
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'.'
        || bytes[23] != b'Z'
    {
        return false;
    }
    for index in [0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18, 20, 21, 22] {
        if !bytes[index].is_ascii_digit() {
            return false;
        }
    }
    let number = |start: usize, end: usize| value[start..end].parse::<u32>().ok();
    let (Some(year), Some(month), Some(day), Some(hour), Some(minute), Some(second)) = (
        number(0, 4),
        number(5, 7),
        number(8, 10),
        number(11, 13),
        number(14, 16),
        number(17, 19),
    ) else {
        return false;
    };
    let leap_year = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap_year => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days_in_month).contains(&day) && hour < 24 && minute < 60 && second < 60
}

fn value_may_contain_sensitive_data(value: &Value) -> bool {
    match value {
        Value::Object(object) => object
            .iter()
            .any(|(key, value)| is_sensitive_key(key) || value_may_contain_sensitive_data(value)),
        Value::Array(values) => values.iter().any(value_may_contain_sensitive_data),
        Value::String(raw) => serde_json::from_str::<Value>(raw)
            .ok()
            .is_some_and(|decoded| value_may_contain_sensitive_data(&decoded)),
        _ => false,
    }
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized: String = key
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect();
    [
        "apikey",
        "secret",
        "token",
        "authorization",
        "password",
        "privatekey",
        "accesskey",
        "cookie",
    ]
    .into_iter()
    .any(|marker| normalized.contains(marker))
}

fn raw_may_contain_sensitive_key(raw: &str) -> bool {
    if let Ok(value) = serde_json::from_str::<Value>(raw) {
        return value_may_contain_sensitive_data(&value);
    }
    let bytes = raw.as_bytes();
    let mut cursor = 0usize;
    while cursor < bytes.len() {
        if bytes[cursor] != b'"' {
            cursor += 1;
            continue;
        }
        let start = cursor;
        cursor += 1;
        let mut escaped = false;
        while cursor < bytes.len() {
            let byte = bytes[cursor];
            cursor += 1;
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                break;
            }
        }
        if cursor > bytes.len() || bytes.get(cursor.saturating_sub(1)) != Some(&b'"') {
            break;
        }
        let Ok(decoded) = serde_json::from_str::<String>(&raw[start..cursor]) else {
            continue;
        };
        let mut after = cursor;
        while bytes.get(after).is_some_and(u8::is_ascii_whitespace) {
            after += 1;
        }
        if bytes.get(after) == Some(&b':') && is_sensitive_key(&decoded) {
            return true;
        }
        let nested = decoded.trim_start();
        if (nested.starts_with('{') || nested.starts_with('['))
            && raw_may_contain_sensitive_key(nested)
        {
            return true;
        }
    }
    false
}

fn validate_panel_window(value: &Value) -> bool {
    let Some(panel) = value.as_object() else {
        return false;
    };
    if panel.keys().any(|key| {
        !matches!(
            key.as_str(),
            "version" | "left" | "top" | "width" | "height"
        )
    }) {
        return false;
    }
    panel.get("version").and_then(Value::as_u64) == Some(2)
        && panel.get("left").and_then(Value::as_f64).is_some()
        && panel.get("top").and_then(Value::as_f64).is_some()
        && ["width", "height"].into_iter().all(|key| {
            panel.get(key).is_none_or(|value| {
                value
                    .as_f64()
                    .is_some_and(|size| size.is_finite() && size > 0.0)
            })
        })
}

fn validate_desktop_config(value: &Value) -> bool {
    const REQUIRED_FIELDS: [&str; 9] = [
        "schemaVersion",
        "model",
        "visionModel",
        "providerCredentials",
        "customProvider",
        "skills",
        "interaction",
        "debug",
        "locale",
    ];
    let Some(config) = value.as_object() else {
        return false;
    };
    has_exact_fields(config, &REQUIRED_FIELDS)
        && config.get("schemaVersion").and_then(Value::as_u64) == Some(1)
        && config.get("model").is_some_and(validate_model_config)
        && config.get("visionModel").is_some_and(validate_model_config)
        && config
            .get("providerCredentials")
            .is_some_and(validate_provider_credentials)
        && config
            .get("customProvider")
            .is_some_and(validate_custom_provider)
        && config.get("skills").is_some_and(validate_skill_config)
        && config
            .get("interaction")
            .is_some_and(validate_interaction_config)
        && config.get("debug").is_some_and(validate_debug_config)
        && matches!(
            config.get("locale").and_then(Value::as_str),
            Some("zh-CN" | "en-US")
        )
}

fn has_exact_fields<const N: usize>(object: &Map<String, Value>, fields: &[&str; N]) -> bool {
    object.len() == fields.len() && fields.iter().all(|field| object.contains_key(*field))
}

fn has_only_fields(object: &Map<String, Value>, fields: &[&str]) -> bool {
    object.keys().all(|key| fields.contains(&key.as_str()))
}

fn bounded_nonempty_string(value: Option<&Value>, max_bytes: usize) -> bool {
    value
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty() && value.len() <= max_bytes)
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_CONFIG_IDENTIFIER_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'/'))
}

fn valid_protocol(value: Option<&Value>) -> bool {
    matches!(
        value.and_then(Value::as_str),
        Some("openai-compatible" | "anthropic" | "google")
    )
}

fn valid_credential_ref(value: Option<&Value>) -> bool {
    let Some(reference) = value.and_then(Value::as_str) else {
        return false;
    };
    if reference.is_empty() {
        return true;
    }
    let Ok(id) = Uuid::parse_str(reference) else {
        return false;
    };
    id.get_version_num() == 4 && id.hyphenated().to_string() == reference
}

fn valid_optional_bounded_integer(value: Option<&Value>, minimum: u64, maximum: u64) -> bool {
    value.is_none_or(|value| {
        value.is_null()
            || value
                .as_u64()
                .is_some_and(|value| (minimum..=maximum).contains(&value))
    })
}

fn validate_model_config(value: &Value) -> bool {
    const REQUIRED_FIELDS: [&str; 3] = ["provider", "model", "credentialRef"];
    const ALLOWED_FIELDS: [&str; 7] = [
        "provider",
        "model",
        "credentialRef",
        "protocol",
        "supportsImages",
        "maxToolSteps",
        "modelStepTimeoutMs",
    ];
    let Some(model) = value.as_object() else {
        return false;
    };
    REQUIRED_FIELDS
        .iter()
        .all(|field| model.contains_key(*field))
        && has_only_fields(model, &ALLOWED_FIELDS)
        && model
            .get("provider")
            .and_then(Value::as_str)
            .is_some_and(valid_model_provider)
        && model
            .get("model")
            .is_some_and(|value| bounded_nonempty_string(Some(value), MAX_CONFIG_IDENTIFIER_BYTES))
        && valid_credential_ref(model.get("credentialRef"))
        && model
            .get("protocol")
            .is_none_or(|_| valid_protocol(model.get("protocol")))
        && model.get("supportsImages").is_none_or(Value::is_boolean)
        && valid_optional_bounded_integer(model.get("maxToolSteps"), 1, 64)
        && valid_optional_bounded_integer(model.get("modelStepTimeoutMs"), 30_000, 300_000)
}

fn valid_model_provider(provider: &str) -> bool {
    matches!(
        provider,
        "deepseek" | "openai" | "anthropic" | "google" | "openrouter" | "qwen" | "custom"
    )
}

fn validate_provider_credentials(value: &Value) -> bool {
    let Some(credentials) = value.as_object() else {
        return false;
    };
    credentials.len() <= MAX_CONFIG_PROVIDER_CREDENTIALS
        && credentials.iter().all(|(provider, value)| {
            valid_model_provider(provider)
                && provider != "custom"
                && validate_provider_credential(value)
        })
}

fn validate_provider_credential(value: &Value) -> bool {
    const FIELDS: [&str; 3] = ["credentialRef", "baseUrl", "protocol"];
    let Some(credential) = value.as_object() else {
        return false;
    };
    has_exact_fields(credential, &FIELDS)
        && valid_credential_ref(credential.get("credentialRef"))
        && valid_base_url(credential.get("baseUrl"), true)
        && valid_protocol(credential.get("protocol"))
}

fn valid_base_url(value: Option<&Value>, allow_empty: bool) -> bool {
    let Some(raw) = value.and_then(Value::as_str) else {
        return false;
    };
    if raw.is_empty() {
        return allow_empty;
    }
    if raw.len() > MAX_CONFIG_URL_BYTES {
        return false;
    }
    canonicalize_endpoint(raw).is_ok()
}

fn validate_custom_provider(value: &Value) -> bool {
    const FIELDS: [&str; 5] = ["name", "baseUrl", "credentialRef", "protocol", "models"];
    let Some(provider) = value.as_object() else {
        return false;
    };
    has_exact_fields(provider, &FIELDS)
        && provider
            .get("name")
            .and_then(Value::as_str)
            .is_some_and(|name| name.len() <= MAX_CONFIG_LABEL_BYTES)
        && valid_base_url(provider.get("baseUrl"), true)
        && valid_credential_ref(provider.get("credentialRef"))
        && valid_protocol(provider.get("protocol"))
        && provider
            .get("models")
            .and_then(Value::as_array)
            .is_some_and(|models| {
                models.len() <= MAX_CONFIG_CUSTOM_MODELS && models.iter().all(validate_custom_model)
            })
}

fn validate_custom_model(value: &Value) -> bool {
    const FIELDS: [&str; 3] = ["name", "callName", "supportsImages"];
    let Some(model) = value.as_object() else {
        return false;
    };
    has_exact_fields(model, &FIELDS)
        && bounded_nonempty_string(model.get("name"), MAX_CONFIG_LABEL_BYTES)
        && model
            .get("callName")
            .is_some_and(|value| bounded_nonempty_string(Some(value), MAX_CONFIG_IDENTIFIER_BYTES))
        && model.get("supportsImages").is_some_and(Value::is_boolean)
}

fn validate_skill_config(value: &Value) -> bool {
    const FIELDS: [&str; 4] = [
        "enabled",
        "autoActivate",
        "enabledSkillNames",
        "visualProfile",
    ];
    let Some(skills) = value.as_object() else {
        return false;
    };
    has_exact_fields(skills, &FIELDS)
        && skills.get("enabled").is_some_and(Value::is_boolean)
        && skills.get("autoActivate").is_some_and(Value::is_boolean)
        && skills
            .get("enabledSkillNames")
            .and_then(Value::as_array)
            .is_some_and(|names| {
                names.len() <= MAX_CONFIG_ENABLED_SKILLS
                    && names
                        .iter()
                        .all(|name| name.as_str().is_some_and(valid_identifier))
            })
        && matches!(
            skills.get("visualProfile").and_then(Value::as_str),
            Some(
                "exam-clean"
                    | "teaching-demo"
                    | "choice-comparison"
                    | "dynamic-exploration"
                    | "proof-highlight"
                    | "spatial-3d"
            )
        )
}

fn validate_interaction_config(value: &Value) -> bool {
    const FIELDS: [&str; 1] = ["mode"];
    let Some(interaction) = value.as_object() else {
        return false;
    };
    has_exact_fields(interaction, &FIELDS)
        && matches!(
            interaction.get("mode").and_then(Value::as_str),
            Some("window" | "fusion")
        )
}

fn validate_debug_config(value: &Value) -> bool {
    const FIELDS: [&str; 1] = ["modelStepTimeoutMs"];
    let Some(debug) = value.as_object() else {
        return false;
    };
    has_exact_fields(debug, &FIELDS)
        && debug
            .get("modelStepTimeoutMs")
            .and_then(Value::as_u64)
            .is_some_and(|timeout| (30_000..=300_000).contains(&timeout))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{fs, path::PathBuf};
    use uuid::Uuid;

    fn temporary_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("geochat-{label}-{}", Uuid::new_v4()))
    }

    fn valid_desktop_config() -> Value {
        json!({
            "schemaVersion": 1,
            "model": {
                "provider": "deepseek",
                "model": "deepseek-flash",
                "credentialRef": ""
            },
            "visionModel": {
                "provider": "openrouter",
                "model": "google/gemini-3.8-flash",
                "credentialRef": "",
                "protocol": "openai-compatible",
                "supportsImages": true,
                "maxToolSteps": null
            },
            "providerCredentials": {
                "deepseek": {
                    "credentialRef": "",
                    "baseUrl": "https://api.deepseek.com",
                    "protocol": "openai-compatible"
                },
                "openrouter": {
                    "credentialRef": "",
                    "baseUrl": "https://openrouter.ai/api/v1",
                    "protocol": "openai-compatible"
                }
            },
            "customProvider": {
                "name": "",
                "baseUrl": "",
                "credentialRef": "",
                "protocol": "openai-compatible",
                "models": []
            },
            "skills": {
                "enabled": true,
                "autoActivate": true,
                "enabledSkillNames": ["function-graph"],
                "visualProfile": "choice-comparison"
            },
            "interaction": { "mode": "fusion" },
            "debug": { "modelStepTimeoutMs": 120000 },
            "locale": "zh-CN"
        })
    }

    fn encoded_desktop_config(config: &Value) -> Value {
        json!(serde_json::to_string(config).expect("serialize desktop config"))
    }

    #[test]
    fn persists_set_and_remove_batches_across_reloads() {
        let root = temporary_directory("renderer-storage-roundtrip");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        storage
            .set_batch(Map::from_iter([
                (LANGUAGE_KEY.to_string(), json!("\"en\"")),
                (SELECTED_MODEL_KEY.to_string(), json!("\"deepseek-flash\"")),
            ]))
            .expect("persist renderer values");
        assert_eq!(
            storage
                .get(Some(vec![SELECTED_MODEL_KEY.to_string()]))
                .expect("refresh selected values"),
            Map::from_iter([(SELECTED_MODEL_KEY.to_string(), json!("\"deepseek-flash\""))])
        );
        storage
            .remove_batch(vec![SELECTED_MODEL_KEY.to_string()])
            .expect("remove renderer value");

        let reloaded = RendererStorage::load(&root).expect("reload renderer storage");
        assert_eq!(
            reloaded.all(),
            Map::from_iter([(LANGUAGE_KEY.to_string(), json!("\"en\""))])
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn failed_persistence_does_not_mutate_in_memory_entries() {
        let root = temporary_directory("renderer-storage-rollback");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        storage
            .set_batch(Map::from_iter([(
                THINKING_ENABLED_KEY.to_string(),
                json!("true"),
            )]))
            .expect("persist initial value");

        fs::remove_file(root.join(RENDERER_STORAGE_FILE_NAME)).expect("remove state file");
        fs::remove_file(root.join(RENDERER_STORAGE_LOCK_NAME)).expect("remove lock file");
        fs::remove_dir(&root).expect("remove state directory");
        fs::write(&root, b"not a directory").expect("replace directory with file");

        assert!(storage
            .set_batch(Map::from_iter([(
                THINKING_EFFORT_KEY.to_string(),
                json!("\"light\"")
            )]))
            .is_err());
        assert_eq!(
            storage.all(),
            Map::from_iter([(THINKING_ENABLED_KEY.to_string(), json!("true"))])
        );
        let _ = fs::remove_file(root);
    }

    #[test]
    fn load_recovers_an_interrupted_replace_from_the_stable_backup() {
        let root = temporary_directory("renderer-storage-recovery");
        fs::create_dir_all(&root).expect("create test directory");
        let path = root.join(RENDERER_STORAGE_FILE_NAME);
        fs::write(
            path.with_extension("previous"),
            serde_json::to_vec(&Map::from_iter([(
                LANGUAGE_KEY.to_string(),
                json!("\"zh-CN\""),
            )]))
            .expect("serialize backup"),
        )
        .expect("write backup");

        let storage = RendererStorage::load(&root).expect("recover renderer storage");

        assert_eq!(
            storage.all(),
            Map::from_iter([(LANGUAGE_KEY.to_string(), json!("\"zh-CN\""))])
        );
        assert!(path.exists());
        assert!(path.with_extension("previous").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn load_quarantines_invalid_inner_config_and_keeps_valid_preferences() {
        let root = temporary_directory("renderer-storage-inner-config-recovery");
        fs::create_dir_all(&root).expect("create test directory");
        let path = root.join(RENDERER_STORAGE_FILE_NAME);
        let damaged_config = r#"{"schemaVersion":1,"locale":"zh-CN""#;
        fs::write(
            &path,
            serde_json::to_vec(&Map::from_iter([
                (LANGUAGE_KEY.to_string(), json!("\"en\"")),
                (DESKTOP_CONFIG_KEY.to_string(), json!(damaged_config)),
            ]))
            .expect("serialize damaged renderer state"),
        )
        .expect("write damaged renderer state");

        let storage = RendererStorage::load(&root).expect("repair renderer storage");
        assert_eq!(storage.all().get(LANGUAGE_KEY), Some(&json!("\"en\"")));
        assert!(!storage.all().contains_key(DESKTOP_CONFIG_KEY));
        let quarantined = storage
            .all()
            .into_iter()
            .find(|(key, _)| valid_config_quarantine_key(key))
            .expect("invalid config is quarantined by the native owner");
        assert_eq!(quarantined.1, json!(damaged_config));

        let reloaded = RendererStorage::load(&root).expect("reload repaired renderer storage");
        assert_eq!(reloaded.all(), storage.all());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn failed_repair_replace_preserves_the_current_preferences_for_a_later_reload() {
        let root = temporary_directory("renderer-storage-repair-write-failure");
        fs::create_dir_all(&root).expect("create test directory");
        let path = root.join(RENDERER_STORAGE_FILE_NAME);
        let installation_id = Uuid::new_v4();
        let damaged_config = r#"{"schemaVersion":1,"locale":"zh-CN""#;
        let original = serde_json::to_vec(&Map::from_iter([
            (LANGUAGE_KEY.to_string(), json!("\"en\"")),
            (
                INSTALLATION_ID_KEY.to_string(),
                json!(format!("\"{installation_id}\"")),
            ),
            (DESKTOP_CONFIG_KEY.to_string(), json!(damaged_config)),
        ]))
        .expect("serialize damaged renderer state");
        fs::write(&path, &original).expect("write damaged renderer state");

        let blocking_backup = path.with_extension("previous");
        fs::create_dir(&blocking_backup).expect("create blocking backup directory");
        fs::write(blocking_backup.join("keep"), b"block replacement")
            .expect("make blocking backup directory non-empty");

        let file =
            AtomicJsonFile::new(path.clone(), RENDERER_STORAGE_LOCK_NAME, "renderer storage");
        let lock = file.lock().expect("lock renderer storage");
        let entries: Map<String, Value> = file
            .read_or_recover(&lock)
            .expect("read damaged renderer state")
            .expect("renderer state exists");
        let repaired = repair_disk_candidate(entries);
        assert!(repaired.changed);
        replace_repaired_file(&file, &lock, &repaired.entries)
            .expect_err("blocking backup must fail the atomic replacement");
        assert_eq!(
            fs::read(&path).expect("read preserved current state"),
            original,
            "a failed repair must not delete or partially replace the current state"
        );
        drop(lock);

        fs::remove_dir_all(&blocking_backup).expect("remove blocking backup directory");
        let repaired_storage = RendererStorage::load(&root).expect("retry repair on reload");
        assert_eq!(
            repaired_storage.all().get(LANGUAGE_KEY),
            Some(&json!("\"en\""))
        );
        assert_eq!(
            repaired_storage.all().get(INSTALLATION_ID_KEY),
            Some(&json!(format!("\"{installation_id}\"")))
        );
        assert!(!repaired_storage.all().contains_key(DESKTOP_CONFIG_KEY));

        let reloaded = RendererStorage::load(&root).expect("reload repaired renderer storage");
        assert_eq!(reloaded.all(), repaired_storage.all());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn load_deletes_secret_bearing_current_previous_and_corrupt_artifacts() {
        let root = temporary_directory("renderer-storage-secret-scrub");
        fs::create_dir_all(&root).expect("create test directory");
        let path = root.join(RENDERER_STORAGE_FILE_NAME);
        let secret = "must-not-survive-on-disk";
        let secret_document = format!(
            r#"{{"{DESKTOP_CONFIG_KEY}":"{{\"nested\":{{\"accessToken\":\"{secret}\"}}}}"}}"#
        );
        fs::write(&path, &secret_document).expect("write secret current state");
        fs::write(path.with_extension("previous"), &secret_document)
            .expect("write secret previous state");
        fs::write(
            root.join(format!("{RENDERER_STORAGE_FILE_NAME}.corrupt-test")),
            &secret_document,
        )
        .expect("write secret corrupt state");

        let storage = RendererStorage::load(&root).expect("scrub secret-bearing renderer state");
        assert!(storage.all().is_empty());
        for entry in fs::read_dir(&root).expect("list renderer storage artifacts") {
            let entry = entry.expect("read renderer storage artifact");
            if !entry.file_type().expect("read artifact type").is_file() {
                continue;
            }
            let bytes = fs::read(entry.path()).expect("read renderer storage artifact");
            assert!(
                !String::from_utf8_lossy(&bytes).contains(secret),
                "secret survived in {}",
                entry.path().display()
            );
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn persistence_error_accepts_the_exact_candidate_that_reached_disk() {
        let root = temporary_directory("renderer-storage-reconcile");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        storage
            .set_batch(Map::from_iter([(
                SELECTED_MODEL_KEY.to_string(),
                json!("\"old\""),
            )]))
            .expect("persist initial state");
        fs::write(
            root.join(RENDERER_STORAGE_FILE_NAME),
            serde_json::to_vec(&Map::from_iter([(
                SELECTED_MODEL_KEY.to_string(),
                json!("\"new\""),
            )]))
            .expect("serialize new state"),
        )
        .expect("simulate rename before directory sync failure");

        let candidate = Map::from_iter([(SELECTED_MODEL_KEY.to_string(), json!("\"new\""))]);
        let lock = storage.file.lock().expect("lock renderer storage");
        reconcile_after_persist_error(
            &storage.file,
            &mut storage.entries,
            &lock,
            &candidate,
            "directory sync failed".to_string(),
        )
        .expect("exact candidate is already committed");

        assert_eq!(storage.all(), candidate);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn concurrent_instances_reload_under_the_cross_process_lock_before_writing() {
        let root = temporary_directory("renderer-storage-concurrent");
        let mut first = RendererStorage::load(&root).expect("load first instance");
        let mut second = RendererStorage::load(&root).expect("load second instance");

        first
            .set_batch(Map::from_iter([(
                LANGUAGE_KEY.to_string(),
                json!("\"en\""),
            )]))
            .expect("persist first key");
        second
            .set_batch(Map::from_iter([(
                THINKING_ENABLED_KEY.to_string(),
                json!("false"),
            )]))
            .expect("persist second key");

        let reloaded = RendererStorage::load(&root).expect("reload merged storage");
        assert_eq!(
            reloaded.all(),
            Map::from_iter([
                (LANGUAGE_KEY.to_string(), json!("\"en\"")),
                (THINKING_ENABLED_KEY.to_string(), json!("false")),
            ])
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reads_reload_values_written_by_another_instance() {
        let root = temporary_directory("renderer-storage-cross-process-read");
        let mut first = RendererStorage::load(&root).expect("load first instance");
        let mut second = RendererStorage::load(&root).expect("load second instance");

        first
            .set_batch(Map::from_iter([(
                THINKING_EFFORT_KEY.to_string(),
                json!("\"extended\""),
            )]))
            .expect("persist shared value");

        assert_eq!(
            second.get(None).expect("reload second instance"),
            Map::from_iter([(THINKING_EFFORT_KEY.to_string(), json!("\"extended\""),)])
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_oversized_values_without_mutating_memory_or_disk() {
        let root = temporary_directory("renderer-storage-limits");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        storage
            .set_batch(Map::from_iter([(
                LANGUAGE_KEY.to_string(),
                json!("\"en\""),
            )]))
            .expect("persist stable value");

        let oversized = "x".repeat(MAX_RENDERER_STORAGE_VALUE_BYTES + 1);
        assert!(storage
            .set_batch(Map::from_iter([(
                SELECTED_MODEL_KEY.to_string(),
                json!(format!("\"{oversized}\""))
            )]))
            .is_err());
        assert_eq!(
            storage.all(),
            Map::from_iter([(LANGUAGE_KEY.to_string(), json!("\"en\""))])
        );
        assert_eq!(
            RendererStorage::load(&root)
                .expect("reload stable storage")
                .all(),
            Map::from_iter([(LANGUAGE_KEY.to_string(), json!("\"en\""))])
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_unknown_and_business_payload_keys() {
        let root = temporary_directory("renderer-storage-key-policy");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");

        for key in [
            "arbitrary",
            "geochatActiveNativeRun",
            "geochat.improvement.queue.v1",
            "geochat-desktop-ui-config:quarantine:v1:not-a-valid-id",
        ] {
            let error = storage
                .set_batch(Map::from_iter([(key.to_string(), json!("{}"))]))
                .expect_err("non-preference key must be rejected");
            assert!(error.contains("not an allowed renderer preference"));
        }

        assert!(storage.all().is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn accepts_only_bounded_config_quarantine_entries_with_strict_ids() {
        let root = temporary_directory("renderer-storage-quarantine-policy");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        let key = format!(
            "{CONFIG_QUARANTINE_KEY_PREFIX}1700000000000-{}",
            Uuid::new_v4()
        );

        storage
            .set_batch(Map::from_iter([(key.clone(), json!("{truncated"))]))
            .expect("persist bounded raw damaged config");
        assert_eq!(
            storage.get(Some(vec![key])).expect("read quarantine").len(),
            1
        );

        let oversized = "x".repeat(MAX_CONFIG_QUARANTINE_VALUE_BYTES + 1);
        let oversized_key = format!(
            "{CONFIG_QUARANTINE_KEY_PREFIX}1700000000001-{}",
            Uuid::new_v4()
        );
        assert!(storage
            .set_batch(Map::from_iter([(oversized_key, json!(oversized))]))
            .is_err());
        let sensitive_key = format!(
            "{CONFIG_QUARANTINE_KEY_PREFIX}1700000000002-{}",
            Uuid::new_v4()
        );
        assert!(storage
            .set_batch(Map::from_iter([(
                sensitive_key,
                json!(r#"{"authorization":"Bearer must-not-persist"}"#)
            )]))
            .is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_nested_sensitive_fields_before_current_previous_or_corrupt_are_written() {
        let root = temporary_directory("renderer-storage-secret-write-policy");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        storage
            .set_batch(Map::from_iter([(
                LANGUAGE_KEY.to_string(),
                json!("\"en\""),
            )]))
            .expect("persist stable value");
        let secret = "must-not-reach-any-artifact";
        let config = format!(
            r#"{{"schemaVersion":1,"model":{{}},"visionModel":{{}},"providerCredentials":{{"nested":{{"password":"{secret}"}}}},"customProvider":{{}},"skills":{{}},"interaction":{{}},"debug":{{}},"locale":"en-US"}}"#
        );

        let error = storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                json!(config),
            )]))
            .expect_err("secret-bearing config must be rejected");
        assert!(error.contains("forbidden sensitive field"));

        for entry in fs::read_dir(&root).expect("list renderer storage artifacts") {
            let entry = entry.expect("read renderer storage artifact");
            if !entry.file_type().expect("read artifact type").is_file() {
                continue;
            }
            let bytes = fs::read(entry.path()).expect("read renderer storage artifact");
            assert!(
                !String::from_utf8_lossy(&bytes).contains(secret),
                "rejected secret reached {}",
                entry.path().display()
            );
        }
        assert_eq!(
            RendererStorage::load(&root)
                .expect("reload stable storage")
                .all(),
            Map::from_iter([(LANGUAGE_KEY.to_string(), json!("\"en\""))])
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sensitive_key_detection_is_recursive_without_matching_plain_values() {
        assert!(raw_may_contain_sensitive_key(
            r#"{"nested":{"accessToken":"sensitive"}}"#
        ));
        assert!(raw_may_contain_sensitive_key(
            r#"{"nested":{"\u0061piKey":"sensitive"}}"#
        ));
        assert!(raw_may_contain_sensitive_key(
            r#"{"config":"{\"authorization\":\"sensitive\"}""#
        ));
        assert!(!raw_may_contain_sensitive_key(
            r#"{"endpoint":"https://token.example/v1","description":"secret recipes"}"#
        ));
    }

    #[test]
    fn validates_each_supported_preference_shape() {
        let root = temporary_directory("renderer-storage-value-policy");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");

        storage
            .set_batch(Map::from_iter([
                ("geogebraCopilotLanguage".to_string(), json!("\"zh-CN\"")),
                (
                    "geochatSelectedModel".to_string(),
                    json!("\"deepseek-flash\""),
                ),
                ("geogebraCopilotThinkingEnabled".to_string(), json!("true")),
                (
                    "geogebraCopilotThinkingEffort".to_string(),
                    json!("\"standard\""),
                ),
                (
                    "geogebraCopilotOnboardingTourCompleted".to_string(),
                    json!("3"),
                ),
                (
                    "geogebraCopilotPanelWindow".to_string(),
                    json!(r#"{"version":2,"left":12,"top":24,"width":640,"height":480}"#),
                ),
                (
                    "geogebraCopilotInstallationId".to_string(),
                    json!(format!("\"{}\"", Uuid::new_v4())),
                ),
                (
                    "geochatLegalConsent".to_string(),
                    json!(r#"{"version":1,"acceptedAt":"2026-10-02T03:04:05.678Z"}"#),
                ),
                (
                    "geochat-desktop-ui-config".to_string(),
                    encoded_desktop_config(&valid_desktop_config()),
                ),
            ]))
            .expect("persist typed renderer preferences");

        for (key, invalid) in [
            ("geogebraCopilotLanguage", json!("\"fr\"")),
            ("geochatSelectedModel", json!("\"\"")),
            ("geogebraCopilotThinkingEnabled", json!("\"yes\"")),
            ("geogebraCopilotThinkingEffort", json!("\"maximum\"")),
            ("geogebraCopilotOnboardingTourCompleted", json!("0")),
            (
                "geogebraCopilotPanelWindow",
                json!(r#"{"prompt":"business data"}"#),
            ),
            ("geogebraCopilotInstallationId", json!("\"not-a-uuid\"")),
            (
                "geochatLegalConsent",
                json!(r#"{"version":0,"acceptedAt":"2026-10-02T03:04:05.678Z"}"#),
            ),
            (
                "geochat-desktop-ui-config",
                json!(r#"{"schemaVersion":99}"#),
            ),
        ] {
            assert!(storage
                .set_batch(Map::from_iter([(key.to_string(), invalid)]))
                .is_err());
        }

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn legal_consent_roundtrips_and_rejects_invalid_records() {
        let root = temporary_directory("renderer-storage-legal-consent");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        let valid = json!(r#"{"version":1,"acceptedAt":"2026-10-02T03:04:05.678Z"}"#);

        storage
            .set_batch(Map::from_iter([(
                LEGAL_CONSENT_KEY.to_string(),
                valid.clone(),
            )]))
            .expect("persist legal consent");
        assert_eq!(
            RendererStorage::load(&root)
                .expect("reload legal consent")
                .get(Some(vec![LEGAL_CONSENT_KEY.to_string()]))
                .expect("read legal consent")
                .get(LEGAL_CONSENT_KEY),
            Some(&valid)
        );

        for invalid in [
            json!("true"),
            json!(r#"{"version":2,"acceptedAt":"2026-10-02T03:04:05.678Z"}"#),
            json!(r#"{"version":1,"acceptedAt":"2026-02-30T03:04:05.678Z"}"#),
            json!(r#"{"version":1,"acceptedAt":"2026-10-02T03:04:05Z"}"#),
            json!(r#"{"version":1,"acceptedAt":"2026-10-02T03:04:05.678Z","extra":true}"#),
        ] {
            storage
                .set_batch(Map::from_iter([(LEGAL_CONSENT_KEY.to_string(), invalid)]))
                .expect_err("invalid legal consent must be rejected");
            assert_eq!(storage.all().get(LEGAL_CONSENT_KEY), Some(&valid));
        }

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_nested_desktop_config_smuggling_without_mutating_memory_or_disk() {
        let root = temporary_directory("renderer-storage-config-schema");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                encoded_desktop_config(&valid_desktop_config()),
            )]))
            .expect("persist stable desktop config");
        let stable_entries = storage.all();
        let stable_disk =
            fs::read(root.join(RENDERER_STORAGE_FILE_NAME)).expect("read stable renderer storage");

        let mut attacks = Vec::new();

        let mut invalid_reference = valid_desktop_config();
        invalid_reference["model"]["credentialRef"] = json!("sk-canary");
        attacks.push(invalid_reference);

        let mut provider_secret = valid_desktop_config();
        provider_secret["providerCredentials"]["deepseek"]["key"] = json!("must-not-persist");
        attacks.push(provider_secret);

        let mut debug_note = valid_desktop_config();
        debug_note["debug"]["note"] = json!("must-not-persist");
        attacks.push(debug_note);

        let mut url_secret = valid_desktop_config();
        url_secret["customProvider"]["baseUrl"] =
            json!("https://api.example.test/v1?api_key=must-not-persist");
        attacks.push(url_secret);

        let mut url_userinfo = valid_desktop_config();
        url_userinfo["customProvider"]["baseUrl"] =
            json!("https://user:must-not-persist@api.example.test/v1");
        attacks.push(url_userinfo);

        let mut url_fragment = valid_desktop_config();
        url_fragment["customProvider"]["baseUrl"] =
            json!("https://api.example.test/v1#must-not-persist");
        attacks.push(url_fragment);

        for attack in attacks {
            storage
                .set_batch(Map::from_iter([(
                    DESKTOP_CONFIG_KEY.to_string(),
                    encoded_desktop_config(&attack),
                )]))
                .expect_err("invalid nested desktop config must be rejected");
            assert_eq!(storage.all(), stable_entries);
            assert_eq!(
                fs::read(root.join(RENDERER_STORAGE_FILE_NAME))
                    .expect("read unchanged renderer storage"),
                stable_disk
            );
        }

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn accepts_configured_credentials_and_custom_provider_with_canonical_v4_references() {
        let root = temporary_directory("renderer-storage-configured-schema");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        let initial = valid_desktop_config();
        let initial_raw = serde_json::to_string(&initial).unwrap();
        storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                json!(initial_raw.clone()),
            )]))
            .unwrap();
        let credential_ref = Uuid::new_v4().hyphenated().to_string();
        let mut config = initial;
        config["model"]["provider"] = json!("custom");
        config["model"]["model"] = json!("local-main");
        config["model"]["credentialRef"] = json!(credential_ref);
        config["providerCredentials"]["deepseek"]["credentialRef"] = json!(credential_ref);
        config["customProvider"] = json!({
            "name": "本地模型",
            "baseUrl": "http://127.0.0.1:11434/v1",
            "credentialRef": credential_ref,
            "protocol": "openai-compatible",
            "models": [{
                "name": "本地模型",
                "callName": "local-main",
                "supportsImages": false
            }]
        });

        storage
            .commit_credential_config(&initial_raw, &serde_json::to_string(&config).unwrap())
            .expect("persist fully configured desktop config");
        assert_eq!(
            storage.all().get(DESKTOP_CONFIG_KEY),
            Some(&encoded_desktop_config(&config))
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn generic_storage_write_cannot_change_active_credential_references() {
        let root = temporary_directory("renderer-storage-credential-guard");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        let initial = valid_desktop_config();
        storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                encoded_desktop_config(&initial),
            )]))
            .unwrap();
        let mut changed = initial;
        changed["model"]["credentialRef"] = json!(Uuid::new_v4().to_string());
        assert!(storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                encoded_desktop_config(&changed),
            )]))
            .unwrap_err()
            .contains("native credential lifecycle"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn generic_storage_write_rejects_rebinding_the_same_active_references() {
        let root = temporary_directory("renderer-storage-credential-rebinding-guard");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        let base = valid_desktop_config();
        let base_raw = serde_json::to_string(&base).unwrap();
        storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                json!(base_raw.clone()),
            )]))
            .unwrap();

        let first_ref = Uuid::new_v4().to_string();
        let second_ref = Uuid::new_v4().to_string();
        let mut configured = base;
        configured["model"]["credentialRef"] = json!(first_ref.clone());
        configured["providerCredentials"]["deepseek"]["credentialRef"] = json!(first_ref.clone());
        configured["visionModel"]["credentialRef"] = json!(second_ref.clone());
        configured["providerCredentials"]["openrouter"]["credentialRef"] =
            json!(second_ref.clone());
        let configured_raw = serde_json::to_string(&configured).unwrap();
        storage
            .commit_credential_config(&base_raw, &configured_raw)
            .expect("seed credential bindings through lifecycle CAS");

        let mut rebound = configured.clone();
        rebound["model"]["credentialRef"] = json!(second_ref);
        rebound["visionModel"]["credentialRef"] = json!(first_ref);
        assert!(storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                encoded_desktop_config(&rebound),
            )]))
            .unwrap_err()
            .contains("native credential lifecycle"));

        let mut protocol_drift = configured.clone();
        protocol_drift["providerCredentials"]["deepseek"]["protocol"] = json!("anthropic");
        assert!(storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                encoded_desktop_config(&protocol_drift),
            )]))
            .unwrap_err()
            .contains("native credential lifecycle"));

        let mut endpoint_drift = configured.clone();
        endpoint_drift["providerCredentials"]["deepseek"]["baseUrl"] =
            json!("https://example.com/v1");
        assert!(storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                encoded_desktop_config(&endpoint_drift),
            )]))
            .unwrap_err()
            .contains("native credential lifecycle"));

        configured["locale"] = json!("en-US");
        storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                encoded_desktop_config(&configured),
            )]))
            .expect("non-reference configuration changes remain allowed");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn active_model_credential_must_match_provider_ownership() {
        let credential_ref = Uuid::new_v4().to_string();
        let mut config = valid_desktop_config();
        config["model"]["credentialRef"] = json!(credential_ref.clone());
        config["providerCredentials"]["deepseek"]["credentialRef"] = json!(credential_ref.clone());

        let mut wrong_provider = config.clone();
        wrong_provider["model"]["provider"] = json!("openai");
        assert!(credential_binding_ownership_from_raw_config(
            &serde_json::to_string(&wrong_provider).unwrap()
        )
        .unwrap_err()
        .contains("active provider credential"));

        let mut wrong_protocol = config;
        wrong_protocol["model"]["protocol"] = json!("anthropic");
        assert!(credential_binding_ownership_from_raw_config(
            &serde_json::to_string(&wrong_protocol).unwrap()
        )
        .unwrap_err()
        .contains("match its provider binding"));
    }

    #[test]
    fn credential_cas_synchronizes_current_and_previous_before_cleanup() {
        let root = temporary_directory("renderer-storage-credential-cas");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        let initial = valid_desktop_config();
        let initial_raw = serde_json::to_string(&initial).unwrap();
        storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                json!(initial_raw),
            )]))
            .unwrap();
        let mut next = initial;
        let new_ref = Uuid::new_v4().to_string();
        next["model"]["credentialRef"] = json!(new_ref.clone());
        next["providerCredentials"]["deepseek"]["credentialRef"] = json!(new_ref.clone());
        let next_raw = serde_json::to_string(&next).unwrap();
        let refs = storage
            .commit_credential_config(&initial_raw, &next_raw)
            .unwrap();
        assert!(refs.contains(&new_ref));
        for path in [
            root.join(RENDERER_STORAGE_FILE_NAME),
            root.join("renderer-state.previous"),
        ] {
            let persisted: Map<String, Value> =
                serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
            assert_eq!(persisted.get(DESKTOP_CONFIG_KEY), Some(&json!(next_raw)));
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn strict_second_write_failure_blocks_cleanup_until_retry_synchronizes_previous() {
        let root = temporary_directory("renderer-storage-credential-strict-retry");
        let mut storage = RendererStorage::load(&root).expect("load empty storage");
        let initial = valid_desktop_config();
        let initial_raw = serde_json::to_string(&initial).unwrap();
        storage
            .set_batch(Map::from_iter([(
                DESKTOP_CONFIG_KEY.to_string(),
                json!(initial_raw.clone()),
            )]))
            .unwrap();
        let mut next = initial;
        let new_ref = Uuid::new_v4().to_string();
        next["model"]["credentialRef"] = json!(new_ref.clone());
        next["providerCredentials"]["deepseek"]["credentialRef"] = json!(new_ref);
        let next_raw = serde_json::to_string(&next).unwrap();

        storage.fail_strict_write_on_call(2);
        storage
            .commit_credential_config(&initial_raw, &next_raw)
            .expect_err("the failed backup synchronization must remain an error");

        let current: Map<String, Value> =
            serde_json::from_slice(&fs::read(root.join(RENDERER_STORAGE_FILE_NAME)).unwrap())
                .unwrap();
        let previous: Map<String, Value> =
            serde_json::from_slice(&fs::read(root.join("renderer-state.previous")).unwrap())
                .unwrap();
        assert_eq!(
            current.get(DESKTOP_CONFIG_KEY),
            Some(&json!(next_raw.clone()))
        );
        assert_eq!(previous.get(DESKTOP_CONFIG_KEY), Some(&json!(initial_raw)));

        storage.clear_strict_write_failure();
        storage
            .synchronize_credential_config(&next_raw)
            .expect("response-loss retry must synchronize previous");
        let previous: Map<String, Value> =
            serde_json::from_slice(&fs::read(root.join("renderer-state.previous")).unwrap())
                .unwrap();
        assert_eq!(previous.get(DESKTOP_CONFIG_KEY), Some(&json!(next_raw)));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn strict_credential_snapshot_rejects_corrupt_current_without_recovery() {
        let root = temporary_directory("renderer-storage-strict-corrupt");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join(RENDERER_STORAGE_FILE_NAME), b"not-json").unwrap();
        let mut storage = RendererStorage {
            file: AtomicJsonFile::new(
                root.join(RENDERER_STORAGE_FILE_NAME),
                RENDERER_STORAGE_LOCK_NAME,
                "renderer storage",
            ),
            path: root.join(RENDERER_STORAGE_FILE_NAME),
            entries: Map::new(),
        };
        assert!(storage.credential_config_snapshot().is_err());
        let _ = fs::remove_dir_all(root);
    }
}
