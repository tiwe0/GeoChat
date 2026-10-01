use super::{development_env, downloader::read_url_bytes};
use crate::env_config::configured_string;
use base64::Engine;
use ring::signature::{UnparsedPublicKey, ED25519};
use std::{fs, path::Path};

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
