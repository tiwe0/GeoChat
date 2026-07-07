use crate::env_config::{conditional_env, configured_string};
use base64::Engine;
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    sync::Arc,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use url::Url;

const APP_BUNDLE_ASSET_DOWNLOAD_CONCURRENCY: usize = 16;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppBundleAsset {
    pub(crate) path: String,
    pub(crate) sha256: String,
    pub(crate) url: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppBundleEntry {
    pub(crate) entry: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppBundleManifest {
    pub(crate) kind: String,
    pub(crate) bundle_version: String,
    pub(crate) shell_version: String,
    pub(crate) min_shell_version: Option<String>,
    pub(crate) max_shell_version: Option<String>,
    pub(crate) requires_shell_update: Option<bool>,
    pub(crate) assets: Vec<AppBundleAsset>,
    pub(crate) backend: AppBundleEntry,
    pub(crate) renderer: AppBundleEntry,
}

#[derive(Clone)]
pub(crate) struct ActiveAppBundle {
    pub(crate) root: PathBuf,
    pub(crate) source: &'static str,
    pub(crate) manifest: AppBundleManifest,
}

pub(crate) struct AppBundleInstallResult {
    pub(crate) bundle_version: String,
    pub(crate) previous_bundle_version: String,
    pub(crate) manifest_url: String,
    pub(crate) signature_url: Option<String>,
    pub(crate) manifest_sha256: String,
    pub(crate) signature_verified: bool,
}

pub(crate) fn app_bundle_manifest_url() -> Option<String> {
    configured_string(&[
        development_env("GEOCHAT_APP_BUNDLE_MANIFEST_URL"),
        option_env!("GEOCHAT_APP_BUNDLE_MANIFEST_URL").map(str::to_string),
    ])
}

pub(crate) fn app_bundle_signature_url() -> Option<String> {
    configured_string(&[
        development_env("GEOCHAT_APP_BUNDLE_SIGNATURE_URL"),
        option_env!("GEOCHAT_APP_BUNDLE_SIGNATURE_URL").map(str::to_string),
    ])
}

pub(crate) fn app_bundle_public_key_pem() -> Option<String> {
    if let Some(pem) = configured_string(&[
        development_env("GEOCHAT_APP_BUNDLE_PUBLIC_KEY_PEM"),
        option_env!("GEOCHAT_APP_BUNDLE_PUBLIC_KEY_PEM").map(str::to_string),
    ]) {
        return Some(pem);
    }
    configured_string(&[
        development_env("GEOCHAT_APP_BUNDLE_PUBLIC_KEY_PEM_BASE64"),
        option_env!("GEOCHAT_APP_BUNDLE_PUBLIC_KEY_PEM_BASE64").map(str::to_string),
    ])
    .and_then(|encoded| {
        base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .ok()
    })
    .and_then(|bytes| String::from_utf8(bytes).ok())
}

pub(crate) fn parse_app_bundle_manifest(bytes: &[u8]) -> Result<AppBundleManifest, String> {
    let manifest: AppBundleManifest =
        serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    if manifest.kind != "geochat-app-bundle" {
        return Err("Invalid app bundle kind.".to_string());
    }
    if manifest.bundle_version.trim().is_empty() {
        return Err("Missing bundle version.".to_string());
    }
    if manifest.shell_version.trim().is_empty() {
        return Err("Missing shell version.".to_string());
    }
    if manifest.assets.is_empty() {
        return Err("Missing bundle assets.".to_string());
    }
    assert_bundle_asset_path(&manifest.backend.entry)?;
    assert_bundle_asset_path(&manifest.renderer.entry)?;
    let mut paths = HashSet::new();
    for asset in &manifest.assets {
        assert_bundle_asset_path(&asset.path)?;
        if let Some(url) = asset.url.as_deref() {
            assert_bundle_asset_url_path(url, &asset.path)?;
        }
        if asset.sha256.len() != 64 || !asset.sha256.chars().all(|ch| ch.is_ascii_hexdigit()) {
            return Err(format!("Invalid bundle asset hash: {}", asset.path));
        }
        if !paths.insert(asset.path.as_str()) {
            return Err("Duplicate bundle asset path.".to_string());
        }
    }
    if !paths.contains(manifest.backend.entry.as_str()) {
        return Err(format!(
            "Required entry is not listed as an asset: {}",
            manifest.backend.entry
        ));
    }
    if !paths.contains(manifest.renderer.entry.as_str()) {
        return Err(format!(
            "Required entry is not listed as an asset: {}",
            manifest.renderer.entry
        ));
    }
    Ok(manifest)
}

pub(crate) fn verify_app_bundle_assets(
    root: &Path,
    manifest: &AppBundleManifest,
) -> Result<(), String> {
    for asset in &manifest.assets {
        let asset_path = safe_bundle_path(root, &asset.path)?;
        let bytes = fs::read(&asset_path).map_err(|error| {
            format!(
                "Failed to read app bundle asset {}: {error}",
                asset_path.display()
            )
        })?;
        if sha256_hex(&bytes) != asset.sha256.to_lowercase() {
            return Err(format!("Bundle manifest hash mismatch: {}", asset.path));
        }
    }
    Ok(())
}

pub(crate) fn download_app_bundle_assets(
    manifest_url: &str,
    manifest: &AppBundleManifest,
    staging_root: &Path,
) -> Result<(), String> {
    let client = Arc::new(
        reqwest::blocking::Client::builder()
            .build()
            .map_err(|error| error.to_string())?,
    );
    for chunk in manifest
        .assets
        .chunks(APP_BUNDLE_ASSET_DOWNLOAD_CONCURRENCY)
    {
        let mut handles = Vec::with_capacity(chunk.len());
        for asset in chunk {
            let client = Arc::clone(&client);
            let asset = asset.clone();
            let manifest_url = manifest_url.to_string();
            let staging_root = staging_root.to_path_buf();
            handles.push(thread::spawn(move || {
                download_app_bundle_asset(&client, &manifest_url, &asset, &staging_root)
            }));
        }
        for handle in handles {
            handle
                .join()
                .map_err(|_| "App bundle asset download worker panicked.".to_string())??;
        }
    }
    Ok(())
}

pub(crate) fn verify_app_bundle_signature(
    root: &Path,
    manifest_bytes: &[u8],
) -> Result<bool, String> {
    let Some(public_key_pem) = app_bundle_public_key_pem() else {
        return Ok(false);
    };
    let signature_path = root.join("app-bundle-manifest.json.sig");
    let signature = fs::read(signature_path).map_err(|error| error.to_string())?;
    verify_ed25519_signature(&public_key_pem, manifest_bytes, &signature)?;
    Ok(true)
}

pub(crate) fn verify_remote_app_bundle_signature(
    manifest_url: &str,
    manifest_bytes: &[u8],
) -> Result<Option<Vec<u8>>, String> {
    let Some(public_key_pem) = app_bundle_public_key_pem() else {
        if cfg!(debug_assertions) {
            return Ok(None);
        }
        return Err("Packaged app bundle updates require a public signature key.".to_string());
    };
    let signature_url = app_bundle_signature_url().unwrap_or_else(|| format!("{manifest_url}.sig"));
    let signature = read_url_bytes(&signature_url)?;
    verify_ed25519_signature(&public_key_pem, manifest_bytes, &signature)?;
    Ok(Some(signature))
}

pub(crate) fn read_url_bytes(url: &str) -> Result<Vec<u8>, String> {
    let parsed = Url::parse(url).map_err(|error| error.to_string())?;
    match parsed.scheme() {
        "file" => {
            let path = parsed
                .to_file_path()
                .map_err(|_| format!("Invalid file URL: {url}"))?;
            fs::read(path).map_err(|error| error.to_string())
        }
        "http" | "https" => {
            let client = reqwest::blocking::Client::builder()
                .build()
                .map_err(|error| error.to_string())?;
            fetch_url_bytes(&client, parsed)
        }
        protocol => Err(format!("Unsupported app bundle URL protocol: {protocol}")),
    }
}

pub(crate) fn app_bundle_updates_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("updates")
}

pub(crate) fn app_bundle_rollback_available(app_data_dir: &Path) -> bool {
    app_bundle_updates_root(app_data_dir)
        .join("previous")
        .join("app-bundle-manifest.json")
        .is_file()
}

pub(crate) fn bundled_resource_root(resource_dir: &Path) -> PathBuf {
    let tauri_dist_root = resource_dir.join("_up_").join("dist");
    if tauri_dist_root.join("app-bundle-manifest.json").is_file() {
        return tauri_dist_root;
    }
    resource_dir.to_path_buf()
}

pub(crate) fn resolve_active_app_bundle(
    app_data_dir: &Path,
    resource_dir: &Path,
    shell_version: &str,
) -> Option<ActiveAppBundle> {
    let installed_root = app_bundle_updates_root(app_data_dir).join("current");
    if let Some(bundle) =
        read_valid_app_bundle_root(&installed_root, "installed", true, shell_version)
    {
        return Some(bundle);
    }
    if let Some(bundle) = read_valid_app_bundle_root(
        &bundled_resource_root(resource_dir),
        "bundled",
        false,
        shell_version,
    ) {
        return Some(bundle);
    }
    let dist_root = development_dist_root()?;
    read_valid_app_bundle_root(&dist_root, "development", false, shell_version)
}

pub(crate) fn read_remote_app_bundle_manifest(
    manifest_url: &str,
) -> Result<(AppBundleManifest, Vec<u8>, Option<Vec<u8>>), String> {
    let manifest_bytes = read_url_bytes(manifest_url)?;
    let signature_bytes = verify_remote_app_bundle_signature(manifest_url, &manifest_bytes)?;
    let manifest = parse_app_bundle_manifest(&manifest_bytes)?;
    Ok((manifest, manifest_bytes, signature_bytes))
}

pub(crate) fn shell_update_required_message(
    manifest: &AppBundleManifest,
    shell_version: &str,
) -> String {
    format!(
        "App bundle {} requires shell version {} but current shell is {}.",
        manifest.bundle_version, manifest.shell_version, shell_version
    )
}

pub(crate) fn install_configured_app_bundle(
    app_data_dir: &Path,
    resource_dir: &Path,
    shell_version: &str,
    current_bundle_version_override: Option<String>,
) -> Result<AppBundleInstallResult, String> {
    let manifest_url = app_bundle_manifest_url()
        .ok_or_else(|| "No app bundle update source is configured.".to_string())?;
    let (manifest, manifest_bytes, signature_bytes) =
        read_remote_app_bundle_manifest(&manifest_url)?;
    if app_bundle_requires_shell_update(&manifest)
        || !is_shell_version_compatible(&manifest, shell_version)
    {
        return Err(shell_update_required_message(&manifest, shell_version));
    }
    let signature_url = signature_bytes
        .as_ref()
        .map(|_| app_bundle_signature_url().unwrap_or_else(|| format!("{manifest_url}.sig")));
    let manifest_sha256 = sha256_hex(&manifest_bytes);
    let previous = resolve_active_app_bundle(app_data_dir, resource_dir, shell_version)
        .ok_or_else(|| {
            "Cannot install app bundle before the active bundle is resolved.".to_string()
        })?;
    let previous_bundle_version =
        current_bundle_version_override.unwrap_or_else(|| previous.manifest.bundle_version.clone());
    if !is_newer_app_bundle_version(&manifest.bundle_version, &previous_bundle_version) {
        return Err(format!(
            "App bundle {} is not newer than current {}.",
            manifest.bundle_version, previous_bundle_version
        ));
    }

    let updates_root = app_bundle_updates_root(app_data_dir);
    fs::create_dir_all(&updates_root).map_err(|error| error.to_string())?;
    let staging_root = updates_root.join(format!("staging-{}-{}", std::process::id(), unix_ms()));
    let current_root = updates_root.join("current");
    let previous_root = updates_root.join("previous");
    let _ = fs::remove_dir_all(&staging_root);
    fs::create_dir_all(&staging_root).map_err(|error| error.to_string())?;
    let install_result = (|| {
        download_app_bundle_assets(&manifest_url, &manifest, &staging_root)?;
        fs::write(
            staging_root.join("app-bundle-manifest.json"),
            &manifest_bytes,
        )
        .map_err(|error| error.to_string())?;
        if let Some(signature_bytes) = signature_bytes.as_ref() {
            fs::write(
                staging_root.join("app-bundle-manifest.json.sig"),
                signature_bytes,
            )
            .map_err(|error| error.to_string())?;
        }
        verify_app_bundle_assets(&staging_root, &manifest)?;
        let _ = fs::remove_dir_all(&previous_root);
        if current_root.exists() {
            fs::rename(&current_root, &previous_root).map_err(|error| error.to_string())?;
        }
        fs::rename(&staging_root, &current_root).map_err(|error| error.to_string())?;
        Ok(AppBundleInstallResult {
            bundle_version: manifest.bundle_version,
            previous_bundle_version,
            manifest_url,
            signature_url,
            manifest_sha256,
            signature_verified: signature_bytes.is_some(),
        })
    })();
    if install_result.is_err() {
        let _ = fs::remove_dir_all(&staging_root);
    }
    install_result
}

pub(crate) fn rollback_app_bundle_installation(app_data_dir: &Path) -> Result<String, String> {
    let updates_root = app_bundle_updates_root(app_data_dir);
    let current_root = updates_root.join("current");
    let previous_root = updates_root.join("previous");
    if !previous_root.join("app-bundle-manifest.json").is_file() {
        return Err("No previous app bundle is available for rollback.".to_string());
    }
    let previous_manifest = parse_app_bundle_manifest(
        &fs::read(previous_root.join("app-bundle-manifest.json"))
            .map_err(|error| error.to_string())?,
    )?;
    verify_app_bundle_assets(&previous_root, &previous_manifest)?;
    let failed_root = updates_root.join(format!("failed-{}", unix_ms()));
    if current_root.exists() {
        fs::rename(&current_root, failed_root).map_err(|error| error.to_string())?;
    }
    fs::rename(previous_root, current_root).map_err(|error| error.to_string())?;
    Ok(previous_manifest.bundle_version)
}

pub(crate) fn is_shell_version_compatible(
    manifest: &AppBundleManifest,
    shell_version: &str,
) -> bool {
    if manifest.min_shell_version.is_none() && manifest.max_shell_version.is_none() {
        return normalize_version_tag(&manifest.shell_version)
            == normalize_version_tag(shell_version);
    }
    if let Some(minimum) = manifest.min_shell_version.as_ref() {
        if compare_versions(shell_version, minimum) < 0 {
            return false;
        }
    }
    if let Some(maximum) = manifest.max_shell_version.as_ref() {
        if maximum.ends_with(".x") {
            return shell_version.starts_with(&format!("{}.", maximum.trim_end_matches(".x")));
        }
        if compare_versions(shell_version, maximum) > 0 {
            return false;
        }
    }
    true
}

pub(crate) fn app_bundle_requires_shell_update(manifest: &AppBundleManifest) -> bool {
    manifest.requires_shell_update.unwrap_or(false)
}

pub(crate) fn is_newer_app_bundle_version(next: &str, current: &str) -> bool {
    match compare_sortable_app_bundle_versions(next, current) {
        Some(ordering) => ordering == std::cmp::Ordering::Greater,
        None => next != current,
    }
}

pub(crate) fn normalize_update_error(error: String) -> (String, String) {
    let normalized = error.to_lowercase();
    let code = if normalized.contains("newer application shell")
        || normalized.contains("not compatible with shell")
        || normalized.contains("shell update")
    {
        "shell_update_required"
    } else if normalized.contains("signature") || normalized.contains("public key") {
        "signature_error"
    } else if normalized.contains("permission") || normalized.contains("denied") {
        "permission_denied"
    } else if normalized.contains("http 404") || normalized.contains("missing") {
        "metadata_missing"
    } else if normalized.contains("network")
        || normalized.contains("dns")
        || normalized.contains("connect")
        || normalized.contains("timeout")
    {
        "network_unavailable"
    } else {
        "unknown"
    };
    (error, code.to_string())
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn development_env(name: &str) -> Option<String> {
    conditional_env(
        name,
        app_bundle_runtime_env_overrides_enabled(
            cfg!(debug_assertions),
            installed_client_update_smoke_env_enabled(),
        ),
    )
}

fn development_dist_root() -> Option<PathBuf> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|root| root.join("dist"))
}

