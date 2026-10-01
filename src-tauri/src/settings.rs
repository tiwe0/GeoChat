use crate::{
    atomic_json_file::AtomicJsonFile,
    logging::{default_logging_preferences, DesktopLoggingPreferences},
};
use serde::{de::Error as _, Deserialize, Deserializer, Serialize};
use std::{env, path::Path, path::PathBuf};

const SETTINGS_LOCK_NAME: &str = ".settings.lock";
const SETTINGS_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DesktopSettings {
    #[serde(deserialize_with = "deserialize_settings_schema_version")]
    pub(crate) schema_version: u32,
    pub(crate) device_id: Option<String>,
    pub(crate) graphics_preferences: DesktopGraphicsPreferences,
    pub(crate) update_preferences: DesktopUpdatePreferences,
    pub(crate) improvement_plan_preferences: DesktopImprovementPlanPreferences,
    pub(crate) logging_preferences: DesktopLoggingPreferences,
}

fn deserialize_settings_schema_version<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    let version = u32::deserialize(deserializer)?;
    if version == SETTINGS_SCHEMA_VERSION {
        Ok(version)
    } else {
        Err(D::Error::custom(format!(
            "unsupported settings schema version: {version}"
        )))
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DesktopAccessFeatures {
    pub(crate) local: bool,
    pub(crate) problem_bank: bool,
    pub(crate) improvement_upload: bool,
}

pub(crate) fn default_access_features() -> DesktopAccessFeatures {
    DesktopAccessFeatures {
        local: true,
        problem_bank: true,
        improvement_upload: false,
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DesktopUpdatePreferences {
    pub(crate) auto_check: bool,
    pub(crate) auto_download: bool,
    pub(crate) install_on_quit: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DesktopGraphicsPreferences {
    pub(crate) hardware_acceleration: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DesktopImprovementPlanPreferences {
    pub(crate) enabled: bool,
}

pub(crate) fn default_settings() -> DesktopSettings {
    DesktopSettings {
        schema_version: SETTINGS_SCHEMA_VERSION,
        device_id: None,
        graphics_preferences: default_graphics_preferences(),
        update_preferences: default_update_preferences(),
        improvement_plan_preferences: default_improvement_plan_preferences(),
        logging_preferences: default_logging_preferences(),
    }
}

pub(crate) fn default_graphics_preferences() -> DesktopGraphicsPreferences {
    DesktopGraphicsPreferences {
        hardware_acceleration: true,
    }
}

pub(crate) fn load_settings(path: &Path) -> Result<DesktopSettings, String> {
    let file = AtomicJsonFile::new(path.to_path_buf(), SETTINGS_LOCK_NAME, "desktop settings");
    let lock = file.lock()?;
    Ok(file
        .read_or_recover(&lock)?
        .unwrap_or_else(default_settings))
}

pub(crate) fn save_settings(path: &Path, settings: &DesktopSettings) -> Result<(), String> {
    let file = AtomicJsonFile::new(path.to_path_buf(), SETTINGS_LOCK_NAME, "desktop settings");
    let lock = file.lock()?;
    file.write(&lock, settings)
}

pub(crate) fn desktop_database_path(app_data_dir: &Path) -> PathBuf {
    env::var("GEOCHAT_DESKTOP_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| app_data_dir.join("geochat-desktop.sqlite"))
}

pub(crate) fn default_update_preferences() -> DesktopUpdatePreferences {
    DesktopUpdatePreferences {
        auto_check: true,
        auto_download: true,
        install_on_quit: false,
    }
}

pub(crate) fn default_improvement_plan_preferences() -> DesktopImprovementPlanPreferences {
    DesktopImprovementPlanPreferences { enabled: true }
}

#[cfg(test)]
mod tests {
    use super::{
        default_graphics_preferences, default_settings, default_update_preferences, load_settings,
        save_settings, SETTINGS_SCHEMA_VERSION,
    };
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn hardware_acceleration_is_enabled_by_default() {
        assert!(default_graphics_preferences().hardware_acceleration);
        assert!(
            default_settings()
                .graphics_preferences
                .hardware_acceleration
        );
    }

    #[test]
    fn default_update_preferences_enable_silent_check_and_download() {
        let preferences = default_update_preferences();
        assert!(preferences.auto_check);
        assert!(preferences.auto_download);
        assert!(!preferences.install_on_quit);
    }

    #[test]
    fn older_settings_are_quarantined_and_reset() {
        let root = std::env::temp_dir().join(format!("geochat-settings-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create settings directory");
        let path = root.join("settings.json");
        fs::write(
            &path,
            r#"{"deviceId":null,"updatePreferences":{"autoCheck":true,"autoDownload":true,"installOnQuit":false},"improvementPlanPreferences":{"enabled":true},"license":{"status":"active"}}"#,
        )
        .expect("write old settings");

        let settings = load_settings(&path).expect("old settings should reset cleanly");

        assert_eq!(settings.schema_version, SETTINGS_SCHEMA_VERSION);
        assert!(settings.graphics_preferences.hardware_acceleration);
        assert_eq!(
            settings.logging_preferences,
            default_settings().logging_preferences
        );
        assert!(!path.exists());
        assert!(fs::read_dir(&root)
            .expect("list settings directory")
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().contains(".corrupt-")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn unsupported_settings_schema_is_rejected() {
        let mut value =
            serde_json::to_value(default_settings()).expect("serialize current settings");
        value["schemaVersion"] = serde_json::json!(2);

        let decoded = serde_json::from_value::<super::DesktopSettings>(value);

        assert!(decoded.is_err());
    }

    #[test]
    fn corrupt_settings_are_quarantined_instead_of_blocking_startup() {
        let root = std::env::temp_dir().join(format!("geochat-settings-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create settings directory");
        let path = root.join("settings.json");
        fs::write(&path, b"{").expect("write corrupt settings");

        let loaded = load_settings(&path).expect("corrupt settings should not block startup");

        assert!(loaded.graphics_preferences.hardware_acceleration);
        assert!(!path.exists());
        assert!(fs::read_dir(&root)
            .expect("list settings directory")
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().contains(".corrupt-")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn settings_recover_the_last_synced_version_after_corruption() {
        let root = std::env::temp_dir().join(format!("geochat-settings-{}", Uuid::new_v4()));
        let path = root.join("settings.json");
        let mut first = default_settings();
        first.device_id = Some("stable".to_string());
        save_settings(&path, &first).expect("save first settings");
        let mut second = first.clone();
        second.device_id = Some("new".to_string());
        save_settings(&path, &second).expect("save second settings");
        fs::write(&path, b"{").expect("corrupt current settings");

        let loaded = load_settings(&path).expect("recover previous settings");

        assert_eq!(loaded.device_id.as_deref(), Some("stable"));
        let _ = fs::remove_dir_all(root);
    }
}
