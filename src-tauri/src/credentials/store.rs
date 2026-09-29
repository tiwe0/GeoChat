use super::{CredentialError, SecretValue};

/// Minimal secure-storage port used by credential business logic.
///
/// The value is opaque to adapters. Envelope parsing and validation remains
/// in the repository-owned vault so platform and in-memory stores behave the
/// same way.
pub(crate) trait CredentialStore: Send + Sync {
    fn put(&self, credential_ref: &str, value: &SecretValue) -> Result<(), CredentialError>;
    fn get(&self, credential_ref: &str) -> Result<SecretValue, CredentialError>;
    fn delete(&self, credential_ref: &str) -> Result<(), CredentialError>;
    fn exists(&self, credential_ref: &str) -> Result<bool, CredentialError>;
}
