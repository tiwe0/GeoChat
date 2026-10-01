mod error;
#[cfg(test)]
mod memory;
mod platform;
mod store;

pub(crate) use error::CredentialError;
#[cfg(test)]
pub(crate) use memory::InMemoryCredentialStore;
pub(crate) use platform::{CredentialProfile, PlatformCredentialStore};
pub(crate) use store::CredentialStore;

use serde::{Deserialize, Deserializer, Serialize};
use std::{fmt, sync::Arc};
use url::Url;
use uuid::Uuid;
use zeroize::Zeroizing;

const CREDENTIAL_SCHEMA_VERSION: u32 = 1;
const MAX_PROVIDER_LENGTH: usize = 128;
// Windows Credential Manager's generic credential blob limit is 2,560 bytes.
// The complete versioned envelope (not just the provider key) must fit.
const MAX_STORED_ENVELOPE_BYTES: usize = 2_560;
const SUPPORTED_PROTOCOLS: [&str; 3] = ["openai-compatible", "anthropic", "google"];

/// Secret-bearing value with redacted formatting, no serialization support,
/// and best-effort zeroing when dropped.
pub(crate) struct SecretValue(Zeroizing<String>);

impl SecretValue {
    pub(crate) fn new(value: String) -> Self {
        Self(Zeroizing::new(value))
    }

    pub(crate) fn expose_secret(&self) -> &str {
        self.0.as_str()
    }

    #[cfg(test)]
    fn duplicate(&self) -> Self {
        Self::new(self.expose_secret().to_owned())
    }
}

impl<'de> Deserialize<'de> for SecretValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        String::deserialize(deserializer).map(Self::new)
    }
}

impl fmt::Debug for SecretValue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SecretValue([REDACTED])")
    }
}

/// Renderer-to-Tauri save input. It is deserialize-only and deliberately has
/// no Debug or Serialize implementation because it contains the cleartext key.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveCredentialRequest {
    pub(crate) provider: String,
    pub(crate) protocol: String,
    pub(crate) base_url: String,
    pub(crate) secret: SecretValue,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CredentialMetadata {
    pub(crate) credential_ref: String,
    pub(crate) provider: String,
    pub(crate) protocol: String,
    pub(crate) canonical_base_url: String,
}

/// Backend-only resolved credential. It cannot be serialized or cloned, and
/// its Debug output never includes the secret.
pub(crate) struct ResolvedCredential {
    pub(crate) metadata: CredentialMetadata,
    secret: SecretValue,
}

impl ResolvedCredential {
    pub(crate) fn secret(&self) -> &str {
        self.secret.expose_secret()
    }
}

impl fmt::Debug for ResolvedCredential {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ResolvedCredential")
            .field("metadata", &self.metadata)
            .field("secret", &"[REDACTED]")
            .finish()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredEnvelope {
    schema_version: u32,
    secret: SecretValue,
    provider: String,
    protocol: String,
    canonical_base_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredEnvelopeRef<'a> {
    schema_version: u32,
    secret: &'a str,
    provider: &'a str,
    protocol: &'a str,
    canonical_base_url: &'a str,
}

pub(crate) struct CredentialVault {
    store: Arc<dyn CredentialStore>,
}

impl CredentialVault {
    pub(crate) fn new(store: Arc<dyn CredentialStore>) -> Self {
        Self { store }
    }

    pub(crate) fn save(
        &self,
        request: SaveCredentialRequest,
    ) -> Result<CredentialMetadata, CredentialError> {
        let provider = validate_provider(&request.provider)?.to_owned();
        let protocol = validate_protocol(&request.protocol)?.to_owned();
        let canonical_base_url = canonicalize_endpoint(&request.base_url)?;
        validate_secret(request.secret.expose_secret())?;

        let credential_ref = Uuid::new_v4().to_string();
        if self.store.exists(&credential_ref)? {
            return Err(CredentialError::AlreadyExists);
        }

        let encoded = encode_envelope(
            request.secret.expose_secret(),
            &provider,
            &protocol,
            &canonical_base_url,
        )?;
        self.store.put(&credential_ref, &encoded)?;
        Ok(CredentialMetadata {
            credential_ref,
            provider,
            protocol,
            canonical_base_url,
        })
    }

