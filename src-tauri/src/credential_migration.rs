use crate::credentials::{canonicalize_endpoint, validate_protocol, validate_provider};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use uuid::Uuid;

const JOURNAL_SCHEMA_VERSION: u32 = 1;
const MAX_JOURNAL_BYTES: u64 = 64 * 1024;
const JOURNAL_FILE_NAME: &str = "credential-migration-v1.json";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CredentialMigrationPhase {
    Planned,
    SecretStored,
    ConfigSanitized,
    Complete,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CredentialMigrationJournalEntry {
    schema_version: u32,
    provider: String,
    protocol: String,
    canonical_base_url: String,
    credential_ref: String,
    source_fingerprint: String,
    phase: CredentialMigrationPhase,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CredentialMigrationJournal {
    schema_version: u32,
    entries: Vec<CredentialMigrationJournalEntry>,
}

impl CredentialMigrationJournal {
    fn validate(&self) -> Result<(), String> {
        if self.schema_version != JOURNAL_SCHEMA_VERSION || self.entries.len() > 64 {
            return Err("credential_migration_journal_invalid".to_owned());
        }
        let mut references = HashSet::with_capacity(self.entries.len());
        let mut fingerprints = HashSet::with_capacity(self.entries.len());
        for entry in &self.entries {
            let canonical_reference = Uuid::parse_str(&entry.credential_ref)
                .ok()
                .filter(|value| value.get_version_num() == 4)
                .map(|value| value.to_string());
            let canonical_endpoint = canonicalize_endpoint(&entry.canonical_base_url).ok();
            let fingerprint = entry.source_fingerprint.strip_prefix("sha256:");
            if entry.schema_version != JOURNAL_SCHEMA_VERSION
                || validate_provider(&entry.provider).is_err()
                || validate_protocol(&entry.protocol).is_err()
                || canonical_endpoint.as_deref() != Some(entry.canonical_base_url.as_str())
                || canonical_reference.as_deref() != Some(entry.credential_ref.as_str())
                || fingerprint.map_or(true, |digest| {
                    digest.len() != 64
                        || !digest
                            .bytes()
                            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
                })
                || !references.insert(entry.credential_ref.clone())
                || !fingerprints.insert(entry.source_fingerprint.clone())
            {
                return Err("credential_migration_journal_invalid".to_owned());
            }
        }
        Ok(())
    }

    pub(crate) fn allows_import(&self, credential_ref: &str) -> bool {
        self.entries.iter().any(|entry| {
            entry.credential_ref == credential_ref
                && matches!(
                    entry.phase,
                    CredentialMigrationPhase::Planned | CredentialMigrationPhase::SecretStored
                )
        })
    }
}

pub(crate) struct CredentialMigrationJournalStore {
    path: PathBuf,
}

impl CredentialMigrationJournalStore {
    pub(crate) fn new(app_data_dir: &Path) -> Self {
        Self {
            path: app_data_dir.join(JOURNAL_FILE_NAME),
        }
    }

    pub(crate) fn read(&self) -> Result<Option<CredentialMigrationJournal>, String> {
        let mut file = match File::open(&self.path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err("credential_migration_journal_read_failed".to_owned()),
        };
        let metadata = file
            .metadata()
            .map_err(|_| "credential_migration_journal_read_failed".to_owned())?;
        if metadata.len() > MAX_JOURNAL_BYTES {
            return Err("credential_migration_journal_invalid".to_owned());
        }
        let mut bytes = Vec::with_capacity(metadata.len() as usize);
        file.read_to_end(&mut bytes)
            .map_err(|_| "credential_migration_journal_read_failed".to_owned())?;
        let journal: CredentialMigrationJournal = serde_json::from_slice(&bytes)
            .map_err(|_| "credential_migration_journal_invalid".to_owned())?;
        journal.validate()?;
        Ok(Some(journal))
    }

    pub(crate) fn persist(&self, journal: &CredentialMigrationJournal) -> Result<(), String> {
        journal.validate()?;
        let bytes = serde_json::to_vec(journal)
            .map_err(|_| "credential_migration_journal_invalid".to_owned())?;
        if bytes.len() as u64 > MAX_JOURNAL_BYTES {
            return Err("credential_migration_journal_invalid".to_owned());
        }
        let parent = self
            .path
            .parent()
            .ok_or_else(|| "credential_migration_journal_write_failed".to_owned())?;
        fs::create_dir_all(parent)
            .map_err(|_| "credential_migration_journal_write_failed".to_owned())?;
        let temporary = parent.join(format!(".{JOURNAL_FILE_NAME}.{}.tmp", Uuid::new_v4()));
        let result = (|| {
            let mut options = OpenOptions::new();
            options.create_new(true).write(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options
                .open(&temporary)
                .map_err(|_| "credential_migration_journal_write_failed".to_owned())?;
            file.write_all(&bytes)
                .and_then(|_| file.sync_all())
                .map_err(|_| "credential_migration_journal_write_failed".to_owned())?;
            fs::rename(&temporary, &self.path)
                .map_err(|_| "credential_migration_journal_write_failed".to_owned())?;
            sync_parent_directory(parent)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    pub(crate) fn delete(&self) -> Result<(), String> {
        match fs::remove_file(&self.path) {
            Ok(()) => {
                if let Some(parent) = self.path.parent() {
                    sync_parent_directory(parent)?;
                }
                Ok(())
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err("credential_migration_journal_delete_failed".to_owned()),
        }
    }
}

#[cfg(unix)]
fn sync_parent_directory(parent: &Path) -> Result<(), String> {
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| "credential_migration_journal_write_failed".to_owned())
}

#[cfg(not(unix))]
fn sync_parent_directory(_parent: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn journal(reference: &str) -> CredentialMigrationJournal {
        CredentialMigrationJournal {
            schema_version: 1,
            entries: vec![CredentialMigrationJournalEntry {
                schema_version: 1,
                provider: "openai".to_owned(),
                protocol: "openai-compatible".to_owned(),
                canonical_base_url: "https://api.openai.com/v1".to_owned(),
                credential_ref: reference.to_owned(),
                source_fingerprint: format!("sha256:{}", "ab".repeat(32)),
                phase: CredentialMigrationPhase::Planned,
            }],
        }
    }

    #[test]
    fn journal_round_trips_atomically_without_secret_fields() {
        let root =
            std::env::temp_dir().join(format!("geochat-credential-journal-{}", Uuid::new_v4()));
        let store = CredentialMigrationJournalStore::new(&root);
        let reference = Uuid::new_v4().to_string();
        let value = journal(&reference);
        store.persist(&value).unwrap();
        let bytes = fs::read(root.join(JOURNAL_FILE_NAME)).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("secret"));
        assert!(store.read().unwrap().unwrap().allows_import(&reference));
        store.delete().unwrap();
        assert!(store.read().unwrap().is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn journal_rejects_duplicate_references_and_unknown_fields() {
        let reference = Uuid::new_v4().to_string();
        let mut duplicate = journal(&reference);
        duplicate.entries.push(duplicate.entries[0].clone());
        assert_eq!(
            duplicate.validate().unwrap_err(),
            "credential_migration_journal_invalid"
        );
        assert!(serde_json::from_str::<CredentialMigrationJournal>(
            r#"{"schemaVersion":1,"entries":[],"secret":"nope"}"#
        )
        .is_err());
    }
}
