#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod access;
mod app_bundle;
mod app_bundle_protocol;
mod commands;
mod env_config;
mod installed_client_smoke;
mod mcp;
mod settings;
mod shell_update;
mod sidecar;
mod update_flow;
mod update_state;

use access::{
    access_allows_runtime_use, refresh_runtime_authorization, schedule_silent_access_check,
    stable_device_id,
};
use app_bundle::{resolve_active_app_bundle, ActiveAppBundle};
use app_bundle_protocol::{
    app_bundle_content_type, app_bundle_protocol_request_path, app_bundle_protocol_response,
};
use commands::access::{check_access, get_access_state};
use commands::app_bundle_update::{
    check_app_bundle_update, get_app_bundle_update_state, install_app_bundle_update,
    rollback_app_bundle_update,
};
use commands::improvement::{
    get_improvement_plan_preferences, set_improvement_plan_preferences,
    upload_improvement_plan_samples,
};
use commands::mcp::{get_mcp_status, set_mcp_enabled};
use commands::runtime::{get_runtime_info, mark_renderer_ready};
use commands::shell_update::{
    check_all_updates, check_for_updates, download_update, get_update_state, install_update,
    set_update_preferences,
};
use env_config::configured_string;
use installed_client_smoke::{
    complete_pending_installed_client_update_evidence, installed_client_update_smoke_cli_enabled,
    maybe_run_installed_client_update_smoke, run_installed_client_update_smoke_cli,
};
use mcp::{auto_start_desktop_mcp_requested, DesktopMcpStatus, McpRuntime};
use settings::{desktop_database_path, load_settings, DesktopSettings, DesktopUpdatePreferences};
use sidecar::{project_root, start_backend, BackendRuntime};
use std::{
    env, fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{http, webview::PageLoadEvent, AppHandle, Manager, RunEvent};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use update_state::{
    initial_app_bundle_update_state, initial_shell_update_state, AppBundleUpdateRuntime,
    ShellUpdateRuntime,
};
use url::Url;
use uuid::Uuid;

const APP_BUNDLE_PROTOCOL: &str = "geochat-bundle";

struct DesktopState {
    backend: Mutex<BackendRuntime>,
    mcp: Mutex<McpRuntime>,
    shell_update: Mutex<ShellUpdateRuntime>,
    app_bundle_update: Mutex<AppBundleUpdateRuntime>,
    settings_path: PathBuf,
    app_data_dir: PathBuf,
    database_path: PathBuf,
    resource_dir: PathBuf,
    active_app_bundle: Mutex<Option<ActiveAppBundle>>,
    settings: Mutex<DesktopSettings>,
    local_backend_auth_token: String,
    runtime_authorized: AtomicBool,
    renderer_ready: AtomicBool,
    silent_shell_update_task_running: AtomicBool,
    update_preferences: Mutex<DesktopUpdatePreferences>,
}

fn main() {
    if installed_client_update_smoke_cli_enabled() {
        if let Err(error) = run_installed_client_update_smoke_cli() {
            eprintln!("Installed-client app-bundle update smoke failed: {error}");
            std::process::exit(1);
        }
        return;
    }

    let app = tauri::Builder::default()
        .register_uri_scheme_protocol(APP_BUNDLE_PROTOCOL, handle_app_bundle_protocol_request)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_page_load(|webview, payload| {
            if !matches!(payload.event(), PageLoadEvent::Finished) {
                return;
            }
            let app = webview.app_handle().clone();
            if let Some(state) = app.try_state::<DesktopState>() {
                complete_pending_installed_client_update_evidence(&state);
                maybe_run_installed_client_update_smoke(app);
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_info,
            get_mcp_status,
            set_mcp_enabled,
            get_access_state,
            check_access,
            get_update_state,
            check_for_updates,
            check_all_updates,
            download_update,
            set_update_preferences,
            get_improvement_plan_preferences,
            set_improvement_plan_preferences,
            upload_improvement_plan_samples,
            get_app_bundle_update_state,
            check_app_bundle_update,
            install_app_bundle_update,
            rollback_app_bundle_update,
            mark_renderer_ready,
            install_update
        ])
        .build(tauri::generate_context!())
        .expect("failed to build GeoChat Tauri shell");
    if let Err(error) = initialize_desktop_app(app.handle()) {
        eprintln!("failed to initialize GeoChat Tauri shell: {error}");
        std::process::exit(1);
    }
    let window_initialized = Arc::new(AtomicBool::new(false));
    app.run(move |app, event| {
        if !matches!(event, RunEvent::Ready) {
            return;
        }
        if window_initialized.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Err(error) = initialize_main_window(app) {
            eprintln!("failed to initialize GeoChat main window: {error}");
            app.exit(1);
        }
    });
}

fn initialize_desktop_app(app: &AppHandle) -> Result<(), String> {
    let app_data_dir = desktop_app_data_dir(app)?;
    let resource_dir = app.path().resource_dir().unwrap_or_else(|_| {
        app.path()
            .resolve("../dist", tauri::path::BaseDirectory::Resource)
            .unwrap_or_else(|_| {
                project_root()
                    .unwrap_or_else(|_| app_data_dir.clone())
                    .join("dist")
            })
    });
    fs::create_dir_all(&app_data_dir).map_err(|error| {
        format!(
            "Failed to create app data dir {}: {error}",
            app_data_dir.display()
        )
    })?;
    let settings_path = app_data_dir.join("settings.json");
    let database_path = desktop_database_path(&app_data_dir);
    let settings = load_settings(&settings_path)?;
    let local_backend_auth_token = local_runtime_auth_token();
    let runtime_authorized = access_allows_runtime_use();
    let backend = start_backend(
        &app_data_dir,
        &resource_dir,
        Some(&local_backend_auth_token),
    )?;
    let shell_update_state = initial_shell_update_state(settings.update_preferences.clone());
    let app_bundle_update_state = initial_app_bundle_update_state(&app_data_dir, &resource_dir);
    let active_app_bundle =
        resolve_active_app_bundle(&app_data_dir, &resource_dir, env!("CARGO_PKG_VERSION"));
    app.manage(DesktopState {
        backend: Mutex::new(backend),
        mcp: Mutex::new(McpRuntime::new()),
        shell_update: Mutex::new(ShellUpdateRuntime::new(shell_update_state)),
        app_bundle_update: Mutex::new(AppBundleUpdateRuntime::new(app_bundle_update_state)),
        settings_path,
        app_data_dir: app_data_dir.clone(),
        database_path,
        resource_dir: resource_dir.clone(),
        active_app_bundle: Mutex::new(active_app_bundle),
        update_preferences: Mutex::new(settings.update_preferences.clone()),
        settings: Mutex::new(settings),
        local_backend_auth_token,
        runtime_authorized: AtomicBool::new(runtime_authorized),
        renderer_ready: AtomicBool::new(false),
        silent_shell_update_task_running: AtomicBool::new(false),
    });
    if auto_start_desktop_mcp_requested() {
        if let Some(state) = app.try_state::<DesktopState>() {
            let mut mcp = state.mcp.lock().map_err(|error| error.to_string())?;
            mcp.enable(&state);
        }
    }
    schedule_silent_access_check(app.clone());
    update_flow::schedule_silent_shell_update_check(app.clone());
    Ok(())
}

fn initialize_main_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window("main").is_none() {
        let state = app
            .try_state::<DesktopState>()
            .ok_or_else(|| "Desktop state is not initialized.".to_string())?;
        let active_app_bundle = state
            .active_app_bundle
            .lock()
            .map_err(|error| error.to_string())?;
        let mut window_config = app.config().app.windows[0].clone();
        window_config.url = initial_window_url(active_app_bundle.as_ref())?;
        let window_builder = tauri::WebviewWindowBuilder::from_config(app, &window_config)
            .map_err(|error| error.to_string())?;
        #[cfg(target_os = "windows")]
        let window_builder = window_builder.decorations(false);
        window_builder.build().map_err(|error| error.to_string())?;
    }
    show_main_window(app);
    Ok(())
}

fn initial_window_url(
    active_bundle: Option<&ActiveAppBundle>,
) -> Result<tauri::WebviewUrl, String> {
    if cfg!(debug_assertions) {
        return Url::parse("http://127.0.0.1:1420")
            .map(tauri::WebviewUrl::External)
            .map_err(|error| error.to_string());
    }
    if let Some(bundle) = active_bundle {
        return Url::parse(&format!(
            "{APP_BUNDLE_PROTOCOL}://localhost/{}",
            bundle.manifest.renderer.entry
        ))
        .map(tauri::WebviewUrl::CustomProtocol)
        .map_err(|error| error.to_string());
    }
    Ok(tauri::WebviewUrl::App("index.html".into()))
}

fn desktop_app_data_dir<R: tauri::Runtime, M: Manager<R>>(app: &M) -> Result<PathBuf, String> {
    if let Some(configured) = configured_string(&[env::var("GEOCHAT_DESKTOP_USER_DATA_DIR").ok()]) {
        return Ok(PathBuf::from(configured));
    }
    app.path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data dir: {error}"))
}

fn handle_app_bundle_protocol_request<R: tauri::Runtime>(
    context: tauri::UriSchemeContext<'_, R>,
    request: http::Request<Vec<u8>>,
) -> http::Response<Vec<u8>> {
    let Some(state) = context.app_handle().try_state::<DesktopState>() else {
        return app_bundle_protocol_response(
            http::StatusCode::SERVICE_UNAVAILABLE,
            "text/plain; charset=utf-8",
            b"app state is not ready".to_vec(),
        );
    };
    let Some(request_path) = app_bundle_protocol_request_path(request.uri().path()) else {
        return app_bundle_protocol_response(
            http::StatusCode::BAD_REQUEST,
            "text/plain; charset=utf-8",
            b"invalid app bundle path".to_vec(),
        );
    };
    let active_bundle = state
        .active_app_bundle
        .lock()
        .ok()
        .and_then(|bundle| bundle.clone());
    let Some(bundle) = active_bundle else {
        return app_bundle_protocol_response(
            http::StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
            b"active app bundle is unavailable".to_vec(),
        );
    };
    if !bundle
        .manifest
        .assets
        .iter()
        .any(|asset| asset.path == request_path)
    {
        return app_bundle_protocol_response(
            http::StatusCode::FORBIDDEN,
            "text/plain; charset=utf-8",
            b"app bundle asset is not listed in the manifest".to_vec(),
        );
    }
    let asset_path = bundle.root.join(&request_path);
    match fs::read(&asset_path) {
        Ok(bytes) => app_bundle_protocol_response(
            http::StatusCode::OK,
            app_bundle_content_type(&request_path),
            bytes,
        ),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => app_bundle_protocol_response(
            http::StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
            b"app bundle asset was not found".to_vec(),
        ),
        Err(error) => app_bundle_protocol_response(
            http::StatusCode::INTERNAL_SERVER_ERROR,
            "text/plain; charset=utf-8",
            format!("failed to read app bundle asset: {error}").into_bytes(),
        ),
    }
}

fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("GeoChat Tauri shell did not find the main window during initialization.");
        return;
    };
    if let Err(error) = window.show() {
        eprintln!("GeoChat Tauri shell failed to show the main window: {error}");
    }
    if let Err(error) = window.set_focus() {
        eprintln!("GeoChat Tauri shell failed to focus the main window: {error}");
    }
}

