use crate::{settings::save_settings, DesktopState};
use serde::Serialize;
use tauri::State;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DesktopGraphicsMode {
    Configurable,
    SystemManaged,
    Compatibility,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopGraphicsState {
    enabled: bool,
    applied: bool,
    configurable: bool,
    restart_required: bool,
    mode: DesktopGraphicsMode,
}

#[tauri::command]
pub(crate) fn get_graphics_preferences(
    state: State<'_, DesktopState>,
) -> Result<DesktopGraphicsState, String> {
    graphics_state(&state)
}

#[tauri::command]
pub(crate) fn set_graphics_preferences(
    state: State<'_, DesktopState>,
    preferences: serde_json::Value,
) -> Result<DesktopGraphicsState, String> {
    if !state.hardware_acceleration_configurable {
        return graphics_state(&state);
    }

    let mut settings = state.settings.lock().map_err(|error| error.to_string())?;
    if let Some(enabled) = preferences
        .get("hardwareAcceleration")
        .and_then(|value| value.as_bool())
    {
        settings.graphics_preferences.hardware_acceleration = enabled;
    }
    save_settings(&state.settings_path, &settings)?;
    drop(settings);
    graphics_state(&state)
}

fn graphics_state(state: &DesktopState) -> Result<DesktopGraphicsState, String> {
    let configured = state
        .settings
        .lock()
        .map_err(|error| error.to_string())?
        .graphics_preferences
        .hardware_acceleration;
    let enabled = if state.hardware_acceleration_configurable {
        configured
    } else {
        state.hardware_acceleration_applied
    };
    Ok(DesktopGraphicsState {
        enabled,
        applied: state.hardware_acceleration_applied,
        configurable: state.hardware_acceleration_configurable,
        restart_required: state.hardware_acceleration_configurable
            && configured != state.hardware_acceleration_applied,
        mode: state.graphics_mode,
    })
}
