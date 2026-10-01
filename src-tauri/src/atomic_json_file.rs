use serde::{de::DeserializeOwned, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

#[derive(Debug)]
pub(crate) struct AtomicJsonFile {
    path: PathBuf,
    lock_path: PathBuf,
    description: &'static str,
}

impl AtomicJsonFile {
    pub(crate) fn new(path: PathBuf, lock_file_name: &str, description: &'static str) -> Self {
        let lock_path = path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(lock_file_name);
        Self {
            path,
            lock_path,
            description,
        }
    }

    #[cfg(test)]
    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    /// Reports whether a current, previous, or quarantined document exists.
    /// Callers can use this while holding the file lock to distinguish a truly
    /// new document from persisted state that recovery had to quarantine.
    pub(crate) fn has_persisted_version(&self) -> Result<bool, String> {
        let backup = backup_path(&self.path);
        if self.path.exists() || backup.exists() {
            return Ok(true);
        }
        let parent = self
            .path
            .parent()
            .ok_or_else(|| format!("{} path has no parent directory", self.description))?;
        let current_prefix = format!(
            "{}.corrupt-",
            self.path.file_name().unwrap_or_default().to_string_lossy()
        );
        let backup_prefix = format!(
            "{}.corrupt-",
            backup.file_name().unwrap_or_default().to_string_lossy()
        );
        let entries = match fs::read_dir(parent) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => {
                return Err(format!(
                    "Failed to inspect {} directory {}: {error}",
                    self.description,
                    parent.display()
                ));
            }
        };
        for entry in entries {
            let entry = entry.map_err(|error| {
                format!(
                    "Failed to inspect {} directory {}: {error}",
                    self.description,
                    parent.display()
                )
            })?;
            let file_name = entry.file_name();
            let file_name = file_name.to_string_lossy();
            if file_name.starts_with(&current_prefix) || file_name.starts_with(&backup_prefix) {
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub(crate) fn lock(&self) -> Result<AtomicJsonFileLock, String> {
        let parent = self
            .lock_path
            .parent()
            .ok_or_else(|| format!("{} lock path has no parent directory", self.description))?;
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create {} directory {}: {error}",
                self.description,
                parent.display()
            )
        })?;
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(&self.lock_path)
            .map_err(|error| {
                format!(
                    "Failed to open {} lock {}: {error}",
                    self.description,
                    self.lock_path.display()
                )
            })?;
        File::lock(&file).map_err(|error| {
            format!(
                "Failed to acquire {} lock {}: {error}",
                self.description,
                self.lock_path.display()
            )
        })?;
        Ok(AtomicJsonFileLock { file })
    }

    /// Reads the current JSON document while recovering the last fully synced
    /// version when possible. Invalid documents are quarantined instead of
    /// preventing the application from starting.
    pub(crate) fn read_or_recover<T: DeserializeOwned>(
        &self,
        _lock: &AtomicJsonFileLock,
    ) -> Result<Option<T>, String> {
        match read_json::<T>(&self.path, self.description) {
            Ok(value) => Ok(Some(value)),
            Err(ReadJsonError::NotFound) => self.restore_backup_or_empty(),
            Err(ReadJsonError::Invalid(current_error)) => {
                if let Some(value) = self.read_valid_backup()? {
                    quarantine(&self.path, self.description)?;
                    self.restore_backup()?;
                    log::warn!(
                        target: "geochat::storage",
                        "Recovered invalid {} {} from its previous version: {}",
                        self.description,
                        self.path.display(),
                        current_error
                    );
                    return Ok(Some(value));
                }
                let quarantined = quarantine(&self.path, self.description)?;
                log::warn!(
                    target: "geochat::storage",
                    "Quarantined invalid {} {} at {}: {}",
                    self.description,
                    self.path.display(),
                    quarantined.display(),
                    current_error
                );
                Ok(None)
            }
            Err(ReadJsonError::Io(error)) => Err(error),
        }
    }

    pub(crate) fn write<T: Serialize>(
        &self,
        _lock: &AtomicJsonFileLock,
        value: &T,
    ) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(value)
            .map_err(|error| format!("Failed to serialize {}: {error}", self.description))?;
        match atomic_write(&self.path, &bytes, self.description) {
            Ok(()) => Ok(()),
            Err(error) => match fs::read(&self.path) {
                Ok(committed) if committed == bytes => Ok(()),
                _ => Err(error),
            },
        }
    }

    fn restore_backup_or_empty<T: DeserializeOwned>(&self) -> Result<Option<T>, String> {
        let Some(value) = self.read_valid_backup()? else {
            return Ok(None);
        };
        self.restore_backup()?;
        Ok(Some(value))
    }

    fn read_valid_backup<T: DeserializeOwned>(&self) -> Result<Option<T>, String> {
        let backup = backup_path(&self.path);
        match read_json::<T>(&backup, self.description) {
            Ok(value) => Ok(Some(value)),
            Err(ReadJsonError::NotFound) => Ok(None),
            Err(ReadJsonError::Invalid(error)) => {
                let quarantined = quarantine(&backup, self.description)?;
                log::warn!(
                    target: "geochat::storage",
                    "Quarantined invalid {} backup {} at {}: {}",
                    self.description,
                    backup.display(),
                    quarantined.display(),
                    error
                );
                Ok(None)
            }
            Err(ReadJsonError::Io(error)) => Err(error),
        }
    }

    fn restore_backup(&self) -> Result<(), String> {
        let bytes = fs::read(backup_path(&self.path)).map_err(|error| {
            format!(
                "Failed to read previous {} for {}: {error}",
                self.description,
                self.path.display()
            )
        })?;
        write_new_destination(&self.path, &bytes, self.description)
    }
}

