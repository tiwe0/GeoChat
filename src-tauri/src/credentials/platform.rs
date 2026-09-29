use super::{CredentialError, CredentialStore, SecretValue};

pub(crate) const PROVIDER_CREDENTIAL_SERVICE: &str = "cafe.ivory.geochat.provider";

/// Production adapter for macOS Keychain Services and Windows Credential
/// Manager through keyring 4.x's stable v1 API.
pub(crate) struct PlatformCredentialStore;

impl PlatformCredentialStore {
    pub(crate) fn new() -> Result<Self, CredentialError> {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            keyring::v1::Entry::store_status()
                .as_ref()
                .map_err(map_keyring_error)?;
            Ok(Self)
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            Err(CredentialError::StoreUnavailable)
        }
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    fn entry(credential_ref: &str) -> Result<keyring::v1::Entry, CredentialError> {
        keyring::v1::Entry::new(PROVIDER_CREDENTIAL_SERVICE, credential_ref)
            .map_err(|error| map_keyring_error(&error))
    }
}

impl CredentialStore for PlatformCredentialStore {
    fn put(&self, credential_ref: &str, value: &SecretValue) -> Result<(), CredentialError> {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            let entry = Self::entry(credential_ref)?;
            match entry.get_password() {
                Ok(_) => return Err(CredentialError::AlreadyExists),
                Err(keyring::Error::NoEntry) => {}
                Err(error) => return Err(map_keyring_error(&error)),
            }
            entry
                .set_password(value.expose_secret())
                .map_err(|error| map_keyring_error(&error))
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let _ = (credential_ref, value);
            Err(CredentialError::StoreUnavailable)
        }
    }

    fn get(&self, credential_ref: &str) -> Result<SecretValue, CredentialError> {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            Self::entry(credential_ref)?
                .get_password()
                .map(SecretValue::new)
                .map_err(|error| map_keyring_error(&error))
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let _ = credential_ref;
            Err(CredentialError::StoreUnavailable)
        }
    }

    fn delete(&self, credential_ref: &str) -> Result<(), CredentialError> {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            Self::entry(credential_ref)?
                .delete_credential()
                .map_err(|error| map_keyring_error(&error))
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let _ = credential_ref;
            Err(CredentialError::StoreUnavailable)
        }
    }

    fn exists(&self, credential_ref: &str) -> Result<bool, CredentialError> {
        match self.get(credential_ref) {
            Ok(_) => Ok(true),
            Err(CredentialError::NotFound) => Ok(false),
            Err(error) => Err(error),
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn map_keyring_error(error: &keyring::Error) -> CredentialError {
    match error {
        keyring::Error::NoEntry => CredentialError::NotFound,
        keyring::Error::NoStorageAccess(_) | keyring::Error::NoDefaultStore => {
            CredentialError::StoreUnavailable
        }
        _ => CredentialError::StoreFailure,
    }
}

#[cfg(test)]
mod tests {
    use super::PROVIDER_CREDENTIAL_SERVICE;

    #[test]
    fn production_service_name_is_fixed() {
        assert_eq!(PROVIDER_CREDENTIAL_SERVICE, "cafe.ivory.geochat.provider");
    }
}
