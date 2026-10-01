use super::{
    canonicalize_endpoint, validate_credential_ref, validate_protocol, validate_provider,
    CredentialError, CredentialMetadata,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use uuid::Uuid;

const JOURNAL_SCHEMA_VERSION: u32 = 1;
const JOURNAL_FILE_NAME: &str = "credential-lifecycle.json";
const MAX_JOURNAL_BYTES: u64 = 512 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields, tag = "kind")]
pub(crate) enum CredentialLifecycleOperation {
    Replacement {
        schema_version: u32,
        operation_id: String,
        target_provider: String,
        starting_config_json: String,
        new_credential: CredentialMetadata,
        previous_target_refs: Vec<String>,
    },
    Retirement {
        schema_version: u32,
        operation_id: String,
        starting_config_json: String,
        retiring_credential_ref: String,
    },
}

impl CredentialLifecycleOperation {
    pub(crate) fn replacement(
        operation_id: String,
        target_provider: String,
        starting_config_json: String,
        new_credential: CredentialMetadata,
        previous_target_refs: Vec<String>,
    ) -> Self {
        Self::Replacement {
            schema_version: JOURNAL_SCHEMA_VERSION,
            operation_id,
            target_provider,
            starting_config_json,
            new_credential,
            previous_target_refs,
        }
    }

    pub(crate) fn retirement(
        operation_id: String,
        starting_config_json: String,
        retiring_credential_ref: String,
    ) -> Self {
        Self::Retirement {
            schema_version: JOURNAL_SCHEMA_VERSION,
            operation_id,
            starting_config_json,
            retiring_credential_ref,
        }
    }

    pub(crate) fn operation_id(&self) -> &str {
        match self {
            Self::Replacement { operation_id, .. } | Self::Retirement { operation_id, .. } => {
                operation_id
            }
        }
    }

    pub(crate) fn starting_config_json(&self) -> &str {
        match self {
            Self::Replacement {
                starting_config_json,
                ..
            }
            | Self::Retirement {
                starting_config_json,
                ..
            } => starting_config_json,
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
                previous_target_refs,
                ..
            } => previous_target_refs
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
        let (schema_version, operation_id, starting_config_json) = match self {
            Self::Replacement {
                schema_version,
                operation_id,
                target_provider,
                starting_config_json,
                new_credential,
                previous_target_refs,
            } => {
                validate_provider(target_provider)?;
                validate_credential_ref(&new_credential.credential_ref)?;
                validate_protocol(&new_credential.protocol)?;
                let canonical = canonicalize_endpoint(&new_credential.canonical_base_url)?;
                if new_credential.provider != *target_provider
                    || canonical != new_credential.canonical_base_url
                    || previous_target_refs
                        .iter()
                        .any(|reference| validate_credential_ref(reference).is_err())
                    || previous_target_refs.iter().collect::<BTreeSet<_>>().len()
                        != previous_target_refs.len()
                {
                    return Err(CredentialError::CorruptEntry);
                }
                let recorded: BTreeSet<_> = previous_target_refs.iter().cloned().collect();
                if crate::renderer_storage::target_credential_refs_from_raw_config(
                    starting_config_json,
                    target_provider,
                )
                .map_err(|_| CredentialError::CorruptEntry)?
                    != recorded
                {
                    return Err(CredentialError::CorruptEntry);
                }
                let active = crate::renderer_storage::active_credential_refs_from_raw_config(
                    starting_config_json,
                )
                .map_err(|_| CredentialError::CorruptEntry)?;
                if active.contains(&new_credential.credential_ref) {
                    return Err(CredentialError::CorruptEntry);
                }
                (schema_version, operation_id, starting_config_json)
            }
            Self::Retirement {
                schema_version,
                operation_id,
                starting_config_json,
                retiring_credential_ref,
            } => {
                validate_credential_ref(retiring_credential_ref)?;
                if !crate::renderer_storage::active_credential_refs_from_raw_config(
                    starting_config_json,
                )
                .map_err(|_| CredentialError::CorruptEntry)?
                .contains(retiring_credential_ref)
                {
                    return Err(CredentialError::CorruptEntry);
                }
                (schema_version, operation_id, starting_config_json)
            }
        };
        if *schema_version != JOURNAL_SCHEMA_VERSION
            || !is_canonical_v4(operation_id)
            || starting_config_json.is_empty()
            || starting_config_json.len() as u64 > MAX_JOURNAL_BYTES
        {
            return Err(CredentialError::CorruptEntry);
        }
        crate::renderer_storage::active_credential_refs_from_raw_config(starting_config_json)
            .map_err(|_| CredentialError::CorruptEntry)?;
        Ok(())
    }
}

