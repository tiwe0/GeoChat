use std::{
    env,
    ffi::OsString,
    fs,
    io::{BufRead, BufReader, ErrorKind, Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        mpsc::{self, Receiver, Sender},
        Arc, Mutex,
    },
    thread,
    thread::JoinHandle,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use crate::{
    app_bundle::{bundled_resource_root, resolve_active_app_bundle},
    credential_broker::CredentialBrokerRuntime,
    desktop_database_path,
    logging::sanitize_message,
    DesktopState,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use url::Url;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(crate) const BACKEND_RUNTIME_STATE_EVENT: &str = "desktop:backend-runtime-state";

const MANAGED_BACKEND_POLL_INTERVAL: Duration = Duration::from_millis(250);
const MANAGED_BACKEND_RESTART_BASE_DELAY: Duration = Duration::from_millis(500);
const MANAGED_BACKEND_RESTART_MAX_DELAY: Duration = Duration::from_secs(4);
const MANAGED_BACKEND_STABLE_WINDOW: Duration = Duration::from_secs(30);
const MANAGED_BACKEND_DEFAULT_RESTART_LIMIT: u8 = 3;
const EXTERNAL_BACKEND_POLL_INTERVAL: Duration = Duration::from_secs(2);
const EXTERNAL_BACKEND_MAX_POLL_INTERVAL: Duration = Duration::from_secs(30);
const EXTERNAL_BACKEND_FAILURE_THRESHOLD: u8 = 3;
const EXTERNAL_BACKEND_RECOVERY_THRESHOLD: u8 = 2;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum BackendRuntimeMode {
    Managed,
    External,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum BackendRuntimeState {
    Running,
    Exited,
    Unreachable,
    Stopped,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackendRuntimeSnapshot {
    pub(crate) mode: BackendRuntimeMode,
    pub(crate) state: BackendRuntimeState,
    pub(crate) base_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
}

struct BackendMonitor {
    shutdown: Sender<()>,
    thread: Option<JoinHandle<()>>,
}

#[derive(Clone)]
struct ManagedBackendLaunch {
    runtime: PathBuf,
    entry: PathBuf,
    cwd: PathBuf,
    environment: Vec<(OsString, OsString)>,
}

impl ManagedBackendLaunch {
    fn spawn(&self) -> Result<Child, String> {
        let mut command = Command::new(&self.runtime);
        command
            .arg(&self.entry)
            .current_dir(&self.cwd)
            .envs(self.environment.iter().cloned())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = spawn_with_retry(
            &mut command,
            &format!(
                "backend with runtime {} and entry {}",
                self.runtime.display(),
                self.entry.display()
            ),
        )?;
        capture_child_output(&mut child, "backend");
        Ok(child)
    }
}

impl BackendMonitor {
    fn stop(&mut self) {
        let _ = self.shutdown.send(());
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

pub(crate) struct BackendRuntime {
    pub(crate) base_url: String,
    child: Option<Child>,
    managed_launch: Option<ManagedBackendLaunch>,
    pub(crate) _credential_broker: Option<CredentialBrokerRuntime>,
    mode: BackendRuntimeMode,
    snapshot: Arc<Mutex<BackendRuntimeSnapshot>>,
    monitor: Option<BackendMonitor>,
}

impl BackendRuntime {
    pub(crate) fn detached(base_url: String) -> Self {
        Self::new(base_url, None, None, BackendRuntimeMode::External, None)
    }

    fn new(
        base_url: String,
        child: Option<Child>,
        credential_broker: Option<CredentialBrokerRuntime>,
        mode: BackendRuntimeMode,
        managed_launch: Option<ManagedBackendLaunch>,
    ) -> Self {
        let pid = child.as_ref().map(Child::id);
        let snapshot = BackendRuntimeSnapshot {
            mode,
            state: BackendRuntimeState::Running,
            base_url: base_url.clone(),
            pid,
            error: None,
        };
        Self {
            base_url,
            child,
            managed_launch,
            _credential_broker: credential_broker,
            mode,
            snapshot: Arc::new(Mutex::new(snapshot)),
            monitor: None,
        }
    }

    pub(crate) fn snapshot(&self) -> BackendRuntimeSnapshot {
        lock_snapshot(&self.snapshot).clone()
    }

    pub(crate) fn start_monitor(&mut self, app: AppHandle) {
        if self.monitor.is_some() {
            return;
        }
        self.monitor = Some(match self.mode {
            BackendRuntimeMode::Managed => {
                let Some(child) = self.child.take() else {
                    return;
                };
                let Some(launch) = self.managed_launch.clone() else {
                    return;
                };
                start_managed_backend_monitor(
                    child,
                    launch,
                    self.base_url.clone(),
                    self.snapshot.clone(),
                    app,
                )
            }
            BackendRuntimeMode::External => {
                start_external_backend_monitor(self.base_url.clone(), self.snapshot.clone(), app)
            }
        });
    }

    pub(crate) fn stop(&mut self) {
        if let Some(mut monitor) = self.monitor.take() {
            monitor.stop();
        }
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        update_backend_snapshot(&self.snapshot, BackendRuntimeState::Stopped, None, None);
    }
}

impl Drop for BackendRuntime {
    fn drop(&mut self) {
        self.stop();
    }
}

pub(crate) fn start_backend(
    app_data_dir: &Path,
    resource_dir: &Path,
    auth_token: &str,
    credential_broker: CredentialBrokerRuntime,
) -> Result<BackendRuntime, String> {
    if let Some(configured_url) = development_backend_url() {
        let configured_url = validate_development_backend_url(&configured_url)?;
        let configured_token = configured_development_backend_auth_token().ok_or_else(|| {
            "GEOCHAT_DESKTOP_BACKEND_URL requires an explicit GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN.".to_string()
        })?;
        if configured_token != auth_token {
            return Err("The configured development backend token does not match the renderer runtime token.".to_string());
        }
        return Ok(BackendRuntime::new(
            configured_url,
            None,
            Some(credential_broker),
            BackendRuntimeMode::External,
            None,
        ));
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

    log::info!(
        target: "geochat::backend",
        "Starting local backend on 127.0.0.1:{port}"
    );
    log::debug!(
        target: "geochat::backend",
        "Backend runtime={} entry={} cwd={}",
        runtime.display(),
        entry.display(),
        cwd.display()
    );

    let broker_connection = credential_broker.connection();
    let launch = ManagedBackendLaunch {
        runtime,
        entry,
        cwd,
        environment: vec![
            (
                "GEOCHAT_DESKTOP_BACKEND_PORT".into(),
                port.to_string().into(),
            ),
            ("GEOCHAT_DESKTOP_BACKEND_HOST".into(), "127.0.0.1".into()),
            (
                "GEOCHAT_DESKTOP_BACKEND_AUTH_MODE".into(),
                "required".into(),
            ),
            (
                "GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN".into(),
                auth_token.into(),
            ),
            (
                "GEOCHAT_CREDENTIAL_BROKER_URL".into(),
                broker_connection.base_url.clone().into(),
            ),
            (
                "GEOCHAT_CREDENTIAL_BROKER_TOKEN".into(),
                broker_connection.token.clone().into(),
            ),
            (
                "GEOCHAT_DESKTOP_ALLOWED_ORIGINS".into(),
                backend_allowed_origins().into(),
            ),
            (
                "GEOCHAT_DESKTOP_RESOURCE_ROOT".into(),
                resource_root.clone().into_os_string(),
            ),
            (
                "GEOCHAT_DESKTOP_DB_PATH".into(),
                database_path.into_os_string(),
            ),
            (
                "GEOCHAT_REMOTE_SKILLS_CACHE_DIR".into(),
                skill_cache_dir.into_os_string(),
            ),
            (
                "GEOCHAT_BUILTIN_SKILLS_DIRS".into(),
                builtin_skill_dirs.into_os_string(),
            ),
            ("GEOCHAT_BUNDLED_SKILLS_DIRS".into(), bundled_skill_dirs),
            (
                "GEOCHAT_BACKEND_TOOL_AUTO_STEP_LIMIT".into(),
                env::var("GEOCHAT_BACKEND_TOOL_AUTO_STEP_LIMIT")
                    .unwrap_or_else(|_| "24".to_string())
                    .into(),
            ),
        ],
    };
    let mut child = launch.spawn()?;

    if let Err(error) =
        wait_for_backend_health(&base_url, &mut child, Duration::from_millis(12_000))
    {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    log::info!(target: "geochat::backend", "Local backend health check passed");

    Ok(BackendRuntime::new(
        base_url,
        Some(child),
        Some(credential_broker),
        BackendRuntimeMode::Managed,
        Some(launch),
    ))
}

fn start_managed_backend_monitor(
    child: Child,
    launch: ManagedBackendLaunch,
    base_url: String,
    snapshot: Arc<Mutex<BackendRuntimeSnapshot>>,
    app: AppHandle,
) -> BackendMonitor {
    let publisher = Arc::new(move |state, pid, error| {
        publish_backend_snapshot(&snapshot, &app, state, pid, error);
    });
    start_managed_backend_monitor_with(
        child,
        launch,
        base_url,
        managed_backend_restart_limit(),
        publisher,
        Arc::new(backend_health_ok),
    )
}

type SnapshotPublisher =
    Arc<dyn Fn(BackendRuntimeState, Option<u32>, Option<String>) + Send + Sync>;
type HealthProbe = Arc<dyn Fn(&str) -> bool + Send + Sync>;

fn start_managed_backend_monitor_with(
    mut child: Child,
    launch: ManagedBackendLaunch,
    base_url: String,
    restart_limit: u8,
    publish: SnapshotPublisher,
    health_probe: HealthProbe,
) -> BackendMonitor {
    let (shutdown, shutdown_rx) = mpsc::channel();
    let thread = thread::spawn(move || {
        let mut consecutive_restart_attempts = 0;
        let mut running_since = Instant::now();
        loop {
            let exit_error = loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        break format!("Backend process exited with status {status}.");
                    }
                    Ok(None) => {}
                    Err(error) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        break format!("Failed to inspect backend process state: {error}");
                    }
                }

                match shutdown_rx.recv_timeout(MANAGED_BACKEND_POLL_INTERVAL) {
                    Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return;
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
            };

            log::error!(target: "geochat::backend", "{exit_error}");
            publish(BackendRuntimeState::Exited, None, Some(exit_error));
            if running_since.elapsed() >= MANAGED_BACKEND_STABLE_WINDOW {
                consecutive_restart_attempts = 0;
            }

            let mut recovered = None;
            while consecutive_restart_attempts < restart_limit {
                let attempt = consecutive_restart_attempts;
                consecutive_restart_attempts = consecutive_restart_attempts.saturating_add(1);
                let delay = managed_backend_restart_delay(attempt);
                if wait_for_monitor_shutdown(&shutdown_rx, delay) {
                    return;
                }
                log::warn!(
                    target: "geochat::backend",
                    "Restarting managed backend after unexpected exit (attempt {}/{restart_limit})",
                    attempt + 1
                );
                let mut candidate = match launch.spawn() {
                    Ok(candidate) => candidate,
                    Err(error) => {
                        log::error!(target: "geochat::backend", "Managed backend restart failed: {error}");
                        publish(BackendRuntimeState::Exited, None, Some(error));
                        continue;
                    }
                };
                match wait_for_restarted_backend(
                    &base_url,
                    &mut candidate,
                    &shutdown_rx,
                    health_probe.as_ref(),
                    Duration::from_millis(12_000),
                ) {
                    RestartReadiness::Ready => {
                        let pid = candidate.id();
                        log::info!(target: "geochat::backend", "Managed backend recovered");
                        publish(BackendRuntimeState::Running, Some(pid), None);
                        recovered = Some(candidate);
                        running_since = Instant::now();
                        break;
                    }
                    RestartReadiness::Failed(error) => {
                        let _ = candidate.kill();
                        let _ = candidate.wait();
                        log::error!(target: "geochat::backend", "Managed backend restart failed: {error}");
                        publish(BackendRuntimeState::Exited, None, Some(error));
                    }
                    RestartReadiness::Stopped => {
                        let _ = candidate.kill();
                        let _ = candidate.wait();
                        return;
                    }
                }
            }

            let Some(next_child) = recovered else {
                log::error!(target: "geochat::backend", "Managed backend restart limit exhausted");
                return;
            };
            child = next_child;
        }
    });
    BackendMonitor {
        shutdown,
        thread: Some(thread),
    }
}

enum RestartReadiness {
    Ready,
    Failed(String),
    Stopped,
}

fn wait_for_restarted_backend(
    base_url: &str,
    child: &mut Child,
    shutdown: &Receiver<()>,
    health_probe: &(dyn Fn(&str) -> bool + Send + Sync),
    timeout: Duration,
) -> RestartReadiness {
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return RestartReadiness::Failed(format!(
                    "Backend process exited during restart with status {status}."
                ));
            }
            Ok(None) => {}
            Err(error) => {
                return RestartReadiness::Failed(format!(
                    "Failed to inspect restarted backend: {error}"
                ));
            }
        }
        if health_probe(base_url) {
            return RestartReadiness::Ready;
        }
        if started.elapsed() >= timeout {
            return RestartReadiness::Failed(
                "Backend health check timed out after restart.".into(),
            );
        }
        if wait_for_monitor_shutdown(shutdown, Duration::from_millis(100)) {
            return RestartReadiness::Stopped;
        }
    }
}

fn wait_for_monitor_shutdown(shutdown: &Receiver<()>, duration: Duration) -> bool {
    matches!(
        shutdown.recv_timeout(duration),
        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected)
    )
}

fn managed_backend_restart_limit() -> u8 {
    env::var("GEOCHAT_DESKTOP_BACKEND_RESTART_LIMIT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(MANAGED_BACKEND_DEFAULT_RESTART_LIMIT)
        .min(10)
}

fn managed_backend_restart_delay(attempt: u8) -> Duration {
    MANAGED_BACKEND_RESTART_BASE_DELAY
        .saturating_mul(1_u32.checked_shl(u32::from(attempt)).unwrap_or(u32::MAX))
        .min(MANAGED_BACKEND_RESTART_MAX_DELAY)
}

fn start_external_backend_monitor(
    base_url: String,
    snapshot: Arc<Mutex<BackendRuntimeSnapshot>>,
    app: AppHandle,
) -> BackendMonitor {
    let (shutdown, shutdown_rx) = mpsc::channel();
    let thread = thread::spawn(move || {
        let mut health = ExternalBackendHealth::new();
        let mut jitter_seed = monitor_jitter_seed();
        loop {
            let healthy = backend_health_ok(&base_url);
            if let Some(reachable) = health.observe(healthy) {
                if reachable {
                    log::info!(target: "geochat::backend", "External backend health recovered");
                    publish_backend_snapshot(
                        &snapshot,
                        &app,
                        BackendRuntimeState::Running,
                        None,
                        None,
                    );
                } else {
                    let error = "External backend health check failed repeatedly.".to_string();
                    log::warn!(target: "geochat::backend", "{error}");
                    publish_backend_snapshot(
                        &snapshot,
                        &app,
                        BackendRuntimeState::Unreachable,
                        None,
                        Some(error),
                    );
                }
            }

            let delay = external_backend_poll_delay(health.consecutive_failures, &mut jitter_seed);
            match shutdown_rx.recv_timeout(delay) {
                Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
        }
    });
    BackendMonitor {
        shutdown,
        thread: Some(thread),
    }
}

fn publish_backend_snapshot(
    snapshot: &Arc<Mutex<BackendRuntimeSnapshot>>,
    app: &AppHandle,
    state: BackendRuntimeState,
    pid: Option<u32>,
    error: Option<String>,
) {
    let next = update_backend_snapshot(snapshot, state, pid, error);
    if let Err(error) = app.emit(BACKEND_RUNTIME_STATE_EVENT, next) {
        log::warn!(target: "geochat::backend", "Failed to emit backend runtime state: {error}");
    }
}

fn update_backend_snapshot(
    snapshot: &Arc<Mutex<BackendRuntimeSnapshot>>,
    state: BackendRuntimeState,
    pid: Option<u32>,
    error: Option<String>,
) -> BackendRuntimeSnapshot {
    let mut snapshot = lock_snapshot(snapshot);
    snapshot.state = state;
    snapshot.pid = pid;
    snapshot.error = error;
    snapshot.clone()
}

fn lock_snapshot(
    snapshot: &Arc<Mutex<BackendRuntimeSnapshot>>,
) -> std::sync::MutexGuard<'_, BackendRuntimeSnapshot> {
    snapshot.lock().unwrap_or_else(|error| error.into_inner())
}

#[derive(Debug)]
struct ExternalBackendHealth {
    reachable: bool,
    consecutive_successes: u8,
    consecutive_failures: u8,
}

impl ExternalBackendHealth {
    fn new() -> Self {
        Self {
            reachable: true,
            consecutive_successes: 0,
            consecutive_failures: 0,
        }
    }

    fn observe(&mut self, healthy: bool) -> Option<bool> {
        if healthy {
            self.consecutive_failures = 0;
            self.consecutive_successes = self.consecutive_successes.saturating_add(1);
            if !self.reachable && self.consecutive_successes >= EXTERNAL_BACKEND_RECOVERY_THRESHOLD
            {
                self.reachable = true;
                self.consecutive_successes = 0;
                return Some(true);
            }
        } else {
            self.consecutive_successes = 0;
            self.consecutive_failures = self.consecutive_failures.saturating_add(1);
            if self.reachable && self.consecutive_failures >= EXTERNAL_BACKEND_FAILURE_THRESHOLD {
                self.reachable = false;
                return Some(false);
            }
        }
        None
    }
}

fn external_backend_poll_delay(failure_streak: u8, jitter_seed: &mut u64) -> Duration {
    if failure_streak == 0 {
        return EXTERNAL_BACKEND_POLL_INTERVAL;
    }
    let exponent = u32::from(failure_streak.saturating_sub(1).min(8));
    let base = EXTERNAL_BACKEND_POLL_INTERVAL
        .saturating_mul(1_u32 << exponent)
        .min(EXTERNAL_BACKEND_MAX_POLL_INTERVAL);
    let jitter_room = (base / 5).min(EXTERNAL_BACKEND_MAX_POLL_INTERVAL.saturating_sub(base));
    if jitter_room.is_zero() {
        return base;
    }
    *jitter_seed = jitter_seed
        .wrapping_mul(6_364_136_223_846_793_005)
        .wrapping_add(1);
    let jitter_millis = *jitter_seed % (jitter_room.as_millis() as u64 + 1);
    base + Duration::from_millis(jitter_millis)
}

fn monitor_jitter_seed() -> u64 {
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;
    time ^ u64::from(std::process::id())
}

fn backend_allowed_origins() -> String {
    backend_allowed_origins_for(
        cfg!(debug_assertions),
        cfg!(target_os = "windows"),
        env::var("GEOCHAT_DEV_URL").ok().as_deref(),
    )
}

fn backend_allowed_origins_for(debug: bool, windows: bool, dev_url: Option<&str>) -> String {
    let mut origins = if debug {
        vec!["http://127.0.0.1:1421".to_string()]
    } else if windows {
        vec![
            "http://tauri.localhost".to_string(),
            "http://geochat-bundle.localhost".to_string(),
        ]
    } else {
        vec![
            "tauri://localhost".to_string(),
            "geochat-bundle://localhost".to_string(),
        ]
    };
    if debug {
        if let Some(dev_url) = dev_url {
            if let Ok(parsed_url) = Url::parse(dev_url.trim()) {
                let origin = parsed_url.origin().ascii_serialization();
                if !origins.iter().any(|candidate| candidate == &origin) {
                    origins.push(origin);
                }
            }
        }
    }
    origins.join(",")
}

pub(crate) fn start_desktop_mcp(state: &DesktopState) -> Result<(Child, u16), String> {
    let entry = resolve_desktop_mcp_entry()?;
    let project_root = project_root()?;
    let port = find_available_loopback_port(desktop_mcp_port())?;
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
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = spawn_with_retry(&mut command, "desktop MCP")?;
    capture_child_output(&mut child, "mcp");
    log::info!(target: "geochat::mcp", "Desktop MCP process started on 127.0.0.1:{port}");
    Ok((child, port))
}

fn capture_child_output(child: &mut Child, service: &'static str) {
    if let Some(stdout) = child.stdout.take() {
        pipe_child_output(stdout, service, false);
    }
    if let Some(stderr) = child.stderr.take() {
        pipe_child_output(stderr, service, true);
    }
}

fn pipe_child_output<R>(reader: R, service: &'static str, is_stderr: bool)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines() {
            let Ok(line) = line else {
                break;
            };
            let sanitized = sanitize_message(&line);
            if is_stderr {
                eprintln!("{sanitized}");
            } else {
                println!("{sanitized}");
            }
            log::log!(
                target: "geochat::sidecar",
                child_output_level(&line, is_stderr),
                "[{service}] {}",
                sanitized
            );
        }
    });
}

