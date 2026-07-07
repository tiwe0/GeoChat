use std::env;

pub(crate) fn configured_string(values: &[Option<String>]) -> Option<String> {
    values
        .iter()
        .flatten()
        .map(|value| value.trim().to_string())
        .find(|value| !value.is_empty())
}

pub(crate) fn development_env(name: &str) -> Option<String> {
    conditional_env(name, cfg!(debug_assertions))
}

pub(crate) fn conditional_env(name: &str, enabled: bool) -> Option<String> {
    if enabled {
        env::var(name).ok()
    } else {
        None
    }
}
