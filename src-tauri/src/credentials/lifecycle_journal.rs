use super::{validate_credential_ref, CredentialError, CredentialMetadata};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

const JOURNAL_SCHEMA_VERSION: u32 = 1;
const JOURNAL_FILE_NAME: &str = "credential-lifecycle.json";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields, tag = "kind")]
pub(crate) enum CredentialLifecycleOperation {
    Replacement {
        schema_version: u32,
        operation_id: String,
        new_credential: CredentialMetadata,
        previous_active_refs: Vec<String>,
    },
    Retirement {
        schema_version: u32,
        operation_id: String,
        retiring_credential_ref: String,
        previous_active_refs: Vec<String>,
    },
}

impl CredentialLifecycleOperation {
    pub(crate) fn replacement(
        operation_id: String,
        new_credential: CredentialMetadata,
        previous_active_refs: Vec<String>,
    ) -> Self {
        Self::Replacement {
            schema_version: JOURNAL_SCHEMA_VERSION,
            operation_id,
            new_credential,
            previous_active_refs,
        }
    }

    pub(crate) fn retirement(
        operation_id: String,
        retiring_credential_ref: String,
        previous_active_refs: Vec<String>,
    ) -> Self {
        Self::Retirement {
            schema_version: JOURNAL_SCHEMA_VERSION,
            operation_id,
            retiring_credential_ref,
            previous_active_refs,
        }
    }

    pub(crate) fn operation_id(&self) -> &str {
        match self {
            Self::Replacement { operation_id, .. } | Self::Retirement { operation_id, .. } => {
                operation_id
            }
        }
    }

    pub(crate) fn new_ref(&self) -> Option<&str> {
        match self {
            Self::Replacement { new_credential, .. } => Some(&new_credential.credential_ref),
            Self::Retirement { .. } => None,
        }
    }

    pub(crate) fn cleanup_candidates(&self) -> Vec<&str> {
        match self {
            Self::Replacement {
                new_credential,
                previous_active_refs,
                ..
            } => previous_active_refs
                .iter()
                .map(String::as_str)
                .chain(std::iter::once(new_credential.credential_ref.as_str()))
                .collect(),
            Self::Retirement {
                retiring_credential_ref,
                ..
            } => vec![retiring_credential_ref],
        }
    }

    fn validate(&self) -> Result<(), CredentialError> {
        let (schema_version, operation_id, previous_active_refs) = match self {
            Self::Replacement {
                schema_version,
                operation_id,
                new_credential,
                previous_active_refs,
            } => {
                validate_credential_ref(&new_credential.credential_ref)?;
                (schema_version, operation_id, previous_active_refs)
            }
            Self::Retirement {
                schema_version,
                operation_id,
                retiring_credential_ref,
                previous_active_refs,
            } => {
                validate_credential_ref(retiring_credential_ref)?;
                (schema_version, operation_id, previous_active_refs)
            }
        };
        if *schema_version != JOURNAL_SCHEMA_VERSION
            || Uuid::parse_str(operation_id)
                .ok()
                .filter(|id| id.get_version_num() == 4 && id.to_string() == *operation_id)
                .is_none()
            || previous_active_refs
                .iter()
                .any(|credential_ref| validate_credential_ref(credential_ref).is_err())
        {
            return Err(CredentialError::CorruptEntry);
        }
        Ok(())
    }
}

pub(crate) struct CredentialLifecycleJournal {
    path: PathBuf,
    #[cfg(test)]
    fail_create: bool,
}

impl CredentialLifecycleJournal {
    pub(crate) fn new(app_data_dir: &Path) -> Self {
        Self {
            path: app_data_dir.join(JOURNAL_FILE_NAME),
            #[cfg(test)]
            fail_create: false,
        }
    }

    #[cfg(test)]
    pub(crate) fn failing_create(app_data_dir: &Path) -> Self {
        Self {
            path: app_data_dir.join(JOURNAL_FILE_NAME),
            fail_create: true,
        }
    }

