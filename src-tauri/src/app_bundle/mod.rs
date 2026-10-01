mod downloader;
mod installer;
mod manifest;
mod signature;

use crate::env_config::conditional_env;
// Keep the historical crate-local facade stable while the implementation lives
// in responsibility-specific modules. Some exports are extension points used by
// tests and update tooling rather than the production binary itself.
#[allow(unused_imports)]
pub(crate) use downloader::{download_app_bundle_assets, read_url_bytes};
#[allow(unused_imports)]
pub(crate) use installer::RemoteAppBundleManifest;
pub(crate) use installer::{
    app_bundle_manifest_url, app_bundle_rollback_available, app_bundle_updates_root,
    install_configured_app_bundle, read_remote_app_bundle_manifest,
    rollback_app_bundle_installation, shell_update_required_message, AppBundleInstallResult,
};
pub(crate) use manifest::{
    app_bundle_requires_shell_update, bundled_resource_root, is_newer_app_bundle_version,
    is_shell_version_compatible, resolve_active_app_bundle, ActiveAppBundle,
};
#[allow(unused_imports)]
pub(crate) use manifest::{
    parse_app_bundle_manifest, verify_app_bundle_assets, AppBundleAsset, AppBundleEntry,
    AppBundleManifest,
};
use sha2::{Digest, Sha256};
#[allow(unused_imports)]
pub(crate) use signature::{
    app_bundle_public_key_pem, app_bundle_signature_url, verify_app_bundle_signature,
    verify_remote_app_bundle_signature,
};
use std::{env, path::PathBuf};

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

fn app_bundle_runtime_env_overrides_enabled(
    debug_assertions: bool,
    installed_client_smoke: bool,
) -> bool {
    debug_assertions || installed_client_smoke
}

fn installed_client_update_smoke_env_enabled() -> bool {
    env::var("GEOCHAT_APP_BUNDLE_INSTALLED_CLIENT_SMOKE").as_deref() == Ok("1")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

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

    fn write_test_bundle_root(root: &std::path::Path, version: &str, backend_bytes: &[u8]) {
        fs::create_dir_all(root.join("backend")).unwrap();
        fs::create_dir_all(root.join("renderer")).unwrap();
        fs::write(root.join("backend/backend.bundle.js"), backend_bytes).unwrap();
        fs::write(root.join("renderer/index.html"), b"<html></html>").unwrap();
        let manifest = serde_json::json!({
            "kind": "geochat-app-bundle",
            "bundleVersion": version,
            "shellVersion": env!("CARGO_PKG_VERSION"),
            "assets": [
                {
                    "path": "backend/backend.bundle.js",
                    "sha256": sha256_hex(backend_bytes)
                },
                {
                    "path": "renderer/index.html",
                    "sha256": sha256_hex(b"<html></html>")
                }
            ],
            "backend": { "entry": "backend/backend.bundle.js" },
            "renderer": { "entry": "renderer/index.html" }
        });
        fs::write(
            root.join("app-bundle-manifest.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
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
        let url = downloader::resolve_app_bundle_asset_url(
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
        let error =
            manifest::safe_bundle_path(&root, "backend/../renderer/index.html").unwrap_err();
        assert!(error.contains("Unsafe bundle asset path"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn app_bundle_rollback_promotes_previous_and_quarantines_current() {
        let app_data_dir = temp_root("rollback");
        let updates_root = app_bundle_updates_root(&app_data_dir);
        write_test_bundle_root(&updates_root.join("current"), "0.2.0", b"current");
        write_test_bundle_root(&updates_root.join("previous"), "0.1.0", b"previous");

        let restored_version = rollback_app_bundle_installation(&app_data_dir).unwrap();

        assert_eq!(restored_version, "0.1.0");
        assert_eq!(
            fs::read(updates_root.join("current/backend/backend.bundle.js")).unwrap(),
            b"previous"
        );
        assert!(!updates_root.join("previous").exists());
        let failed_roots = fs::read_dir(&updates_root)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().starts_with("failed-"))
            .collect::<Vec<_>>();
        assert_eq!(failed_roots.len(), 1);
        assert_eq!(
            fs::read(failed_roots[0].path().join("backend/backend.bundle.js")).unwrap(),
            b"current"
        );

        fs::remove_dir_all(app_data_dir).unwrap();
    }

    #[test]
    fn app_bundle_rollback_keeps_roots_when_previous_bundle_is_invalid() {
        let app_data_dir = temp_root("rollback-invalid");
        let updates_root = app_bundle_updates_root(&app_data_dir);
        write_test_bundle_root(&updates_root.join("current"), "0.2.0", b"current");
        write_test_bundle_root(&updates_root.join("previous"), "0.1.0", b"previous");
        fs::write(
            updates_root.join("previous/backend/backend.bundle.js"),
            b"corrupted",
        )
        .unwrap();

        let error = rollback_app_bundle_installation(&app_data_dir).unwrap_err();

        assert!(error.contains("hash mismatch"));
        assert_eq!(
            fs::read(updates_root.join("current/backend/backend.bundle.js")).unwrap(),
            b"current"
        );
        assert!(updates_root.join("previous").exists());
        assert!(fs::read_dir(&updates_root)
            .unwrap()
            .filter_map(Result::ok)
            .all(|entry| !entry.file_name().to_string_lossy().starts_with("failed-")));

        fs::remove_dir_all(app_data_dir).unwrap();
    }
}
