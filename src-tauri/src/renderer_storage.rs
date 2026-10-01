use crate::atomic_json_file::{AtomicJsonFile, AtomicJsonFileLock};
use serde_json::{Map, Value};
use std::path::Path;
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
    entries: Map<String, Value>,
}

impl RendererStorage {
    pub(crate) fn load(app_data_dir: &Path) -> Result<Self, String> {
        let path = app_data_dir.join(RENDERER_STORAGE_FILE_NAME);
        let file = AtomicJsonFile::new(path, RENDERER_STORAGE_LOCK_NAME, "renderer storage");
        let lock = file.lock()?;
        let entries = file.read_or_recover(&lock)?.unwrap_or_default();
        validate_candidate(&entries)?;
        drop(lock);
        Ok(Self { file, entries })
    }

    pub(crate) fn all(&self) -> Map<String, Value> {
        self.entries.clone()
    }

    pub(crate) fn get(&mut self, keys: Option<Vec<String>>) -> Result<Map<String, Value>, String> {
        let lock = self.file.lock()?;
        self.entries = self.file.read_or_recover(&lock)?.unwrap_or_default();
        validate_candidate(&self.entries)?;
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
        let mut candidate: Map<String, Value> =
            self.file.read_or_recover(&lock)?.unwrap_or_default();
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
        let mut candidate: Map<String, Value> =
            self.file.read_or_recover(&lock)?.unwrap_or_default();
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
            .filter(|raw| !raw.is_empty() && raw.len() <= MAX_CONFIG_QUARANTINE_VALUE_BYTES)
            .map(|_| ())
            .ok_or_else(|| format!("Renderer preference {key} has an invalid value"));
    }
    let decoded = decode_preference_value(key, value)?;
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
        let _ = fs::remove_dir_all(root);
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