    pub(crate) fn resolve(
        &self,
        credential_ref: &str,
    ) -> Result<ResolvedCredential, CredentialError> {
        validate_credential_ref(credential_ref)?;
        let encoded = self.store.get(credential_ref)?;
        decode_envelope(credential_ref, encoded)
    }

    pub(crate) fn delete(&self, credential_ref: &str) -> Result<(), CredentialError> {
        validate_credential_ref(credential_ref)?;
        self.store.delete(credential_ref)
    }

    /// Keychain and Credential Manager do not provide a portable service-wide
    /// enumeration through keyring's v1 API. Callers therefore supply the
    /// references already present in non-secret configuration; missing entries
    /// are omitted and malformed/corrupt entries fail closed.
    pub(crate) fn list_metadata(
        &self,
        credential_refs: &[String],
    ) -> Result<Vec<CredentialMetadata>, CredentialError> {
        let mut metadata = Vec::with_capacity(credential_refs.len());
        for credential_ref in credential_refs {
            match self.resolve(credential_ref) {
                Ok(resolved) => metadata.push(resolved.metadata),
                Err(CredentialError::NotFound) => {}
                Err(error) => return Err(error),
            }
        }
        Ok(metadata)
    }
}

fn encode_envelope(
    secret: &str,
    provider: &str,
    protocol: &str,
    canonical_base_url: &str,
) -> Result<SecretValue, CredentialError> {
    let envelope = StoredEnvelopeRef {
        schema_version: CREDENTIAL_SCHEMA_VERSION,
        secret,
        provider,
        protocol,
        canonical_base_url,
    };
    let encoded = serde_json::to_string(&envelope).map_err(|_| CredentialError::StoreFailure)?;
    if encoded.len() > MAX_STORED_ENVELOPE_BYTES {
        return Err(CredentialError::InvalidInput);
    }
    Ok(SecretValue::new(encoded))
}

fn decode_envelope(
    credential_ref: &str,
    encoded: SecretValue,
) -> Result<ResolvedCredential, CredentialError> {
    let envelope: StoredEnvelope =
        serde_json::from_str(encoded.expose_secret()).map_err(|_| CredentialError::CorruptEntry)?;
    if envelope.schema_version != CREDENTIAL_SCHEMA_VERSION {
        return Err(CredentialError::UnsupportedVersion);
    }
    let provider = validate_provider(&envelope.provider)
        .map_err(|_| CredentialError::CorruptEntry)?
        .to_owned();
    let protocol = validate_protocol(&envelope.protocol)
        .map_err(|_| CredentialError::CorruptEntry)?
        .to_owned();
    validate_secret(envelope.secret.expose_secret()).map_err(|_| CredentialError::CorruptEntry)?;
    let canonical_base_url = canonicalize_endpoint(&envelope.canonical_base_url)
        .map_err(|_| CredentialError::CorruptEntry)?;
    if canonical_base_url != envelope.canonical_base_url {
        return Err(CredentialError::CorruptEntry);
    }

    Ok(ResolvedCredential {
        metadata: CredentialMetadata {
            credential_ref: credential_ref.to_owned(),
            provider,
            protocol,
            canonical_base_url,
        },
        secret: envelope.secret,
    })
}

fn validate_credential_ref(credential_ref: &str) -> Result<(), CredentialError> {
    let parsed = Uuid::parse_str(credential_ref).map_err(|_| CredentialError::InvalidReference)?;
    if parsed.get_version_num() != 4 || parsed.to_string() != credential_ref {
        return Err(CredentialError::InvalidReference);
    }
    Ok(())
}

pub(crate) fn validate_provider(provider: &str) -> Result<&str, CredentialError> {
    if provider.is_empty()
        || provider.len() > MAX_PROVIDER_LENGTH
        || !provider
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(CredentialError::InvalidInput);
    }
    Ok(provider)
}

pub(crate) fn validate_protocol(protocol: &str) -> Result<&str, CredentialError> {
    SUPPORTED_PROTOCOLS
        .contains(&protocol)
        .then_some(protocol)
        .ok_or(CredentialError::InvalidInput)
}

fn validate_secret(secret: &str) -> Result<(), CredentialError> {
    if secret.is_empty() || secret.len() > MAX_STORED_ENVELOPE_BYTES || secret.contains('\0') {
        return Err(CredentialError::InvalidInput);
    }
    Ok(())
}