fn read_valid_app_bundle_root(
    root: &Path,
    source: &'static str,
    verify_installed_signature: bool,
    shell_version: &str,
) -> Option<ActiveAppBundle> {
    let manifest_path = root.join("app-bundle-manifest.json");
    let manifest_bytes = fs::read(&manifest_path).ok()?;
    if source == "installed" && root.join("runtime").exists() {
        eprintln!(
            "GeoChat app bundle fallback: installed bundle contains runtime assets: {}",
            root.display()
        );
        return None;
    }
    if verify_installed_signature {
        match verify_app_bundle_signature(root, &manifest_bytes) {
            Ok(true) => {}
            Ok(false) => {
                eprintln!(
                    "GeoChat app bundle fallback: installed bundle signature key is unavailable: {}",
                    root.display()
                );
                return None;
            }
            Err(error) => {
                eprintln!(
                    "GeoChat app bundle fallback: installed bundle signature check failed: {error}"
                );
                return None;
            }
        }
    }
    let manifest = match parse_app_bundle_manifest(&manifest_bytes) {
        Ok(manifest) => manifest,
        Err(error) => {
            eprintln!(
                "GeoChat app bundle fallback: invalid {source} manifest {}: {error}",
                manifest_path.display()
            );
            return None;
        }
    };
    if app_bundle_requires_shell_update(&manifest) {
        eprintln!(
            "GeoChat app bundle fallback: {source} bundle {} requires a shell update",
            manifest.bundle_version
        );
        return None;
    }
    if !is_shell_version_compatible(&manifest, shell_version) {
        eprintln!(
            "GeoChat app bundle fallback: {source} bundle {} is not compatible with shell {}",
            manifest.bundle_version, shell_version
        );
        return None;
    }
    if let Err(error) = verify_app_bundle_assets(root, &manifest) {
        eprintln!("GeoChat app bundle fallback: {source} asset verification failed: {error}");
        return None;
    }
    Some(ActiveAppBundle {
        root: root.to_path_buf(),
        source,
        manifest,
    })
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn app_bundle_runtime_env_overrides_enabled(
    debug_assertions: bool,
    installed_client_smoke: bool,
) -> bool {
    debug_assertions || installed_client_smoke
}

fn installed_client_update_smoke_env_enabled() -> bool {
    env::var("GEOCHAT_APP_BUNDLE_INSTALLED_CLIENT_SMOKE").as_deref() == Ok("1")
}

fn assert_bundle_asset_path(path: &str) -> Result<(), String> {
    if path.starts_with('/') || path.contains("..") || path.contains('\\') {
        return Err(format!("Unsafe bundle asset path: {path}"));
    }
    if path == "runtime" || path.starts_with("runtime/") {
        return Err(format!(
            "Runtime assets must not be included in app bundles: {path}"
        ));
    }
    let root = path.split('/').next().unwrap_or_default();
    if !matches!(root, "backend" | "renderer" | "vendor") {
        return Err(format!(
            "Bundle assets must stay under backend, renderer, or vendor: {path}"
        ));
    }
    Ok(())
}

fn assert_bundle_asset_url_path(path: &str, label: &str) -> Result<(), String> {
    if path.is_empty() || path.trim() != path {
        return Err(format!("Unsafe bundle asset URL for {label}: {path}"));
    }
    if path.starts_with('/')
        || path.contains('\\')
        || path.contains('?')
        || path.contains('#')
        || looks_like_absolute_url(path)
    {
        return Err(format!("Unsafe bundle asset URL for {label}: {path}"));
    }

    let decoded = percent_decode_path(path)
        .map_err(|_| format!("Unsafe bundle asset URL for {label}: {path}"))?;
    if decoded
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err(format!("Unsafe bundle asset URL for {label}: {path}"));
    }
    Ok(())
}

