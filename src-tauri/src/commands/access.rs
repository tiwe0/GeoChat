use crate::{
    access::{access_state_from_store, check_desktop_access, DesktopAccessState},
    DesktopState,
};
use tauri::State;

#[tauri::command]
pub(crate) fn get_access_state(
    state: State<'_, DesktopState>,
) -> Result<DesktopAccessState, String> {
    crate::access::refresh_runtime_authorization(&state)?;
    access_state_from_store(&state)
}

#[tauri::command]
pub(crate) fn check_access(state: State<'_, DesktopState>) -> Result<DesktopAccessState, String> {
    check_desktop_access(&state)
}
