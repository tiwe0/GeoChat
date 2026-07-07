use serde::Serialize;
use std::{env, process::Child};

use crate::{
    sidecar::{desktop_mcp_available, desktop_mcp_port, start_desktop_mcp},
    DesktopState,
};

pub(crate) struct McpRuntime {
    pub(crate) enabled: bool,
    child: Option<Child>,
    last_error: Option<String>,
}

impl McpRuntime {
    pub(crate) fn new() -> Self {
        Self {
            enabled: false,
            child: None,
            last_error: None,
        }
    }

    pub(crate) fn stop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
        self.last_error = None;
    }

    pub(crate) fn status(&mut self) -> DesktopMcpStatus {
        if !desktop_mcp_available() {
            self.stop();
            self.enabled = false;
            return DesktopMcpStatus {
                available: false,
                enabled: false,
                running: false,
                endpoint: None,
                health_url: None,
                port: desktop_mcp_port(),
                pid: None,
                error: None,
            };
        }

        let mut running = false;
        let mut pid = None;
        if let Some(child) = self.child.as_mut() {
            match child.try_wait() {
                Ok(Some(status)) => {
                    if self.enabled && !status.success() {
                        self.last_error = Some(format!("MCP process exited with status {status}."));
                    }
                    self.child = None;
                }
                Ok(None) => {
                    running = true;
                    pid = Some(child.id());
                }
                Err(error) => {
                    self.last_error = Some(error.to_string());
                    self.child = None;
                }
            }
        }

        let port = desktop_mcp_port();
        DesktopMcpStatus {
            available: true,
            enabled: self.enabled,
            running,
            endpoint: running.then(|| format!("http://127.0.0.1:{port}/mcp")),
            health_url: running.then(|| format!("http://127.0.0.1:{port}/health")),
            port,
            pid,
            error: self.last_error.clone(),
        }
    }

    pub(crate) fn enable(&mut self, state: &DesktopState) {
        if !desktop_mcp_available() {
            self.stop();
            self.enabled = false;
            return;
        }

        self.enabled = true;
        if self.child.is_some() {
            return;
        }
        match start_desktop_mcp(state) {
            Ok(child) => {
                self.last_error = None;
                self.child = Some(child);
            }
            Err(error) => {
                self.last_error = Some(error);
            }
        }
    }
}

impl Drop for McpRuntime {
    fn drop(&mut self) {
        self.stop();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopMcpStatus {
    pub(crate) available: bool,
    pub(crate) enabled: bool,
    pub(crate) running: bool,
    pub(crate) endpoint: Option<String>,
    pub(crate) health_url: Option<String>,
    pub(crate) port: u16,
    pub(crate) pid: Option<u32>,
    pub(crate) error: Option<String>,
}

pub(crate) fn auto_start_desktop_mcp_requested() -> bool {
    auto_start_desktop_mcp_requested_for(
        cfg!(debug_assertions),
        env::var("GEOCHAT_DESKTOP_MCP_AUTO_START").ok().as_deref(),
        env::args().skip(1),
    )
}

pub(crate) fn auto_start_desktop_mcp_requested_for<T: AsRef<str>>(
    debug_assertions: bool,
    env_value: Option<&str>,
    args: impl IntoIterator<Item = T>,
) -> bool {
    if !debug_assertions {
        return false;
    }
    if matches!(
        env_value
            .map(str::trim)
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("1" | "true" | "yes" | "on")
    ) {
        return true;
    }
    args.into_iter().any(|arg| {
        matches!(
            arg.as_ref(),
            "--mcp" | "--desktop-mcp" | "--debug-mcp" | "--auto-start-mcp" | "--geochat-mcp"
        )
    })
}