fn now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn local_runtime_auth_token() -> String {
    if cfg!(debug_assertions) {
        if let Ok(configured) = env::var("GEOCHAT_DESKTOP_LOCAL_AUTH_TOKEN") {
            let trimmed = configured.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    Uuid::new_v4().simple().to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        app_bundle::{AppBundleAsset, AppBundleEntry, AppBundleManifest},
        app_bundle_content_type, app_bundle_protocol_request_path, initial_window_url,
        mcp::auto_start_desktop_mcp_requested_for,
        ActiveAppBundle,
    };
    use std::path::PathBuf;

    #[test]
    fn app_bundle_protocol_accepts_manifest_relative_paths() {
        assert_eq!(
            app_bundle_protocol_request_path("/renderer/index.html"),
            Some("renderer/index.html".to_string())
        );
        assert_eq!(
            app_bundle_protocol_request_path("/renderer/assets/app%2Dchunk.js"),
            Some("renderer/assets/app-chunk.js".to_string())
        );
    }

    #[test]
    fn app_bundle_protocol_rejects_unsafe_paths() {
        assert_eq!(app_bundle_protocol_request_path("/"), None);
        assert_eq!(
            app_bundle_protocol_request_path("/renderer/../settings.json"),
            None
        );
        assert_eq!(
            app_bundle_protocol_request_path("/renderer\\index.html"),
            None
        );
        assert_eq!(
            app_bundle_protocol_request_path("/renderer/C:%5Cwindows%5Csystem.ini"),
            None
        );
        assert_eq!(app_bundle_protocol_request_path("/renderer/%ZZ"), None);
    }

    #[test]
    fn desktop_debug_mcp_auto_start_is_debug_only_and_opt_in() {
        assert!(!auto_start_desktop_mcp_requested_for(
            true,
            None,
            [] as [&str; 0]
        ));
        assert!(auto_start_desktop_mcp_requested_for(
            true,
            Some("1"),
            [] as [&str; 0]
        ));
        assert!(auto_start_desktop_mcp_requested_for(
            true,
            Some("true"),
            [] as [&str; 0]
        ));
        assert!(auto_start_desktop_mcp_requested_for(true, None, ["--mcp"]));
        assert!(auto_start_desktop_mcp_requested_for(
            true,
            None,
            ["--desktop-mcp"]
        ));
        assert!(!auto_start_desktop_mcp_requested_for(
            false,
            Some("1"),
            ["--mcp"]
        ));
        assert!(!auto_start_desktop_mcp_requested_for(
            true,
            Some("0"),
            ["--not-mcp"]
        ));
    }

    #[test]
    fn app_bundle_protocol_serves_expected_content_types() {
        assert_eq!(
            app_bundle_content_type("renderer/index.html"),
            "text/html; charset=utf-8"
        );
        assert_eq!(
            app_bundle_content_type("renderer/assets/app.js"),
            "text/javascript; charset=utf-8"
        );
        assert_eq!(
            app_bundle_content_type("renderer/assets/app.css"),
            "text/css; charset=utf-8"
        );
    }

    #[test]
    fn debug_window_url_uses_vite_even_when_app_bundle_exists() {
        let active_bundle = ActiveAppBundle {
            root: PathBuf::from("/tmp/geochat-app-bundle"),
            source: "development",
            manifest: AppBundleManifest {
                kind: "geochat-app-bundle".to_string(),
                bundle_version: "0.0.0+test".to_string(),
                shell_version: "0.0.0".to_string(),
                min_shell_version: None,
                max_shell_version: None,
                requires_shell_update: None,
                assets: vec![AppBundleAsset {
                    path: "renderer/index.html".to_string(),
                    sha256: "0".repeat(64),
                    url: None,
                }],
                backend: AppBundleEntry {
                    entry: "backend/backend.bundle.js".to_string(),
                },
                renderer: AppBundleEntry {
                    entry: "renderer/index.html".to_string(),
                },
            },
        };

        let url = initial_window_url(Some(&active_bundle)).expect("initial window URL");

        match url {
            tauri::WebviewUrl::External(url) => {
                assert_eq!(url.as_str(), "http://127.0.0.1:1420/");
            }
            other => panic!("expected Vite dev URL, got {other:?}"),
        }
    }
}
