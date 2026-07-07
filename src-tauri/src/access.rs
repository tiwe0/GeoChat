use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::AppHandle;
use uuid::Uuid;

use crate::{
    now_iso,
    settings::{default_access_features, save_settings, DesktopAccessFeatures},
    DesktopState,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopAccessState {
    pub(crate) status: String,
    pub(crate) features: DesktopAccessFeatures,
    pub(crate) checked_at: Option<String>,
    pub(crate) error: Option<String>,
    pub(crate) error_code: Option<String>,
}

pub(crate) fn access_allows_runtime_use() -> bool {
    true
}

pub(crate) fn schedule_silent_access_check(_app: AppHandle) {}

pub(crate) fn refresh_runtime_authorization(state: &DesktopState) -> Result<(), String> {
    state
        .runtime_authorized
        .store(access_allows_runtime_use(), Ordering::SeqCst);
    Ok(())
}

pub(crate) fn access_state_from_store(_state: &DesktopState) -> Result<DesktopAccessState, String> {
    Ok(local_access_state())
}

pub(crate) fn check_desktop_access(state: &DesktopState) -> Result<DesktopAccessState, String> {
    state
        .runtime_authorized
        .store(access_allows_runtime_use(), Ordering::SeqCst);
    Ok(local_access_state())
}

pub(crate) fn stable_device_id(state: &DesktopState) -> Result<String, String> {
    let mut settings = state.settings.lock().map_err(|error| error.to_string())?;
    if let Some(device_id) = settings.device_id.as_ref() {
        return Ok(device_id.clone());
    }
    let device_id = format!("dev_{}", Uuid::new_v4().simple());
    settings.device_id = Some(device_id.clone());
    save_settings(&state.settings_path, &settings)?;
    Ok(device_id)
}

fn local_access_state() -> DesktopAccessState {
    DesktopAccessState {
        status: "active".to_string(),
        features: default_access_features(),
        checked_at: Some(now_iso()),
        error: None,
        error_code: None,
    }
}
