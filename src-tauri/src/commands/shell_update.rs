use crate::{
    update_flow,
    update_state::{DesktopUnifiedUpdateState, DesktopUpdateState},
    DesktopState,
};
use tauri::{AppHandle, State};

#[tauri::command]
pub(crate) fn get_update_state(
    state: State<'_, DesktopState>,
) -> Result<DesktopUpdateState, String> {
    update_flow::desktop_update_state(&state)
}

#[tauri::command]
pub(crate) async fn check_for_updates(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<DesktopUpdateState, String> {
    update_flow::check_shell_update(&app, &state).await
}

#[tauri::command]
pub(crate) async fn check_all_updates(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<DesktopUnifiedUpdateState, String> {
    update_flow::check_all_updates(app, &state).await
}

#[tauri::command]
pub(crate) async fn download_update(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<DesktopUpdateState, String> {
    update_flow::download_shell_update(&app, &state).await
}

#[tauri::command]
pub(crate) fn set_update_preferences(
    app: AppHandle,
    state: State<'_, DesktopState>,
    preferences: serde_json::Value,
) -> Result<DesktopUpdateState, String> {
    update_flow::set_update_preferences(app, &state, preferences)
}

#[tauri::command]
pub(crate) fn install_update(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<DesktopUpdateState, String> {
    update_flow::install_shell_update(&app, &state)
}
