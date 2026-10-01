use crate::atomic_json_file::{AtomicJsonFile, AtomicJsonFileLock};
use serde_json::{Map, Value};
use std::{
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
const DESKTOP_CONFIG_KEY: &str = "geochat-desktop-ui-config";
const LANGUAGE_KEY: &str = "geogebraCopilotLanguage";
const SELECTED_MODEL_KEY: &str = "geochatSelectedModel";
const THINKING_ENABLED_KEY: &str = "geogebraCopilotThinkingEnabled";
const THINKING_EFFORT_KEY: &str = "geogebraCopilotThinkingEffort";
const ONBOARDING_TOUR_KEY: &str = "geogebraCopilotOnboardingTourCompleted";
const PANEL_WINDOW_KEY: &str = "geogebraCopilotPanelWindow";
const INSTALLATION_ID_KEY: &str = "geogebraCopilotInstallationId";
const CONFIG_QUARANTINE_KEY_PREFIX: &str = "geochat-desktop-ui-config:quarantine:v1:";
const MAX_CONFIG_QUARANTINE_VALUE_BYTES: usize = 256 * 1024;

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
        candidate.extend(values);
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
        for key in keys {
            validate_preference_key(&key)?;
            candidate.remove(&key);
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

    fn persist_candidate(
        &self,
        lock: &AtomicJsonFileLock,
        candidate: &Map<String, Value>,
    ) -> Result<(), String> {
        validate_candidate(candidate)?;
        self.file.write(lock, candidate)
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
        | THINKING_EFFORT_KEY | ONBOARDING_TOUR_KEY | PANEL_WINDOW_KEY | INSTALLATION_ID_KEY => {
            Ok(())
        }
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
        PANEL_WINDOW_KEY => validate_panel_window(&decoded),
        DESKTOP_CONFIG_KEY => validate_desktop_config(&decoded),
        _ => false,
    };
    valid
        .then_some(())
        .ok_or_else(|| format!("Renderer preference {key} has an invalid value"))
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
    config.len() == REQUIRED_FIELDS.len()
        && config.get("schemaVersion").and_then(Value::as_u64) == Some(1)
        && REQUIRED_FIELDS
            .iter()
            .all(|field| config.contains_key(*field))
        && [
            "model",
            "visionModel",
            "providerCredentials",
            "customProvider",
            "skills",
            "interaction",
            "debug",
        ]
        .into_iter()
        .all(|field| config.get(field).is_some_and(Value::is_object))
        && matches!(
            config.get("locale").and_then(Value::as_str),
            Some("zh-CN" | "en-US")
        )
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
                (
                    "geogebraCopilotLanguage".to_string(),
                    json!("\"zh-CN\""),
                ),
                ("geochatSelectedModel".to_string(), json!("\"deepseek-flash\"")),
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
                    "geochat-desktop-ui-config".to_string(),
                    json!(r#"{"schemaVersion":1,"model":{},"visionModel":{},"providerCredentials":{},"customProvider":{},"skills":{},"interaction":{},"debug":{},"locale":"zh-CN"}"#),
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
}
