use serde::{Serialize, Serializer};
use std::fmt;

/// Stable, redacted failures exposed across the credential boundary.
///
/// Platform errors are intentionally collapsed into these codes. They may
/// contain credential-store details (and, for malformed entries, raw bytes),
/// so their messages must never cross the command or logging boundary.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum CredentialError {
    InvalidInput,
    InvalidReference,
    InvalidEndpoint,
    AlreadyExists,
    NotFound,
    CorruptEntry,
    UnsupportedVersion,
    StoreUnavailable,
    StoreFailure,
    TaskFailure,
    MigrationDisabled,
}

impl CredentialError {
    pub(crate) const fn code(self) -> &'static str {
        match self {
            Self::InvalidInput => "credential_invalid_input",
            Self::InvalidReference => "credential_invalid_reference",
            Self::InvalidEndpoint => "credential_invalid_endpoint",
            Self::AlreadyExists => "credential_already_exists",
            Self::NotFound => "credential_not_found",
            Self::CorruptEntry => "credential_corrupt_entry",
            Self::UnsupportedVersion => "credential_unsupported_version",
            Self::StoreUnavailable => "credential_store_unavailable",
            Self::StoreFailure => "credential_store_failure",
            Self::TaskFailure => "credential_task_failure",
            Self::MigrationDisabled => "credential_migration_disabled",
        }
    }
}

impl fmt::Debug for CredentialError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl fmt::Display for CredentialError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for CredentialError {}

impl Serialize for CredentialError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.code())
    }
}

#[cfg(test)]
mod tests {
    use super::CredentialError;

    #[test]
    fn debug_and_display_only_emit_stable_codes() {
        let error = CredentialError::CorruptEntry;
        assert_eq!(format!("{error:?}"), "credential_corrupt_entry");
        assert_eq!(error.to_string(), "credential_corrupt_entry");
        assert_eq!(
            serde_json::to_string(&error).unwrap(),
            "\"credential_corrupt_entry\""
        );
    }
}
