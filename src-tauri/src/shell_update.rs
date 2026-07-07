use crate::env_config::{configured_string, development_env};
use base64::Engine;

pub(crate) fn shell_update_configured() -> bool {
    shell_update_public_key().is_some() && shell_update_endpoint().is_some()
}

pub(crate) fn shell_update_endpoint() -> Option<String> {
    configured_string(&[
        development_env("GEOCHAT_SHELL_UPDATE_ENDPOINT"),
        option_env!("GEOCHAT_SHELL_UPDATE_ENDPOINT").map(str::to_string),
    ])
}

pub(crate) fn shell_update_public_key() -> Option<String> {
    configured_string(&[
        development_env("GEOCHAT_SHELL_UPDATE_PUBLIC_KEY"),
        option_env!("GEOCHAT_SHELL_UPDATE_PUBLIC_KEY").map(str::to_string),
    ])
    .or_else(|| {
        configured_string(&[
            development_env("GEOCHAT_SHELL_UPDATE_PUBLIC_KEY_BASE64"),
            option_env!("GEOCHAT_SHELL_UPDATE_PUBLIC_KEY_BASE64").map(str::to_string),
        ])
        .and_then(|encoded| {
            base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .ok()
        })
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .map(|decoded| decoded.trim().to_string())
        .filter(|decoded| !decoded.is_empty())
    })
}