fn looks_like_absolute_url(path: &str) -> bool {
    let Some(index) = path.find(':') else {
        return false;
    };
    let scheme = &path[..index];
    !scheme.is_empty()
        && scheme.chars().enumerate().all(|(position, ch)| {
            if position == 0 {
                ch.is_ascii_alphabetic()
            } else {
                ch.is_ascii_alphanumeric() || matches!(ch, '+' | '.' | '-')
            }
        })
}

fn percent_decode_path(path: &str) -> Result<String, ()> {
    let bytes = path.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err(());
            }
            let high = hex_value(bytes[index + 1]).ok_or(())?;
            let low = hex_value(bytes[index + 2]).ok_or(())?;
            output.push((high << 4) | low);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(output).map_err(|_| ())
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn download_app_bundle_asset(
    client: &reqwest::blocking::Client,
    manifest_url: &str,
    asset: &AppBundleAsset,
    staging_root: &Path,
) -> Result<(), String> {
    let asset_url = resolve_app_bundle_asset_url(manifest_url, asset)?;
    let bytes = read_url_bytes_with_client(client, &asset_url)?;
    if sha256_hex(&bytes) != asset.sha256.to_lowercase() {
        return Err(format!("App bundle asset hash mismatch: {}", asset.path));
    }
    let target = safe_bundle_path(staging_root, &asset.path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(target, bytes).map_err(|error| error.to_string())
}

fn safe_bundle_path(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    assert_bundle_asset_path(relative_path)?;
    let root = root.to_path_buf();
    let target = root.join(relative_path);
    let normalized = target.components().collect::<PathBuf>();
    if !normalized.starts_with(&root) {
        return Err(format!("App bundle path escapes root: {relative_path}"));
    }
    Ok(normalized)
}

fn verify_ed25519_signature(
    public_key_pem: &str,
    message: &[u8],
    signature: &[u8],
) -> Result<(), String> {
    let parsed = pem::parse(public_key_pem).map_err(|error| error.to_string())?;
    let subject_public_key = spki_subject_public_key(parsed.contents())?;
    UnparsedPublicKey::new(&ED25519, subject_public_key)
        .verify(message, signature)
        .map_err(|_| "App bundle manifest signature verification failed.".to_string())
}

fn spki_subject_public_key(der: &[u8]) -> Result<&[u8], String> {
    const ED25519_PREFIX: &[u8] = &[
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ];
    if der.len() == 32 {
        return Ok(der);
    }
    if der.starts_with(ED25519_PREFIX) && der.len() == ED25519_PREFIX.len() + 32 {
        return Ok(&der[ED25519_PREFIX.len()..]);
    }
    Err("App bundle public key must be an Ed25519 SPKI PEM.".to_string())
}

fn read_url_bytes_with_client(
    client: &reqwest::blocking::Client,
    url: &str,
) -> Result<Vec<u8>, String> {
    let parsed = Url::parse(url).map_err(|error| error.to_string())?;
    match parsed.scheme() {
        "file" => {
            let path = parsed
                .to_file_path()
                .map_err(|_| format!("Invalid file URL: {url}"))?;
            fs::read(path).map_err(|error| error.to_string())
        }
        "http" | "https" => fetch_url_bytes(client, parsed),
        protocol => Err(format!("Unsupported app bundle URL protocol: {protocol}")),
    }
}

fn fetch_url_bytes(client: &reqwest::blocking::Client, url: Url) -> Result<Vec<u8>, String> {
    let url_text = url.to_string();
    let response = client.get(url).send().map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch app bundle URL {url_text}: HTTP {}",
            response.status()
        ));
    }
    response
        .bytes()
        .map(|bytes| bytes.to_vec())
        .map_err(|error| error.to_string())
}

