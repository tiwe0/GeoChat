use crate::{
    complete_pending_installed_client_update_evidence, maybe_run_installed_client_update_smoke,
    refresh_runtime_authorization, sidecar::BackendRuntimeSnapshot, DesktopState,
};
use serde::Serialize;
use std::{env, sync::atomic::Ordering};
use tauri::{AppHandle, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeInfo {
    platform: String,
    app_version: String,
    backend_base_url: String,
    backend_runtime: BackendRuntimeSnapshot,
    backend_auth: RuntimeBackendAuth,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum RuntimeBackendAuth {
    Authorized { token: String },
    Unauthorized,
}

#[tauri::command]
pub(crate) fn get_runtime_info(state: State<'_, DesktopState>) -> Result<RuntimeInfo, String> {
    let backend = state.backend.lock().map_err(|error| error.to_string())?;
    refresh_runtime_authorization(&state)?;
    Ok(RuntimeInfo {
        platform: env::consts::OS.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        backend_base_url: backend.base_url.clone(),
        backend_runtime: backend.snapshot(),
        backend_auth: if state.runtime_authorized.load(Ordering::SeqCst) {
            RuntimeBackendAuth::Authorized {
                token: state.local_backend_auth_token.clone(),
            }
        } else {
            RuntimeBackendAuth::Unauthorized
        },
    })
}

#[tauri::command]
pub(crate) fn mark_renderer_ready(app: AppHandle, state: State<'_, DesktopState>) {
    state.renderer_ready.store(true, Ordering::SeqCst);
    complete_pending_installed_client_update_evidence(&state);
    maybe_run_installed_client_update_smoke(app);
}
