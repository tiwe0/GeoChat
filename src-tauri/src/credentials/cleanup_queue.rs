use super::{validate_credential_ref, CredentialError};
use crate::atomic_json_file::AtomicJsonFile;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, path::Path};

const CLEANUP_QUEUE_SCHEMA_VERSION: u32 = 1;
const CLEANUP_QUEUE_FILE_NAME: &str = "credential-cleanup-queue.json";
const CLEANUP_QUEUE_LOCK_FILE_NAME: &str = ".credential-cleanup-queue.lock";

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CleanupQueueDocument {
    schema_version: u32,
    credential_refs: BTreeSet<String>,
}

/// Durable, non-secret compensation state for credentials whose deletion must
/// be retried. The document contains only opaque UUID references; credential
/// values remain exclusively in the platform credential store.
pub(crate) struct CredentialCleanupQueue {
    file: AtomicJsonFile,
}

impl CredentialCleanupQueue {
    pub(crate) fn new(app_data_dir: &Path) -> Self {
        Self {
            file: AtomicJsonFile::new(
                app_data_dir.join(CLEANUP_QUEUE_FILE_NAME),
                CLEANUP_QUEUE_LOCK_FILE_NAME,
                "credential cleanup queue",
            ),
        }
    }

    pub(crate) fn list(&self) -> Result<Vec<String>, CredentialError> {
        let lock = self
            .file
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?;
        let document = self.load(&lock)?;
        Ok(document.credential_refs.into_iter().collect())
    }

    pub(crate) fn track(&self, credential_ref: &str) -> Result<(), CredentialError> {
        validate_credential_ref(credential_ref)?;
        let lock = self
            .file
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?;
        let mut document = self.load(&lock)?;
        if document.credential_refs.insert(credential_ref.to_owned()) {
            self.file
                .write(&lock, &document)
                .map_err(|_| CredentialError::StoreFailure)?;
        }
        Ok(())
    }

    pub(crate) fn remove(&self, credential_ref: &str) -> Result<(), CredentialError> {
        validate_credential_ref(credential_ref)?;
        let lock = self
            .file
            .lock()
            .map_err(|_| CredentialError::StoreFailure)?;
        let mut document = self.load(&lock)?;
        if document.credential_refs.remove(credential_ref) {
            self.file
                .write(&lock, &document)
                .map_err(|_| CredentialError::StoreFailure)?;
        }
        Ok(())
    }

    fn load(
        &self,
        lock: &crate::atomic_json_file::AtomicJsonFileLock,
    ) -> Result<CleanupQueueDocument, CredentialError> {
        let had_persisted_version = self
            .file
            .has_persisted_version()
            .map_err(|_| CredentialError::StoreFailure)?;
        let recovered = self
            .file
            .read_or_recover(lock)
            .map_err(|_| CredentialError::StoreFailure)?;
        if recovered.is_none() && had_persisted_version {
            return Err(CredentialError::CorruptEntry);
        }
        let document = recovered.unwrap_or_else(|| CleanupQueueDocument {
            schema_version: CLEANUP_QUEUE_SCHEMA_VERSION,
            credential_refs: BTreeSet::new(),
        });
        if document.schema_version != CLEANUP_QUEUE_SCHEMA_VERSION
            || document
                .credential_refs
                .iter()
                .any(|credential_ref| validate_credential_ref(credential_ref).is_err())
        {
            return Err(CredentialError::CorruptEntry);
        }
        Ok(document)
    }
}

#[cfg(test)]
mod tests {
    use super::CredentialCleanupQueue;
    use crate::credentials::CredentialError;
    use std::{fs, path::PathBuf};
    use uuid::Uuid;

    fn temporary_directory(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "geochat-credential-cleanup-{label}-{}",
            Uuid::new_v4()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn pending_reference_survives_queue_reconstruction_and_contains_no_secret() {
        let root = temporary_directory("restart");
        let credential_ref = Uuid::new_v4().to_string();
        let secret = "must-never-be-persisted";

        CredentialCleanupQueue::new(&root)
            .track(&credential_ref)
            .unwrap();

        let reloaded = CredentialCleanupQueue::new(&root);
        assert_eq!(reloaded.list().unwrap(), vec![credential_ref.clone()]);
        let persisted = fs::read_to_string(root.join("credential-cleanup-queue.json")).unwrap();
        assert!(persisted.contains(&credential_ref));
        assert!(!persisted.contains(secret));

        reloaded.remove(&credential_ref).unwrap();
        assert!(CredentialCleanupQueue::new(&root)
            .list()
            .unwrap()
            .is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn queue_is_deduplicated_and_stably_ordered() {
        let root = temporary_directory("deduplicate");
        let first = Uuid::new_v4().to_string();
        let second = Uuid::new_v4().to_string();
        let queue = CredentialCleanupQueue::new(&root);
        queue.track(&second).unwrap();
        queue.track(&first).unwrap();
        queue.track(&second).unwrap();

        let mut expected = vec![first, second];
        expected.sort();
        assert_eq!(queue.list().unwrap(), expected);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn corrupt_current_document_fails_closed_instead_of_becoming_an_empty_queue() {
        let root = temporary_directory("corrupt-current");
        fs::write(root.join("credential-cleanup-queue.json"), b"not-json").unwrap();

        assert_eq!(
            CredentialCleanupQueue::new(&root).list(),
            Err(CredentialError::CorruptEntry)
        );
        assert_eq!(
            CredentialCleanupQueue::new(&root).list(),
            Err(CredentialError::CorruptEntry)
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn corrupt_backup_fails_closed_when_the_current_document_is_missing() {
        let root = temporary_directory("corrupt-backup");
        fs::write(root.join("credential-cleanup-queue.previous"), b"not-json").unwrap();

        assert_eq!(
            CredentialCleanupQueue::new(&root).list(),
            Err(CredentialError::CorruptEntry)
        );
        assert_eq!(
            CredentialCleanupQueue::new(&root).list(),
            Err(CredentialError::CorruptEntry)
        );
        fs::remove_dir_all(root).unwrap();
    }
}
