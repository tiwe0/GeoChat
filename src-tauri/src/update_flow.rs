use crate::{
    app_bundle::{
        app_bundle_manifest_url, app_bundle_requires_shell_update, install_configured_app_bundle,
        is_newer_app_bundle_version, is_shell_version_compatible, normalize_update_error,
        read_remote_app_bundle_manifest, resolve_active_app_bundle,
        rollback_app_bundle_installation, shell_update_required_message,
    },
    installed_client_smoke::{
        installed_client_smoke_current_bundle_version, installed_client_update_smoke_enabled,
        installed_client_update_smoke_external_relaunch_enabled,
        write_pending_installed_client_update_evidence,
    },
    now_iso,
    settings::{save_settings, DesktopUpdatePreferences},
    shell_update::{shell_update_configured, shell_update_endpoint, shell_update_public_key},
    update_state::{
        apply_app_bundle_update_patch, hydrate_app_bundle_update_state_for_paths,
        hydrate_shell_update_state, initial_shell_update_state, shell_update_state_from_update,
        unified_update_state, AppBundleUpdatePatch, DesktopAppBundleUpdateState,
        DesktopUnifiedUpdateState, DesktopUpdateState,
    },
    DesktopState,
};
use std::{
    env,
    sync::{atomic::Ordering, Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use time::format_description::well_known::Rfc3339;
use url::Url;

pub(crate) fn desktop_update_state(state: &DesktopState) -> Result<DesktopUpdateState, String> {
    let mut runtime = state
        .shell_update
        .lock()
        .map_err(|error| error.to_string())?;
    runtime.state = hydrate_shell_update_state(runtime.state.clone(), update_preferences(state)?);
    Ok(runtime.state.clone())
}

pub(crate) async fn check_shell_update(
    app: &AppHandle,
    state: &DesktopState,
) -> Result<DesktopUpdateState, String> {
    if !shell_update_configured() {
        let disabled = initial_shell_update_state(update_preferences(state)?);
        return set_shell_update_state(app, state, disabled);
    }

    set_shell_update_state(
        app,
        state,
        DesktopUpdateState {
            status: "checking",
            available: true,
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            update_version: None,
            release_name: None,
            release_date: None,
            downloaded: false,
            download_percent: None,
            error: None,
            error_code: None,
            checked_at: Some(now_iso()),
            preferences: update_preferences(state)?,
        },
    )?;

    match fetch_shell_update(app).await {
        Ok(Some(update)) => {
            let next = shell_update_state_from_update(
                "available",
                &update,
                false,
                None,
                update_preferences(state)?,
                now_iso(),
            );
            let mut runtime = state
                .shell_update
                .lock()
                .map_err(|error| error.to_string())?;
            runtime.pending_update = Some(update);
            runtime.pending_bytes = None;
            runtime.state = hydrate_shell_update_state(next, update_preferences(state)?);
            let emitted = runtime.state.clone();
            drop(runtime);
            app.emit("desktop:update-state", emitted.clone())
                .map_err(|error| error.to_string())?;
            Ok(emitted)
        }
        Ok(None) => {
            let mut runtime = state
                .shell_update
                .lock()
                .map_err(|error| error.to_string())?;
            runtime.pending_update = None;
            runtime.pending_bytes = None;
            drop(runtime);
            set_shell_update_state(
                app,
                state,
                DesktopUpdateState {
                    status: "not_available",
                    available: true,
                    current_version: env!("CARGO_PKG_VERSION").to_string(),
                    update_version: None,
                    release_name: None,
                    release_date: None,
                    downloaded: false,
                    download_percent: None,
                    error: None,
                    error_code: None,
                    checked_at: Some(now_iso()),
                    preferences: update_preferences(state)?,
                },
            )
        }
        Err(error) => {
            let (message, code) = normalize_update_error(error);
            let mut runtime = state
                .shell_update
                .lock()
                .map_err(|error| error.to_string())?;
            runtime.pending_update = None;
            runtime.pending_bytes = None;
            drop(runtime);
            set_shell_update_state(
                app,
                state,
                DesktopUpdateState {
                    status: "error",
                    available: true,
                    current_version: env!("CARGO_PKG_VERSION").to_string(),
                    update_version: None,
                    release_name: None,
                    release_date: None,
                    downloaded: false,
                    download_percent: None,
                    error: Some(message),
                    error_code: Some(code),
                    checked_at: Some(now_iso()),
                    preferences: update_preferences(state)?,
                },
            )
        }
    }
}

async fn fetch_shell_update(app: &AppHandle) -> Result<Option<Update>, String> {
    let public_key = shell_update_public_key()
        .ok_or_else(|| "Shell update public key is not configured.".to_string())?;
    let endpoint = shell_update_endpoint()
        .ok_or_else(|| "Shell update endpoint is not configured.".to_string())?;
    let endpoint = Url::parse(&endpoint)
        .map_err(|error| format!("Invalid shell update endpoint {endpoint}: {error}"))?;
    let updater = app
        .updater_builder()
        .pubkey(public_key)
        .endpoints(vec![endpoint])
        .map_err(|error| error.to_string())?
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?;
    updater.check().await.map_err(|error| error.to_string())
}

pub(crate) async fn download_shell_update(
    app: &AppHandle,
    state: &DesktopState,
) -> Result<DesktopUpdateState, String> {
    let update = {
        let runtime = state
            .shell_update
            .lock()
            .map_err(|error| error.to_string())?;
        runtime.pending_update.clone()
    }
    .ok_or_else(|| "No shell update has been checked and staged for download.".to_string())?;

    set_shell_update_state(
        app,
        state,
        shell_update_state_from_update(
            "downloading",
            &update,
            false,
            Some(0.0),
            update_preferences(state)?,
            now_iso(),
        ),
    )?;

    let downloaded = Arc::new(Mutex::new(0_u64));
    let downloaded_for_progress = Arc::clone(&downloaded);
    match update
        .download(
            move |chunk_length, _content_length| {
                if let Ok(mut total) = downloaded_for_progress.lock() {
                    *total += chunk_length as u64;
                }
            },
            || {},
        )
        .await
    {
        Ok(bytes) => {
            let mut runtime = state
                .shell_update
                .lock()
                .map_err(|error| error.to_string())?;
            runtime.pending_update = Some(update.clone());
            runtime.pending_bytes = Some(bytes);
            drop(runtime);
            set_shell_update_state(
                app,
                state,
                shell_update_state_from_update(
                    "downloaded",
                    &update,
                    true,
                    Some(100.0),
                    update_preferences(state)?,
                    now_iso(),
                ),
            )
        }
        Err(error) => {
            let (message, code) = normalize_update_error(error.to_string());
            set_shell_update_state(
                app,
                state,
                DesktopUpdateState {
                    status: "error",
                    available: true,
                    current_version: env!("CARGO_PKG_VERSION").to_string(),
                    update_version: Some(update.version.clone()),
                    release_name: update.body.clone(),
                    release_date: update.date.and_then(|date| date.format(&Rfc3339).ok()),
                    downloaded: false,
                    download_percent: None,
                    error: Some(message),
                    error_code: Some(code),
                    checked_at: Some(now_iso()),
                    preferences: update_preferences(state)?,
                },
            )
        }
    }
}

pub(crate) fn install_shell_update(
    app: &AppHandle,
    state: &DesktopState,
) -> Result<DesktopUpdateState, String> {
    let (update, bytes) = {
        let mut runtime = state
            .shell_update
            .lock()
            .map_err(|error| error.to_string())?;
        (runtime.pending_update.clone(), runtime.pending_bytes.take())
    };
    let update = update
        .ok_or_else(|| "No shell update has been checked and staged for install.".to_string())?;
    let bytes = bytes.ok_or_else(|| "No downloaded shell update package is ready.".to_string())?;

    match update.install(bytes) {
        Ok(()) => {
            let next = shell_update_state_from_update(
                "downloaded",
                &update,
                true,
                Some(100.0),
                update_preferences(state)?,
                now_iso(),
            );
            let emitted = set_shell_update_state(app, state, next)?;
            app.request_restart();
            Ok(emitted)
        }
        Err(error) => {
            let (message, code) = normalize_update_error(error.to_string());
            set_shell_update_state(
                app,
                state,
                DesktopUpdateState {
                    status: "error",
                    available: true,
                    current_version: env!("CARGO_PKG_VERSION").to_string(),
                    update_version: Some(update.version),
                    release_name: update.body,
                    release_date: update.date.and_then(|date| date.format(&Rfc3339).ok()),
                    downloaded: false,
                    download_percent: None,
                    error: Some(message),
                    error_code: Some(code),
                    checked_at: Some(now_iso()),
                    preferences: update_preferences(state)?,
                },
            )
        }
    }
}

pub(crate) fn schedule_silent_shell_update_check(app: AppHandle) {
    let Some(state) = app.try_state::<DesktopState>() else {
        return;
    };
    let already_running = state
        .silent_shell_update_task_running
        .swap(true, Ordering::SeqCst);
    drop(state);
    if already_running {
        return;
    }
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_silent_shell_update_check(&app).await {
            eprintln!("Silent shell update check failed: {error}");
        }
        if let Some(state) = app.try_state::<DesktopState>() {
            state
                .silent_shell_update_task_running
                .store(false, Ordering::SeqCst);
        }
    });
}

