use crate::{update_flow, update_state::DesktopAppBundleUpdateState, DesktopState};
use tauri::{AppHandle, State};

#[tauri::command]
pub(crate) fn get_app_bundle_update_state(
    state: State<'_, DesktopState>,
) -> Result<DesktopAppBundleUpdateState, String> {
    update_flow::app_bundle_update_state(&state)
}

#[tauri::command]
pub(crate) fn check_app_bundle_update(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<DesktopAppBundleUpdateState, String> {
    update_flow::check_app_bundle_update(&app, &state)
}

#[tauri::command]
pub(crate) fn install_app_bundle_update(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<DesktopAppBundleUpdateState, String> {
    update_flow::install_app_bundle_update(app, &state)
}

#[tauri::command]
pub(crate) fn rollback_app_bundle_update(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<DesktopAppBundleUpdateState, String> {
    update_flow::rollback_app_bundle_update(app, &state)
}
