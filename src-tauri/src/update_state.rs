use crate::{
    app_bundle::{
        app_bundle_manifest_url, app_bundle_rollback_available, resolve_active_app_bundle,
    },
    settings::DesktopUpdatePreferences,
    shell_update::shell_update_configured,
};
use serde::Serialize;
use std::path::Path;
use tauri_plugin_updater::Update;
use time::format_description::well_known::Rfc3339;

#[derive(Clone)]
pub(crate) struct ShellUpdateRuntime {
    pub(crate) state: DesktopUpdateState,
    pub(crate) pending_update: Option<tauri_plugin_updater::Update>,
    pub(crate) pending_bytes: Option<Vec<u8>>,
}

impl ShellUpdateRuntime {
    pub(crate) fn new(state: DesktopUpdateState) -> Self {
        Self {
            state,
            pending_update: None,
            pending_bytes: None,
        }
    }
}

#[derive(Clone)]
pub(crate) struct AppBundleUpdateRuntime {
    pub(crate) state: DesktopAppBundleUpdateState,
}

impl AppBundleUpdateRuntime {
    pub(crate) fn new(state: DesktopAppBundleUpdateState) -> Self {
        Self { state }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopUpdateState {
    pub(crate) status: &'static str,
    pub(crate) available: bool,
    pub(crate) current_version: String,
    pub(crate) update_version: Option<String>,
    pub(crate) release_name: Option<String>,
    pub(crate) release_date: Option<String>,
    pub(crate) downloaded: bool,
    pub(crate) download_percent: Option<f64>,
    pub(crate) error: Option<String>,
    pub(crate) error_code: Option<String>,
    pub(crate) checked_at: Option<String>,
    pub(crate) preferences: DesktopUpdatePreferences,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopAppBundleUpdateState {
    pub(crate) status: &'static str,
    pub(crate) available: bool,
    pub(crate) configured: bool,
    pub(crate) update_available: bool,
    pub(crate) manifest_url: Option<String>,
    pub(crate) current_bundle_version: Option<String>,
    pub(crate) bundle_version: Option<String>,
    pub(crate) rollback_available: bool,
    pub(crate) checked_at: Option<String>,
    pub(crate) installed_at: Option<String>,
    pub(crate) requires_restart: bool,
    pub(crate) error: Option<String>,
    pub(crate) error_code: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopUnifiedUpdateState {
    pub(crate) status: &'static str,
    pub(crate) recommendation: &'static str,
    pub(crate) shell: DesktopUpdateState,
    pub(crate) app_bundle: DesktopAppBundleUpdateState,
    pub(crate) message: Option<String>,
    pub(crate) error: Option<String>,
    pub(crate) error_code: Option<String>,
}

#[derive(Default)]
pub(crate) struct AppBundleUpdatePatch {
    pub(crate) status: Option<&'static str>,
    pub(crate) update_available: Option<bool>,
    pub(crate) current_bundle_version: Option<Option<String>>,
    pub(crate) bundle_version: Option<Option<String>>,
    pub(crate) checked_at: Option<Option<String>>,
    pub(crate) installed_at: Option<Option<String>>,
    pub(crate) requires_restart: Option<bool>,
    pub(crate) error: Option<Option<String>>,
    pub(crate) error_code: Option<Option<String>>,
}

pub(crate) fn disabled_update_state(preferences: DesktopUpdatePreferences) -> DesktopUpdateState {
    DesktopUpdateState {
        status: "disabled",
        available: false,
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        update_version: None,
        release_name: None,
        release_date: None,
        downloaded: false,
        download_percent: None,
        error: Some("Shell updates are not available in this runtime.".to_string()),
        error_code: None,
        checked_at: None,
        preferences,
    }
}

pub(crate) fn initial_shell_update_state(
    preferences: DesktopUpdatePreferences,
) -> DesktopUpdateState {
    if !shell_update_configured() {
        return disabled_update_state(preferences);
    }
    DesktopUpdateState {
        status: "idle",
        available: true,
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        update_version: None,
        release_name: None,
        release_date: None,
        downloaded: false,
        download_percent: None,
        error: None,
        error_code: None,
        checked_at: None,
        preferences,
    }
}

pub(crate) fn hydrate_shell_update_state(
    current: DesktopUpdateState,
    preferences: DesktopUpdatePreferences,
) -> DesktopUpdateState {
    if !shell_update_configured() {
        return disabled_update_state(preferences);
    }
    DesktopUpdateState {
        status: if current.status == "disabled" {
            "idle"
        } else {
            current.status
        },
        available: true,
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        error: if current.status == "disabled" {
            None
        } else {
            current.error
        },
        error_code: if current.status == "disabled" {
            None
        } else {
            current.error_code
        },
        preferences,
        ..current
    }
}

pub(crate) fn shell_update_state_from_update(
    status: &'static str,
    update: &Update,
    downloaded: bool,
    download_percent: Option<f64>,
    preferences: DesktopUpdatePreferences,
    checked_at: String,
) -> DesktopUpdateState {
    DesktopUpdateState {
        status,
        available: true,
        current_version: update.current_version.clone(),
        update_version: Some(update.version.clone()),
        release_name: update.body.clone(),
        release_date: update.date.and_then(|date| date.format(&Rfc3339).ok()),
        downloaded,
        download_percent,
        error: None,
        error_code: None,
        checked_at: Some(checked_at),
        preferences,
    }
}

pub(crate) fn initial_app_bundle_update_state(
    app_data_dir: &Path,
    resource_dir: &Path,
) -> DesktopAppBundleUpdateState {
    hydrate_app_bundle_update_state_for_paths(
        app_data_dir,
        resource_dir,
        DesktopAppBundleUpdateState {
            status: if app_bundle_manifest_url().is_some() {
                "idle"
            } else {
                "disabled"
            },
            available: app_bundle_manifest_url().is_some(),
            configured: app_bundle_manifest_url().is_some(),
            update_available: false,
            manifest_url: app_bundle_manifest_url(),
            current_bundle_version: None,
            bundle_version: None,
            rollback_available: false,
            checked_at: None,
            installed_at: None,
            requires_restart: false,
            error: if app_bundle_manifest_url().is_some() {
                None
            } else {
                Some("No app bundle update source is configured.".to_string())
            },
            error_code: None,
        },
    )
}

pub(crate) fn hydrate_app_bundle_update_state_for_paths(
    app_data_dir: &Path,
    resource_dir: &Path,
    current: DesktopAppBundleUpdateState,
) -> DesktopAppBundleUpdateState {
    let configured = app_bundle_manifest_url().is_some();
    DesktopAppBundleUpdateState {
        available: configured,
        configured,
        manifest_url: app_bundle_manifest_url(),
        current_bundle_version: resolve_active_app_bundle(
            app_data_dir,
            resource_dir,
            env!("CARGO_PKG_VERSION"),
        )
        .map(|bundle| bundle.manifest.bundle_version)
        .or(current.current_bundle_version),
        rollback_available: app_bundle_rollback_available(app_data_dir),
        update_available: current.status == "available",
        error: if configured {
            current.error
        } else {
            Some("No app bundle update source is configured.".to_string())
        },
        ..current
    }
}

pub(crate) fn apply_app_bundle_update_patch(
    app_data_dir: &Path,
    resource_dir: &Path,
    current: DesktopAppBundleUpdateState,
    patch: AppBundleUpdatePatch,
) -> DesktopAppBundleUpdateState {
    let mut next = current;
    if let Some(value) = patch.status {
        next.status = value;
    }
    if let Some(value) = patch.update_available {
        next.update_available = value;
    }
    if let Some(value) = patch.current_bundle_version {
        next.current_bundle_version = value;
    }
    if let Some(value) = patch.bundle_version {
        next.bundle_version = value;
    }
    if let Some(value) = patch.checked_at {
        next.checked_at = value;
    }
    if let Some(value) = patch.installed_at {
        next.installed_at = value;
    }
    if let Some(value) = patch.requires_restart {
        next.requires_restart = value;
    }
    if let Some(value) = patch.error {
        next.error = value;
    }
    if let Some(value) = patch.error_code {
        next.error_code = value;
    }
    hydrate_app_bundle_update_state_for_paths(app_data_dir, resource_dir, next)
}

pub(crate) fn unified_update_state(
    shell: DesktopUpdateState,
    app_bundle: DesktopAppBundleUpdateState,
) -> DesktopUnifiedUpdateState {
    let (recommendation, message, error, error_code) = if app_bundle.error_code.as_deref()
        == Some("shell_update_required")
        || app_bundle.status == "blocked"
    {
        (
            "shell_required_for_app_bundle",
            app_bundle.error.clone(),
            app_bundle.error.clone(),
            app_bundle.error_code.clone(),
        )
    } else if shell.available && shell.status == "available" && app_bundle.update_available {
        (
            "both_shell_first",
            shell.update_version.as_ref().map(|version| {
                format!("Application shell update {version} is available. Install it before the workspace logic update.")
            }),
            None,
            None,
        )
    } else if app_bundle.update_available {
        (
            "app_bundle",
            app_bundle
                .bundle_version
                .as_ref()
                .map(|version| format!("Workspace logic update {version} is available.")),
            None,
            None,
        )
    } else if shell.available && shell.status == "available" {
        (
            "shell",
            shell
                .update_version
                .as_ref()
                .map(|version| format!("Application shell update {version} is available.")),
            None,
            None,
        )
    } else if app_bundle.status == "error" {
        (
            "error",
            app_bundle.error.clone(),
            app_bundle.error.clone(),
            app_bundle.error_code.clone(),
        )
    } else if shell.status == "error" {
        (
            "error",
            shell.error.clone(),
            shell.error.clone(),
            shell.error_code.clone(),
        )
    } else {
        ("none", None, None, None)
    };
    let status = match recommendation {
        "app_bundle" | "shell" | "shell_required_for_app_bundle" | "both_shell_first" => {
            "available"
        }
        "error" => "error",
        _ if app_bundle.status == "checking" || shell.status == "checking" => "checking",
        _ => "not_available",
    };
    DesktopUnifiedUpdateState {
        status,
        recommendation,
        shell,
        app_bundle,
        message,
        error,
        error_code,
    }
}
