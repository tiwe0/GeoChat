use super::{CredentialError, CredentialStore, SecretValue};

const PRODUCTION_PROVIDER_CREDENTIAL_SERVICE: &str = "cafe.ivory.geochat.provider";
const DEVELOPMENT_PROVIDER_CREDENTIAL_SERVICE: &str = "cafe.ivory.geochat.provider.dev";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CredentialProfile {
    Production,
    Development,
}

impl CredentialProfile {
    const fn service_name(self) -> &'static str {
        match self {
            Self::Production => PRODUCTION_PROVIDER_CREDENTIAL_SERVICE,
            Self::Development => DEVELOPMENT_PROVIDER_CREDENTIAL_SERVICE,
        }
    }
}

/// Native adapter for macOS Keychain Services and Windows Credential Manager.
/// Each runtime profile receives a distinct service namespace.
pub(crate) struct PlatformCredentialStore {
    service_name: &'static str,
}

impl PlatformCredentialStore {
    pub(crate) fn new(profile: CredentialProfile) -> Result<Self, CredentialError> {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            keyring::v1::Entry::store_status()
                .as_ref()
                .map_err(map_keyring_error)?;
            Ok(Self {
                service_name: profile.service_name(),
            })
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            Err(CredentialError::StoreUnavailable)
        }
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    fn entry(&self, credential_ref: &str) -> Result<keyring::v1::Entry, CredentialError> {
        keyring::v1::Entry::new(self.service_name, credential_ref)
            .map_err(|error| map_keyring_error(&error))
    }
}

impl CredentialStore for PlatformCredentialStore {
    fn put(&self, credential_ref: &str, value: &SecretValue) -> Result<(), CredentialError> {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            let entry = self.entry(credential_ref)?;
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
            self.entry(credential_ref)?
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
            self.entry(credential_ref)?
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
    use super::{
        CredentialProfile, DEVELOPMENT_PROVIDER_CREDENTIAL_SERVICE,
        PRODUCTION_PROVIDER_CREDENTIAL_SERVICE,
    };

    #[test]
    fn service_names_are_isolated_by_profile() {
        assert_eq!(
            CredentialProfile::Production.service_name(),
            PRODUCTION_PROVIDER_CREDENTIAL_SERVICE
        );
        assert_eq!(
            CredentialProfile::Development.service_name(),
            DEVELOPMENT_PROVIDER_CREDENTIAL_SERVICE
        );
        assert_ne!(
            CredentialProfile::Production.service_name(),
            CredentialProfile::Development.service_name()
        );
    }
}
