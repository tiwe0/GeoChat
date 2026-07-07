use crate::{DesktopMcpStatus, DesktopState};
use tauri::State;

#[tauri::command]
pub(crate) fn get_mcp_status(state: State<'_, DesktopState>) -> Result<DesktopMcpStatus, String> {
    let mut mcp = state.mcp.lock().map_err(|error| error.to_string())?;
    Ok(mcp.status())
}

#[tauri::command]
pub(crate) fn set_mcp_enabled(
    state: State<'_, DesktopState>,
    enabled: bool,
) -> Result<DesktopMcpStatus, String> {
    let mut mcp = state.mcp.lock().map_err(|error| error.to_string())?;
    if enabled {
        mcp.enable(&state);
    } else {
        mcp.enabled = false;
        mcp.stop();
    }
    Ok(mcp.status())
}