    pub(crate) fn load_strict(
        &self,
    ) -> Result<Option<CredentialLifecycleOperation>, CredentialError> {
        match fs::read(&self.path) {
            Ok(bytes) => {
                let operation: CredentialLifecycleOperation =
                    serde_json::from_slice(&bytes).map_err(|_| CredentialError::CorruptEntry)?;
                operation.validate()?;
                Ok(Some(operation))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                if self.has_recovery_artifact()? {
                    Err(CredentialError::CorruptEntry)
                } else {
                    Ok(None)
                }
            }
            Err(_) => Err(CredentialError::StoreFailure),
        }
    }

    pub(crate) fn create(
        &self,
        operation: &CredentialLifecycleOperation,
    ) -> Result<(), CredentialError> {
        #[cfg(test)]
        if self.fail_create {
            return Err(CredentialError::StoreFailure);
        }
        operation.validate()?;
        if self.load_strict()?.is_some() {
            return Err(CredentialError::AlreadyExists);
        }
        let parent = self.path.parent().ok_or(CredentialError::StoreFailure)?;
        fs::create_dir_all(parent).map_err(|_| CredentialError::StoreFailure)?;
        let bytes =
            serde_json::to_vec_pretty(operation).map_err(|_| CredentialError::StoreFailure)?;
        let temporary = parent.join(format!(".{JOURNAL_FILE_NAME}-{}.tmp", Uuid::new_v4()));
        write_synced_new(&temporary, &bytes)?;
        match fs::rename(&temporary, &self.path) {
            Ok(()) => sync_directory(parent),
            Err(_) => {
                let _ = fs::remove_file(temporary);
                Err(CredentialError::StoreFailure)
            }
        }
    }

    pub(crate) fn clear(&self) -> Result<(), CredentialError> {
        match fs::remove_file(&self.path) {
            Ok(()) => sync_directory(self.path.parent().ok_or(CredentialError::StoreFailure)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                if self.has_recovery_artifact()? {
                    Err(CredentialError::CorruptEntry)
                } else {
                    Ok(())
                }
            }
            Err(_) => Err(CredentialError::StoreFailure),
        }
    }

    fn has_recovery_artifact(&self) -> Result<bool, CredentialError> {
        let parent = self.path.parent().ok_or(CredentialError::StoreFailure)?;
        let previous = self.path.with_extension("previous");
        if previous.exists() {
            return Ok(true);
        }
        let prefix = format!("{JOURNAL_FILE_NAME}.corrupt-");
        match fs::read_dir(parent) {
            Ok(entries) => {
                for entry in entries {
                    let entry = entry.map_err(|_| CredentialError::StoreFailure)?;
                    if entry.file_name().to_string_lossy().starts_with(&prefix) {
                        return Ok(true);
                    }
                }
                Ok(false)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(_) => Err(CredentialError::StoreFailure),
        }
    }
}

fn write_synced_new(path: &Path, bytes: &[u8]) -> Result<(), CredentialError> {
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|_| CredentialError::StoreFailure)?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| CredentialError::StoreFailure)
}

fn sync_directory(path: &Path) -> Result<(), CredentialError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| CredentialError::StoreFailure)
}

#[cfg(test)]
mod tests {
    use super::CredentialLifecycleJournal;
    use crate::credentials::CredentialError;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn missing_current_with_previous_or_corrupt_artifact_fails_closed_repeatedly() {
        for artifact in [
            "credential-lifecycle.previous",
            "credential-lifecycle.json.corrupt-test",
        ] {
            let root =
                std::env::temp_dir().join(format!("geochat-journal-corrupt-{}", Uuid::new_v4()));
            fs::create_dir_all(&root).unwrap();
            fs::write(root.join(artifact), b"").unwrap();
            let journal = CredentialLifecycleJournal::new(&root);
            assert!(matches!(
                journal.load_strict(),
                Err(CredentialError::CorruptEntry)
            ));
            assert!(matches!(
                journal.load_strict(),
                Err(CredentialError::CorruptEntry)
            ));
            fs::remove_dir_all(root).unwrap();
        }
    }
}