fn is_canonical_v4(value: &str) -> bool {
    Uuid::parse_str(value)
        .ok()
        .is_some_and(|id| id.get_version_num() == 4 && id.to_string() == value)
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
        let metadata = match fs::symlink_metadata(&self.path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return if self.has_recovery_artifact()? {
                    Err(CredentialError::CorruptEntry)
                } else {
                    Ok(None)
                };
            }
            Err(_) => return Err(CredentialError::StoreFailure),
        };
        if !metadata.file_type().is_file() || metadata.len() > MAX_JOURNAL_BYTES {
            return Err(CredentialError::CorruptEntry);
        }
        let file = OpenOptions::new()
            .read(true)
            .open(&self.path)
            .map_err(|_| CredentialError::StoreFailure)?;
        let opened = file.metadata().map_err(|_| CredentialError::StoreFailure)?;
        if !opened.is_file() || opened.len() > MAX_JOURNAL_BYTES {
            return Err(CredentialError::CorruptEntry);
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if metadata.dev() != opened.dev()
                || metadata.ino() != opened.ino()
                || opened.mode() & 0o077 != 0
            {
                return Err(CredentialError::CorruptEntry);
            }
        }
        let mut bytes = Vec::with_capacity(opened.len() as usize);
        file.take(MAX_JOURNAL_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| CredentialError::StoreFailure)?;
        if bytes.len() as u64 > MAX_JOURNAL_BYTES {
            return Err(CredentialError::CorruptEntry);
        }
        let operation: CredentialLifecycleOperation =
            serde_json::from_slice(&bytes).map_err(|_| CredentialError::CorruptEntry)?;
        operation.validate()?;
        Ok(Some(operation))
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
        if bytes.len() as u64 > MAX_JOURNAL_BYTES {
            return Err(CredentialError::InvalidInput);
        }
        // The journal is a fail-closed intent marker. Creating the final path
        // exclusively is safer than renaming over a path that could appear
        // after the preflight check. A crash during the write leaves a corrupt
        // marker, which strict loading intentionally blocks for inspection.
        write_synced_new(&self.path, &bytes)?;
        sync_directory(parent)
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
        if self.path.with_extension("previous").exists() {
            return Ok(true);
        }
        let prefix = format!("{JOURNAL_FILE_NAME}.corrupt-");
        match fs::read_dir(parent) {
            Ok(entries) => entries
                .map(|entry| entry.map_err(|_| CredentialError::StoreFailure))
                .try_fold(false, |found, entry| {
                    Ok(found || entry?.file_name().to_string_lossy().starts_with(&prefix))
                }),
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
    use super::*;

    fn config_json() -> String {
        serde_json::to_string(&serde_json::json!({
            "schemaVersion": 1,
            "model": { "provider": "deepseek", "model": "deepseek-flash", "credentialRef": "" },
            "visionModel": { "provider": "openrouter", "model": "vision", "credentialRef": "", "protocol": "openai-compatible", "supportsImages": true, "maxToolSteps": null },
            "providerCredentials": {
                "deepseek": { "credentialRef": "", "baseUrl": "https://api.deepseek.com", "protocol": "openai-compatible" },
                "openrouter": { "credentialRef": "", "baseUrl": "https://openrouter.ai/api/v1", "protocol": "openai-compatible" }
            },
            "customProvider": { "name": "", "baseUrl": "", "credentialRef": "", "protocol": "openai-compatible", "models": [] },
            "skills": { "enabled": true, "autoActivate": true, "enabledSkillNames": ["function-graph"], "visualProfile": "choice-comparison" },
            "interaction": { "mode": "fusion" },
            "debug": { "modelStepTimeoutMs": 120000 },
            "locale": "zh-CN"
        })).unwrap()
    }

    fn root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("geochat-journal-{label}-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn missing_current_with_previous_or_corrupt_artifact_fails_closed_repeatedly() {
        for artifact in [
            "credential-lifecycle.previous",
            "credential-lifecycle.json.corrupt-test",
        ] {
            let root = root("corrupt");
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

    #[test]
    fn oversized_or_non_regular_current_journal_fails_closed() {
        let root = root("shape");
        let path = root.join(JOURNAL_FILE_NAME);
        fs::write(&path, vec![b'x'; (MAX_JOURNAL_BYTES + 1) as usize]).unwrap();
        assert!(matches!(
            CredentialLifecycleJournal::new(&root).load_strict(),
            Err(CredentialError::CorruptEntry)
        ));
        fs::remove_file(&path).unwrap();
        fs::create_dir(&path).unwrap();
        assert!(matches!(
            CredentialLifecycleJournal::new(&root).load_strict(),
            Err(CredentialError::CorruptEntry)
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlink_journal_is_never_followed() {
        use std::os::unix::fs::symlink;
        let root = root("symlink");
        let outside = root.join("outside.json");
        fs::write(&outside, b"{}").unwrap();
        symlink(&outside, root.join(JOURNAL_FILE_NAME)).unwrap();
        assert!(matches!(
            CredentialLifecycleJournal::new(&root).load_strict(),
            Err(CredentialError::CorruptEntry)
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn group_or_other_readable_journal_is_rejected() {
        use std::os::unix::fs::PermissionsExt;
        let root = root("permissions");
        let journal = CredentialLifecycleJournal::new(&root);
        journal
            .create(&CredentialLifecycleOperation::replacement(
                Uuid::new_v4().to_string(),
                "deepseek".into(),
                config_json(),
                CredentialMetadata {
                    credential_ref: Uuid::new_v4().to_string(),
                    provider: "deepseek".into(),
                    protocol: "openai-compatible".into(),
                    canonical_base_url: "https://api.deepseek.com".into(),
                },
                vec![],
            ))
            .unwrap();
        fs::set_permissions(
            root.join(JOURNAL_FILE_NAME),
            fs::Permissions::from_mode(0o644),
        )
        .unwrap();
        assert!(matches!(
            journal.load_strict(),
            Err(CredentialError::CorruptEntry)
        ));
        fs::remove_dir_all(root).unwrap();
    }
}