pub(crate) struct AtomicJsonFileLock {
    file: File,
}

impl Drop for AtomicJsonFileLock {
    fn drop(&mut self) {
        let _ = File::unlock(&self.file);
    }
}

enum ReadJsonError {
    NotFound,
    Invalid(String),
    Io(String),
}

fn read_json<T: DeserializeOwned>(path: &Path, description: &str) -> Result<T, ReadJsonError> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| {
            ReadJsonError::Invalid(format!(
                "Failed to parse {description} {}: {error}",
                path.display()
            ))
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Err(ReadJsonError::NotFound),
        Err(error) => Err(ReadJsonError::Io(format!(
            "Failed to read {description} {}: {error}",
            path.display()
        ))),
    }
}

fn backup_path(destination: &Path) -> PathBuf {
    destination.with_extension("previous")
}

fn quarantine(path: &Path, description: &str) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("{description} path has no parent directory"))?;
    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
    let quarantined = parent.join(format!("{file_name}.corrupt-{}", Uuid::new_v4()));
    fs::rename(path, &quarantined).map_err(|error| {
        format!(
            "Failed to quarantine invalid {description} {}: {error}",
            path.display()
        )
    })?;
    sync_parent_directory(parent, description)?;
    Ok(quarantined)
}

fn atomic_write(path: &Path, bytes: &[u8], description: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("{description} path has no parent directory"))?;
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create {description} directory {}: {error}",
            parent.display()
        )
    })?;
    let temporary = temporary_path(path, "tmp");
    write_synced_file(&temporary, bytes, description)?;
    let result = replace_with_backup(&temporary, path, description)
        .and_then(|_| sync_parent_directory(parent, description));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn write_new_destination(path: &Path, bytes: &[u8], description: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("{description} path has no parent directory"))?;
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create {description} directory {}: {error}",
            parent.display()
        )
    })?;
    let temporary = temporary_path(path, "restore");
    write_synced_file(&temporary, bytes, description)?;
    let result = replace_without_backup(&temporary, path, description)
        .and_then(|_| sync_parent_directory(parent, description));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn temporary_path(path: &Path, suffix: &str) -> PathBuf {
    path.parent()
        .unwrap_or_else(|| Path::new("."))
        .join(format!(
            ".{}-{suffix}-{}.tmp",
            path.file_name().unwrap_or_default().to_string_lossy(),
            Uuid::new_v4()
        ))
}

fn write_synced_file(path: &Path, bytes: &[u8], description: &str) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|error| {
        format!(
            "Failed to create {description} temporary file {}: {error}",
            path.display()
        )
    })?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| {
            format!(
                "Failed to sync {description} temporary file {}: {error}",
                path.display()
            )
        })
}

#[cfg(not(target_os = "windows"))]
fn replace_with_backup(
    temporary: &Path,
    destination: &Path,
    description: &str,
) -> Result<(), String> {
    if destination.exists() {
        let backup = backup_path(destination);
        let backup_temporary = temporary_path(&backup, "tmp");
        let bytes = fs::read(destination).map_err(|error| {
            format!(
                "Failed to read current {description} {} for backup: {error}",
                destination.display()
            )
        })?;
        write_synced_file(&backup_temporary, &bytes, description)?;
        fs::rename(&backup_temporary, &backup).map_err(|error| {
            let _ = fs::remove_file(&backup_temporary);
            format!(
                "Failed to replace previous {description} backup {}: {error}",
                backup.display()
            )
        })?;
    }
    replace_without_backup(temporary, destination, description)
}