async fn run_silent_shell_update_check(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    let preferences = update_preferences(&state)?;
    if !preferences.auto_check {
        return Ok(());
    }
    if shell_update_operation_active(&state)? {
        return Ok(());
    }
    if shell_update_download_ready(&state)? {
        return Ok(());
    }

    let checked = check_shell_update(app, &state).await?;
    let preferences = update_preferences(&state)?;
    if preferences.auto_download && checked.status == "available" {
        let _ = download_shell_update(app, &state).await?;
    }
    Ok(())
}

fn shell_update_operation_active(state: &DesktopState) -> Result<bool, String> {
    let runtime = state
        .shell_update
        .lock()
        .map_err(|error| error.to_string())?;
    Ok(matches!(runtime.state.status, "checking" | "downloading"))
}

fn shell_update_download_ready(state: &DesktopState) -> Result<bool, String> {
    let runtime = state
        .shell_update
        .lock()
        .map_err(|error| error.to_string())?;
    Ok(runtime.state.status == "downloaded" && runtime.pending_bytes.is_some())
}

pub(crate) async fn check_all_updates(
    app: AppHandle,
    state: &DesktopState,
) -> Result<DesktopUnifiedUpdateState, String> {
    let shell = check_shell_update(&app, state).await?;
    let app_bundle = check_app_bundle_update(&app, state)?;
    Ok(unified_update_state(shell, app_bundle))
}