pub(crate) fn canonicalize_endpoint(endpoint: &str) -> Result<String, CredentialError> {
    let trimmed = endpoint.trim();
    if trimmed.is_empty() || trimmed.contains('?') || trimmed.contains('#') {
        return Err(CredentialError::InvalidEndpoint);
    }
    let candidate = if has_explicit_url_scheme(trimmed) {
        trimmed.to_owned()
    } else {
        format!("https://{trimmed}")
    };
    let mut url = Url::parse(&candidate).map_err(|_| CredentialError::InvalidEndpoint)?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_none()
        || url.cannot_be_a_base()
    {
        return Err(CredentialError::InvalidEndpoint);
    }

    let scheme_is_allowed = match url.scheme() {
        "https" => true,
        "http" => is_loopback_host(&url),
        _ => false,
    };
    if !scheme_is_allowed {
        return Err(CredentialError::InvalidEndpoint);
    }

    let normalized_path = url
        .path()
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/");
    let normalized_path = if normalized_path.is_empty() {
        "/".to_owned()
    } else {
        format!("/{normalized_path}")
    };
    url.set_path(&normalized_path);
    let mut canonical = url.to_string();
    if url.path() == "/" {
        canonical.pop();
    }
    Ok(canonical)
}

fn has_explicit_url_scheme(value: &str) -> bool {
    let Some(scheme_end) = value.find("://") else {
        return false;
    };
    let scheme = &value[..scheme_end];
    scheme
        .bytes()
        .next()
        .is_some_and(|byte| byte.is_ascii_alphabetic())
        && scheme
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'-' | b'.'))
}

