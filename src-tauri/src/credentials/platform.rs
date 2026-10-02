use super::{CredentialError, CredentialStore, SecretValue};
use crate::atomic_json_file::{AtomicJsonFile, AtomicJsonFileLock};
use serde::{Deserialize, Serialize};
#[cfg(unix)]
use std::fs::File;
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use uuid::Uuid;
use zeroize::Zeroizing;

const CREDENTIAL_FILE_NAME: &str = "provider-credentials.json";
const CREDENTIAL_LOCK_NAME: &str = ".provider-credentials.lock";
const CREDENTIAL_FILE_VERSION: u32 = 1;
const MAX_CREDENTIAL_FILE_BYTES: u64 = 2 * 1024 * 1024;
#[cfg(windows)]
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CredentialFile {
    schema_version: u32,
    credentials: BTreeMap<String, SecretValue>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialFileRef<'a> {
    schema_version: u32,
    credentials: BTreeMap<&'a str, &'a str>,
}

/// Native-only credential configuration. The renderer stores references, never
/// this file or its cleartext values. Writes never retain a previous snapshot.
pub(crate) struct PlatformCredentialStore {
    path: PathBuf,
}

impl PlatformCredentialStore {
    pub(crate) fn new(app_data_dir: &Path) -> Result<Self, CredentialError> {
        let path = app_data_dir.join(CREDENTIAL_FILE_NAME);
        let store = Self { path };
        let lock = store.lock()?;
        store.remove_orphaned_temporary_files(&lock)?;
        store.read_locked(&lock)?;
        Ok(store)
    }

    fn lock(&self) -> Result<AtomicJsonFileLock, CredentialError> {
        AtomicJsonFile::new(
            self.path.clone(),
            CREDENTIAL_LOCK_NAME,
            "provider credentials",
        )
        .lock()
        .map_err(|_| CredentialError::StoreFailure)
    }

    fn remove_orphaned_temporary_files(
        &self,
        _lock: &AtomicJsonFileLock,
    ) -> Result<(), CredentialError> {
        let parent = self.path.parent().ok_or(CredentialError::StoreFailure)?;
        let prefix = format!(".{CREDENTIAL_FILE_NAME}-");
        let mut removed = false;
        for entry in fs::read_dir(parent).map_err(|_| CredentialError::StoreFailure)? {
            let entry = entry.map_err(|_| CredentialError::StoreFailure)?;
            let file_name = entry.file_name();
            let Some(identifier) = file_name
                .to_str()
                .and_then(|name| name.strip_prefix(&prefix))
                .and_then(|name| name.strip_suffix(".tmp"))
            else {
                continue;
            };
            if !Uuid::parse_str(identifier)
                .ok()
                .is_some_and(|uuid| uuid.get_version_num() == 4 && uuid.to_string() == identifier)
            {
                continue;
            }
            let path = entry.path();
            let metadata =
                fs::symlink_metadata(&path).map_err(|_| CredentialError::StoreFailure)?;
            if !metadata.file_type().is_file() {
                return Err(CredentialError::CorruptEntry);
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if metadata.permissions().mode() & 0o077 != 0 {
                    return Err(CredentialError::CorruptEntry);
                }
            }
            fs::remove_file(path).map_err(|_| CredentialError::StoreFailure)?;
            removed = true;
        }
        if removed {
            sync_directory(parent)?;
        }
        Ok(())
    }