pub(crate) fn set_update_preferences(
    app: AppHandle,
    state: &DesktopState,
    preferences: serde_json::Value,
) -> Result<DesktopUpdateState, String> {
    let mut stored = state
        .update_preferences
        .lock()
        .map_err(|error| error.to_string())?;
    if let Some(value) = preferences
        .get("autoCheck")
        .and_then(|value| value.as_bool())
    {
        stored.auto_check = value;
    }
    if let Some(value) = preferences
        .get("autoDownload")
        .and_then(|value| value.as_bool())
    {
        stored.auto_download = value;
    }
    if let Some(value) = preferences
        .get("installOnQuit")
        .and_then(|value| value.as_bool())
    {
        stored.install_on_quit = value;
    }
    let next_preferences = stored.clone();
    drop(stored);

    {
        let mut settings = state.settings.lock().map_err(|error| error.to_string())?;
        settings.update_preferences = next_preferences.clone();
        save_settings(&state.settings_path, &settings)?;
    }

    let mut runtime = state
        .shell_update
        .lock()
        .map_err(|error| error.to_string())?;
    runtime.state.preferences = next_preferences;
    runtime.state = hydrate_shell_update_state(runtime.state.clone(), update_preferences(state)?);
    let next_state = runtime.state.clone();
    drop(runtime);

    if next_state.preferences.auto_check {
        schedule_silent_shell_update_check(app);
    }
    Ok(next_state)
}

pub(crate) fn app_bundle_update_state(
    state: &DesktopState,
) -> Result<DesktopAppBundleUpdateState, String> {
    let mut runtime = state
        .app_bundle_update
        .lock()
        .map_err(|error| error.to_string())?;
    runtime.state = hydrate_app_bundle_update_state_for_paths(
        &state.app_data_dir,
        &state.resource_dir,
        runtime.state.clone(),
    );
    Ok(runtime.state.clone())
}

