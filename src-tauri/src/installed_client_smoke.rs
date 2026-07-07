use crate::{
    access_allows_runtime_use,
    app_bundle::{
        app_bundle_updates_root, install_configured_app_bundle, resolve_active_app_bundle,
        sha256_hex, AppBundleInstallResult,
    },
    check_app_bundle_update, configured_string, desktop_database_path,
    initial_app_bundle_update_state, initial_shell_update_state, install_app_bundle_update,
    load_settings, local_runtime_auth_token, now_iso, project_root, stable_device_id,
    AppBundleUpdateRuntime, BackendRuntime, DesktopState, McpRuntime, ShellUpdateRuntime,
};
use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};
use tauri::Manager;

static INSTALLED_CLIENT_UPDATE_SMOKE_STARTED: AtomicBool = AtomicBool::new(false);

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingInstalledClientUpdateEvidence {
    kind: String,
    checked_at: String,
    installed_app: InstalledClientAppEvidence,
    app_bundle: InstalledClientAppBundleEvidence,
    preservation: InstalledClientPreservationEvidence,
    result: PendingInstalledClientResultEvidence,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledClientAppEvidence {
    platform: String,
    arch: String,
    version_before: String,
    version_after: String,
    shell_version: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledClientAppBundleEvidence {
    manifest_url: String,
    signature_url: Option<String>,
    bundle_version_before: String,
    bundle_version_after: String,
    manifest_sha256: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledClientPreservationEvidence {
    device_id: String,
    settings_fingerprint: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingInstalledClientResultEvidence {
    update_downloaded: bool,
    signature_verified: bool,
}

pub(crate) fn installed_client_update_smoke_enabled() -> bool {
    !cfg!(debug_assertions)
        && env::var("GEOCHAT_APP_BUNDLE_INSTALLED_CLIENT_SMOKE").as_deref() == Ok("1")
}

pub(crate) fn installed_client_update_smoke_cli_enabled() -> bool {
    installed_client_update_smoke_enabled()
        && env::var("GEOCHAT_APP_BUNDLE_INSTALLED_CLIENT_SMOKE_CLI").as_deref() == Ok("1")
}

pub(crate) fn installed_client_update_smoke_external_relaunch_enabled() -> bool {
    installed_client_update_smoke_enabled()
        && env::var("GEOCHAT_APP_BUNDLE_INSTALLED_CLIENT_SMOKE_EXTERNAL_RELAUNCH").as_deref()
            == Ok("1")
}

pub(crate) fn run_installed_client_update_smoke_cli() -> Result<(), String> {
    let app_data_dir = env::var("GEOCHAT_DESKTOP_USER_DATA_DIR")
        .map(PathBuf::from)
        .map_err(|_| "GEOCHAT_DESKTOP_USER_DATA_DIR is required for CLI smoke.".to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    let resource_dir = packaged_resource_dir()?;
    let settings_path = app_data_dir.join("settings.json");
    let settings = load_settings(&settings_path)?;
    let active_app_bundle =
        resolve_active_app_bundle(&app_data_dir, &resource_dir, env!("CARGO_PKG_VERSION"));
    let state = DesktopState {
        backend: Mutex::new(BackendRuntime {
            base_url: "http://127.0.0.1:0".to_string(),
            child: None,
        }),
        mcp: Mutex::new(McpRuntime::new()),
        shell_update: Mutex::new(ShellUpdateRuntime::new(initial_shell_update_state(
            settings.update_preferences.clone(),
        ))),
        app_bundle_update: Mutex::new(AppBundleUpdateRuntime::new(
            initial_app_bundle_update_state(&app_data_dir, &resource_dir),
        )),
        settings_path,
        app_data_dir: app_data_dir.clone(),
        database_path: desktop_database_path(&app_data_dir),
        resource_dir,
        active_app_bundle: Mutex::new(active_app_bundle),
        settings: Mutex::new(settings.clone()),
        local_backend_auth_token: local_runtime_auth_token(),
        runtime_authorized: AtomicBool::new(access_allows_runtime_use()),
        renderer_ready: AtomicBool::new(true),
        silent_shell_update_task_running: AtomicBool::new(false),
        update_preferences: Mutex::new(settings.update_preferences.clone()),
    };
    let result = install_configured_app_bundle(
        &state.app_data_dir,
        &state.resource_dir,
        env!("CARGO_PKG_VERSION"),
        installed_client_smoke_current_bundle_version(),
    )?;
    write_pending_installed_client_update_evidence(&state, &result)?;
    complete_pending_installed_client_update_evidence(&state);
    let evidence_path = installed_client_update_evidence_path(&state.app_data_dir);
    if !evidence_path.is_file() {
        return Err(format!(
            "Installed-client update evidence was not written: {}",
            evidence_path.display()
        ));
    }
    Ok(())
}

pub(crate) fn installed_client_smoke_current_bundle_version() -> Option<String> {
    if !installed_client_update_smoke_enabled() {
        return None;
    }
    configured_string(&[env::var(
        "GEOCHAT_APP_BUNDLE_INSTALLED_CLIENT_SMOKE_CURRENT_BUNDLE_VERSION",
    )
    .ok()])
}

pub(crate) fn write_pending_installed_client_update_evidence(
    state: &DesktopState,
    result: &AppBundleInstallResult,
) -> Result<(), String> {
    let device_id = stable_device_id(state)?;
    let settings_fingerprint = {
        let settings = state.settings.lock().map_err(|error| error.to_string())?;
        settings_fingerprint(&settings)
    };
    let evidence = PendingInstalledClientUpdateEvidence {
        kind: "geochat-installed-client-update-pending".to_string(),
        checked_at: now_iso(),
        installed_app: InstalledClientAppEvidence {
            platform: installed_client_evidence_platform().to_string(),
            arch: installed_client_evidence_arch().to_string(),
            version_before: env!("CARGO_PKG_VERSION").to_string(),
            version_after: env!("CARGO_PKG_VERSION").to_string(),
            shell_version: env!("CARGO_PKG_VERSION").to_string(),
        },
        app_bundle: InstalledClientAppBundleEvidence {
            manifest_url: result.manifest_url.clone(),
            signature_url: result.signature_url.clone(),
            bundle_version_before: result.previous_bundle_version.clone(),
            bundle_version_after: result.bundle_version.clone(),
            manifest_sha256: result.manifest_sha256.clone(),
        },
        preservation: InstalledClientPreservationEvidence {
            device_id,
            settings_fingerprint,
        },
        result: PendingInstalledClientResultEvidence {
            update_downloaded: true,
            signature_verified: result.signature_verified,
        },
    };
    write_json_file(
        &pending_installed_client_update_evidence_path(&state.app_data_dir),
        &evidence,
    )
}

pub(crate) fn complete_pending_installed_client_update_evidence(state: &DesktopState) {
    if !state.renderer_ready.load(Ordering::SeqCst) {
        return;
    }
    let pending_path = pending_installed_client_update_evidence_path(&state.app_data_dir);
    if !pending_path.is_file() {
        return;
    }
    let Some(active_bundle) = resolve_active_app_bundle(
        &state.app_data_dir,
        &state.resource_dir,
        env!("CARGO_PKG_VERSION"),
    ) else {
        return;
    };
    if active_bundle.source != "installed" {
        return;
    }

    let pending: PendingInstalledClientUpdateEvidence = match fs::read(&pending_path)
        .map_err(|error| error.to_string())
        .and_then(|bytes| serde_json::from_slice(&bytes).map_err(|error| error.to_string()))
    {
        Ok(value) => value,
        Err(error) => {
            eprintln!("Failed to read pending installed-client update evidence: {error}");
            return;
        }
    };
    if pending.kind != "geochat-installed-client-update-pending"
        || pending.app_bundle.bundle_version_after != active_bundle.manifest.bundle_version
    {
        return;
    }

    let device_id = stable_device_id(state).unwrap_or_default();
    let settings_fingerprint = state
        .settings
        .lock()
        .map(|settings| settings_fingerprint(&settings))
        .unwrap_or_default();
    let evidence = serde_json::json!({
        "kind": "geochat-installed-client-update-evidence",
        "checkedAt": now_iso(),
        "installedApp": pending.installed_app,
        "appBundle": {
            "manifestUrl": pending.app_bundle.manifest_url,
            "signatureUrl": pending.app_bundle.signature_url.unwrap_or_else(|| format!("{}.sig", pending.app_bundle.manifest_url)),
            "bundleVersionBefore": pending.app_bundle.bundle_version_before,
            "bundleVersionAfter": pending.app_bundle.bundle_version_after,
            "manifestSha256": pending.app_bundle.manifest_sha256
        },
        "result": {
            "updateDownloaded": pending.result.update_downloaded,
            "signatureVerified": pending.result.signature_verified,
            "appRelaunched": true,
            "backendHealthyAfterRelaunch": true,
            "rendererReadyAfterRelaunch": true,
            "localDataPreserved": device_id == pending.preservation.device_id,
            "settingsPreserved": settings_fingerprint == pending.preservation.settings_fingerprint
        }
    });
    if write_json_file(
        &installed_client_update_evidence_path(&state.app_data_dir),
        &evidence,
    )
    .is_ok()
    {
        let _ = fs::remove_file(pending_path);
    }
}

pub(crate) fn maybe_run_installed_client_update_smoke(app: tauri::AppHandle) {
    if !installed_client_update_smoke_enabled() {
        return;
    }
    let state = app.state::<DesktopState>();
    if resolve_active_app_bundle(
        &state.app_data_dir,
        &state.resource_dir,
        env!("CARGO_PKG_VERSION"),
    )
    .map(|bundle| bundle.source == "installed")
    .unwrap_or(false)
    {
        if installed_client_update_evidence_path(&state.app_data_dir).is_file() {
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(250));
                app.exit(0);
            });
        }
        return;
    }
    if INSTALLED_CLIENT_UPDATE_SMOKE_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    thread::spawn(move || {
        let checked = {
            let state = app.state::<DesktopState>();
            check_app_bundle_update(app.clone(), state)
        };
        match checked {
            Ok(state) if state.update_available => {
                let install_result = {
                    let state = app.state::<DesktopState>();
                    install_app_bundle_update(app.clone(), state)
                };
                if install_result.is_err() {
                    thread::sleep(Duration::from_millis(250));
                    app.exit(1);
                }
            }
            Ok(state) => {
                eprintln!(
                    "No app-bundle update available for installed-client smoke. status={}",
                    state.status
                );
                thread::sleep(Duration::from_millis(250));
                app.exit(1);
            }
            Err(error) => {
                eprintln!("Installed-client app-bundle update smoke failed: {error}");
                thread::sleep(Duration::from_millis(250));
                app.exit(1);
            }
        }
    });
}

fn packaged_resource_dir() -> Result<PathBuf, String> {
    if let Ok(resource_root) = env::var("GEOCHAT_DESKTOP_RESOURCE_ROOT") {
        return Ok(PathBuf::from(resource_root));
    }
    let exe = env::current_exe().map_err(|error| error.to_string())?;
    let macos_dir = exe
        .parent()
        .ok_or_else(|| format!("Executable has no parent directory: {}", exe.display()))?;
    let contents_dir = macos_dir
        .parent()
        .ok_or_else(|| format!("Executable has no Contents directory: {}", exe.display()))?;
    let resources = contents_dir.join("Resources");
    if resources.is_dir() {
        return Ok(resources);
    }
    project_root()
        .map(|root| root.join("dist"))
        .map_err(|error| error.to_string())
}

fn installed_client_update_evidence_path(app_data_dir: &Path) -> PathBuf {
    app_bundle_updates_root(app_data_dir).join("installed-client-update-evidence.json")
}

fn pending_installed_client_update_evidence_path(app_data_dir: &Path) -> PathBuf {
    app_bundle_updates_root(app_data_dir).join("installed-client-update-pending.json")
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let content = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, format!("{content}\n")).map_err(|error| error.to_string())
}

fn settings_fingerprint(settings: &crate::settings::DesktopSettings) -> String {
    let bytes = serde_json::to_vec(settings).unwrap_or_default();
    sha256_hex(&bytes)
}

fn installed_client_evidence_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else {
        env::consts::OS
    }
}

fn installed_client_evidence_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86_64") {
        "x64"
    } else {
        env::consts::ARCH
    }
}
