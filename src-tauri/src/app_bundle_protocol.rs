use tauri::http;

/// CSP enforced by the production `geochat-bundle` custom protocol.
///
/// Tauri applies `app.security.csp` while serving its built-in asset protocol,
/// but registered custom protocol responses bypass that asset transformation.
/// Keep this value synchronized with `tauri.conf.json`; a behavioral test
/// asserts both the emitted response header and config parity.
pub(crate) const APP_BUNDLE_CONTENT_SECURITY_POLICY: &str = "default-src 'self' geochat-bundle:; connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:*; script-src 'self' geochat-bundle: 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' geochat-bundle: 'unsafe-inline'; img-src 'self' geochat-bundle: https://assets.chat-with-geogebra.com data: blob:; font-src 'self' geochat-bundle: data:; worker-src 'self' geochat-bundle: blob:; child-src 'self' geochat-bundle: blob:; manifest-src 'self' geochat-bundle:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

pub(crate) fn app_bundle_protocol_request_path(path: &str) -> Option<String> {
    let path = path.strip_prefix('/').unwrap_or(path);
    if path.is_empty() {
        return None;
    }
    let decoded = percent_decode_app_bundle_protocol_path(path)?;
    if decoded.starts_with('/')
        || decoded.contains('\\')
        || decoded.split('/').any(|segment| {
            segment.is_empty() || segment == "." || segment == ".." || segment.contains(':')
        })
    {
        return None;
    }
    Some(decoded)
}

fn percent_decode_app_bundle_protocol_path(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return None;
            }
            let high = hex_value(bytes[index + 1])?;
            let low = hex_value(bytes[index + 2])?;
            output.push((high << 4) | low);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(output).ok()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

pub(crate) fn app_bundle_content_type(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".js") || path.ends_with(".mjs") {
        "text/javascript; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".json") || path.ends_with(".map") {
        "application/json; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "image/jpeg"
    } else if path.ends_with(".webp") {
        "image/webp"
    } else if path.ends_with(".wasm") {
        "application/wasm"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else {
        "application/octet-stream"
    }
}

pub(crate) fn app_bundle_protocol_response(
    status: http::StatusCode,
    content_type: &'static str,
    body: Vec<u8>,
) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header(http::header::CONTENT_TYPE, content_type)
        .header(
            http::header::CONTENT_SECURITY_POLICY,
            APP_BUNDLE_CONTENT_SECURITY_POLICY,
        )
        .header(http::header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(body)
        .unwrap_or_else(|_| http::Response::new(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::{app_bundle_protocol_response, APP_BUNDLE_CONTENT_SECURITY_POLICY};
    use tauri::http;

    #[test]
    fn custom_protocol_html_response_enforces_production_csp() {
        let body = b"<!doctype html><script>alert('blocked without policy')</script>".to_vec();
        let response = app_bundle_protocol_response(
            http::StatusCode::OK,
            "text/html; charset=utf-8",
            body.clone(),
        );

        assert_eq!(response.status(), http::StatusCode::OK);
        assert_eq!(response.body(), &body);
        assert_eq!(
            response
                .headers()
                .get(http::header::CONTENT_SECURITY_POLICY)
                .and_then(|value| value.to_str().ok()),
            Some(APP_BUNDLE_CONTENT_SECURITY_POLICY)
        );
        assert_eq!(
            response
                .headers()
                .get(http::header::X_CONTENT_TYPE_OPTIONS)
                .and_then(|value| value.to_str().ok()),
            Some("nosniff")
        );
        assert!(APP_BUNDLE_CONTENT_SECURITY_POLICY.contains("object-src 'none'"));
        assert!(APP_BUNDLE_CONTENT_SECURITY_POLICY.contains("frame-ancestors 'none'"));
    }

    #[test]
    fn custom_protocol_csp_matches_production_tauri_config() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(
            config
                .pointer("/app/security/csp")
                .and_then(serde_json::Value::as_str),
            Some(APP_BUNDLE_CONTENT_SECURITY_POLICY)
        );
    }
}
