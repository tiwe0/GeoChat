use super::{
    development_env,
    downloader::{download_app_bundle_assets, read_url_bytes},
    manifest::{
        app_bundle_requires_shell_update, is_newer_app_bundle_version, is_shell_version_compatible,
        parse_app_bundle_manifest, resolve_active_app_bundle, verify_app_bundle_assets,
        AppBundleManifest,
    },
    sha256_hex,
    signature::{app_bundle_signature_url, verify_remote_app_bundle_signature},
};
use crate::env_config::configured_string;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug)]
pub(crate) struct AppBundleInstallResult {
    pub(crate) bundle_version: String,
    pub(crate) previous_bundle_version: String,
    pub(crate) manifest_url: String,
    pub(crate) signature_url: Option<String>,
    pub(crate) manifest_sha256: String,
    pub(crate) signature_verified: bool,
}

pub(crate) type RemoteAppBundleManifest = (AppBundleManifest, Vec<u8>, Option<Vec<u8>>);

pub(crate) fn app_bundle_manifest_url() -> Option<String> {
    configured_string(&[
        development_env("GEOCHAT_APP_BUNDLE_MANIFEST_URL"),
        option_env!("GEOCHAT_APP_BUNDLE_MANIFEST_URL").map(str::to_string),
    ])
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

pub(crate) fn read_remote_app_bundle_manifest(
    manifest_url: &str,
) -> Result<RemoteAppBundleManifest, String> {
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
    install_remote_app_bundle(
        app_data_dir,
        resource_dir,
        shell_version,
        current_bundle_version_override,
        manifest_url,
        manifest,
        manifest_bytes,
        signature_bytes,
        &SystemBundleInstallFileOps,
    )
}

#[allow(clippy::too_many_arguments)]
fn install_remote_app_bundle(
    app_data_dir: &Path,
    resource_dir: &Path,
    shell_version: &str,
    current_bundle_version_override: Option<String>,
    manifest_url: String,
    manifest: AppBundleManifest,
    manifest_bytes: Vec<u8>,
    signature_bytes: Option<Vec<u8>>,
    file_ops: &dyn BundleInstallFileOps,
) -> Result<AppBundleInstallResult, String> {
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
        switch_installed_app_bundle(&staging_root, &current_root, &previous_root, file_ops)?;
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

trait BundleInstallFileOps {
    fn rename(&self, from: &Path, to: &Path) -> std::io::Result<()>;
}

struct SystemBundleInstallFileOps;

impl BundleInstallFileOps for SystemBundleInstallFileOps {
    fn rename(&self, from: &Path, to: &Path) -> std::io::Result<()> {
        fs::rename(from, to)
    }
}

fn switch_installed_app_bundle(
    staging_root: &Path,
    current_root: &Path,
    previous_root: &Path,
    file_ops: &dyn BundleInstallFileOps,
) -> Result<(), String> {
    if previous_root.exists() {
        fs::remove_dir_all(previous_root).map_err(|error| {
            format!(
                "Cannot remove the previous app bundle at {} before installation: {error}",
                previous_root.display()
            )
        })?;
    }

    let moved_current = current_root.exists();
    if moved_current {
        file_ops
            .rename(current_root, previous_root)
            .map_err(|error| {
                format!(
                    "Cannot preserve the current app bundle at {} before installation: {error}",
                    previous_root.display()
                )
            })?;
    }

    if let Err(install_error) = file_ops.rename(staging_root, current_root) {
        if moved_current {
            return match file_ops.rename(previous_root, current_root) {
                Ok(()) => Err(format!(
                    "Cannot activate the downloaded app bundle: {install_error}. The previous app bundle was restored."
                )),
                Err(restore_error) => Err(format!(
                    "Cannot activate the downloaded app bundle: {install_error}. Automatic recovery also failed: {restore_error}. Restore {} to {} before retrying.",
                    previous_root.display(),
                    current_root.display()
                )),
            };
        }
        return Err(format!(
            "Cannot activate the downloaded app bundle: {install_error}."
        ));
    }

    Ok(())
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

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_bundle::manifest::parse_app_bundle_manifest;
    use std::{
        io,
        sync::atomic::{AtomicBool, Ordering},
    };
    use url::Url;

    struct FailActivationRename {
        failed: AtomicBool,
        fail_recovery: bool,
    }

    impl FailActivationRename {
        fn new(fail_recovery: bool) -> Self {
            Self {
                failed: AtomicBool::new(false),
                fail_recovery,
            }
        }
    }

    impl BundleInstallFileOps for FailActivationRename {
        fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
            let is_activation = from
                .file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("staging-"))
                && to.file_name().is_some_and(|name| name == "current");
            if is_activation && !self.failed.swap(true, Ordering::SeqCst) {
                return Err(io::Error::other("injected activation rename failure"));
            }
            let is_recovery = from.file_name().is_some_and(|name| name == "previous")
                && to.file_name().is_some_and(|name| name == "current");
            if is_recovery && self.fail_recovery {
                return Err(io::Error::other("injected recovery rename failure"));
            }
            fs::rename(from, to)
        }
    }

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "geochat-installer-{name}-{}-{}",
            std::process::id(),
            unix_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn manifest_bytes(version: &str, backend: &[u8]) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "kind": "geochat-app-bundle",
            "bundleVersion": version,
            "shellVersion": env!("CARGO_PKG_VERSION"),
            "assets": [
                {
                    "path": "backend/backend.bundle.js",
                    "sha256": sha256_hex(backend)
                },
                {
                    "path": "renderer/index.html",
                    "sha256": sha256_hex(b"<html></html>")
                }
            ],
            "backend": { "entry": "backend/backend.bundle.js" },
            "renderer": { "entry": "renderer/index.html" }
        }))
        .unwrap()
    }

    fn write_bundle(root: &Path, version: &str, backend: &[u8]) -> Vec<u8> {
        fs::create_dir_all(root.join("backend")).unwrap();
        fs::create_dir_all(root.join("renderer")).unwrap();
        fs::write(root.join("backend/backend.bundle.js"), backend).unwrap();
        fs::write(root.join("renderer/index.html"), b"<html></html>").unwrap();
        let manifest = manifest_bytes(version, backend);
        fs::write(root.join("app-bundle-manifest.json"), &manifest).unwrap();
        manifest
    }

    fn install_local_bundle(
        root: &Path,
        file_ops: &dyn BundleInstallFileOps,
    ) -> Result<AppBundleInstallResult, String> {
        let app_data_dir = root.join("app-data");
        let resource_dir = root.join("resources");
        let source_dir = root.join("source");
        write_bundle(&resource_dir, "0.1.0", b"bundled");
        write_bundle(
            &app_bundle_updates_root(&app_data_dir).join("current"),
            "0.1.0",
            b"current",
        );
        let manifest_bytes = write_bundle(&source_dir, "0.2.0", b"downloaded");
        let manifest = parse_app_bundle_manifest(&manifest_bytes).unwrap();
        let manifest_url = Url::from_file_path(source_dir.join("app-bundle-manifest.json"))
            .unwrap()
            .to_string();

        install_remote_app_bundle(
            &app_data_dir,
            &resource_dir,
            env!("CARGO_PKG_VERSION"),
            Some("0.1.0".to_string()),
            manifest_url,
            manifest,
            manifest_bytes,
            None,
            file_ops,
        )
    }

    #[test]
    fn local_file_install_uses_the_production_stage_and_switch_path() {
        let root = temp_root("local-success");

        let result = install_local_bundle(&root, &SystemBundleInstallFileOps).unwrap();

        let updates_root = app_bundle_updates_root(&root.join("app-data"));
        assert_eq!(result.bundle_version, "0.2.0");
        assert_eq!(result.previous_bundle_version, "0.1.0");
        assert_eq!(
            fs::read(updates_root.join("current/backend/backend.bundle.js")).unwrap(),
            b"downloaded"
        );
        assert_eq!(
            fs::read(updates_root.join("previous/backend/backend.bundle.js")).unwrap(),
            b"current"
        );
        assert!(fs::read_dir(&updates_root)
            .unwrap()
            .filter_map(Result::ok)
            .all(|entry| !entry.file_name().to_string_lossy().starts_with("staging-")));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn activation_rename_failure_restores_current_and_cleans_staging() {
        let root = temp_root("activation-failure");

        let error = install_local_bundle(&root, &FailActivationRename::new(false)).unwrap_err();

        let updates_root = app_bundle_updates_root(&root.join("app-data"));
        assert!(error.contains("injected activation rename failure"));
        assert!(error.contains("previous app bundle was restored"));
        assert_eq!(
            fs::read(updates_root.join("current/backend/backend.bundle.js")).unwrap(),
            b"current"
        );
        assert!(!updates_root.join("previous").exists());
        assert!(fs::read_dir(&updates_root)
            .unwrap()
            .filter_map(Result::ok)
            .all(|entry| !entry.file_name().to_string_lossy().starts_with("staging-")));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_automatic_recovery_reports_exact_manual_restore_paths() {
        let root = temp_root("recovery-failure");

        let error = install_local_bundle(&root, &FailActivationRename::new(true)).unwrap_err();

        let updates_root = app_bundle_updates_root(&root.join("app-data"));
        assert!(error.contains("Automatic recovery also failed"));
        assert!(error.contains(&updates_root.join("previous").display().to_string()));
        assert!(error.contains(&updates_root.join("current").display().to_string()));
        assert!(!updates_root.join("current").exists());
        assert_eq!(
            fs::read(updates_root.join("previous/backend/backend.bundle.js")).unwrap(),
            b"current"
        );
        assert!(fs::read_dir(&updates_root)
            .unwrap()
            .filter_map(Result::ok)
            .all(|entry| !entry.file_name().to_string_lossy().starts_with("staging-")));

        fs::remove_dir_all(root).unwrap();
    }
}
