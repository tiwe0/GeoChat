use crate::{
    logging::{configure_logging, sanitize_message, DesktopLogLevel, DesktopLoggingPreferences},
    settings::save_settings,
    DesktopState,
};
use serde::Serialize;
use std::fs;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopLoggingState {
    enabled: bool,
    level: DesktopLogLevel,
    log_directory: String,
}

#[tauri::command]
pub(crate) fn get_logging_preferences(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<DesktopLoggingState, String> {
    let preferences = state
        .settings
        .lock()
        .map_err(|error| error.to_string())?
        .logging_preferences
        .clone();
    logging_state(&app, preferences)
}

#[tauri::command]
pub(crate) fn set_logging_preferences(
    app: AppHandle,
    state: State<'_, DesktopState>,
    preferences: serde_json::Value,
) -> Result<DesktopLoggingState, String> {
    let mut settings = state.settings.lock().map_err(|error| error.to_string())?;
    if let Some(enabled) = preferences.get("enabled").and_then(|value| value.as_bool()) {
        settings.logging_preferences.enabled = enabled;
    }
    if let Some(level) = preferences.get("level").and_then(|value| value.as_str()) {
        settings.logging_preferences.level = DesktopLogLevel::parse(level)?;
    }
    let next_preferences = settings.logging_preferences.clone();
    save_settings(&state.settings_path, &settings)?;
    configure_logging(&next_preferences);
    drop(settings);

    if next_preferences.enabled {
        log::info!(
            target: "geochat::lifecycle",
            "Local file logging enabled at {:?} level",
            next_preferences.level
        );
    }
    logging_state(&app, next_preferences)
}

#[tauri::command]
pub(crate) fn open_log_directory(app: AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create log directory {}: {error}", path.display()))?;
    let display_path = path.to_string_lossy().into_owned();
    app.opener()
        .open_path(display_path.clone(), None::<String>)
        .map_err(|error| format!("Failed to open log directory: {error}"))?;
    log::debug!(target: "geochat::logging", "Opened local log directory");
    Ok(display_path)
}

#[tauri::command]
pub(crate) fn write_app_log(level: DesktopLogLevel, message: String) -> Result<(), String> {
    let message = sanitize_message(&message);
    log::log!(
        target: "geochat::frontend",
        level.as_log_level(),
        "[frontend] {message}"
    );
    Ok(())
}

fn logging_state(
    app: &AppHandle,
    preferences: DesktopLoggingPreferences,
) -> Result<DesktopLoggingState, String> {
    let log_directory = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .into_owned();
    Ok(DesktopLoggingState {
        enabled: preferences.enabled,
        level: preferences.level,
        log_directory,
    })
}