pub(crate) fn check_app_bundle_update(
    app: &AppHandle,
    state: &DesktopState,
) -> Result<DesktopAppBundleUpdateState, String> {
    set_app_bundle_update_state(
        app,
        state,
        AppBundleUpdatePatch {
            status: Some("checking"),
            update_available: Some(false),
            checked_at: Some(Some(now_iso())),
            error: Some(None),
            error_code: Some(None),
            ..AppBundleUpdatePatch::default()
        },
    )?;

    let manifest_url = match app_bundle_manifest_url() {
        Some(value) => value,
        None => {
            set_app_bundle_update_state(
                app,
                state,
                AppBundleUpdatePatch {
                    status: Some("disabled"),
                    error: Some(Some(
                        "No app bundle update source is configured.".to_string(),
                    )),
                    ..AppBundleUpdatePatch::default()
                },
            )?;
            return app_bundle_update_state(state);
        }
    };

    match read_remote_app_bundle_manifest(&manifest_url) {
        Ok((manifest, _manifest_bytes, _signature_bytes)) => {
            let current = current_app_bundle_version(state);
            let shell_update_required = app_bundle_requires_shell_update(&manifest)
                || !is_shell_version_compatible(&manifest, env!("CARGO_PKG_VERSION"));
            let has_update = !shell_update_required
                && current
                    .as_ref()
                    .map(|version| is_newer_app_bundle_version(&manifest.bundle_version, version))
                    .unwrap_or(false);
            set_app_bundle_update_state(
                app,
                state,
                AppBundleUpdatePatch {
                    status: Some(if shell_update_required {
                        "blocked"
                    } else if has_update {
                        "available"
                    } else {
                        "not_available"
                    }),
                    update_available: Some(has_update),
                    current_bundle_version: Some(current),
                    bundle_version: Some(Some(manifest.bundle_version.clone())),
                    checked_at: Some(Some(now_iso())),
                    requires_restart: Some(false),
                    error: Some(if shell_update_required {
                        Some(shell_update_required_message(
                            &manifest,
                            env!("CARGO_PKG_VERSION"),
                        ))
                    } else {
                        None
                    }),
                    error_code: Some(if shell_update_required {
                        Some("shell_update_required".to_string())
                    } else {
                        None
                    }),
                    ..AppBundleUpdatePatch::default()
                },
            )?;
        }
        Err(error) => {
            let (message, code) = normalize_update_error(error);
            set_app_bundle_update_state(
                app,
                state,
                AppBundleUpdatePatch {
                    status: Some("error"),
                    update_available: Some(false),
                    checked_at: Some(Some(now_iso())),
                    error: Some(Some(message)),
                    error_code: Some(Some(code)),
                    ..AppBundleUpdatePatch::default()
                },
            )?;
        }
    }
    app_bundle_update_state(state)
}

pub(crate) fn install_app_bundle_update(
    app: AppHandle,
    state: &DesktopState,
) -> Result<DesktopAppBundleUpdateState, String> {
    set_app_bundle_update_state(
        &app,
        state,
        AppBundleUpdatePatch {
            status: Some("downloading"),
            update_available: Some(false),
            error: Some(None),
            error_code: Some(None),
            ..AppBundleUpdatePatch::default()
        },
    )?;

    let result = match install_configured_app_bundle(
        &state.app_data_dir,
        &state.resource_dir,
        env!("CARGO_PKG_VERSION"),
        installed_client_smoke_current_bundle_version(),
    ) {
        Ok(result) => result,
        Err(error) => {
            let (message, code) = normalize_update_error(error);
            set_app_bundle_update_state(
                &app,
                state,
                AppBundleUpdatePatch {
                    status: Some("error"),
                    update_available: Some(false),
                    error: Some(Some(message)),
                    error_code: Some(Some(code)),
                    ..AppBundleUpdatePatch::default()
                },
            )?;
            return app_bundle_update_state(state);
        }
    };
    if installed_client_update_smoke_enabled() {
        write_pending_installed_client_update_evidence(state, &result)?;
    }

    set_app_bundle_update_state(
        &app,
        state,
        AppBundleUpdatePatch {
            status: Some("installed"),
            update_available: Some(false),
            current_bundle_version: Some(Some(result.bundle_version.clone())),
            bundle_version: Some(Some(result.bundle_version)),
            installed_at: Some(Some(now_iso())),
            requires_restart: Some(true),
            error: Some(None),
            error_code: Some(None),
            ..AppBundleUpdatePatch::default()
        },
    )?;
    schedule_app_bundle_restart(app);
    app_bundle_update_state(state)
}