fn is_loopback_host(url: &Url) -> bool {
    match url.host() {
        Some(url::Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(address)) => address.octets()[0] == 127,
        Some(url::Host::Ipv6(address)) => address.is_loopback(),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct LoopbackPolicyCase {
        url: String,
        allowed: bool,
    }

    fn vault() -> CredentialVault {
        CredentialVault::new(Arc::new(InMemoryCredentialStore::default()))
    }

    fn request(secret: &str) -> SaveCredentialRequest {
        SaveCredentialRequest {
            provider: "deepseek".to_owned(),
            protocol: "openai-compatible".to_owned(),
            base_url: "https://API.DeepSeek.com:443/v1/".to_owned(),
            secret: SecretValue::new(secret.to_owned()),
        }
    }

    #[test]
    fn endpoint_policy_matches_shared_loopback_cases() {
        let cases: Vec<LoopbackPolicyCase> = serde_json::from_str(include_str!(
            "../../../tests/fixtures/credential-loopback-policy.json"
        ))
        .unwrap();
        for case in cases {
            let parsed = Url::parse(&case.url).unwrap();
            assert_eq!(is_loopback_host(&parsed), case.allowed, "{}", case.url);
            assert_eq!(
                canonicalize_endpoint(&case.url).is_ok(),
                case.allowed,
                "{}",
                case.url
            );
        }
    }

    #[test]
    fn save_resolve_list_and_delete_preserve_only_metadata() {
        let vault = vault();
        let metadata = vault.save(request("test-secret-value")).unwrap();
        assert_eq!(metadata.provider, "deepseek");
        assert_eq!(metadata.canonical_base_url, "https://api.deepseek.com/v1");
        assert_eq!(
            Uuid::parse_str(&metadata.credential_ref)
                .unwrap()
                .get_version_num(),
            4
        );

        let resolved = vault.resolve(&metadata.credential_ref).unwrap();
        assert_eq!(resolved.secret(), "test-secret-value");
        assert!(!format!("{resolved:?}").contains("test-secret-value"));

        let listed = vault
            .list_metadata(&[metadata.credential_ref.clone(), Uuid::new_v4().to_string()])
            .unwrap();
        assert_eq!(listed, vec![metadata.clone()]);
        assert!(!serde_json::to_string(&listed)
            .unwrap()
            .contains("test-secret-value"));

        vault.delete(&metadata.credential_ref).unwrap();
        assert_eq!(
            vault.resolve(&metadata.credential_ref).unwrap_err(),
            CredentialError::NotFound
        );
    }

    #[test]
    fn endpoint_policy_rejects_credentialed_remote_http_and_ambiguous_urls() {
        for endpoint in [
            "http://api.example.com/v1",
            "https://user:pass@example.com/v1",
            "https://example.com/v1?token=x",
            "https://example.com/v1#fragment",
            "file:///tmp/socket",
        ] {
            let mut input = request("secret");
            input.base_url = endpoint.to_owned();
            assert_eq!(
                vault().save(input).unwrap_err(),
                CredentialError::InvalidEndpoint,
                "endpoint should be rejected: {endpoint}"
            );
        }

        let mut loopback = request("secret");
        loopback.base_url = "http://127.0.0.1:8787/v1/".to_owned();
        assert_eq!(
            vault().save(loopback).unwrap().canonical_base_url,
            "http://127.0.0.1:8787/v1"
        );

        let mut scheme_less = request("secret");
        scheme_less.base_url = "  API.Example.COM:443//v1///  ".to_owned();
        assert_eq!(
            vault().save(scheme_less).unwrap().canonical_base_url,
            "https://api.example.com/v1"
        );

        let mut loopback_range = request("secret");
        loopback_range.base_url = "http://127.22.33.44:11434//v1//".to_owned();
        assert_eq!(
            vault().save(loopback_range).unwrap().canonical_base_url,
            "http://127.22.33.44:11434/v1"
        );

        for endpoint in ["https://example.com/v1?", "https://example.com/v1#"] {
            let mut input = request("secret");
            input.base_url = endpoint.to_owned();
            assert_eq!(
                vault().save(input).unwrap_err(),
                CredentialError::InvalidEndpoint
            );
        }
    }

    #[test]
    fn envelope_validation_fails_closed() {
        let store = Arc::new(InMemoryCredentialStore::default());
        let vault = CredentialVault::new(store.clone());
        let credential_ref = Uuid::new_v4().to_string();
        let malformed = SecretValue::new(
            r#"{"schemaVersion":1,"secret":"secret","provider":"deepseek","protocol":"openai-compatible","canonicalBaseUrl":"https://example.com/v1","extra":true}"#.to_owned(),
        );
        store.put(&credential_ref, &malformed).unwrap();
        assert_eq!(
            vault.resolve(&credential_ref).unwrap_err(),
            CredentialError::CorruptEntry
        );

        let another_ref = Uuid::new_v4().to_string();
        let unsupported = SecretValue::new(
            r#"{"schemaVersion":2,"secret":"secret","provider":"deepseek","protocol":"openai-compatible","canonicalBaseUrl":"https://example.com/v1"}"#.to_owned(),
        );
        store.put(&another_ref, &unsupported).unwrap();
        assert_eq!(
            vault.resolve(&another_ref).unwrap_err(),
            CredentialError::UnsupportedVersion
        );
    }

    #[test]
    fn immutable_references_cannot_be_overwritten() {
        let store = InMemoryCredentialStore::default();
        let credential_ref = Uuid::new_v4().to_string();
        let first = SecretValue::new("first".to_owned());
        let second = SecretValue::new("second".to_owned());
        store.put(&credential_ref, &first).unwrap();
        assert_eq!(
            store.put(&credential_ref, &second).unwrap_err(),
            CredentialError::AlreadyExists
        );
        assert_eq!(store.get(&credential_ref).unwrap().expose_secret(), "first");
    }

    #[test]
    fn invalid_reference_is_rejected_before_store_access() {
        assert_eq!(
            vault().resolve("deepseek-secret-prefix").unwrap_err(),
            CredentialError::InvalidReference
        );
    }

    #[test]
    fn complete_envelope_respects_windows_credential_blob_limit() {
        let largest_fitting_secret = (1..=MAX_STORED_ENVELOPE_BYTES)
            .rev()
            .find(|length| {
                encode_envelope(
                    &"x".repeat(*length),
                    "deepseek",
                    "openai-compatible",
                    "https://api.deepseek.com/v1",
                )
                .is_ok()
            })
            .expect("a non-empty secret should fit");
        let encoded = encode_envelope(
            &"x".repeat(largest_fitting_secret),
            "deepseek",
            "openai-compatible",
            "https://api.deepseek.com/v1",
        )
        .unwrap();
        assert!(encoded.expose_secret().len() <= MAX_STORED_ENVELOPE_BYTES);
        assert_eq!(
            encode_envelope(
                &"x".repeat(largest_fitting_secret + 1),
                "deepseek",
                "openai-compatible",
                "https://api.deepseek.com/v1",
            )
            .unwrap_err(),
            CredentialError::InvalidInput
        );
    }
}
