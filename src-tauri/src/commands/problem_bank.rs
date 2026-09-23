use crate::{
    problem_bank_cache::{
        self, DesktopProblemBankCacheState, DesktopProblemBankCatalog,
        DesktopProblemBankDownloadState, DesktopProblemBankPage, DesktopProblemDetail,
    },
    DesktopState,
};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub(crate) fn get_problem_bank_cache_state(
    state: State<'_, DesktopState>,
) -> Result<DesktopProblemBankCacheState, String> {
    problem_bank_cache::cache_state(&state)
}

#[tauri::command]
pub(crate) fn get_problem_bank_catalog(
    state: State<'_, DesktopState>,
) -> Result<Option<DesktopProblemBankCatalog>, String> {
    problem_bank_cache::catalog(&state)
}

#[tauri::command]
pub(crate) fn get_problem_bank_download_states(
    state: State<'_, DesktopState>,
) -> Result<Vec<DesktopProblemBankDownloadState>, String> {
    problem_bank_cache::download_states(&state)
}

#[tauri::command]
pub(crate) async fn download_problem_bank(
    app: AppHandle,
    bank_slug: String,
) -> Result<DesktopProblemBankDownloadState, String> {
    problem_bank_cache::download_bank(app, bank_slug).await
}

#[tauri::command]
pub(crate) fn open_problem_bank_cache_directory(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<String, String> {
    let path = problem_bank_cache::cache_directory(&state)?;
    std::fs::create_dir_all(&path).map_err(|error| {
        format!(
            "Failed to create problem bank cache directory {}: {error}",
            path.display()
        )
    })?;
    let display_path = path.to_string_lossy().into_owned();
    app.opener()
        .open_path(display_path.clone(), None::<String>)
        .map_err(|error| format!("Failed to open problem bank cache directory: {error}"))?;
    Ok(display_path)
}

#[tauri::command]
pub(crate) fn clear_problem_bank_cache(
    app: AppHandle,
) -> Result<DesktopProblemBankCacheState, String> {
    problem_bank_cache::clear_cache(&app)
}

#[tauri::command]
pub(crate) async fn check_problem_bank_update(
    app: AppHandle,
) -> Result<DesktopProblemBankCacheState, String> {
    problem_bank_cache::check_for_update(app).await
}

#[tauri::command]
pub(crate) async fn sync_problem_bank_metadata(
    app: AppHandle,
) -> Result<DesktopProblemBankCacheState, String> {
    problem_bank_cache::sync_metadata(app).await
}

#[tauri::command]
pub(crate) async fn load_problem_bank_page(
    app: AppHandle,
    bank_slug: String,
    cursor: Option<String>,
) -> Result<DesktopProblemBankPage, String> {
    problem_bank_cache::load_page(app, bank_slug, cursor).await
}

#[tauri::command]
pub(crate) async fn load_problem_detail(
    app: AppHandle,
    bank_slug: String,
    problem_id: String,
) -> Result<DesktopProblemDetail, String> {
    problem_bank_cache::load_detail(app, bank_slug, problem_id).await
}