pub(crate) fn rollback_app_bundle_update(
    app: AppHandle,
    state: &DesktopState,
) -> Result<DesktopAppBundleUpdateState, String> {
    set_app_bundle_update_state(
        &app,
        state,
        AppBundleUpdatePatch {
            status: Some("downloading"),
            update_available: Some(false),
            error: Some(None),
            error_code: Some(None),
            ..AppBundleUpdatePatch::default()
        },
    )?;
    match rollback_app_bundle_installation(&state.app_data_dir) {
        Ok(bundle_version) => {
            set_app_bundle_update_state(
                &app,
                state,
                AppBundleUpdatePatch {
                    status: Some("installed"),
                    current_bundle_version: Some(Some(bundle_version.clone())),
                    bundle_version: Some(Some(bundle_version)),
                    installed_at: Some(Some(now_iso())),
                    requires_restart: Some(true),
                    error: Some(None),
                    error_code: Some(None),
                    ..AppBundleUpdatePatch::default()
                },
            )?;
            schedule_app_bundle_restart(app);
        }
        Err(error) => {
            let (message, code) = normalize_update_error(error);
            set_app_bundle_update_state(
                &app,
                state,
                AppBundleUpdatePatch {
                    status: Some("error"),
                    update_available: Some(false),
                    error: Some(Some(message)),
                    error_code: Some(Some(code)),
                    ..AppBundleUpdatePatch::default()
                },
            )?;
        }
    }
    app_bundle_update_state(state)
}

fn update_preferences(state: &DesktopState) -> Result<DesktopUpdatePreferences, String> {
    state
        .update_preferences
        .lock()
        .map_err(|error| error.to_string())
        .map(|preferences| preferences.clone())
}

fn set_shell_update_state(
    app: &AppHandle,
    state: &DesktopState,
    next: DesktopUpdateState,
) -> Result<DesktopUpdateState, String> {
    let next = hydrate_shell_update_state(next, update_preferences(state)?);
    let mut runtime = state
        .shell_update
        .lock()
        .map_err(|error| error.to_string())?;
    runtime.state = next.clone();
    drop(runtime);
    app.emit("desktop:update-state", next.clone())
        .map_err(|error| error.to_string())?;
    Ok(next)
}

fn set_app_bundle_update_state(
    app: &AppHandle,
    state: &DesktopState,
    patch: AppBundleUpdatePatch,
) -> Result<(), String> {
    let mut runtime = state
        .app_bundle_update
        .lock()
        .map_err(|error| error.to_string())?;
    let next = apply_app_bundle_update_patch(
        &state.app_data_dir,
        &state.resource_dir,
        runtime.state.clone(),
        patch,
    );
    runtime.state = next.clone();
    app.emit("desktop:app-bundle-update-state", next)
        .map_err(|error| error.to_string())
}

fn current_app_bundle_version(state: &DesktopState) -> Option<String> {
    if let Some(version) = installed_client_smoke_current_bundle_version() {
        return Some(version);
    }
    resolve_active_app_bundle(
        &state.app_data_dir,
        &state.resource_dir,
        env!("CARGO_PKG_VERSION"),
    )
    .map(|bundle| bundle.manifest.bundle_version)
}

fn schedule_app_bundle_restart(app: AppHandle) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(500));
        if let Some(state) = app.try_state::<DesktopState>() {
            if let Ok(mut mcp) = state.mcp.lock() {
                mcp.stop();
            }
            if let Ok(mut backend) = state.backend.lock() {
                if let Some(child) = backend.child.as_mut() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                backend.child = None;
            }
        }
        if installed_client_update_smoke_external_relaunch_enabled() {
            app.exit(0);
            return;
        }
        app.request_restart();
    });
}
