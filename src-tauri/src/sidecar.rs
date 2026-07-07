use std::{
    env, fs,
    io::{ErrorKind, Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use crate::{
    app_bundle::{bundled_resource_root, resolve_active_app_bundle},
    desktop_database_path, DesktopState,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(crate) struct BackendRuntime {
    pub(crate) base_url: String,
    pub(crate) child: Option<Child>,
}

impl Drop for BackendRuntime {
    fn drop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

pub(crate) fn start_backend(
    app_data_dir: &Path,
    resource_dir: &Path,
    auth_token: Option<&str>,
) -> Result<BackendRuntime, String> {
    if let Some(configured_url) = development_backend_url() {
        return Ok(BackendRuntime {
            base_url: configured_url,
            child: None,
        });
    }

    let port =
        find_available_loopback_port(env_port("GEOCHAT_DESKTOP_BACKEND_PORT").unwrap_or(17365))?;
    let project_root = project_root()?;
    let database_path = desktop_database_path(app_data_dir);
    let (runtime, entry, cwd, resource_root) =
        backend_launch_paths(&project_root, app_data_dir, resource_dir)?;
    let skill_cache_dir = desktop_agent_skill_cache_dir(app_data_dir)?;
    let builtin_skill_dirs = resource_root.join("agent-skills");
    let bundled_skill_dirs = desktop_bundled_agent_skill_dirs(&resource_root)?;
    let base_url = format!("http://127.0.0.1:{port}");

    let mut command = Command::new(&runtime);
    command
        .arg(&entry)
        .current_dir(&cwd)
        .env("GEOCHAT_DESKTOP_BACKEND_PORT", port.to_string())
        .env("GEOCHAT_DESKTOP_BACKEND_HOST", "127.0.0.1")
        .env("GEOCHAT_DESKTOP_RESOURCE_ROOT", &resource_root)
        .env("GEOCHAT_DESKTOP_DB_PATH", &database_path)
        .env("GEOCHAT_REMOTE_SKILLS_CACHE_DIR", &skill_cache_dir)
        .env("GEOCHAT_BUILTIN_SKILLS_DIRS", &builtin_skill_dirs)
        .env("GEOCHAT_BUNDLED_SKILLS_DIRS", bundled_skill_dirs)
        .env(
            "GEOCHAT_BACKEND_TOOL_AUTO_STEP_LIMIT",
            env::var("GEOCHAT_BACKEND_TOOL_AUTO_STEP_LIMIT").unwrap_or_else(|_| "24".to_string()),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    if let Some(auth_token) = auth_token {
        command.env("GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN", auth_token);
    }

    let mut child = spawn_with_retry(
        &mut command,
        &format!(
            "backend with runtime {} and entry {}",
            runtime.display(),
            entry.display()
        ),
    )?;

    wait_for_backend_health(&base_url, &mut child, Duration::from_millis(12_000))?;

    Ok(BackendRuntime {
        base_url,
        child: Some(child),
    })
}

pub(crate) fn start_desktop_mcp(state: &DesktopState) -> Result<Child, String> {
    let entry = resolve_desktop_mcp_entry()?;
    let project_root = project_root()?;
    let port = desktop_mcp_port();
    let backend_base_url = {
        let backend = state.backend.lock().map_err(|error| error.to_string())?;
        backend.base_url.clone()
    };
    let mut command = Command::new(resolve_bun_command());
    command
        .arg(&entry)
        .current_dir(project_root)
        .env("GEOCHAT_DESKTOP_MCP_HOST", "127.0.0.1")
        .env("GEOCHAT_DESKTOP_MCP_PORT", port.to_string())
        .env("GEOCHAT_DESKTOP_MCP_DB_PATH", &state.database_path)
        .env("GEOCHAT_DESKTOP_MCP_BACKEND_BASE_URL", backend_base_url)
        .env(
            "GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN",
            &state.local_backend_auth_token,
        )
        .env(
            "GEOCHAT_DESKTOP_MCP_AUTH_TOKEN",
            &state.local_backend_auth_token,
        )
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    spawn_with_retry(&mut command, "desktop MCP")
}

pub(crate) fn project_root() -> Result<PathBuf, String> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Failed to resolve repository root from CARGO_MANIFEST_DIR.".to_string())
}

pub(crate) fn desktop_mcp_available() -> bool {
    desktop_mcp_available_for(cfg!(debug_assertions))
}

fn desktop_mcp_available_for(debug_assertions: bool) -> bool {
    debug_assertions
}

pub(crate) fn desktop_mcp_port() -> u16 {
    env_port("GEOCHAT_DESKTOP_MCP_PORT").unwrap_or(17369)
}

fn spawn_with_retry(command: &mut Command, label: &str) -> Result<Child, String> {
    hide_windows_child_console(command);

    let mut last_error = None;
    for attempt in 0..4 {
        match command.spawn() {
            Ok(child) => return Ok(child),
            Err(error)
                if error.kind() == ErrorKind::WouldBlock || error.raw_os_error() == Some(35) =>
            {
                last_error = Some(error);
                thread::sleep(Duration::from_millis(120 * (attempt + 1)));
            }
            Err(error) => return Err(format!("Failed to launch {label}: {error}")),
        }
    }
    Err(format!(
        "Failed to launch {label}: {}",
        last_error
            .map(|error| error.to_string())
            .unwrap_or_else(|| "unknown spawn error".to_string())
    ))
}

fn hide_windows_child_console(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = command;
    }
}

fn resolve_desktop_mcp_entry() -> Result<PathBuf, String> {
    let project_entry = project_root()?
        .join("tools")
        .join("desktop-debug-mcp")
        .join("http.ts");
    if project_entry.is_file() {
        return Ok(project_entry);
    }
    if let Ok(resource_root) = env::var("GEOCHAT_DESKTOP_RESOURCE_ROOT") {
        let resource_entry = PathBuf::from(resource_root)
            .join("tools")
            .join("desktop-debug-mcp")
            .join("http.ts");
        if resource_entry.is_file() {
            return Ok(resource_entry);
        }
    }
    Err("Desktop debug MCP entry was not found.".to_string())
}

fn backend_launch_paths(
    project_root: &Path,
    app_data_dir: &Path,
    resource_dir: &Path,
) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf), String> {
    if should_use_built_backend() {
        if let Some(bundle) =
            resolve_active_app_bundle(app_data_dir, resource_dir, env!("CARGO_PKG_VERSION"))
        {
            let runtime = if bundle.source == "development" {
                project_root
                    .join("dist")
                    .join("runtime")
                    .join(bun_runtime_name())
            } else {
                bundled_resource_root(resource_dir)
                    .join("runtime")
                    .join(bun_runtime_name())
            };
            let entry = bundle.root.join(&bundle.manifest.backend.entry);
            if runtime.is_file() && entry.is_file() {
                return Ok((runtime, entry, bundle.root.clone(), bundle.root));
            }
        }

        let dist_root = project_root.join("dist");
        let runtime = dist_root.join("runtime").join(bun_runtime_name());
        let entry = dist_root.join("backend").join("backend.bundle.js");
        if runtime.is_file() && entry.is_file() {
            return Ok((runtime, entry, dist_root.clone(), dist_root));
        }
    }

    let runtime = resolve_bun_command();
    let entry = project_root.join("backend").join("src").join("index.ts");
    if !entry.is_file() {
        return Err(format!(
            "Backend source entry is missing: {}",
            entry.display()
        ));
    }
    Ok((
        runtime,
        entry,
        project_root.to_path_buf(),
        project_root.to_path_buf(),
    ))
}

fn should_use_built_backend() -> bool {
    should_use_built_backend_for(
        env::var("GEOCHAT_DESKTOP_USE_BUILT_BACKEND")
            .ok()
            .as_deref(),
        cfg!(debug_assertions),
    )
}

fn should_use_built_backend_for(configured: Option<&str>, debug_assertions: bool) -> bool {
    // Release builds must never fall back to source backend paths controlled by the launch environment.
    if !debug_assertions {
        return true;
    }
    matches!(configured.map(str::trim), Some("1"))
}

fn development_backend_url() -> Option<String> {
    if !cfg!(debug_assertions) {
        return None;
    }
    env::var("GEOCHAT_DESKTOP_BACKEND_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn desktop_agent_skill_cache_dir(app_data_dir: &Path) -> Result<PathBuf, String> {
    let directory = app_data_dir.join("agent-skills");
    fs::create_dir_all(&directory).map_err(|error| {
        format!(
            "Failed to create desktop agent skill cache directory {}: {error}",
            directory.display()
        )
    })?;
    Ok(directory)
}

fn desktop_bundled_agent_skill_dirs(resource_root: &Path) -> Result<std::ffi::OsString, String> {
    env::join_paths([
        resource_root.join("vendor").join("agent-skills"),
        resource_root.join("agent-skills"),
        resource_root.join("skills"),
    ])
    .map_err(|error| format!("Failed to join bundled agent skill directories: {error}"))
}

fn resolve_bun_command() -> PathBuf {
    if let Ok(bun_install) = env::var("BUN_INSTALL") {
        let candidate = PathBuf::from(bun_install).join("bin").join("bun");
        if candidate.is_file() {
            return candidate;
        }
    }
    PathBuf::from("bun")
}

fn bun_runtime_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "bun.exe"
    } else {
        "bun"
    }
}

fn wait_for_backend_health(
    base_url: &str,
    child: &mut Child,
    timeout: Duration,
) -> Result<(), String> {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            return Err(format!(
                "Backend exited before health check passed: {status}"
            ));
        }
        if backend_health_ok(base_url) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(150));
    }
    Err(format!(
        "Backend did not pass /health within {}ms.",
        timeout.as_millis()
    ))
}

