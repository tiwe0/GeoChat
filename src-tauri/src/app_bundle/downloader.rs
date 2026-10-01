use super::{
    manifest::{assert_bundle_asset_url_path, safe_bundle_path, AppBundleAsset, AppBundleManifest},
    sha256_hex,
};
use std::{fs, path::Path, sync::Arc, thread};
use url::Url;

const APP_BUNDLE_ASSET_DOWNLOAD_CONCURRENCY: usize = 16;

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

pub(super) fn resolve_app_bundle_asset_url(
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
