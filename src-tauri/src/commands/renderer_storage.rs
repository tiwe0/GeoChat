use crate::DesktopState;
use serde_json::{Map, Value};
use tauri::State;

#[tauri::command]
pub(crate) fn get_renderer_storage(
    state: State<'_, DesktopState>,
    keys: Option<Vec<String>>,
) -> Result<Map<String, Value>, String> {
    let mut storage = state
        .renderer_storage
        .lock()
        .map_err(|error| error.to_string())?;
    storage.get(keys)
}

#[tauri::command]
pub(crate) fn set_renderer_storage(
    state: State<'_, DesktopState>,
    values: Map<String, Value>,
) -> Result<(), String> {
    state
        .renderer_storage
        .lock()
        .map_err(|error| error.to_string())?
        .set_batch(values)
}

#[tauri::command]
pub(crate) fn remove_renderer_storage(
    state: State<'_, DesktopState>,
    keys: Vec<String>,
) -> Result<(), String> {
    state
        .renderer_storage
        .lock()
        .map_err(|error| error.to_string())?
        .remove_batch(keys)
}