fn resolve_app_bundle_asset_url(
    manifest_url: &str,
    asset: &AppBundleAsset,
) -> Result<String, String> {
    let base = Url::parse(manifest_url).map_err(|error| error.to_string())?;
    let path = asset.url.as_deref().unwrap_or(&asset.path);
    if asset.url.is_some() {
        assert_bundle_asset_url_path(path, &asset.path)?;
    }
    base.join(path)
        .map(|url| url.to_string())
        .map_err(|error| error.to_string())
}

fn compare_sortable_app_bundle_versions(left: &str, right: &str) -> Option<std::cmp::Ordering> {
    let left = normalize_version_tag(left);
    let right = normalize_version_tag(right);
    if left == right {
        return Some(std::cmp::Ordering::Equal);
    }
    let left_parts = parse_sortable_app_bundle_version(left)?;
    let right_parts = parse_sortable_app_bundle_version(right)?;
    let length = left_parts.len().max(right_parts.len());
    for index in 0..length {
        let left_value = *left_parts.get(index).unwrap_or(&0);
        let right_value = *right_parts.get(index).unwrap_or(&0);
        if left_value != right_value {
            return Some(left_value.cmp(&right_value));
        }
    }
    Some(std::cmp::Ordering::Equal)
}

fn parse_sortable_app_bundle_version(version: &str) -> Option<Vec<u64>> {
    if !version
        .chars()
        .all(|ch| ch.is_ascii_digit() || matches!(ch, '.' | '+' | '-'))
    {
        return None;
    }
    version
        .split(['.', '+', '-'])
        .map(|part| part.parse::<u64>().ok())
        .collect()
}

