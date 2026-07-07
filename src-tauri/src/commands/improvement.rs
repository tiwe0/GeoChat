use crate::{
    settings::{save_settings, DesktopImprovementPlanPreferences},
    DesktopState,
};
use tauri::State;

#[tauri::command]
pub(crate) fn get_improvement_plan_preferences(
    state: State<'_, DesktopState>,
) -> Result<DesktopImprovementPlanPreferences, String> {
    let settings = state.settings.lock().map_err(|error| error.to_string())?;
    Ok(settings.improvement_plan_preferences.clone())
}

#[tauri::command]
pub(crate) fn set_improvement_plan_preferences(
    state: State<'_, DesktopState>,
    preferences: serde_json::Value,
) -> Result<DesktopImprovementPlanPreferences, String> {
    let mut settings = state.settings.lock().map_err(|error| error.to_string())?;
    if let Some(value) = preferences.get("enabled").and_then(|value| value.as_bool()) {
        settings.improvement_plan_preferences.enabled = value;
    }
    let next_preferences = settings.improvement_plan_preferences.clone();
    save_settings(&state.settings_path, &settings)?;
    Ok(next_preferences)
}

#[tauri::command]
pub(crate) fn upload_improvement_plan_samples(
    _state: State<'_, DesktopState>,
    samples: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if !samples.is_array() {
        return Err("Improvement plan upload expects a sample array.".to_string());
    }
    Err("Improvement plan upload is not available in the local desktop build.".to_string())
}
