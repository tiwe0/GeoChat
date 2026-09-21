use log::{Level, LevelFilter, Metadata};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use tauri::{plugin::TauriPlugin, Runtime};
use tauri_plugin_log::{FileOpenStrategy, RotationStrategy, Target, TargetKind, TimezoneStrategy};

const LOG_FILE_NAME: &str = "geochat";
const LOG_FILE_SIZE_BYTES: u128 = 5 * 1024 * 1024;
const LOG_FILES_TO_KEEP: usize = 5;
const MAX_LOG_MESSAGE_CHARS: usize = 16 * 1024;

static FILE_LOGGING_ENABLED: AtomicBool = AtomicBool::new(false);
static FILE_LOGGING_LEVEL: AtomicU8 = AtomicU8::new(DesktopLogLevel::Info as u8);

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub(crate) enum DesktopLogLevel {
    Error = 1,
    Warn = 2,
    Info = 3,
    Debug = 4,
    Trace = 5,
}

impl DesktopLogLevel {
    pub(crate) fn parse(value: &str) -> Result<Self, String> {
        match value {
            "error" => Ok(Self::Error),
            "warn" => Ok(Self::Warn),
            "info" => Ok(Self::Info),
            "debug" => Ok(Self::Debug),
            "trace" => Ok(Self::Trace),
            _ => Err(format!("Unsupported log level: {value}")),
        }
    }

    pub(crate) fn as_log_level(self) -> Level {
        match self {
            Self::Error => Level::Error,
            Self::Warn => Level::Warn,
            Self::Info => Level::Info,
            Self::Debug => Level::Debug,
            Self::Trace => Level::Trace,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopLoggingPreferences {
    pub(crate) enabled: bool,
    pub(crate) level: DesktopLogLevel,
}

pub(crate) fn default_logging_preferences() -> DesktopLoggingPreferences {
    DesktopLoggingPreferences {
        enabled: false,
        level: DesktopLogLevel::Info,
    }
}

pub(crate) fn configure_logging(preferences: &DesktopLoggingPreferences) {
    FILE_LOGGING_LEVEL.store(preferences.level as u8, Ordering::Relaxed);
    FILE_LOGGING_ENABLED.store(preferences.enabled, Ordering::Release);
}

pub(crate) fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .level(LevelFilter::Trace)
        .target(
            Target::new(TargetKind::LogDir {
                file_name: Some(LOG_FILE_NAME.to_string()),
            })
            .filter(file_logging_allows),
        )
        .max_file_size(LOG_FILE_SIZE_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(LOG_FILES_TO_KEEP))
        .file_open_strategy(FileOpenStrategy::Rotate)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .build()
}

fn file_logging_allows(metadata: &Metadata<'_>) -> bool {
    FILE_LOGGING_ENABLED.load(Ordering::Acquire)
        && level_rank(metadata.level()) <= FILE_LOGGING_LEVEL.load(Ordering::Relaxed)
}

fn level_rank(level: Level) -> u8 {
    match level {
        Level::Error => DesktopLogLevel::Error as u8,
        Level::Warn => DesktopLogLevel::Warn as u8,
        Level::Info => DesktopLogLevel::Info as u8,
        Level::Debug => DesktopLogLevel::Debug as u8,
        Level::Trace => DesktopLogLevel::Trace as u8,
    }
}

/// Keep diagnostic logging useful without turning it into an accidental
/// credential or prompt archive. Callers should still log metadata rather than
/// request bodies; this is the final defensive boundary for renderer/sidecar text.
pub(crate) fn sanitize_message(message: &str) -> String {
    let normalized = message.to_ascii_lowercase();
    let sensitive_markers = [
        "authorization",
        "bearer ",
        "api key",
        "api_key",
        "apikey",
        "access_token",
        "refresh_token",
        "password",
        "secret",
    ];
    if sensitive_markers
        .iter()
        .any(|marker| normalized.contains(marker))
    {
        return "[redacted sensitive log message]".to_string();
    }

    message.chars().take(MAX_LOG_MESSAGE_CHARS).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logging_defaults_to_disabled_info() {
        let preferences = default_logging_preferences();
        assert!(!preferences.enabled);
        assert_eq!(preferences.level, DesktopLogLevel::Info);
    }

    #[test]
    fn configured_level_filters_less_severe_messages() {
        configure_logging(&DesktopLoggingPreferences {
            enabled: true,
            level: DesktopLogLevel::Warn,
        });
        assert!(file_logging_allows(
            &Metadata::builder().level(Level::Error).build()
        ));
        assert!(file_logging_allows(
            &Metadata::builder().level(Level::Warn).build()
        ));
        assert!(!file_logging_allows(
            &Metadata::builder().level(Level::Info).build()
        ));
        configure_logging(&default_logging_preferences());
    }

    #[test]
    fn sensitive_and_oversized_messages_are_bounded() {
        assert_eq!(
            sanitize_message("Authorization: Bearer example"),
            "[redacted sensitive log message]"
        );
        assert_eq!(
            sanitize_message(&"a".repeat(20_000)).chars().count(),
            16_384
        );
    }
}