fn backend_health_ok(base_url: &str) -> bool {
    let Some(port) = port_from_url(base_url) else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
    if stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

fn find_available_loopback_port(preferred_port: u16) -> Result<u16, String> {
    for offset in 0..20u16 {
        let candidate = preferred_port.saturating_add(offset);
        if can_bind_loopback(candidate) {
            return Ok(candidate);
        }
    }
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| error.to_string())
}

fn can_bind_loopback(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn env_port(name: &str) -> Option<u16> {
    env::var(name).ok()?.parse().ok()
}

fn port_from_url(value: &str) -> Option<u16> {
    value
        .rsplit_once(':')
        .and_then(|(_, port)| port.trim_end_matches('/').parse().ok())
}

#[cfg(test)]
mod tests {
    use super::should_use_built_backend_for;

    #[test]
    fn release_builds_use_packaged_backend_by_default() {
        assert!(should_use_built_backend_for(None, false));
    }

    #[test]
    fn debug_builds_keep_source_backend_by_default() {
        assert!(!should_use_built_backend_for(None, true));
    }

    #[test]
    fn backend_mode_environment_can_override_defaults() {
        assert!(should_use_built_backend_for(Some("1"), true));
        assert!(!should_use_built_backend_for(Some("0"), true));
    }

    #[test]
    fn release_builds_ignore_source_backend_override() {
        assert!(should_use_built_backend_for(Some("1"), false));
        assert!(should_use_built_backend_for(Some("0"), false));
    }

    #[test]
    fn desktop_debug_mcp_is_not_available_in_release() {
        assert!(super::desktop_mcp_available_for(true));
        assert!(!super::desktop_mcp_available_for(false));
    }
}