    fn read_locked(&self, _lock: &AtomicJsonFileLock) -> Result<CredentialFile, CredentialError> {
        let metadata = match fs::symlink_metadata(&self.path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(CredentialFile {
                    schema_version: CREDENTIAL_FILE_VERSION,
                    credentials: BTreeMap::new(),
                });
            }
            Err(_) => return Err(CredentialError::StoreFailure),
        };
        if !metadata.file_type().is_file() || metadata.len() > MAX_CREDENTIAL_FILE_BYTES {
            return Err(CredentialError::CorruptEntry);
        }
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
        }
        let file = options
            .open(&self.path)
            .map_err(|_| CredentialError::StoreFailure)?;
        let opened = file.metadata().map_err(|_| CredentialError::StoreFailure)?;
        if !opened.is_file() || opened.len() > MAX_CREDENTIAL_FILE_BYTES {
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
        let mut bytes = Zeroizing::new(Vec::with_capacity(opened.len() as usize));
        file.take(MAX_CREDENTIAL_FILE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| CredentialError::StoreFailure)?;
        if bytes.len() as u64 > MAX_CREDENTIAL_FILE_BYTES {
            return Err(CredentialError::CorruptEntry);
        }
        let document: CredentialFile =
            serde_json::from_slice(&bytes).map_err(|_| CredentialError::CorruptEntry)?;
        if document.schema_version != CREDENTIAL_FILE_VERSION
            || document
                .credentials
                .keys()
                .any(|reference| super::validate_credential_ref(reference).is_err())
        {
            return Err(CredentialError::CorruptEntry);
        }
        Ok(document)
    }

    fn write_locked(
        &self,
        _lock: &AtomicJsonFileLock,
        document: &CredentialFile,
    ) -> Result<(), CredentialError> {
        let credentials = document
            .credentials
            .iter()
            .map(|(reference, value)| (reference.as_str(), value.expose_secret()))
            .collect();
        let bytes = Zeroizing::new(
            serde_json::to_vec_pretty(&CredentialFileRef {
                schema_version: CREDENTIAL_FILE_VERSION,
                credentials,
            })
            .map_err(|_| CredentialError::StoreFailure)?,
        );
        if bytes.len() as u64 > MAX_CREDENTIAL_FILE_BYTES {
            return Err(CredentialError::InvalidInput);
        }
        let parent = self.path.parent().ok_or(CredentialError::StoreFailure)?;
        let temporary = parent.join(format!(".{CREDENTIAL_FILE_NAME}-{}.tmp", Uuid::new_v4()));
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let result = (|| {
            let mut file = options
                .open(&temporary)
                .map_err(|_| CredentialError::StoreFailure)?;
            file.write_all(&bytes)
                .and_then(|_| file.sync_all())
                .map_err(|_| CredentialError::StoreFailure)?;
            drop(file);
            replace_credentials_file(&temporary, &self.path)?;
            sync_directory(parent)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }
}

impl CredentialStore for PlatformCredentialStore {
    fn put(&self, credential_ref: &str, value: &SecretValue) -> Result<(), CredentialError> {
        super::validate_credential_ref(credential_ref)?;
        let lock = self.lock()?;
        let mut document = self.read_locked(&lock)?;
        if document.credentials.contains_key(credential_ref) {
            return Err(CredentialError::AlreadyExists);
        }
        document.credentials.insert(
            credential_ref.to_owned(),
            SecretValue::new(value.expose_secret().to_owned()),
        );
        self.write_locked(&lock, &document)
    }

    fn get(&self, credential_ref: &str) -> Result<SecretValue, CredentialError> {
        super::validate_credential_ref(credential_ref)?;
        let lock = self.lock()?;
        self.read_locked(&lock)?
            .credentials
            .remove(credential_ref)
            .ok_or(CredentialError::NotFound)
    }

    fn delete(&self, credential_ref: &str) -> Result<(), CredentialError> {
        super::validate_credential_ref(credential_ref)?;
        let lock = self.lock()?;
        let mut document = self.read_locked(&lock)?;
        if document.credentials.remove(credential_ref).is_none() {
            return Err(CredentialError::NotFound);
        }
        self.write_locked(&lock, &document)
    }

    fn exists(&self, credential_ref: &str) -> Result<bool, CredentialError> {
        super::validate_credential_ref(credential_ref)?;
        let lock = self.lock()?;
        Ok(self
            .read_locked(&lock)?
            .credentials
            .contains_key(credential_ref))
    }
}

#[cfg(not(windows))]
fn replace_credentials_file(source: &Path, destination: &Path) -> Result<(), CredentialError> {
    fs::rename(source, destination).map_err(|_| CredentialError::StoreFailure)
}

#[cfg(windows)]
fn replace_credentials_file(source: &Path, destination: &Path) -> Result<(), CredentialError> {
    crate::atomic_json_file::move_file_write_through(
        source,
        destination,
        true,
        "provider credentials",
    )
    .map_err(|_| CredentialError::StoreFailure)
}

#[cfg(unix)]
fn sync_directory(parent: &Path) -> Result<(), CredentialError> {
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| CredentialError::StoreFailure)
}

