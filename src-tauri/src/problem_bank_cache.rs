use reqwest::header::{CONTENT_RANGE, RANGE};
use reqwest::{blocking::Client, StatusCode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use url::Url;
use uuid::Uuid;

use crate::{now_iso, DesktopState};

const SUPPORTED_SCHEMA_VERSION: &str = "problem-bank.r2.v1";
const DEFAULT_MANIFEST_URL: &str =
    "https://assets.chat-with-geogebra.com/problem-bank/v1/manifest.json";
const STATE_EVENT: &str = "desktop:problem-bank-cache-state";
const DOWNLOAD_STATE_EVENT: &str = "desktop:problem-bank-download-state";
const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const MAX_CORE_INDEX_BYTES: u64 = 16 * 1024 * 1024;
const MAX_RECORD_SHARD_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopProblemBankCacheState {
    pub(crate) status: String,
    pub(crate) configured: bool,
    pub(crate) manifest_url: Option<String>,
    pub(crate) active_release_id: Option<String>,
    pub(crate) available_release_id: Option<String>,
    pub(crate) active_channel: Option<String>,
    pub(crate) available_channel: Option<String>,
    pub(crate) update_available: bool,
    pub(crate) checked_at: Option<String>,
    pub(crate) activated_at: Option<String>,
    pub(crate) cached_bytes: u64,
    pub(crate) cache_directory: String,
    pub(crate) error: Option<String>,
    pub(crate) error_code: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopProblemBankCatalog {
    pub(crate) release_id: String,
    pub(crate) channel: String,
    pub(crate) cloud_base_url: String,
    pub(crate) banks: Vec<DesktopProblemBankSummary>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopProblemBankSummary {
    pub(crate) bank_id: String,
    pub(crate) bank_slug: String,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) kind: String,
    pub(crate) problem_count: u64,
    pub(crate) dataset_id: Option<String>,
    pub(crate) reuse_policy: String,
}

pub(crate) struct ProblemBankCacheRuntime {
    root: PathBuf,
    manifest_url: Option<String>,
    operation_in_progress: bool,
    active_loads: usize,
    active_downloads: HashSet<String>,
    downloads: HashMap<String, DesktopProblemBankDownloadState>,
    pub(crate) state: DesktopProblemBankCacheState,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopProblemBankDownloadState {
    pub(crate) bank_slug: String,
    pub(crate) release_id: String,
    pub(crate) status: String,
    pub(crate) phase: String,
    pub(crate) completed_items: u64,
    pub(crate) total_items: u64,
    pub(crate) downloaded_bytes: u64,
    pub(crate) total_bytes: u64,
    pub(crate) updated_at: String,
    pub(crate) error: Option<String>,
}

enum OperationStart {
    Started { root: PathBuf, manifest_url: String },
    InProgress(Box<DesktopProblemBankCacheState>),
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RootManifest {
    schema_version: String,
    current_release_id: String,
    releases: Vec<ReleasePointer>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleasePointer {
    id: String,
    channel: String,
    manifest_url: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseManifest {
    schema_version: String,
    release_id: String,
    channel: String,
    problem_banks: ReleaseProblemBanks,
    indexes: ReleaseIndexes,
    #[serde(default)]
    datasets: Vec<ReleaseDatasetPointer>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseDatasetPointer {
    dataset_id: String,
    dataset_slug: String,
    manifest_url: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseProblemBanks {
    index_url: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseIndexes {
    facets_url: String,
    problem_id_lookup: ReleaseProblemIdLookup,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseProblemIdLookup {
    prefix_length: usize,
    base_url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActiveRelease {
    release_id: String,
    channel: String,
    activated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledRelease {
    schema_version: String,
    release_id: String,
    channel: String,
    root_manifest_sha256: String,
    release_manifest_sha256: String,
    installed_at: String,
}

struct CheckedRelease {
    root_manifest_bytes: Vec<u8>,
    release_manifest_bytes: Vec<u8>,
    release_manifest: ReleaseManifest,
    release: ReleasePointer,
}

struct CoreArtifacts {
    problem_bank_index_bytes: Vec<u8>,
    facets_bytes: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedProblemBankIndex {
    release_id: String,
    banks: Vec<CachedProblemBank>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedProblemBank {
    bank_id: String,
    bank_slug: String,
    title: String,
    description: Option<String>,
    kind: String,
    index_url: String,
    dataset_id: Option<String>,
    commercial_use: Option<String>,
    counts: CachedProblemBankCounts,
}

#[derive(Clone, Debug, Deserialize)]
struct CachedProblemBankCounts {
    records: Option<u64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedFacetsIndex {
    release_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedProblemBankDetailIndex {
    release_id: String,
    bank_slug: String,
    pages: Vec<CachedProblemBankPagePointer>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedProblemBankPagePointer {
    id: String,
    url: String,
    rows: usize,
    sha256: String,
    byte_size: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedDatasetManifest {
    release_id: String,
    dataset_slug: String,
    record_shards: Vec<CachedArtifactPointer>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedArtifactPointer {
    id: String,
    url: String,
    rows: usize,
    sha256: String,
    byte_size: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedProblemBankPage {
    release_id: String,
    bank_slug: String,
    rows: Vec<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopProblemBankPage {
    pub(crate) release_id: String,
    pub(crate) bank_slug: String,
    pub(crate) cursor: String,
    pub(crate) next_cursor: Option<String>,
    pub(crate) items: Vec<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopProblemDetail {
    pub(crate) release_id: String,
    pub(crate) bank_slug: String,
    pub(crate) problem: serde_json::Value,
}

struct PageLoadContext {
    root: PathBuf,
    manifest_url: String,
    active: ActiveRelease,
}

enum DownloadStart {
    Started(PageLoadContext),
    Existing(DesktopProblemBankDownloadState),
}

#[derive(Clone, Debug, Deserialize)]
struct CachedProblemLookup {
    #[serde(rename = "releaseId")]
    release_id: String,
    prefix: String,
    rows: HashMap<String, CachedProblemLookupEntry>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedProblemLookupEntry {
    bank_slug: String,
    dataset_slug: String,
    shard_url: String,
    shard_id: String,
    line: usize,
}

impl ProblemBankCacheRuntime {
    pub(crate) fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(root.join("releases"))
            .and_then(|_| fs::create_dir_all(root.join("staging")))
            .and_then(|_| fs::create_dir_all(root.join("downloads")))
            .map_err(|error| format!("Failed to initialize problem bank cache: {error}"))?;
        let manifest_url = configured_manifest_url();
        let active = load_active_release(&root)?;
        let mut state =
            load_state(&root).unwrap_or_else(|| initial_state(manifest_url.clone(), &root));
        state.configured = manifest_url.is_some();
        state.manifest_url = manifest_url.clone();
        state.cache_directory = root.to_string_lossy().into_owned();
        if let Some(active) = active {
            state.active_release_id = Some(active.release_id);
            state.active_channel = Some(active.channel);
            state.activated_at = Some(active.activated_at);
            state.cached_bytes = directory_size(&root.join("releases"));
            if matches!(state.status.as_str(), "checking" | "syncing" | "error") {
                state.status = "ready".to_string();
                state.error = None;
                state.error_code = None;
            }
        } else if state.configured && matches!(state.status.as_str(), "checking" | "syncing") {
            state.status = "idle".to_string();
        }
        let mut downloads = load_download_states(&root)?;
        for download in downloads.values_mut() {
            if download.status == "downloading" {
                download.status = "paused".to_string();
                download.updated_at = now_iso();
                persist_download_state(&root, download)?;
            }
        }
        Ok(Self {
            root,
            manifest_url,
            operation_in_progress: false,
            active_loads: 0,
            active_downloads: HashSet::new(),
            downloads,
            state,
        })
    }
}

pub(crate) fn cache_state(state: &DesktopState) -> Result<DesktopProblemBankCacheState, String> {
    state
        .problem_bank_cache
        .lock()
        .map_err(|error| error.to_string())
        .map(|runtime| runtime.state.clone())
}

pub(crate) fn catalog(state: &DesktopState) -> Result<Option<DesktopProblemBankCatalog>, String> {
    let runtime = state
        .problem_bank_cache
        .lock()
        .map_err(|error| error.to_string())?;
    load_active_catalog(&runtime.root, runtime.manifest_url.as_deref())
}

pub(crate) fn download_states(
    state: &DesktopState,
) -> Result<Vec<DesktopProblemBankDownloadState>, String> {
    let runtime = state
        .problem_bank_cache
        .lock()
        .map_err(|error| error.to_string())?;
    let mut states = runtime.downloads.values().cloned().collect::<Vec<_>>();
    states.sort_by(|left, right| left.bank_slug.cmp(&right.bank_slug));
    Ok(states)
}

pub(crate) fn cache_directory(state: &DesktopState) -> Result<PathBuf, String> {
    state
        .problem_bank_cache
        .lock()
        .map_err(|error| error.to_string())
        .map(|runtime| runtime.root.clone())
}

pub(crate) fn clear_cache(app: &AppHandle) -> Result<DesktopProblemBankCacheState, String> {
    let state = app
        .try_state::<DesktopState>()
        .ok_or_else(|| "Desktop state is not initialized.".to_string())?;
    let mut runtime = state
        .problem_bank_cache
        .lock()
        .map_err(|error| error.to_string())?;
    if runtime.operation_in_progress || runtime.active_loads > 0 {
        return Err(
            "Problem bank cache is busy. Try again after the current operation finishes."
                .to_string(),
        );
    }
    let next = clear_cache_root(&runtime.root, runtime.manifest_url.clone())?;
    runtime.state = next.clone();
    runtime.downloads.clear();
    runtime.active_downloads.clear();
    drop(runtime);
    if let Err(error) = emit_state(app, &next) {
        log::warn!(target: "geochat::problem_bank", "Failed to emit cleared cache state: {error}");
    }
    Ok(next)
}

pub(crate) async fn load_page(
    app: AppHandle,
    bank_slug: String,
    cursor: Option<String>,
) -> Result<DesktopProblemBankPage, String> {
    let context = begin_cache_read(&app)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        load_problem_bank_page(&context, &bank_slug, cursor.as_deref())
    })
    .await;
    finish_cache_read(&app);
    let result =
        result.map_err(|error| format!("unknown: problem-bank page task failed: {error}"))?;
    if result.is_ok() {
        refresh_lazy_cache_state(&app);
    }
    result
}

pub(crate) async fn load_detail(
    app: AppHandle,
    bank_slug: String,
    problem_id: String,
) -> Result<DesktopProblemDetail, String> {
    let context = begin_cache_read(&app)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        load_problem_detail(&context, &bank_slug, &problem_id)
    })
    .await;
    finish_cache_read(&app);
    let result = result.map_err(|error| format!("unknown: problem detail task failed: {error}"))?;
    if result.is_ok() {
        refresh_lazy_cache_state(&app);
    }
    result
}

pub(crate) async fn download_bank(
    app: AppHandle,
    bank_slug: String,
) -> Result<DesktopProblemBankDownloadState, String> {
    let context = match begin_download(&app, &bank_slug)? {
        DownloadStart::Existing(state) => return Ok(state),
        DownloadStart::Started(context) => context,
    };
    let worker_app = app.clone();
    let worker_slug = bank_slug.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        download_problem_bank_files(&context, &worker_slug, |progress| {
            update_download_state(&worker_app, &worker_slug, |state| {
                state.phase = progress.phase;
                state.completed_items = progress.completed_items;
                state.total_items = progress.total_items;
                state.downloaded_bytes = progress.downloaded_bytes;
                state.total_bytes = progress.total_bytes;
                state.updated_at = now_iso();
                state.error = None;
            })?;
            Ok(())
        })
    })
    .await;

    match result {
        Ok(Ok(())) => finish_download(&app, &bank_slug, None),
        Ok(Err(error)) => finish_download(&app, &bank_slug, Some(error)),
        Err(error) => finish_download(
            &app,
            &bank_slug,
            Some(format!(
                "unknown: problem-bank download task failed: {error}"
            )),
        ),
    }
}

fn begin_download(app: &AppHandle, bank_slug: &str) -> Result<DownloadStart, String> {
    validate_bank_slug(bank_slug)?;
    let state = app
        .try_state::<DesktopState>()
        .ok_or_else(|| "Desktop state is not initialized.".to_string())?;
    let mut runtime = state
        .problem_bank_cache
        .lock()
        .map_err(|error| error.to_string())?;
    let active = load_active_release(&runtime.root)?.ok_or_else(|| {
        "integrity_error: no active problem-bank release is installed.".to_string()
    })?;
    let manifest_url = runtime
        .manifest_url
        .clone()
        .ok_or_else(|| "Problem bank manifest URL is not configured.".to_string())?;
    let catalog = load_active_catalog(&runtime.root, Some(&manifest_url))?
        .ok_or_else(|| "integrity_error: active problem-bank catalog is missing.".to_string())?;
    if !catalog.banks.iter().any(|bank| bank.bank_slug == bank_slug) {
        return Err(
            "integrity_error: requested problem bank is not in the active catalog.".to_string(),
        );
    }
    if runtime.active_downloads.contains(bank_slug) {
        let existing = runtime.downloads.get(bank_slug).cloned().ok_or_else(|| {
            "integrity_error: active problem-bank download state is missing.".to_string()
        })?;
        return Ok(DownloadStart::Existing(existing));
    }
    if let Some(existing) = runtime.downloads.get(bank_slug) {
        if existing.release_id == active.release_id && existing.status == "complete" {
            return Ok(DownloadStart::Existing(existing.clone()));
        }
    }
    let next = DesktopProblemBankDownloadState {
        bank_slug: bank_slug.to_string(),
        release_id: active.release_id.clone(),
        status: "downloading".to_string(),
        phase: "preparing".to_string(),
        completed_items: 0,
        total_items: 0,
        downloaded_bytes: 0,
        total_bytes: 0,
        updated_at: now_iso(),
        error: None,
    };
    persist_download_state(&runtime.root, &next)?;
    runtime
        .downloads
        .insert(bank_slug.to_string(), next.clone());
    runtime.active_downloads.insert(bank_slug.to_string());
    runtime.active_loads += 1;
    let context = PageLoadContext {
        root: runtime.root.clone(),
        manifest_url,
        active,
    };
    drop(runtime);
    if let Err(error) = emit_download_state(app, &next) {
        log::warn!(target: "geochat::problem_bank", "Failed to emit started download state: {error}");
    }
    Ok(DownloadStart::Started(context))
}

fn finish_download(
    app: &AppHandle,
    bank_slug: &str,
    error: Option<String>,
) -> Result<DesktopProblemBankDownloadState, String> {
    if let Some(ref error) = error {
        log::error!(target: "geochat::problem_bank", "Problem bank download failed for {bank_slug}: {error}");
    }
    let desktop_state = app
        .try_state::<DesktopState>()
        .ok_or_else(|| "Desktop state is not initialized.".to_string())?;
    let mut runtime = desktop_state
        .problem_bank_cache
        .lock()
        .map_err(|lock_error| lock_error.to_string())?;
    let next = {
        let state = runtime.downloads.get_mut(bank_slug).ok_or_else(|| {
            "integrity_error: problem-bank download state is missing.".to_string()
        })?;
        state.status = if error.is_some() { "error" } else { "complete" }.to_string();
        if error.is_none() {
            state.phase = "complete".to_string();
        }
        state.updated_at = now_iso();
        state.error = error;
        state.clone()
    };
    runtime.active_downloads.remove(bank_slug);
    runtime.active_loads = runtime.active_loads.saturating_sub(1);
    runtime.state.cached_bytes = directory_size(&runtime.root.join("releases"));
    let cache_state = runtime.state.clone();
    let download_persist_result = persist_download_state(&runtime.root, &next);
    let cache_persist_result = persist_state(&runtime.root, &cache_state);
    drop(runtime);
    download_persist_result?;
    cache_persist_result?;
    if let Err(emit_error) = emit_download_state(app, &next) {
        log::warn!(target: "geochat::problem_bank", "Failed to emit finished download state: {emit_error}");
    }
    if let Err(emit_error) = emit_state(app, &cache_state) {
        log::warn!(target: "geochat::problem_bank", "Failed to emit cache size after download: {emit_error}");
    }
    if next.status == "error" {
        return Err(next
            .error
            .clone()
            .unwrap_or_else(|| "Problem bank download failed.".to_string()));
    }
    Ok(next)
}

fn update_download_state(
    app: &AppHandle,
    bank_slug: &str,
    update: impl FnOnce(&mut DesktopProblemBankDownloadState),
) -> Result<DesktopProblemBankDownloadState, String> {
    let desktop_state = app
        .try_state::<DesktopState>()
        .ok_or_else(|| "Desktop state is not initialized.".to_string())?;
    let mut runtime = desktop_state
        .problem_bank_cache
        .lock()
        .map_err(|error| error.to_string())?;
    let state = runtime
        .downloads
        .get_mut(bank_slug)
        .ok_or_else(|| "integrity_error: problem-bank download state is missing.".to_string())?;
    update(state);
    let next = state.clone();
    persist_download_state(&runtime.root, &next)?;
    drop(runtime);
    if let Err(error) = emit_download_state(app, &next) {
        log::warn!(target: "geochat::problem_bank", "Failed to emit download progress: {error}");
    }
    Ok(next)
}

fn emit_download_state(
    app: &AppHandle,
    state: &DesktopProblemBankDownloadState,
) -> Result<(), String> {
    app.emit(DOWNLOAD_STATE_EVENT, state.clone())
        .map_err(|error| error.to_string())
}

fn refresh_lazy_cache_state(app: &AppHandle) {
    let Some(state) = app.try_state::<DesktopState>() else {
        return;
    };
    let Ok(mut runtime) = state.problem_bank_cache.lock() else {
        return;
    };
    let cached_bytes = directory_size(&runtime.root.join("releases"));
    if cached_bytes == runtime.state.cached_bytes {
        return;
    }
    runtime.state.cached_bytes = cached_bytes;
    let next = runtime.state.clone();
    if let Err(error) = persist_state(&runtime.root, &next) {
        log::warn!(target: "geochat::problem_bank", "Failed to persist lazy cache size: {error}");
    }
    drop(runtime);
    if let Err(error) = emit_state(app, &next) {
        log::warn!(target: "geochat::problem_bank", "Failed to emit lazy cache size: {error}");
    }
}

fn begin_cache_read(app: &AppHandle) -> Result<PageLoadContext, String> {
    let state = app
        .try_state::<DesktopState>()
        .ok_or_else(|| "Desktop state is not initialized.".to_string())?;
    let mut runtime = state
        .problem_bank_cache
        .lock()
        .map_err(|error| error.to_string())?;
    let active = load_active_release(&runtime.root)?.ok_or_else(|| {
        "integrity_error: no active problem-bank release is installed.".to_string()
    })?;
    let manifest_url = runtime
        .manifest_url
        .clone()
        .ok_or_else(|| "Problem bank manifest URL is not configured.".to_string())?;
    runtime.active_loads += 1;
    Ok(PageLoadContext {
        root: runtime.root.clone(),
        manifest_url,
        active,
    })
}

fn finish_cache_read(app: &AppHandle) {
    let Some(state) = app.try_state::<DesktopState>() else {
        return;
    };
    let Ok(mut runtime) = state.problem_bank_cache.lock() else {
        return;
    };
    runtime.active_loads = runtime.active_loads.saturating_sub(1);
}

pub(crate) async fn check_for_update(
    app: AppHandle,
) -> Result<DesktopProblemBankCacheState, String> {
    let (root, manifest_url) = match begin_operation(&app, "checking")? {
        OperationStart::Started { root, manifest_url } => (root, manifest_url),
        OperationStart::InProgress(state) => return Ok(*state),
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        check_remote_release(&manifest_url).map(|checked| (root, checked))
    })
    .await;

    match result {
        Ok(Ok((_root, checked))) => finish_check(&app, &checked),
        Ok(Err(error)) => finish_error(&app, error),
        Err(error) => finish_error(
            &app,
            format!("unknown: problem bank check task failed: {error}"),
        ),
    }
}

pub(crate) async fn sync_metadata(app: AppHandle) -> Result<DesktopProblemBankCacheState, String> {
    let (root, manifest_url) = match begin_operation(&app, "syncing")? {
        OperationStart::Started { root, manifest_url } => (root, manifest_url),
        OperationStart::InProgress(state) => return Ok(*state),
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        let checked = check_remote_release(&manifest_url)?;
        let core_artifacts = fetch_core_artifacts(&manifest_url, &checked)?;
        install_checked_release(&root, &checked, &core_artifacts, &now_iso())?;
        Ok::<_, String>((root, checked))
    })
    .await;

    match result {
        Ok(Ok((root, checked))) => finish_sync(&app, &root, &checked),
        Ok(Err(error)) => finish_error(&app, error),
        Err(error) => finish_error(
            &app,
            format!("unknown: problem bank sync task failed: {error}"),
        ),
    }
}

fn begin_operation(app: &AppHandle, status: &str) -> Result<OperationStart, String> {
    let state = app
        .try_state::<DesktopState>()
        .ok_or_else(|| "Desktop state is not initialized.".to_string())?;
    let mut runtime = state
        .problem_bank_cache
        .lock()
        .map_err(|error| error.to_string())?;
    if runtime.operation_in_progress {
        return Ok(OperationStart::InProgress(Box::new(runtime.state.clone())));
    }
    let manifest_url = runtime
        .manifest_url
        .clone()
        .ok_or_else(|| "Problem bank manifest URL is not configured.".to_string())?;
    runtime.state.status = status.to_string();
    runtime.state.error = None;
    runtime.state.error_code = None;
    let root = runtime.root.clone();
    let next = runtime.state.clone();
    persist_state(&root, &next)?;
    runtime.operation_in_progress = true;
    drop(runtime);
    if let Err(error) = emit_state(app, &next) {
        log::warn!(target: "geochat::problem_bank", "Failed to emit problem bank state: {error}");
    }
    Ok(OperationStart::Started { root, manifest_url })
}

fn finish_check(
    app: &AppHandle,
    checked: &CheckedRelease,
) -> Result<DesktopProblemBankCacheState, String> {
    update_runtime(app, |runtime| {
        runtime.operation_in_progress = false;
        let update_available =
            runtime.state.active_release_id.as_deref() != Some(checked.release.id.as_str());
        runtime.state.status = if update_available {
            "available"
        } else {
            "ready"
        }
        .to_string();
        runtime.state.available_release_id = Some(checked.release.id.clone());
        runtime.state.available_channel = Some(checked.release.channel.clone());
        runtime.state.update_available = update_available;
        runtime.state.checked_at = Some(now_iso());
        runtime.state.error = None;
        runtime.state.error_code = None;
    })
}

fn finish_sync(
    app: &AppHandle,
    root: &Path,
    checked: &CheckedRelease,
) -> Result<DesktopProblemBankCacheState, String> {
    update_runtime(app, |runtime| {
        runtime.operation_in_progress = false;
        runtime.state.status = "ready".to_string();
        runtime.state.active_release_id = Some(checked.release.id.clone());
        runtime.state.available_release_id = Some(checked.release.id.clone());
        runtime.state.active_channel = Some(checked.release.channel.clone());
        runtime.state.available_channel = Some(checked.release.channel.clone());
        runtime.state.update_available = false;
        runtime.state.checked_at = Some(now_iso());
        runtime.state.activated_at = load_active_release(root)
            .ok()
            .flatten()
            .map(|active| active.activated_at);
        runtime.state.cached_bytes = directory_size(&root.join("releases"));
        runtime.state.error = None;
        runtime.state.error_code = None;
    })
}

fn finish_error(app: &AppHandle, error: String) -> Result<DesktopProblemBankCacheState, String> {
    log::error!(target: "geochat::problem_bank", "Problem bank cache operation failed: {error}");
    update_runtime(app, |runtime| {
        runtime.operation_in_progress = false;
        runtime.state.status = "error".to_string();
        runtime.state.error_code = Some(error_code(&error).to_string());
        runtime.state.error = Some(error);
        runtime.state.checked_at = Some(now_iso());
    })
}

fn update_runtime(
    app: &AppHandle,
    update: impl FnOnce(&mut ProblemBankCacheRuntime),
) -> Result<DesktopProblemBankCacheState, String> {
    let state = app
        .try_state::<DesktopState>()
        .ok_or_else(|| "Desktop state is not initialized.".to_string())?;
    let mut runtime = state
        .problem_bank_cache
        .lock()
        .map_err(|error| error.to_string())?;
    update(&mut runtime);
    let next = runtime.state.clone();
    persist_state(&runtime.root, &next)?;
    drop(runtime);
    if let Err(error) = emit_state(app, &next) {
        log::warn!(target: "geochat::problem_bank", "Failed to emit problem bank state: {error}");
    }
    Ok(next)
}

fn emit_state(app: &AppHandle, state: &DesktopProblemBankCacheState) -> Result<(), String> {
    app.emit(STATE_EVENT, state.clone())
        .map_err(|error| error.to_string())
}

fn check_remote_release(manifest_url: &str) -> Result<CheckedRelease, String> {
    let root_manifest_bytes = fetch_with_retry(manifest_url)?;
    let root_manifest = parse_root_manifest(&root_manifest_bytes)?;
    let release = root_manifest
        .releases
        .into_iter()
        .find(|release| release.id == root_manifest.current_release_id)
        .ok_or_else(|| {
            "manifest_invalid: currentReleaseId has no matching release entry.".to_string()
        })?;
    let release_url = resolve_url(manifest_url, &release.manifest_url)?;
    let release_manifest_bytes = fetch_with_retry(release_url.as_str())?;
    let release_manifest = parse_release_manifest(&release_manifest_bytes, &release)?;
    Ok(CheckedRelease {
        root_manifest_bytes,
        release_manifest_bytes,
        release_manifest,
        release,
    })
}

fn fetch_core_artifacts(
    manifest_url: &str,
    checked: &CheckedRelease,
) -> Result<CoreArtifacts, String> {
    let problem_bank_index_url = resolve_url(
        manifest_url,
        &checked.release_manifest.problem_banks.index_url,
    )?;
    let facets_url = resolve_url(manifest_url, &checked.release_manifest.indexes.facets_url)?;
    let problem_bank_index_bytes = fetch_bounded_with_retry(
        problem_bank_index_url.as_str(),
        MAX_CORE_INDEX_BYTES,
        "core index",
    )?;
    let facets_bytes =
        fetch_bounded_with_retry(facets_url.as_str(), MAX_CORE_INDEX_BYTES, "facets index")?;
    parse_problem_bank_index(&problem_bank_index_bytes, &checked.release.id)?;
    parse_facets_index(&facets_bytes, &checked.release.id)?;
    Ok(CoreArtifacts {
        problem_bank_index_bytes,
        facets_bytes,
    })
}

fn fetch_with_retry(url: &str) -> Result<Vec<u8>, String> {
    fetch_bounded_with_retry(url, MAX_MANIFEST_BYTES, "manifest")
}

fn fetch_bounded_with_retry(url: &str, max_bytes: u64, label: &str) -> Result<Vec<u8>, String> {
    let client = Client::builder()
        .user_agent("GeoChat-Desktop/problem-bank-cache")
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("network_unavailable: failed to create HTTP client: {error}"))?;
    let mut last_error = None;
    for (index, delay) in [0_u64, 250, 750, 1_500].into_iter().enumerate() {
        if delay > 0 {
            thread::sleep(Duration::from_millis(delay));
        }
        match client.get(url).send() {
            Ok(response) if response.status().is_success() => {
                if response
                    .content_length()
                    .is_some_and(|size| size > max_bytes)
                {
                    return Err(format!(
                        "integrity_error: {label} response from {url} exceeds {max_bytes} bytes"
                    ));
                }
                let mut bytes = Vec::new();
                response
                    .take(max_bytes + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|error| {
                        format!("network_unavailable: failed to read {url}: {error}")
                    })?;
                if bytes.len() as u64 > max_bytes {
                    return Err(format!(
                        "integrity_error: {label} response from {url} exceeds {max_bytes} bytes"
                    ));
                }
                return Ok(bytes);
            }
            Ok(response) if should_retry(response.status()) && index < 3 => {
                last_error = Some(format!("HTTP {}", response.status()));
            }
            Ok(response) => {
                return Err(format!(
                    "network_unavailable: request to {url} failed with HTTP {}",
                    response.status()
                ));
            }
            Err(error) if index < 3 => last_error = Some(error.to_string()),
            Err(error) => {
                return Err(format!(
                    "network_unavailable: request to {url} failed: {error}"
                ));
            }
        }
    }
    Err(format!(
        "network_unavailable: request to {url} failed after retries: {}",
        last_error.unwrap_or_else(|| "unknown network error".to_string())
    ))
}

fn should_retry(status: StatusCode) -> bool {
    status.is_server_error()
        || status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::TOO_MANY_REQUESTS
}

fn parse_root_manifest(bytes: &[u8]) -> Result<RootManifest, String> {
    let manifest: RootManifest = serde_json::from_slice(bytes)
        .map_err(|error| format!("manifest_invalid: root manifest is invalid JSON: {error}"))?;
    validate_schema(&manifest.schema_version)?;
    if manifest.current_release_id.trim().is_empty() {
        return Err("manifest_invalid: currentReleaseId is empty.".to_string());
    }
    validate_release_id(&manifest.current_release_id)?;
    Ok(manifest)
}

fn parse_release_manifest(
    bytes: &[u8],
    pointer: &ReleasePointer,
) -> Result<ReleaseManifest, String> {
    let manifest: ReleaseManifest = serde_json::from_slice(bytes)
        .map_err(|error| format!("manifest_invalid: release manifest is invalid JSON: {error}"))?;
    validate_schema(&manifest.schema_version)?;
    if manifest.release_id != pointer.id {
        return Err(
            "integrity_error: release manifest id does not match root pointer.".to_string(),
        );
    }
    if manifest.channel != pointer.channel {
        return Err(
            "integrity_error: release manifest channel does not match root pointer.".to_string(),
        );
    }
    if manifest.problem_banks.index_url.trim().is_empty()
        || manifest.indexes.facets_url.trim().is_empty()
        || manifest
            .indexes
            .problem_id_lookup
            .base_url
            .trim()
            .is_empty()
        || manifest.indexes.problem_id_lookup.prefix_length == 0
        || manifest.indexes.problem_id_lookup.prefix_length > 16
    {
        return Err("manifest_invalid: release manifest is missing core index URLs.".to_string());
    }
    Ok(manifest)
}

fn parse_problem_bank_index(
    bytes: &[u8],
    expected_release_id: &str,
) -> Result<CachedProblemBankIndex, String> {
    let index: CachedProblemBankIndex = serde_json::from_slice(bytes)
        .map_err(|error| format!("integrity_error: problem-bank index is invalid JSON: {error}"))?;
    if index.release_id != expected_release_id {
        return Err("integrity_error: problem-bank index release id does not match.".to_string());
    }
    let mut slugs = HashSet::new();
    for bank in &index.banks {
        if bank.bank_id.trim().is_empty()
            || bank.bank_slug.trim().is_empty()
            || bank.title.trim().is_empty()
            || !slugs.insert(bank.bank_slug.as_str())
        {
            return Err(
                "integrity_error: problem-bank index contains an invalid or duplicate bank."
                    .to_string(),
            );
        }
    }
    Ok(index)
}

fn parse_facets_index(bytes: &[u8], expected_release_id: &str) -> Result<(), String> {
    let index: CachedFacetsIndex = serde_json::from_slice(bytes)
        .map_err(|error| format!("integrity_error: facets index is invalid JSON: {error}"))?;
    if index.release_id != expected_release_id {
        return Err("integrity_error: facets index release id does not match.".to_string());
    }
    Ok(())
}

fn validate_schema(schema_version: &str) -> Result<(), String> {
    if schema_version != SUPPORTED_SCHEMA_VERSION {
        return Err(format!(
            "schema_unsupported: expected {SUPPORTED_SCHEMA_VERSION}, received {schema_version}."
        ));
    }
    Ok(())
}

fn resolve_url(base: &str, candidate: &str) -> Result<Url, String> {
    let base = Url::parse(base)
        .map_err(|error| format!("manifest_invalid: invalid root manifest URL: {error}"))?;
    if let Ok(absolute) = Url::parse(candidate) {
        if matches!(absolute.scheme(), "http" | "https") && absolute.origin() == base.origin() {
            return Ok(absolute);
        }
        return Err(
            "manifest_invalid: release manifest URL must use the root manifest origin.".to_string(),
        );
    }
    let candidate = candidate.trim_start_matches('/');
    if let Some(public_path) = candidate.strip_prefix("problem-bank/") {
        if base.path().starts_with("/problem-bank/") {
            return base
                .join(&format!("/{candidate}"))
                .map_err(|error| format!("manifest_invalid: invalid release manifest URL: {error}"));
        }
        // Production manifests store bucket-root-relative R2 keys. The dedicated
        // public origin already represents the problem-bank namespace, so avoid
        // exposing that private storage prefix in the canonical URL.
        return base
            .join(&format!("/{public_path}"))
            .map_err(|error| format!("manifest_invalid: invalid release manifest URL: {error}"));
    }

    // Ordinary relative references follow URL semantics and stay alongside the
    // root manifest (for example /v1/manifest.json -> /v1/releases/...).
    base.join(candidate)
        .map_err(|error| format!("manifest_invalid: invalid release manifest URL: {error}"))
}

fn install_checked_release(
    root: &Path,
    checked: &CheckedRelease,
    core_artifacts: &CoreArtifacts,
    activated_at: &str,
) -> Result<(), String> {
    let staging = root
        .join("staging")
        .join(format!("{}-{}", checked.release.id, Uuid::new_v4()));
    fs::create_dir_all(&staging).map_err(|error| {
        format!("permission_denied: failed to create staging directory: {error}")
    })?;
    let result = (|| {
        write_synced(
            &staging.join("root-manifest.json"),
            &checked.root_manifest_bytes,
        )?;
        write_synced(
            &staging.join("manifest.json"),
            &checked.release_manifest_bytes,
        )?;
        fs::create_dir_all(staging.join("problem-banks"))
            .and_then(|_| fs::create_dir_all(staging.join("index")))
            .map_err(|error| {
                format!("permission_denied: failed to create core index directories: {error}")
            })?;
        write_synced(
            &staging.join("problem-banks/index.json"),
            &core_artifacts.problem_bank_index_bytes,
        )?;
        write_synced(
            &staging.join("index/facets.json"),
            &core_artifacts.facets_bytes,
        )?;
        atomic_write_json(
            &staging.join("release.json"),
            &InstalledRelease {
                schema_version: SUPPORTED_SCHEMA_VERSION.to_string(),
                release_id: checked.release.id.clone(),
                channel: checked.release.channel.clone(),
                root_manifest_sha256: sha256_hex(&checked.root_manifest_bytes),
                release_manifest_sha256: sha256_hex(&checked.release_manifest_bytes),
                installed_at: activated_at.to_string(),
            },
        )?;

        // Re-parse bytes from disk before activation so a partial/corrupt write
        // can never replace the currently active release.
        let persisted_release = fs::read(staging.join("manifest.json"))
            .map_err(|error| format!("integrity_error: failed to read staged manifest: {error}"))?;
        parse_release_manifest(&persisted_release, &checked.release)?;
        let persisted_catalog =
            fs::read(staging.join("problem-banks/index.json")).map_err(|error| {
                format!("integrity_error: failed to read staged problem-bank index: {error}")
            })?;
        parse_problem_bank_index(&persisted_catalog, &checked.release.id)?;
        let persisted_facets = fs::read(staging.join("index/facets.json")).map_err(|error| {
            format!("integrity_error: failed to read staged facets index: {error}")
        })?;
        parse_facets_index(&persisted_facets, &checked.release.id)?;

        let release_dir = root.join("releases").join(&checked.release.id);
        let existing_is_complete = release_dir.exists()
            && fs::read(release_dir.join("manifest.json"))
                .ok()
                .and_then(|bytes| parse_release_manifest(&bytes, &checked.release).ok())
                .is_some()
            && fs::read(release_dir.join("problem-banks/index.json"))
                .ok()
                .and_then(|bytes| parse_problem_bank_index(&bytes, &checked.release.id).ok())
                .is_some()
            && fs::read(release_dir.join("index/facets.json"))
                .ok()
                .is_some_and(|bytes| parse_facets_index(&bytes, &checked.release.id).is_ok());
        if existing_is_complete {
            fs::remove_dir_all(&staging).map_err(|error| {
                format!("permission_denied: failed to remove duplicate staging directory: {error}")
            })?;
        } else {
            replace_release_directory(&staging, &release_dir)?;
        }

        let active = ActiveRelease {
            release_id: checked.release.id.clone(),
            channel: checked.release.channel.clone(),
            activated_at: activated_at.to_string(),
        };
        atomic_write_json(&root.join("active.json"), &active)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

fn replace_release_directory(staging: &Path, destination: &Path) -> Result<(), String> {
    let backup = destination.with_extension(format!("previous-{}", Uuid::new_v4()));
    let had_destination = destination.exists();
    if had_destination {
        fs::rename(destination, &backup).map_err(|error| {
            format!("permission_denied: failed to stage previous release: {error}")
        })?;
    }
    if let Err(error) = fs::rename(staging, destination) {
        if had_destination {
            let _ = fs::rename(&backup, destination);
        }
        return Err(format!(
            "permission_denied: failed to activate release directory: {error}"
        ));
    }
    if had_destination {
        fs::remove_dir_all(&backup).map_err(|error| {
            format!("permission_denied: failed to remove previous release: {error}")
        })?;
    }
    Ok(())
}

fn load_active_catalog(
    root: &Path,
    manifest_url: Option<&str>,
) -> Result<Option<DesktopProblemBankCatalog>, String> {
    let Some(active) = load_active_release(root)? else {
        return Ok(None);
    };
    let bytes = fs::read(
        root.join("releases")
            .join(&active.release_id)
            .join("problem-banks/index.json"),
    )
    .map_err(|error| {
        format!("integrity_error: failed to read cached problem-bank index: {error}")
    })?;
    let index = parse_problem_bank_index(&bytes, &active.release_id)?;
    let cloud_base_url = manifest_url
        .and_then(|value| Url::parse(value).ok())
        .map(|value| value.origin().ascii_serialization())
        .unwrap_or_default();
    Ok(Some(DesktopProblemBankCatalog {
        release_id: active.release_id,
        channel: active.channel,
        cloud_base_url,
        banks: index
            .banks
            .into_iter()
            .map(|bank| DesktopProblemBankSummary {
                bank_id: bank.bank_id,
                bank_slug: bank.bank_slug,
                title: bank.title,
                description: bank.description,
                kind: bank.kind,
                problem_count: bank.counts.records.unwrap_or(0),
                dataset_id: bank.dataset_id,
                reuse_policy: match bank.commercial_use.as_deref() {
                    Some("allowed") => "allowed",
                    Some("restricted") => "restricted",
                    _ => "unknown",
                }
                .to_string(),
            })
            .collect(),
    }))
}

struct DownloadProgress {
    phase: String,
    completed_items: u64,
    total_items: u64,
    downloaded_bytes: u64,
    total_bytes: u64,
}

struct ArtifactExpectation<'a> {
    max_bytes: u64,
    label: &'a str,
    byte_size: Option<u64>,
    sha256: Option<&'a str>,
}

fn download_problem_bank_files(
    context: &PageLoadContext,
    bank_slug: &str,
    mut report: impl FnMut(DownloadProgress) -> Result<(), String>,
) -> Result<(), String> {
    validate_bank_slug(bank_slug)?;
    let release_dir = context
        .root
        .join("releases")
        .join(&context.active.release_id);
    let catalog_bytes =
        fs::read(release_dir.join("problem-banks/index.json")).map_err(|error| {
            format!("integrity_error: failed to read cached problem-bank index: {error}")
        })?;
    let catalog = parse_problem_bank_index(&catalog_bytes, &context.active.release_id)?;
    let bank = catalog
        .banks
        .into_iter()
        .find(|bank| bank.bank_slug == bank_slug)
        .ok_or_else(|| {
            "integrity_error: requested problem bank is not in the active catalog.".to_string()
        })?;
    let release_manifest_bytes = fs::read(release_dir.join("manifest.json")).map_err(|error| {
        format!("integrity_error: failed to read cached release manifest: {error}")
    })?;
    let release_manifest: ReleaseManifest = serde_json::from_slice(&release_manifest_bytes)
        .map_err(|error| format!("integrity_error: cached release manifest is invalid: {error}"))?;
    if release_manifest.release_id != context.active.release_id {
        return Err(
            "integrity_error: cached release manifest identity does not match.".to_string(),
        );
    }
    let dataset = release_manifest
        .datasets
        .iter()
        .find(|dataset| {
            dataset.dataset_slug == bank_slug
                || bank.dataset_id.as_deref() == Some(dataset.dataset_id.as_str())
        })
        .ok_or_else(|| {
            "manifest_invalid: release manifest has no dataset for the requested problem bank."
                .to_string()
        })?;
    let dataset_slug = dataset.dataset_slug.clone();

    let bank_index_path = release_dir
        .join("problem-banks")
        .join(bank_slug)
        .join("index.json");
    let bank_index_bytes = load_or_download_resumable(
        &context.manifest_url,
        &bank.index_url,
        &bank_index_path,
        ArtifactExpectation {
            max_bytes: MAX_CORE_INDEX_BYTES,
            label: "problem-bank detail index",
            byte_size: None,
            sha256: None,
        },
        |bytes| {
            parse_problem_bank_detail_index(bytes, &context.active.release_id, bank_slug)
                .map(|_| ())
        },
    )?;
    let bank_index =
        parse_problem_bank_detail_index(&bank_index_bytes, &context.active.release_id, bank_slug)?;

    let dataset_manifest_path = release_dir
        .join("datasets")
        .join(&dataset_slug)
        .join("manifest.json");
    let dataset_manifest_bytes = load_or_download_resumable(
        &context.manifest_url,
        &dataset.manifest_url,
        &dataset_manifest_path,
        ArtifactExpectation {
            max_bytes: MAX_CORE_INDEX_BYTES,
            label: "dataset manifest",
            byte_size: None,
            sha256: None,
        },
        |bytes| {
            parse_dataset_manifest(bytes, &context.active.release_id, &dataset_slug).map(|_| ())
        },
    )?;
    let dataset_manifest = parse_dataset_manifest(
        &dataset_manifest_bytes,
        &context.active.release_id,
        &dataset_slug,
    )?;
    let total_items = (bank_index.pages.len() + dataset_manifest.record_shards.len()) as u64;
    let total_bytes = bank_index
        .pages
        .iter()
        .map(|page| page.byte_size)
        .chain(
            dataset_manifest
                .record_shards
                .iter()
                .map(|shard| shard.byte_size),
        )
        .sum();
    let mut completed_items = 0_u64;
    let mut downloaded_bytes = 0_u64;
    report(DownloadProgress {
        phase: "pages".to_string(),
        completed_items,
        total_items,
        downloaded_bytes,
        total_bytes,
    })?;

    for page in &bank_index.pages {
        let page_path = release_dir
            .join("problem-banks")
            .join(bank_slug)
            .join("problems")
            .join(format!("{}.json", page.id));
        load_or_download_resumable(
            &context.manifest_url,
            &page.url,
            &page_path,
            ArtifactExpectation {
                max_bytes: MAX_CORE_INDEX_BYTES,
                label: "problem-bank page",
                byte_size: Some(page.byte_size),
                sha256: Some(&page.sha256),
            },
            |bytes| {
                parse_problem_bank_page(bytes, &context.active.release_id, bank_slug, page.rows)
                    .map(|_| ())
            },
        )?;
        completed_items += 1;
        downloaded_bytes += page.byte_size;
        report(DownloadProgress {
            phase: "pages".to_string(),
            completed_items,
            total_items,
            downloaded_bytes,
            total_bytes,
        })?;
    }

    for shard in &dataset_manifest.record_shards {
        let shard_path = release_dir
            .join("records")
            .join(&dataset_slug)
            .join(format!("{}.jsonl", shard.id));
        load_or_download_resumable(
            &context.manifest_url,
            &shard.url,
            &shard_path,
            ArtifactExpectation {
                max_bytes: MAX_RECORD_SHARD_BYTES,
                label: "problem record shard",
                byte_size: Some(shard.byte_size),
                sha256: Some(&shard.sha256),
            },
            |bytes| validate_record_shard(bytes, shard.rows),
        )?;
        completed_items += 1;
        downloaded_bytes += shard.byte_size;
        report(DownloadProgress {
            phase: "records".to_string(),
            completed_items,
            total_items,
            downloaded_bytes,
            total_bytes,
        })?;
    }
    Ok(())
}

fn parse_dataset_manifest(
    bytes: &[u8],
    expected_release_id: &str,
    expected_dataset_slug: &str,
) -> Result<CachedDatasetManifest, String> {
    let manifest: CachedDatasetManifest = serde_json::from_slice(bytes)
        .map_err(|error| format!("integrity_error: dataset manifest is invalid JSON: {error}"))?;
    if manifest.release_id != expected_release_id || manifest.dataset_slug != expected_dataset_slug
    {
        return Err("integrity_error: dataset manifest identity does not match.".to_string());
    }
    if manifest.record_shards.iter().any(|shard| {
        shard.id.is_empty()
            || shard.url.is_empty()
            || shard.sha256.len() != 64
            || shard.byte_size == 0
    }) {
        return Err("integrity_error: dataset manifest contains an invalid shard.".to_string());
    }
    Ok(manifest)
}

fn validate_record_shard(bytes: &[u8], expected_rows: usize) -> Result<(), String> {
    let row_count = bytes
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .count();
    if row_count != expected_rows {
        return Err("integrity_error: problem record shard row count does not match.".to_string());
    }
    Ok(())
}

fn load_problem_bank_page(
    context: &PageLoadContext,
    bank_slug: &str,
    cursor: Option<&str>,
) -> Result<DesktopProblemBankPage, String> {
    validate_bank_slug(bank_slug)?;
    let release_dir = context
        .root
        .join("releases")
        .join(&context.active.release_id);
    let catalog_bytes =
        fs::read(release_dir.join("problem-banks/index.json")).map_err(|error| {
            format!("integrity_error: failed to read cached problem-bank index: {error}")
        })?;
    let catalog = parse_problem_bank_index(&catalog_bytes, &context.active.release_id)?;
    let bank = catalog
        .banks
        .into_iter()
        .find(|bank| bank.bank_slug == bank_slug)
        .ok_or_else(|| {
            "integrity_error: requested problem bank is not in the active catalog.".to_string()
        })?;

    let bank_index_path = release_dir
        .join("problem-banks")
        .join(bank_slug)
        .join("index.json");
    let bank_index_bytes = load_or_fetch_artifact(
        &context.manifest_url,
        &bank.index_url,
        &bank_index_path,
        MAX_CORE_INDEX_BYTES,
        "problem-bank detail index",
        None,
        None,
    )?;
    let detail =
        parse_problem_bank_detail_index(&bank_index_bytes, &context.active.release_id, bank_slug)?;
    let page_index = cursor
        .unwrap_or("0")
        .parse::<usize>()
        .map_err(|_| "integrity_error: problem-bank page cursor is invalid.".to_string())?;
    let pointer = detail
        .pages
        .get(page_index)
        .ok_or_else(|| "integrity_error: problem-bank page cursor is out of range.".to_string())?;
    let page_path = release_dir
        .join("problem-banks")
        .join(bank_slug)
        .join("problems")
        .join(format!("{}.json", pointer.id));
    let page_bytes = load_or_fetch_artifact(
        &context.manifest_url,
        &pointer.url,
        &page_path,
        MAX_CORE_INDEX_BYTES,
        "problem-bank page",
        Some(pointer.byte_size),
        Some(&pointer.sha256),
    )?;
    let page = parse_problem_bank_page(
        &page_bytes,
        &context.active.release_id,
        bank_slug,
        pointer.rows,
    )?;
    Ok(DesktopProblemBankPage {
        release_id: page.release_id,
        bank_slug: page.bank_slug,
        cursor: page_index.to_string(),
        next_cursor: (page_index + 1 < detail.pages.len()).then(|| (page_index + 1).to_string()),
        items: page.rows,
    })
}

fn load_problem_detail(
    context: &PageLoadContext,
    bank_slug: &str,
    problem_id: &str,
) -> Result<DesktopProblemDetail, String> {
    validate_bank_slug(bank_slug)?;
    if problem_id.trim().is_empty() || problem_id.len() > 512 {
        return Err("integrity_error: problem id is invalid.".to_string());
    }
    let release_dir = context
        .root
        .join("releases")
        .join(&context.active.release_id);
    let manifest_bytes = fs::read(release_dir.join("manifest.json")).map_err(|error| {
        format!("integrity_error: failed to read cached release manifest: {error}")
    })?;
    let manifest: ReleaseManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("integrity_error: cached release manifest is invalid: {error}"))?;
    if manifest.release_id != context.active.release_id {
        return Err(
            "integrity_error: cached release manifest identity does not match.".to_string(),
        );
    }
    let lookup = &manifest.indexes.problem_id_lookup;
    let normalized_id = source_slug(problem_id);
    let prefix = normalized_id
        .chars()
        .take(lookup.prefix_length)
        .collect::<String>();
    if prefix.is_empty() {
        return Err("integrity_error: problem id cannot be mapped to a lookup prefix.".to_string());
    }
    let lookup_url = format!("{}/{}.json", lookup.base_url.trim_end_matches('/'), prefix);
    let lookup_path = release_dir
        .join("index/lookup/problem-id")
        .join(format!("{prefix}.json"));
    let lookup_bytes = load_or_fetch_artifact(
        &context.manifest_url,
        &lookup_url,
        &lookup_path,
        MAX_CORE_INDEX_BYTES,
        "problem lookup index",
        None,
        None,
    )?;
    let lookup_index: CachedProblemLookup =
        serde_json::from_slice(&lookup_bytes).map_err(|error| {
            format!("integrity_error: problem lookup index is invalid JSON: {error}")
        })?;
    if lookup_index.release_id != context.active.release_id || lookup_index.prefix != prefix {
        return Err("integrity_error: problem lookup index identity does not match.".to_string());
    }
    let entry = lookup_index.rows.get(problem_id).ok_or_else(|| {
        "integrity_error: problem is not present in the active lookup index.".to_string()
    })?;
    if entry.bank_slug != bank_slug || entry.line == 0 {
        return Err(
            "integrity_error: problem lookup entry does not match the requested bank.".to_string(),
        );
    }
    validate_bank_slug(&entry.dataset_slug)?;
    validate_bank_slug(&entry.shard_id)?;
    let shard_path = release_dir
        .join("records")
        .join(&entry.dataset_slug)
        .join(format!("{}.jsonl", entry.shard_id));
    let shard_bytes = load_or_fetch_artifact(
        &context.manifest_url,
        &entry.shard_url,
        &shard_path,
        MAX_RECORD_SHARD_BYTES,
        "problem record shard",
        None,
        None,
    )?;
    let line = shard_bytes
        .split(|byte| *byte == b'\n')
        .nth(entry.line - 1)
        .ok_or_else(|| {
            "integrity_error: problem record line is missing from its shard.".to_string()
        })?;
    let problem: serde_json::Value = serde_json::from_slice(line)
        .map_err(|error| format!("integrity_error: problem record is invalid JSON: {error}"))?;
    if problem.get("id").and_then(serde_json::Value::as_str) != Some(problem_id)
        || problem.get("releaseId").and_then(serde_json::Value::as_str)
            != Some(context.active.release_id.as_str())
    {
        return Err("integrity_error: problem record identity does not match.".to_string());
    }
    Ok(DesktopProblemDetail {
        release_id: context.active.release_id.clone(),
        bank_slug: bank_slug.to_string(),
        problem,
    })
}

fn source_slug(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            let lower = character.to_ascii_lowercase();
            if lower.is_ascii_alphanumeric() {
                lower
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn load_or_fetch_artifact(
    manifest_url: &str,
    artifact_url: &str,
    cache_path: &Path,
    max_bytes: u64,
    label: &str,
    expected_bytes: Option<u64>,
    expected_sha256: Option<&str>,
) -> Result<Vec<u8>, String> {
    if let Ok(bytes) = fs::read(cache_path) {
        if verify_artifact(&bytes, label, expected_bytes, expected_sha256).is_ok() {
            return Ok(bytes);
        }
        log::warn!(target: "geochat::problem_bank", "Discarding invalid cached {label}: {}", cache_path.display());
        let _ = fs::remove_file(cache_path);
    }
    let url = resolve_url(manifest_url, artifact_url)?;
    let bytes = fetch_bounded_with_retry(url.as_str(), max_bytes, label)?;
    verify_artifact(&bytes, label, expected_bytes, expected_sha256)?;
    atomic_write_bytes(cache_path, &bytes)?;
    Ok(bytes)
}

fn load_or_download_resumable(
    manifest_url: &str,
    artifact_url: &str,
    cache_path: &Path,
    expected: ArtifactExpectation<'_>,
    validate: impl Fn(&[u8]) -> Result<(), String>,
) -> Result<Vec<u8>, String> {
    let ArtifactExpectation {
        max_bytes,
        label,
        byte_size: expected_bytes,
        sha256: expected_sha256,
    } = expected;
    if let Ok(bytes) = fs::read(cache_path) {
        if verify_artifact(&bytes, label, expected_bytes, expected_sha256).is_ok()
            && validate(&bytes).is_ok()
        {
            return Ok(bytes);
        }
        log::warn!(target: "geochat::problem_bank", "Discarding invalid cached {label}: {}", cache_path.display());
        let _ = fs::remove_file(cache_path);
    }
    let parent = cache_path
        .parent()
        .ok_or_else(|| "Problem bank cache path has no parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("permission_denied: failed to create cache directory: {error}"))?;
    let part_path = cache_path.with_file_name(format!(
        "{}.part",
        cache_path.file_name().unwrap_or_default().to_string_lossy()
    ));
    if part_path
        .metadata()
        .is_ok_and(|metadata| metadata.len() > expected_bytes.unwrap_or(max_bytes))
    {
        fs::remove_file(&part_path).map_err(|error| {
            format!("permission_denied: failed to reset oversized partial download: {error}")
        })?;
    }
    let url = resolve_url(manifest_url, artifact_url)?;
    let client = Client::builder()
        .user_agent("GeoChat-Desktop/problem-bank-download")
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("network_unavailable: failed to create HTTP client: {error}"))?;
    let mut last_error = None;

    for (attempt, delay) in [0_u64, 250, 750, 1_500].into_iter().enumerate() {
        if delay > 0 {
            thread::sleep(Duration::from_millis(delay));
        }
        let existing_bytes = part_path
            .metadata()
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        let mut request = client.get(url.as_str());
        if existing_bytes > 0 {
            request = request.header(RANGE, format!("bytes={existing_bytes}-"));
        }
        let response = match request.send() {
            Ok(response) => response,
            Err(error) if attempt < 3 => {
                last_error = Some(error.to_string());
                continue;
            }
            Err(error) => {
                return Err(format!(
                    "network_unavailable: request to {url} failed: {error}"
                ));
            }
        };
        let status = response.status();
        if status == StatusCode::RANGE_NOT_SATISFIABLE && existing_bytes > 0 {
            let bytes = fs::read(&part_path).map_err(|error| {
                format!("integrity_error: failed to read partial {label}: {error}")
            })?;
            if verify_artifact(&bytes, label, expected_bytes, expected_sha256).is_ok()
                && validate(&bytes).is_ok()
            {
                replace_file(&part_path, cache_path)?;
                return Ok(bytes);
            }
            fs::remove_file(&part_path).map_err(|error| {
                format!("permission_denied: failed to reset partial {label}: {error}")
            })?;
            last_error = Some(format!("HTTP {status} with an incomplete partial file"));
            continue;
        }
        if !status.is_success() {
            if should_retry(status) && attempt < 3 {
                last_error = Some(format!("HTTP {status}"));
                continue;
            }
            return Err(format!(
                "network_unavailable: request to {url} failed with HTTP {status}"
            ));
        }

        let append = existing_bytes > 0 && status == StatusCode::PARTIAL_CONTENT;
        if append {
            let expected_prefix = format!("bytes {existing_bytes}-");
            let range_matches = response
                .headers()
                .get(CONTENT_RANGE)
                .and_then(|value| value.to_str().ok())
                .is_some_and(|value| value.starts_with(&expected_prefix));
            if !range_matches {
                fs::remove_file(&part_path).map_err(|error| {
                    format!("permission_denied: failed to reset partial {label}: {error}")
                })?;
                last_error = Some("server returned an invalid Content-Range".to_string());
                continue;
            }
        }
        let write_offset = if append { existing_bytes } else { 0 };
        let response_bytes = response.content_length();
        let response_total = response_bytes.map(|size| write_offset.saturating_add(size));
        if response_total.is_some_and(|size| size > max_bytes)
            || expected_bytes.is_some_and(|size| response_total.is_some_and(|total| total > size))
        {
            return Err(format!(
                "integrity_error: {label} response from {url} exceeds the expected size"
            ));
        }
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(&part_path)
            .map_err(|error| {
                format!("permission_denied: failed to open partial {label}: {error}")
            })?;
        let mut limited = response.take(max_bytes.saturating_sub(write_offset) + 1);
        let mut buffer = [0_u8; 64 * 1024];
        let mut written = write_offset;
        let copy_result = (|| -> Result<(), String> {
            loop {
                let count = limited.read(&mut buffer).map_err(|error| {
                    format!("network_unavailable: failed to read {url}: {error}")
                })?;
                if count == 0 {
                    break;
                }
                written = written.saturating_add(count as u64);
                if written > max_bytes || expected_bytes.is_some_and(|size| written > size) {
                    return Err(format!(
                        "integrity_error: {label} response from {url} exceeds the expected size"
                    ));
                }
                file.write_all(&buffer[..count]).map_err(|error| {
                    format!("permission_denied: failed to write partial {label}: {error}")
                })?;
            }
            file.sync_all().map_err(|error| {
                format!("permission_denied: failed to sync partial {label}: {error}")
            })
        })();
        if let Err(error) = copy_result {
            if error.starts_with("network_unavailable:") && attempt < 3 {
                last_error = Some(error);
                continue;
            }
            return Err(error);
        }
        if response_total.is_some_and(|total| total != written) {
            last_error = Some(format!(
                "response ended at {written} of {response_total:?} bytes"
            ));
            if attempt < 3 {
                continue;
            }
        }
        let bytes = fs::read(&part_path)
            .map_err(|error| format!("integrity_error: failed to read partial {label}: {error}"))?;
        match verify_artifact(&bytes, label, expected_bytes, expected_sha256)
            .and_then(|_| validate(&bytes))
        {
            Ok(()) => {
                replace_file(&part_path, cache_path)?;
                return Ok(bytes);
            }
            Err(error) if attempt < 3 => {
                last_error = Some(error);
            }
            Err(error) => return Err(error),
        }
    }
    Err(format!(
        "network_unavailable: request to {url} failed after retries: {}",
        last_error.unwrap_or_else(|| "unknown network error".to_string())
    ))
}

fn verify_artifact(
    bytes: &[u8],
    label: &str,
    expected_bytes: Option<u64>,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    if expected_bytes.is_some_and(|size| size != bytes.len() as u64) {
        return Err(format!(
            "integrity_error: {label} byte size does not match."
        ));
    }
    if expected_sha256.is_some_and(|digest| !digest.eq_ignore_ascii_case(&sha256_hex(bytes))) {
        return Err(format!("integrity_error: {label} checksum does not match."));
    }
    Ok(())
}

fn parse_problem_bank_detail_index(
    bytes: &[u8],
    expected_release_id: &str,
    expected_bank_slug: &str,
) -> Result<CachedProblemBankDetailIndex, String> {
    let index: CachedProblemBankDetailIndex = serde_json::from_slice(bytes).map_err(|error| {
        format!("integrity_error: problem-bank detail index is invalid JSON: {error}")
    })?;
    if index.release_id != expected_release_id || index.bank_slug != expected_bank_slug {
        return Err(
            "integrity_error: problem-bank detail index identity does not match.".to_string(),
        );
    }
    if index.pages.iter().any(|page| {
        page.id.is_empty() || page.url.is_empty() || page.sha256.len() != 64 || page.byte_size == 0
    }) {
        return Err(
            "integrity_error: problem-bank detail index contains an invalid page.".to_string(),
        );
    }
    Ok(index)
}

fn parse_problem_bank_page(
    bytes: &[u8],
    expected_release_id: &str,
    expected_bank_slug: &str,
    expected_rows: usize,
) -> Result<CachedProblemBankPage, String> {
    let page: CachedProblemBankPage = serde_json::from_slice(bytes)
        .map_err(|error| format!("integrity_error: problem-bank page is invalid JSON: {error}"))?;
    if page.release_id != expected_release_id || page.bank_slug != expected_bank_slug {
        return Err("integrity_error: problem-bank page identity does not match.".to_string());
    }
    if page.rows.len() != expected_rows {
        return Err("integrity_error: problem-bank page row count does not match.".to_string());
    }
    Ok(page)
}

fn validate_bank_slug(bank_slug: &str) -> Result<(), String> {
    if bank_slug.is_empty()
        || bank_slug.len() > 160
        || !bank_slug
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err("integrity_error: problem-bank slug is not a safe path component.".to_string());
    }
    Ok(())
}

fn clear_cache_root(
    root: &Path,
    manifest_url: Option<String>,
) -> Result<DesktopProblemBankCacheState, String> {
    for path in [
        root.join("releases"),
        root.join("staging"),
        root.join("downloads"),
        root.join("active.json"),
        root.join("state.json"),
    ] {
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|error| {
                format!(
                    "Failed to clear problem bank cache {}: {error}",
                    path.display()
                )
            })?;
        } else if path.is_file() {
            fs::remove_file(&path).map_err(|error| {
                format!(
                    "Failed to clear problem bank cache {}: {error}",
                    path.display()
                )
            })?;
        }
    }
    fs::create_dir_all(root.join("releases"))
        .and_then(|_| fs::create_dir_all(root.join("staging")))
        .and_then(|_| fs::create_dir_all(root.join("downloads")))
        .map_err(|error| format!("Failed to recreate problem bank cache: {error}"))?;
    let state = initial_state(manifest_url, root);
    persist_state(root, &state)?;
    Ok(state)
}

fn initial_state(manifest_url: Option<String>, root: &Path) -> DesktopProblemBankCacheState {
    DesktopProblemBankCacheState {
        status: if manifest_url.is_some() {
            "idle"
        } else {
            "disabled"
        }
        .to_string(),
        configured: manifest_url.is_some(),
        manifest_url,
        active_release_id: None,
        available_release_id: None,
        active_channel: None,
        available_channel: None,
        update_available: false,
        checked_at: None,
        activated_at: None,
        cached_bytes: 0,
        cache_directory: root.to_string_lossy().into_owned(),
        error: None,
        error_code: None,
    }
}

fn configured_manifest_url() -> Option<String> {
    if std::env::var("GEOCHAT_PROBLEM_BANK_ENABLED")
        .ok()
        .is_some_and(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "0" | "false" | "off" | "no"
            )
        })
    {
        return None;
    }
    std::env::var("GEOCHAT_PROBLEM_BANK_MANIFEST_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| Some(DEFAULT_MANIFEST_URL.to_string()))
}

fn load_state(root: &Path) -> Option<DesktopProblemBankCacheState> {
    fs::read(root.join("state.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
}

fn persist_state(root: &Path, state: &DesktopProblemBankCacheState) -> Result<(), String> {
    atomic_write_json(&root.join("state.json"), state)
}

fn load_download_states(
    root: &Path,
) -> Result<HashMap<String, DesktopProblemBankDownloadState>, String> {
    let directory = root.join("downloads");
    let mut states = HashMap::new();
    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("Failed to read problem bank download states: {error}"))?
    {
        let entry = entry
            .map_err(|error| format!("Failed to read problem bank download state: {error}"))?;
        if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let bytes = fs::read(entry.path())
            .map_err(|error| format!("Failed to read problem bank download state: {error}"))?;
        let state: DesktopProblemBankDownloadState = serde_json::from_slice(&bytes)
            .map_err(|error| format!("Failed to parse problem bank download state: {error}"))?;
        validate_bank_slug(&state.bank_slug)?;
        states.insert(state.bank_slug.clone(), state);
    }
    Ok(states)
}

fn persist_download_state(
    root: &Path,
    state: &DesktopProblemBankDownloadState,
) -> Result<(), String> {
    validate_bank_slug(&state.bank_slug)?;
    atomic_write_json(
        &root
            .join("downloads")
            .join(format!("{}.json", state.bank_slug)),
        state,
    )
}

fn load_active_release(root: &Path) -> Result<Option<ActiveRelease>, String> {
    let path = root.join("active.json");
    if !path.is_file() {
        return Ok(None);
    }
    let bytes = fs::read(&path)
        .map_err(|error| format!("Failed to read active problem bank release: {error}"))?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| format!("Failed to parse active problem bank release: {error}"))
}

fn atomic_write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Failed to serialize problem bank cache state: {error}"))?;
    atomic_write_bytes(path, &bytes)
}

fn atomic_write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Problem bank cache path has no parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create problem bank cache directory: {error}"))?;
    let temp = parent.join(format!(
        ".{}-{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy(),
        Uuid::new_v4()
    ));
    write_synced(&temp, bytes)?;
    replace_file(&temp, path)
}

fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = fs::File::create(path)
        .map_err(|error| format!("Failed to create {}: {error}", path.display()))?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

#[cfg(not(target_os = "windows"))]
fn replace_file(temp: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(temp, destination).map_err(|error| {
        format!(
            "Failed to atomically replace {}: {error}",
            destination.display()
        )
    })
}

#[cfg(target_os = "windows")]
fn replace_file(temp: &Path, destination: &Path) -> Result<(), String> {
    let backup = destination.with_extension(format!("previous-{}", Uuid::new_v4()));
    let had_destination = destination.exists();
    if had_destination {
        fs::rename(destination, &backup)
            .map_err(|error| format!("Failed to stage previous cache pointer: {error}"))?;
    }
    if let Err(error) = fs::rename(temp, destination) {
        if had_destination {
            let _ = fs::rename(&backup, destination);
        }
        return Err(format!("Failed to replace cache pointer: {error}"));
    }
    if had_destination {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

fn directory_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| {
            let path = entry.path();
            if path.is_dir() {
                directory_size(&path)
            } else {
                entry.metadata().map(|metadata| metadata.len()).unwrap_or(0)
            }
        })
        .sum()
}

fn error_code(error: &str) -> &'static str {
    for code in [
        "network_unavailable",
        "manifest_invalid",
        "schema_unsupported",
        "integrity_error",
        "permission_denied",
    ] {
        if error.starts_with(code) {
            return code;
        }
    }
    "unknown"
}

fn validate_release_id(release_id: &str) -> Result<(), String> {
    if release_id.len() > 128
        || !release_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err("manifest_invalid: release id is not a safe path component.".to_string());
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn temp_root(label: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("geochat-problem-bank-{label}-{}", Uuid::new_v4()));
        fs::create_dir_all(root.join("releases")).unwrap();
        fs::create_dir_all(root.join("staging")).unwrap();
        root
    }

    fn checked_release(id: &str, channel: &str) -> CheckedRelease {
        let root_manifest_bytes = format!(
            r#"{{"schemaVersion":"problem-bank.r2.v1","currentReleaseId":"{id}","releases":[{{"id":"{id}","channel":"{channel}","manifestUrl":"releases/{id}/manifest.json"}}]}}"#
        )
        .into_bytes();
        let release_manifest_bytes = format!(
            r#"{{"schemaVersion":"problem-bank.r2.v1","releaseId":"{id}","channel":"{channel}","problemBanks":{{"indexUrl":"problem-bank/v1/releases/{id}/problem-banks/index.json"}},"indexes":{{"facetsUrl":"problem-bank/v1/releases/{id}/index/facets.json","problemIdLookup":{{"prefixLength":2,"baseUrl":"problem-bank/v1/releases/{id}/index/lookup/problem-id"}}}}}}"#
        )
        .into_bytes();
        let release_manifest = serde_json::from_slice(&release_manifest_bytes).unwrap();
        CheckedRelease {
            root_manifest_bytes,
            release_manifest_bytes,
            release_manifest,
            release: ReleasePointer {
                id: id.to_string(),
                channel: channel.to_string(),
                manifest_url: format!("releases/{id}/manifest.json"),
            },
        }
    }

    fn core_artifacts(id: &str) -> CoreArtifacts {
        CoreArtifacts {
            problem_bank_index_bytes: format!(
                r#"{{"releaseId":"{id}","banks":[{{"bankId":"geometry","bankSlug":"geometry","title":"Geometry","kind":"dataset","indexUrl":"problem-bank/v1/releases/{id}/problem-banks/geometry/index.json","datasetId":"example/geometry","commercialUse":"allowed","counts":{{"records":2}}}}]}}"#
            )
            .into_bytes(),
            facets_bytes: format!(r#"{{"releaseId":"{id}","fields":{{}}}}"#).into_bytes(),
        }
    }

    #[test]
    fn rejects_unsupported_manifest_schema() {
        let error = parse_root_manifest(
            br#"{"schemaVersion":"problem-bank.r2.v2","currentReleaseId":"r1","releases":[]}"#,
        )
        .unwrap_err();
        assert!(error.starts_with("schema_unsupported:"));
    }

    #[test]
    fn resolves_bucket_relative_release_manifest_from_origin() {
        let resolved = resolve_url(
            "https://problem-bank.chat-with-geogebra.com/v1/manifest.json",
            "problem-bank/v1/releases/r1/manifest.json",
        )
        .unwrap();
        assert_eq!(
            resolved.as_str(),
            "https://problem-bank.chat-with-geogebra.com/v1/releases/r1/manifest.json"
        );
    }

    #[test]
    fn resolves_bucket_relative_artifact_on_direct_r2_cdn() {
        let resolved = resolve_url(
            "https://assets.chat-with-geogebra.com/problem-bank/v1/manifest.json",
            "problem-bank/v1/releases/r1/manifest.json",
        )
        .unwrap();
        assert_eq!(
            resolved.as_str(),
            "https://assets.chat-with-geogebra.com/problem-bank/v1/releases/r1/manifest.json"
        );
    }

    #[test]
    fn rejects_release_id_path_traversal() {
        let error = parse_root_manifest(
            br#"{"schemaVersion":"problem-bank.r2.v1","currentReleaseId":"../../escape","releases":[]}"#,
        )
        .unwrap_err();
        assert!(error.starts_with("manifest_invalid:"));
    }

    #[test]
    fn rejects_cross_origin_release_manifest_url() {
        let error = resolve_url(
            "https://problem-bank.chat-with-geogebra.com/v1/manifest.json",
            "http://127.0.0.1/private.json",
        )
        .unwrap_err();
        assert!(error.starts_with("manifest_invalid:"));
    }

    #[test]
    fn installs_release_then_atomically_updates_active_pointer() {
        let root = temp_root("install");
        install_checked_release(
            &root,
            &checked_release("r1", "internal"),
            &core_artifacts("r1"),
            "2026-09-23T00:00:00Z",
        )
        .unwrap();
        let active = load_active_release(&root).unwrap().unwrap();
        assert_eq!(active.release_id, "r1");
        assert!(root.join("releases/r1/manifest.json").is_file());
        assert!(root.join("releases/r1/root-manifest.json").is_file());
        assert!(root.join("releases/r1/release.json").is_file());
        assert!(root.join("releases/r1/problem-banks/index.json").is_file());
        assert!(root.join("releases/r1/index/facets.json").is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_new_release_preserves_previous_active_pointer() {
        let root = temp_root("rollback");
        install_checked_release(
            &root,
            &checked_release("r1", "internal"),
            &core_artifacts("r1"),
            "2026-09-23T00:00:00Z",
        )
        .unwrap();
        let mut invalid = checked_release("r2", "internal");
        invalid.release_manifest_bytes = br#"{"schemaVersion":"problem-bank.r2.v1","releaseId":"different","channel":"internal"}"#.to_vec();
        assert!(install_checked_release(
            &root,
            &invalid,
            &core_artifacts("r2"),
            "2026-09-23T00:10:00Z"
        )
        .is_err());
        let active = load_active_release(&root).unwrap().unwrap();
        assert_eq!(active.release_id, "r1");
        assert!(!root.join("releases/r2").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn startup_recovers_active_release_after_interrupted_sync_state() {
        let root = temp_root("recover");
        install_checked_release(
            &root,
            &checked_release("r1", "internal"),
            &core_artifacts("r1"),
            "2026-09-23T00:00:00Z",
        )
        .unwrap();
        let mut stale = initial_state(Some(DEFAULT_MANIFEST_URL.to_string()), &root);
        stale.status = "syncing".to_string();
        persist_state(&root, &stale).unwrap();

        let runtime = ProblemBankCacheRuntime::new(root.clone()).unwrap();
        assert_eq!(runtime.state.status, "ready");
        assert_eq!(runtime.state.active_release_id.as_deref(), Some("r1"));
        assert_eq!(runtime.state.active_channel.as_deref(), Some("internal"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn clearing_cache_removes_releases_and_preserves_empty_cache_root() {
        let root = temp_root("clear");
        install_checked_release(
            &root,
            &checked_release("r1", "internal"),
            &core_artifacts("r1"),
            "2026-09-23T00:00:00Z",
        )
        .unwrap();
        fs::write(root.join("releases/r1/lazy-page.json"), b"cached").unwrap();

        let state = clear_cache_root(&root, Some(DEFAULT_MANIFEST_URL.to_string())).unwrap();

        assert_eq!(state.status, "idle");
        assert_eq!(state.cached_bytes, 0);
        assert_eq!(state.active_release_id, None);
        assert_eq!(state.cache_directory, root.to_string_lossy());
        assert!(!root.join("active.json").exists());
        assert!(root.join("releases").is_dir());
        assert!(root.join("staging").is_dir());
        assert_eq!(fs::read_dir(root.join("releases")).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_catalog_and_cached_pages_lazily() {
        let root = temp_root("lazy-page");
        install_checked_release(
            &root,
            &checked_release("r1", "internal"),
            &core_artifacts("r1"),
            "2026-09-23T00:00:00Z",
        )
        .unwrap();
        let catalog = load_active_catalog(
            &root,
            Some("https://problem-bank.chat-with-geogebra.com/v1/manifest.json"),
        )
        .unwrap()
        .unwrap();
        assert_eq!(catalog.banks.len(), 1);
        assert_eq!(catalog.banks[0].problem_count, 2);

        let page_bytes = br#"{"releaseId":"r1","bankSlug":"geometry","rows":[{"id":"p1","promptPreview":"Draw a circle"},{"id":"p2","promptPreview":"Draw a line"}]}"#.to_vec();
        let page_digest = sha256_hex(&page_bytes);
        let bank_dir = root.join("releases/r1/problem-banks/geometry");
        fs::create_dir_all(bank_dir.join("problems")).unwrap();
        fs::write(bank_dir.join("problems/000001.json"), &page_bytes).unwrap();
        fs::write(
            bank_dir.join("index.json"),
            format!(
                r#"{{"releaseId":"r1","bankSlug":"geometry","pages":[{{"id":"000001","url":"problem-bank/v1/releases/r1/problem-banks/geometry/problems/000001.json","rows":2,"sha256":"{page_digest}","byteSize":{}}}]}}"#,
                page_bytes.len()
            ),
        )
        .unwrap();
        let page = load_problem_bank_page(
            &PageLoadContext {
                root: root.clone(),
                manifest_url: "https://problem-bank.chat-with-geogebra.com/v1/manifest.json"
                    .to_string(),
                active: load_active_release(&root).unwrap().unwrap(),
            },
            "geometry",
            None,
        )
        .unwrap();
        assert_eq!(page.items.len(), 2);
        assert_eq!(page.next_cursor, None);

        let lookup_dir = root.join("releases/r1/index/lookup/problem-id");
        let record_dir = root.join("releases/r1/records/example-geometry");
        fs::create_dir_all(&lookup_dir).unwrap();
        fs::create_dir_all(&record_dir).unwrap();
        fs::write(
            lookup_dir.join("p1.json"),
            r#"{"releaseId":"r1","prefix":"p1","rows":{"p1":{"bankSlug":"geometry","datasetSlug":"example-geometry","shardUrl":"problem-bank/v1/releases/r1/records/example-geometry/000001.jsonl","shardId":"000001","line":1}}}"#,
        )
        .unwrap();
        fs::write(
            record_dir.join("000001.jsonl"),
            r#"{"id":"p1","releaseId":"r1","prompt":"$x^2=1$","answer":{"final":"x=1"}}"#,
        )
        .unwrap();
        let detail = load_problem_detail(
            &PageLoadContext {
                root: root.clone(),
                manifest_url: "https://problem-bank.chat-with-geogebra.com/v1/manifest.json"
                    .to_string(),
                active: load_active_release(&root).unwrap().unwrap(),
            },
            "geometry",
            "p1",
        )
        .unwrap();
        assert_eq!(detail.problem["prompt"], "$x^2=1$");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resumes_partial_artifact_with_an_http_range_request() {
        let root = temp_root("resume");
        let destination = root.join("releases/r1/problem-banks/geometry/index.json");
        fs::create_dir_all(destination.parent().unwrap()).unwrap();
        let payload = br#"{"releaseId":"r1","bankSlug":"geometry","pages":[]}"#;
        let split = 19;
        fs::write(
            destination.with_file_name("index.json.part"),
            &payload[..split],
        )
        .unwrap();

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let remainder = payload[split..].to_vec();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 4096];
            let count = stream.read(&mut request).unwrap();
            let request = String::from_utf8_lossy(&request[..count]).to_ascii_lowercase();
            assert!(request.contains(&format!("range: bytes={split}-")));
            let response = format!(
                "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes {}-{}/{}\r\nConnection: close\r\n\r\n",
                remainder.len(),
                split,
                payload.len() - 1,
                payload.len(),
            );
            stream.write_all(response.as_bytes()).unwrap();
            stream.write_all(&remainder).unwrap();
        });

        let manifest_url = format!("http://{address}/v1/manifest.json");
        let artifact_url = format!("http://{address}/artifact.json");
        let bytes = load_or_download_resumable(
            &manifest_url,
            &artifact_url,
            &destination,
            ArtifactExpectation {
                max_bytes: 1024,
                label: "test artifact",
                byte_size: Some(payload.len() as u64),
                sha256: Some(&sha256_hex(payload)),
            },
            |bytes| {
                serde_json::from_slice::<serde_json::Value>(bytes)
                    .map(|_| ())
                    .map_err(|error| error.to_string())
            },
        )
        .unwrap();

        server.join().unwrap();
        assert_eq!(bytes, payload);
        assert_eq!(fs::read(&destination).unwrap(), payload);
        assert!(!destination.with_file_name("index.json.part").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn startup_marks_interrupted_downloads_as_resumable() {
        let root = temp_root("paused-download");
        let state = DesktopProblemBankDownloadState {
            bank_slug: "geometry".to_string(),
            release_id: "r1".to_string(),
            status: "downloading".to_string(),
            phase: "records".to_string(),
            completed_items: 4,
            total_items: 10,
            downloaded_bytes: 128,
            total_bytes: 1024,
            updated_at: "2026-09-23T00:00:00Z".to_string(),
            error: None,
        };
        persist_download_state(&root, &state).unwrap();

        let runtime = ProblemBankCacheRuntime::new(root.clone()).unwrap();
        let recovered = runtime.downloads.get("geometry").unwrap();
        assert_eq!(recovered.status, "paused");
        assert_eq!(recovered.completed_items, 4);
        fs::remove_dir_all(root).unwrap();
    }
}
