use super::{CredentialError, CredentialStore, SecretValue};
use std::{collections::HashMap, sync::Mutex};

/// Repository-owned test store, isolated per test case.
#[derive(Default)]
pub(crate) struct InMemoryCredentialStore {
    entries: Mutex<HashMap<String, SecretValue>>,
}

impl CredentialStore for InMemoryCredentialStore {
    fn put(&self, credential_ref: &str, value: &SecretValue) -> Result<(), CredentialError> {
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?;
        if entries.contains_key(credential_ref) {
            return Err(CredentialError::AlreadyExists);
        }
        entries.insert(credential_ref.to_owned(), value.duplicate());
        Ok(())
    }

    fn get(&self, credential_ref: &str) -> Result<SecretValue, CredentialError> {
        self.entries
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?
            .get(credential_ref)
            .map(SecretValue::duplicate)
            .ok_or(CredentialError::NotFound)
    }

    fn delete(&self, credential_ref: &str) -> Result<(), CredentialError> {
        let removed = self
            .entries
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?
            .remove(credential_ref);
        if removed.is_some() {
            Ok(())
        } else {
            Err(CredentialError::NotFound)
        }
    }

    fn exists(&self, credential_ref: &str) -> Result<bool, CredentialError> {
        Ok(self
            .entries
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?
            .contains_key(credential_ref))
    }
}
