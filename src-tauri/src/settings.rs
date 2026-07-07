use serde::{Deserialize, Serialize};
use std::{env, fs, path::Path, path::PathBuf};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopSettings {
    pub(crate) device_id: Option<String>,
    #[serde(default = "default_update_preferences")]
    pub(crate) update_preferences: DesktopUpdatePreferences,
    #[serde(default = "default_improvement_plan_preferences")]
    pub(crate) improvement_plan_preferences: DesktopImprovementPlanPreferences,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopUpdatePreferences {
    pub(crate) auto_check: bool,
    pub(crate) auto_download: bool,
    pub(crate) install_on_quit: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopImprovementPlanPreferences {
    pub(crate) enabled: bool,
}

pub(crate) fn default_settings() -> DesktopSettings {
    DesktopSettings {
        device_id: None,
        update_preferences: default_update_preferences(),
        improvement_plan_preferences: default_improvement_plan_preferences(),
    }
}

pub(crate) fn load_settings(path: &Path) -> Result<DesktopSettings, String> {
    if !path.is_file() {
        return Ok(default_settings());
    }
    let content = fs::read_to_string(path).map_err(|error| {
        format!(
            "Failed to read Tauri desktop settings {}: {error}",
            path.display()
        )
    })?;
    serde_json::from_str(&content).map_err(|error| {
        format!(
            "Failed to parse Tauri desktop settings {}: {error}",
            path.display()
        )
    })
}

pub(crate) fn save_settings(path: &Path, settings: &DesktopSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create settings directory {}: {error}",
                parent.display()
            )
        })?;
    }
    let content = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Failed to serialize Tauri desktop settings: {error}"))?;
    fs::write(path, content).map_err(|error| {
        format!(
            "Failed to write Tauri desktop settings {}: {error}",
            path.display()
        )
    })
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
    use super::default_update_preferences;

    #[test]
    fn default_update_preferences_enable_silent_check_and_download() {
        let preferences = default_update_preferences();
        assert!(preferences.auto_check);
        assert!(preferences.auto_download);
        assert!(!preferences.install_on_quit);
    }
}