#[cfg(target_os = "windows")]
fn replace_with_backup(
    temporary: &Path,
    destination: &Path,
    description: &str,
) -> Result<(), String> {
    let backup = backup_path(destination);
    if backup.exists() {
        fs::remove_file(&backup).map_err(|error| {
            format!(
                "Failed to remove stale {description} backup {}: {error}",
                backup.display()
            )
        })?;
    }
    let had_destination = destination.exists();
    if had_destination {
        fs::rename(destination, &backup).map_err(|error| {
            format!(
                "Failed to stage previous {description} {}: {error}",
                destination.display()
            )
        })?;
    }
    if let Err(error) = fs::rename(temporary, destination) {
        if had_destination {
            fs::rename(&backup, destination).map_err(|restore_error| {
                format!(
                    "Failed to replace {description} {}: {error}; failed to restore its previous version: {restore_error}",
                    destination.display()
                )
            })?;
        }
        return Err(format!(
            "Failed to replace {description} {}: {error}",
            destination.display()
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn replace_without_backup(
    temporary: &Path,
    destination: &Path,
    description: &str,
) -> Result<(), String> {
    fs::rename(temporary, destination).map_err(|error| {
        format!(
            "Failed to atomically replace {description} {}: {error}",
            destination.display()
        )
    })
}

#[cfg(target_os = "windows")]
fn replace_without_backup(
    temporary: &Path,
    destination: &Path,
    description: &str,
) -> Result<(), String> {
    if destination.exists() {
        fs::remove_file(destination).map_err(|error| {
            format!(
                "Failed to remove invalid {description} {} during recovery: {error}",
                destination.display()
            )
        })?;
    }
    fs::rename(temporary, destination).map_err(|error| {
        format!(
            "Failed to restore {description} {}: {error}",
            destination.display()
        )
    })
}

#[cfg(unix)]
fn sync_parent_directory(parent: &Path, description: &str) -> Result<(), String> {
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| {
            format!(
                "Failed to sync {description} directory {}: {error}",
                parent.display()
            )
        })
}

#[cfg(not(unix))]
fn sync_parent_directory(_parent: &Path, _description: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use std::{sync::mpsc, thread, time::Duration};

    fn temporary_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("geochat-{label}-{}", Uuid::new_v4()))
    }

    #[test]
    fn atomic_write_preserves_the_previous_synced_document() {
        let root = temporary_directory("atomic-json-backup");
        let file = AtomicJsonFile::new(root.join("state.json"), ".state.lock", "test state");
        let lock = file.lock().expect("lock state");
        file.write(&lock, &json!({"version": 1}))
            .expect("write first version");
        file.write(&lock, &json!({"version": 2}))
            .expect("write second version");

        let previous: Value = serde_json::from_slice(
            &fs::read(backup_path(file.path())).expect("read previous version"),
        )
        .expect("parse previous version");
        assert_eq!(previous, json!({"version": 1}));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn invalid_current_document_recovers_the_previous_version() {
        let root = temporary_directory("atomic-json-recovery");
        let file = AtomicJsonFile::new(root.join("state.json"), ".state.lock", "test state");
        let lock = file.lock().expect("lock state");
        file.write(&lock, &json!({"version": 1}))
            .expect("write first version");
        file.write(&lock, &json!({"version": 2}))
            .expect("write second version");
        fs::write(file.path(), b"{").expect("corrupt current version");

        let recovered: Value = file
            .read_or_recover(&lock)
            .expect("recover state")
            .expect("state should exist");
        assert_eq!(recovered, json!({"version": 1}));
        assert_eq!(
            serde_json::from_slice::<Value>(&fs::read(file.path()).expect("read restored state"))
                .expect("parse restored state"),
            json!({"version": 1})
        );
        assert!(fs::read_dir(&root)
            .expect("list root")
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().contains(".corrupt-")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn invalid_document_without_backup_is_quarantined_and_treated_as_empty() {
        let root = temporary_directory("atomic-json-quarantine");
        fs::create_dir_all(&root).expect("create root");
        let file = AtomicJsonFile::new(root.join("state.json"), ".state.lock", "test state");
        fs::write(file.path(), b"{").expect("write invalid state");
        let lock = file.lock().expect("lock state");

        let recovered = file
            .read_or_recover::<Value>(&lock)
            .expect("quarantine invalid state");
        assert!(recovered.is_none());
        assert!(!file.path().exists());
        assert!(fs::read_dir(&root)
            .expect("list root")
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().contains(".corrupt-")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn file_lock_serializes_independent_instances() {
        let root = temporary_directory("atomic-json-lock");
        let first = AtomicJsonFile::new(root.join("state.json"), ".state.lock", "test state");
        let second = AtomicJsonFile::new(root.join("state.json"), ".state.lock", "test state");
        let first_lock = first.lock().expect("acquire first lock");
        let (sender, receiver) = mpsc::channel();
        let contender = thread::spawn(move || {
            let _lock = second.lock().expect("acquire second lock");
            sender.send(()).expect("report acquisition");
        });

        assert!(receiver.recv_timeout(Duration::from_millis(100)).is_err());
        drop(first_lock);
        receiver
            .recv_timeout(Duration::from_secs(2))
            .expect("second lock should acquire");
        contender.join().expect("join contender");
        let _ = fs::remove_dir_all(root);
    }
}