fn compare_versions(left: &str, right: &str) -> i8 {
    let left = normalize_version_tag(left);
    let right = normalize_version_tag(right);
    let left_parts = left.split('.').map(|part| part.parse::<u64>().unwrap_or(0));
    let right_parts = right
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0));
    let mut left_values = left_parts.collect::<Vec<_>>();
    let mut right_values = right_parts.collect::<Vec<_>>();
    let length = left_values.len().max(right_values.len());
    left_values.resize(length, 0);
    right_values.resize(length, 0);
    for index in 0..length {
        if left_values[index] != right_values[index] {
            return if left_values[index] > right_values[index] {
                1
            } else {
                -1
            };
        }
    }
    0
}

fn normalize_version_tag(version: &str) -> &str {
    let trimmed = version.trim();
    if let Some(stripped) = trimmed.strip_prefix('v') {
        if stripped
            .chars()
            .next()
            .map(|ch| ch.is_ascii_digit())
            .unwrap_or(false)
        {
            return stripped;
        }
    }
    trimmed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_manifest(asset_path: &str, bytes: &[u8]) -> AppBundleManifest {
        AppBundleManifest {
            kind: "geochat-app-bundle".to_string(),
            bundle_version: "0.1.1+test".to_string(),
            shell_version: env!("CARGO_PKG_VERSION").to_string(),
            min_shell_version: None,
            max_shell_version: None,
            requires_shell_update: None,
            assets: vec![
                AppBundleAsset {
                    path: asset_path.to_string(),
                    sha256: sha256_hex(bytes),
                    url: None,
                },
                AppBundleAsset {
                    path: "renderer/index.html".to_string(),
                    sha256: sha256_hex(b"<html></html>"),
                    url: None,
                },
            ],
            backend: AppBundleEntry {
                entry: asset_path.to_string(),
            },
            renderer: AppBundleEntry {
                entry: "renderer/index.html".to_string(),
            },
        }
    }

    fn temp_root(name: &str) -> PathBuf {
        let millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default();
        let root = env::temp_dir().join(format!("geochat-tauri-test-{name}-{millis}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn app_bundle_assets_verify_posix_relative_paths() {
        let root = temp_root("bundle-assets");
        let backend_bytes = b"console.log('backend')";
        let renderer_bytes = b"<html></html>";
        fs::create_dir_all(root.join("backend")).unwrap();
        fs::create_dir_all(root.join("renderer")).unwrap();
        fs::write(
            root.join("backend").join("backend.bundle.js"),
            backend_bytes,
        )
        .unwrap();
        fs::write(root.join("renderer").join("index.html"), renderer_bytes).unwrap();

        let manifest = test_manifest("backend/backend.bundle.js", backend_bytes);
        assert!(verify_app_bundle_assets(&root, &manifest).is_ok());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn app_bundle_manifest_rejects_windows_separators() {
        let manifest = test_manifest("backend\\backend.bundle.js", b"console.log('backend')");
        let bytes = serde_json::json!({
            "kind": manifest.kind,
            "bundleVersion": manifest.bundle_version,
            "shellVersion": manifest.shell_version,
            "assets": [
                {
                    "path": "backend\\backend.bundle.js",
                    "sha256": sha256_hex(b"console.log('backend')")
                },
                {
                    "path": "renderer/index.html",
                    "sha256": sha256_hex(b"<html></html>")
                }
            ],
            "backend": { "entry": "backend\\backend.bundle.js" },
            "renderer": { "entry": "renderer/index.html" }
        })
        .to_string();

        let error = match parse_app_bundle_manifest(bytes.as_bytes()) {
            Ok(_) => panic!("manifest with Windows separators should be rejected"),
            Err(error) => error,
        };
        assert!(error.contains("Unsafe bundle asset path"));
    }

    #[test]
    fn app_bundle_manifest_rejects_unsafe_asset_urls() {
        let bytes = serde_json::json!({
            "kind": "geochat-app-bundle",
            "bundleVersion": "0.1.1+test",
            "shellVersion": env!("CARGO_PKG_VERSION"),
            "assets": [
                {
                    "path": "backend/backend.bundle.js",
                    "url": "https://example.test/backend.bundle.js",
                    "sha256": sha256_hex(b"console.log('backend')")
                },
                {
                    "path": "renderer/index.html",
                    "url": "0.1.1+test/%2e%2e/renderer/index.html",
                    "sha256": sha256_hex(b"<html></html>")
                }
            ],
            "backend": { "entry": "backend/backend.bundle.js" },
            "renderer": { "entry": "renderer/index.html" }
        })
        .to_string();

        let error = match parse_app_bundle_manifest(bytes.as_bytes()) {
            Ok(_) => panic!("manifest with unsafe asset URLs should be rejected"),
            Err(error) => error,
        };
        assert!(error.contains("Unsafe bundle asset URL"));
    }

    #[test]
    fn app_bundle_manifest_parses_shell_update_requirement() {
        let bytes = serde_json::json!({
            "kind": "geochat-app-bundle",
            "bundleVersion": "0.1.1+test",
            "shellVersion": env!("CARGO_PKG_VERSION"),
            "requiresShellUpdate": true,
            "assets": [
                {
                    "path": "backend/backend.bundle.js",
                    "sha256": sha256_hex(b"console.log('backend')")
                },
                {
                    "path": "renderer/index.html",
                    "sha256": sha256_hex(b"<html></html>")
                }
            ],
            "backend": { "entry": "backend/backend.bundle.js" },
            "renderer": { "entry": "renderer/index.html" }
        })
        .to_string();

        let manifest = parse_app_bundle_manifest(bytes.as_bytes()).unwrap();
        assert!(app_bundle_requires_shell_update(&manifest));
    }

    #[test]
    fn app_bundle_versions_accept_release_tag_prefix() {
        let mut manifest = test_manifest("backend/backend.bundle.js", b"console.log('backend')");
        manifest.shell_version = format!("v{}", env!("CARGO_PKG_VERSION"));

        assert!(is_shell_version_compatible(
            &manifest,
            env!("CARGO_PKG_VERSION")
        ));
        assert!(is_newer_app_bundle_version("v0.2.4+1", "0.2.4"));
        assert!(!is_newer_app_bundle_version("v0.2.4", "0.2.4"));
    }

    #[test]
    fn app_bundle_runtime_env_overrides_stay_scoped_to_smoke_mode() {
        assert!(!app_bundle_runtime_env_overrides_enabled(false, false));
        assert!(app_bundle_runtime_env_overrides_enabled(true, false));
        assert!(app_bundle_runtime_env_overrides_enabled(false, true));
    }

    #[test]
    fn app_bundle_asset_url_resolves_from_versioned_object_path() {
        let mut manifest = test_manifest("backend/backend.bundle.js", b"console.log('backend')");
        manifest.assets[0].url = Some("0.1.1+test/backend/backend.bundle.js".to_string());
        let url = resolve_app_bundle_asset_url(
            "https://updates.example.test/app-bundles/app-bundle-manifest.json",
            &manifest.assets[0],
        )
        .unwrap();
        assert_eq!(
            url,
            "https://updates.example.test/app-bundles/0.1.1+test/backend/backend.bundle.js"
        );
    }

    #[test]
    fn app_bundle_path_rejects_root_escape() {
        let root = temp_root("path-escape");
        let error = safe_bundle_path(&root, "backend/../renderer/index.html").unwrap_err();
        assert!(error.contains("Unsafe bundle asset path"));
        fs::remove_dir_all(root).unwrap();
    }
}