#[cfg(not(unix))]
fn sync_directory(_parent: &Path) -> Result<(), CredentialError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(label: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("geochat-credentials-{label}-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create test directory");
        root
    }

    fn reference() -> String {
        Uuid::new_v4().to_string()
    }

    #[test]
    fn persists_credentials_without_backup_and_does_not_revive_deleted_values() {
        let root = root("persist");
        let first = reference();
        let second = reference();
        let store = PlatformCredentialStore::new(&root).unwrap();
        store
            .put(&first, &SecretValue::new("key-first".into()))
            .unwrap();
        store
            .put(&second, &SecretValue::new("key-second".into()))
            .unwrap();
        assert!(matches!(
            store.put(&first, &SecretValue::new("other".into())),
            Err(CredentialError::AlreadyExists)
        ));
        assert_eq!(
            PlatformCredentialStore::new(&root)
                .unwrap()
                .get(&first)
                .unwrap()
                .expose_secret(),
            "key-first"
        );
        store.delete(&first).unwrap();
        let reopened = PlatformCredentialStore::new(&root).unwrap();
        assert!(!reopened.exists(&first).unwrap());
        assert!(matches!(
            reopened.get(&first),
            Err(CredentialError::NotFound)
        ));
        assert_eq!(reopened.get(&second).unwrap().expose_secret(), "key-second");
        assert!(!root.join("provider-credentials.previous").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn corrupt_file_fails_closed_and_is_not_overwritten() {
        let root = root("corrupt");
        let path = root.join(CREDENTIAL_FILE_NAME);
        fs::write(&path, b"{").unwrap();
        assert!(matches!(
            PlatformCredentialStore::new(&root),
            Err(CredentialError::CorruptEntry)
        ));
        assert_eq!(fs::read(&path).unwrap(), b"{");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn concurrent_writers_keep_every_credential() {
        use std::{sync::Arc, thread};

        let root = root("concurrent");
        let store = Arc::new(PlatformCredentialStore::new(&root).unwrap());
        let references: Vec<_> = (0..12).map(|_| reference()).collect();
        let workers: Vec<_> = references
            .iter()
            .cloned()
            .map(|credential_ref| {
                let store = Arc::clone(&store);
                thread::spawn(move || {
                    store
                        .put(&credential_ref, &SecretValue::new("value".into()))
                        .unwrap();
                })
            })
            .collect();
        for worker in workers {
            worker.join().unwrap();
        }
        let reopened = PlatformCredentialStore::new(&root).unwrap();
        for credential_ref in references {
            assert!(reopened.exists(&credential_ref).unwrap());
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn application_data_directories_isolate_identical_references() {
        let development = root("development");
        let production = root("production");
        let credential_ref = reference();
        let development_store = PlatformCredentialStore::new(&development).unwrap();
        let production_store = PlatformCredentialStore::new(&production).unwrap();
        development_store
            .put(&credential_ref, &SecretValue::new("dev-only".into()))
            .unwrap();
        assert!(!production_store.exists(&credential_ref).unwrap());
        assert!(matches!(
            production_store.delete(&credential_ref),
            Err(CredentialError::NotFound)
        ));
        assert_eq!(
            development_store
                .get(&credential_ref)
                .unwrap()
                .expose_secret(),
            "dev-only"
        );
        fs::remove_dir_all(development).unwrap();
        fs::remove_dir_all(production).unwrap();
    }

    #[test]
    fn restart_removes_only_private_orphaned_credential_temporaries() {
        let root = root("orphaned-temp");
        let credential_ref = reference();
        let store = PlatformCredentialStore::new(&root).unwrap();
        store
            .put(&credential_ref, &SecretValue::new("active".into()))
            .unwrap();
        let orphan = root.join(format!(".{CREDENTIAL_FILE_NAME}-{}.tmp", Uuid::new_v4()));
        fs::write(&orphan, b"orphaned key").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&orphan, fs::Permissions::from_mode(0o600)).unwrap();
        }
        let unrelated = root.join(".provider-credentials.json-not-a-uuid.tmp");
        fs::write(&unrelated, b"not our temporary file").unwrap();
        let reopened = PlatformCredentialStore::new(&root).unwrap();
        assert!(!orphan.exists());
        assert!(unrelated.exists());
        assert_eq!(
            reopened.get(&credential_ref).unwrap().expose_secret(),
            "active"
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let symlink_path = root.join(format!(".{CREDENTIAL_FILE_NAME}-{}.tmp", Uuid::new_v4()));
            symlink(&unrelated, &symlink_path).unwrap();
            assert!(matches!(
                PlatformCredentialStore::new(&root),
                Err(CredentialError::CorruptEntry)
            ));
            assert!(unrelated.exists());
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn credential_file_is_private_and_symlinks_are_rejected() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let root = root("permissions");
        let store = PlatformCredentialStore::new(&root).unwrap();
        store
            .put(&reference(), &SecretValue::new("private".into()))
            .unwrap();
        let path = root.join(CREDENTIAL_FILE_NAME);
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
        assert!(matches!(
            PlatformCredentialStore::new(&root),
            Err(CredentialError::CorruptEntry)
        ));
        fs::remove_file(&path).unwrap();
        let target = root.join("target.json");
        fs::write(&target, b"{}").unwrap();
        symlink(&target, &path).unwrap();
        assert!(matches!(
            PlatformCredentialStore::new(&root),
            Err(CredentialError::CorruptEntry)
        ));
        fs::remove_dir_all(root).unwrap();
    }
}