fn child_output_level(line: &str, is_stderr: bool) -> log::Level {
    let normalized = line.trim_start().to_ascii_lowercase();
    if normalized.starts_with("[error]") || normalized.starts_with("error:") {
        log::Level::Error
    } else if normalized.starts_with("[warn]") || normalized.starts_with("warn:") {
        log::Level::Warn
    } else if normalized.starts_with("[debug]") || normalized.starts_with("debug:") {
        log::Level::Debug
    } else if normalized.starts_with("[trace]") || normalized.starts_with("trace:") {
        log::Level::Trace
    } else if normalized.starts_with("[info]") || normalized.starts_with("info:") {
        log::Level::Info
    } else if is_stderr {
        log::Level::Error
    } else {
        log::Level::Info
    }
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
                log::warn!(
                    target: "geochat::sidecar",
                    "Launch attempt {} for {label} was temporarily blocked; retrying",
                    attempt + 1
                );
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

pub(crate) fn should_use_built_backend() -> bool {
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

fn validate_development_backend_url(value: &str) -> Result<String, String> {
    let parsed = Url::parse(value)
        .map_err(|error| format!("GEOCHAT_DESKTOP_BACKEND_URL is not a valid URL: {error}"))?;
    if parsed.scheme() != "http" {
        return Err(
            "GEOCHAT_DESKTOP_BACKEND_URL must use http for the local development backend."
                .to_string(),
        );
    }
    let is_loopback = match parsed.host() {
        Some(url::Host::Ipv4(address)) => address.is_loopback(),
        Some(url::Host::Ipv6(address)) => address.is_loopback(),
        Some(url::Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        None => false,
    };
    if !is_loopback {
        return Err(
            "GEOCHAT_DESKTOP_BACKEND_URL must target a loopback host for the local development backend."
                .to_string(),
        );
    }
    if parsed.port().is_none() {
        return Err(
            "GEOCHAT_DESKTOP_BACKEND_URL must include an explicit non-default port.".to_string(),
        );
    }
    Ok(parsed.to_string().trim_end_matches('/').to_string())
}

fn configured_development_backend_auth_token() -> Option<String> {
    configured_development_backend_auth_token_for(
        env::var("GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN")
            .ok()
            .as_deref(),
    )
}

fn configured_development_backend_auth_token_for(backend_token: Option<&str>) -> Option<String> {
    backend_token
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(str::to_string)
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
        log::trace!(
            target: "geochat::backend",
            "Waiting for backend health check elapsed_ms={}",
            started.elapsed().as_millis()
        );
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
    let Ok(url) = Url::parse(base_url) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    let Some(port) = url.port() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect((host, port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
    let request =
        format!("GET /health HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
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

#[cfg(test)]
mod tests {
    use std::{
        net::TcpListener,
        sync::{mpsc, Arc, Mutex},
        time::Duration,
    };

    use super::{
        backend_allowed_origins_for, child_output_level,
        configured_development_backend_auth_token_for, external_backend_poll_delay,
        find_available_loopback_port, managed_backend_restart_delay, should_use_built_backend_for,
        start_managed_backend_monitor_with, validate_development_backend_url, BackendRuntime,
        BackendRuntimeState, ExternalBackendHealth, ManagedBackendLaunch,
        EXTERNAL_BACKEND_POLL_INTERVAL,
    };

    #[test]
    fn available_port_skips_an_occupied_preferred_port() {
        let occupied = TcpListener::bind(("127.0.0.1", 0)).expect("bind occupied test port");
        let preferred = occupied.local_addr().expect("read occupied port").port();
        let selected = find_available_loopback_port(preferred).expect("select fallback port");
        assert_ne!(selected, preferred);

        let _selected =
            TcpListener::bind(("127.0.0.1", selected)).expect("selected port remains bindable");
    }

    #[test]
    fn sidecar_output_preserves_explicit_log_levels() {
        assert_eq!(
            child_output_level("[ERROR] failed", false),
            log::Level::Error
        );
        assert_eq!(
            child_output_level("[WARN] fallback", true),
            log::Level::Warn
        );
        assert_eq!(child_output_level("[INFO] ready", true), log::Level::Info);
        assert_eq!(
            child_output_level("[DEBUG] state", false),
            log::Level::Debug
        );
        assert_eq!(child_output_level("[TRACE] step", false), log::Level::Trace);
        assert_eq!(child_output_level("plain stderr", true), log::Level::Error);
        assert_eq!(child_output_level("plain stdout", false), log::Level::Info);
    }

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
    fn external_development_backend_requires_an_explicit_shared_token() {
        assert_eq!(
            configured_development_backend_auth_token_for(Some(" shared-token ")),
            Some("shared-token".to_string())
        );
        assert_eq!(configured_development_backend_auth_token_for(None), None);
        assert_eq!(
            configured_development_backend_auth_token_for(Some("  ")),
            None
        );
    }

    #[test]
    fn external_development_backend_requires_loopback_http_with_explicit_port() {
        assert_eq!(
            validate_development_backend_url("http://127.0.0.1:17365/")
                .expect("accept local development backend"),
            "http://127.0.0.1:17365"
        );
        assert!(validate_development_backend_url("https://127.0.0.1:17365")
            .expect_err("reject HTTPS")
            .contains("must use http"));
        assert!(
            validate_development_backend_url("http://192.168.1.10:17365")
                .expect_err("reject remote host")
                .contains("loopback host")
        );
        assert!(validate_development_backend_url("http://127.0.0.1")
            .expect_err("reject implicit default port")
            .contains("explicit non-default port"));
        assert!(validate_development_backend_url("http://127.0.0.1:80")
            .expect_err("reject explicit default port")
            .contains("explicit non-default port"));
    }

    #[test]
    fn external_backend_health_debounces_transient_failures_and_recovery() {
        let mut health = ExternalBackendHealth::new();

        assert_eq!(health.observe(false), None);
        assert_eq!(health.observe(true), None);
        assert_eq!(health.observe(false), None);
        assert_eq!(health.observe(false), None);
        assert_eq!(health.observe(false), Some(false));

        assert_eq!(health.observe(true), None);
        assert_eq!(health.observe(false), None);
        assert_eq!(health.observe(true), None);
        assert_eq!(health.observe(true), Some(true));
    }

    #[test]
    fn external_backend_health_emits_only_on_state_transitions() {
        let mut health = ExternalBackendHealth::new();

        assert_eq!(health.observe(false), None);
        assert_eq!(health.observe(false), None);
        assert_eq!(health.observe(false), Some(false));
        assert_eq!(health.observe(false), None);
        assert_eq!(health.observe(false), None);
        assert_eq!(health.observe(true), None);
        assert_eq!(health.observe(true), Some(true));
        assert_eq!(health.observe(true), None);
    }

    #[test]
    fn external_backend_poll_backoff_progresses_and_resets_after_success() {
        let mut health = ExternalBackendHealth::new();
        let mut seed = 7;

        assert_eq!(
            external_backend_poll_delay(health.consecutive_failures, &mut seed),
            EXTERNAL_BACKEND_POLL_INTERVAL
        );
        assert_eq!(health.observe(false), None);
        let first = external_backend_poll_delay(health.consecutive_failures, &mut seed);
        assert_eq!(health.observe(false), None);
        let second = external_backend_poll_delay(health.consecutive_failures, &mut seed);
        assert_eq!(health.observe(false), Some(false));
        let third = external_backend_poll_delay(health.consecutive_failures, &mut seed);

        assert!(first >= Duration::from_secs(2));
        assert!(second >= Duration::from_secs(4));
        assert!(third >= Duration::from_secs(8));
        assert!(first < second && second < third);

        assert_eq!(health.observe(true), None);
        assert_eq!(
            external_backend_poll_delay(health.consecutive_failures, &mut seed),
            EXTERNAL_BACKEND_POLL_INTERVAL
        );
    }

    #[test]
    fn managed_backend_restart_backoff_is_capped() {
        assert_eq!(managed_backend_restart_delay(0), Duration::from_millis(500));
        assert_eq!(managed_backend_restart_delay(1), Duration::from_secs(1));
        assert_eq!(managed_backend_restart_delay(2), Duration::from_secs(2));
        assert_eq!(managed_backend_restart_delay(3), Duration::from_secs(4));
        assert_eq!(managed_backend_restart_delay(9), Duration::from_secs(4));
    }

    #[cfg(unix)]
    #[test]
    fn managed_monitor_recovers_from_a_crash_and_stop_kills_the_replacement() {
        use std::{fs, process::Command};

        let test_dir = std::env::temp_dir().join(format!(
            "geochat-sidecar-supervisor-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&test_dir).expect("create supervisor test directory");
        let marker = test_dir.join("started-once");
        let script = test_dir.join("backend.sh");
        fs::write(
            &script,
            format!(
                "if [ ! -f '{}' ]; then touch '{}'; exit 7; fi\nwhile true; do sleep 1; done\n",
                marker.display(),
                marker.display()
            ),
        )
        .expect("write supervisor test script");
        let launch = ManagedBackendLaunch {
            runtime: "/bin/sh".into(),
            entry: script,
            cwd: test_dir.clone(),
            environment: Vec::new(),
        };
        let child = launch.spawn().expect("spawn crashing test backend");
        let (events_tx, events_rx) = mpsc::channel();
        let events_tx = Arc::new(Mutex::new(events_tx));
        let publisher = Arc::new(move |state, pid, _error| {
            events_tx
                .lock()
                .expect("lock event sender")
                .send((state, pid))
                .expect("send supervisor event");
        });
        let mut monitor = start_managed_backend_monitor_with(
            child,
            launch,
            "http://127.0.0.1:1".to_string(),
            2,
            publisher,
            Arc::new(|_| true),
        );

        let exited = events_rx
            .recv_timeout(Duration::from_secs(3))
            .expect("observe crashed backend");
        assert_eq!(exited, (BackendRuntimeState::Exited, None));
        let recovered = events_rx
            .recv_timeout(Duration::from_secs(3))
            .expect("observe recovered backend");
        assert_eq!(recovered.0, BackendRuntimeState::Running);
        let recovered_pid = recovered.1.expect("recovered backend pid");

        monitor.stop();
        let process_still_exists = Command::new("/bin/kill")
            .args(["-0", &recovered_pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .expect("probe recovered process")
            .success();
        assert!(!process_still_exists, "stop must reap the supervised child");
        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn backend_runtime_snapshot_matches_renderer_contract() {
        let runtime = BackendRuntime::detached("http://127.0.0.1:17365".to_string());
        let value = serde_json::to_value(runtime.snapshot()).expect("serialize runtime snapshot");

        assert_eq!(value["mode"], "external");
        assert_eq!(value["state"], "running");
        assert_eq!(value["baseUrl"], "http://127.0.0.1:17365");
        assert!(value.get("pid").is_none());
        assert!(value.get("error").is_none());
    }

    #[test]
    fn backend_origins_are_profiled_by_runtime_platform() {
        assert_eq!(
            backend_allowed_origins_for(false, true, None),
            "http://tauri.localhost,http://geochat-bundle.localhost"
        );
        assert_eq!(
            backend_allowed_origins_for(false, false, None),
            "tauri://localhost,geochat-bundle://localhost"
        );
        assert_eq!(
            backend_allowed_origins_for(true, false, Some("http://localhost:4173/app")),
            "http://127.0.0.1:1421,http://localhost:4173"
        );
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
