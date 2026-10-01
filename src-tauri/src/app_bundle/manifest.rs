use super::{development_dist_root, sha256_hex};
use crate::app_bundle::signature::verify_app_bundle_signature;
use serde::Deserialize;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

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
    let installed_root = super::installer::app_bundle_updates_root(app_data_dir).join("current");
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

pub(super) fn assert_bundle_asset_path(path: &str) -> Result<(), String> {
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

pub(super) fn assert_bundle_asset_url_path(path: &str, label: &str) -> Result<(), String> {
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

pub(super) fn safe_bundle_path(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    assert_bundle_asset_path(relative_path)?;
    let root = root.to_path_buf();
    let target = root.join(relative_path);
    let normalized = target.components().collect::<PathBuf>();
    if !normalized.starts_with(&root) {
        return Err(format!("App bundle path escapes root: {relative_path}"));
    }
    Ok(normalized)
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
