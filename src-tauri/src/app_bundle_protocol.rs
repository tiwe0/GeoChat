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
    protocol_response(
        status,
        content_type,
        body,
        APP_BUNDLE_CONTENT_SECURITY_POLICY,
    )
}

pub(crate) fn app_bundle_renderer_response(body: Vec<u8>) -> http::Response<Vec<u8>> {
    // Only the verified renderer entry's Vite local module bootstrap gets a
    // nonce. Never mark arbitrary vendor HTML or remote script src elements:
    // CSP nonces authorize external sources too, regardless of the allowlist.
    let Ok(html) = String::from_utf8(body) else {
        return app_bundle_protocol_response(
            http::StatusCode::INTERNAL_SERVER_ERROR,
            "text/plain; charset=utf-8",
            b"renderer entry is not valid UTF-8".to_vec(),
        );
    };
    let (body, policy) = {
        // Two UUIDv4 values provide 244 random bits (each UUID reserves six
        // version/variant bits), exceeding CSP's 128-bit randomness minimum.
        let nonce = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        let policy = APP_BUNDLE_CONTENT_SECURITY_POLICY.replacen(
            "script-src 'self'",
            &format!("script-src 'nonce-{nonce}' 'self'"),
            1,
        );
        let body = html
            .replace(
                "<script type=\"module\" crossorigin src=\"./assets/",
                &format!("<script nonce=\"{nonce}\" type=\"module\" crossorigin src=\"./assets/"),
            )
            .into_bytes();
        (body, policy)
    };
    protocol_response(
        http::StatusCode::OK,
        "text/html; charset=utf-8",
        body,
        &policy,
    )
}

fn protocol_response(
    status: http::StatusCode,
    content_type: &'static str,
    body: Vec<u8>,
    policy: &str,
) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header(http::header::CONTENT_TYPE, content_type)
        .header(http::header::CONTENT_SECURITY_POLICY, policy)
        .header(http::header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(body)
        .unwrap_or_else(|_| http::Response::new(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::{
        app_bundle_protocol_response, app_bundle_renderer_response,
        APP_BUNDLE_CONTENT_SECURITY_POLICY,
    };
    use tauri::http;

    #[test]
    fn custom_protocol_html_response_enforces_production_csp() {
        let body =
            b"<!doctype html><script type=\"module\" crossorigin src=\"./assets/app.js\"></script>"
                .to_vec();
        let response = app_bundle_renderer_response(body);

        assert_eq!(response.status(), http::StatusCode::OK);
        let html = std::str::from_utf8(response.body()).unwrap();
        let nonce = html
            .split("nonce=\"")
            .nth(1)
            .unwrap()
            .split('"')
            .next()
            .unwrap();
        assert_eq!(nonce.len(), 64);
        assert!(nonce.chars().all(|character| character.is_ascii_hexdigit()));
        let policy = response.headers()[http::header::CONTENT_SECURITY_POLICY]
            .to_str()
            .unwrap();
        assert!(policy.contains(&format!("'nonce-{nonce}'")));
        assert!(policy.contains("geochat-bundle:"));
        assert!(!policy
            .split("script-src ")
            .nth(1)
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .contains("'unsafe-inline'"));
        assert!(html.contains("src=\"./assets/app.js\""));
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
    fn html_nonce_is_unique_per_document_and_not_added_to_asset_responses() {
        let html = || {
            app_bundle_renderer_response(
                b"<script type=\"module\" crossorigin src=\"./assets/app.js\"></script>".to_vec(),
            )
        };
        assert_ne!(
            html().headers()[http::header::CONTENT_SECURITY_POLICY],
            html().headers()[http::header::CONTENT_SECURITY_POLICY]
        );
        let script = app_bundle_protocol_response(
            http::StatusCode::OK,
            "text/javascript; charset=utf-8",
            b"window.test = true;".to_vec(),
        );
        assert_eq!(
            script.headers()[http::header::CONTENT_SECURITY_POLICY],
            APP_BUNDLE_CONTENT_SECURITY_POLICY
        );
        assert_eq!(script.body(), b"window.test = true;");
    }

    #[test]
    fn remote_scripts_and_vendor_html_never_receive_a_nonce() {
        let remote = "<script type=\"module\" crossorigin src=\"https://example.com/app.js\"></script><script src=\"//js.live.net/v5.0/wl.js\"></script><script>alert(1)</script>";
        let renderer = app_bundle_renderer_response(remote.as_bytes().to_vec());
        assert_eq!(renderer.body(), remote.as_bytes());
        assert!(!std::str::from_utf8(renderer.body())
            .unwrap()
            .contains("nonce="));
        let vendor = app_bundle_protocol_response(
            http::StatusCode::OK,
            "text/html; charset=utf-8",
            remote.as_bytes().to_vec(),
        );
        assert_eq!(vendor.body(), remote.as_bytes());
        assert_eq!(
            vendor.headers()[http::header::CONTENT_SECURITY_POLICY],
            APP_BUNDLE_CONTENT_SECURITY_POLICY
        );
    }

    #[test]
    fn invalid_renderer_utf8_fails_without_nonce_authorization() {
        let response = app_bundle_renderer_response(vec![0xff, 0xfe]);
        assert_eq!(response.status(), http::StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(response.body(), b"renderer entry is not valid UTF-8");
        assert_eq!(
            response.headers()[http::header::CONTENT_SECURITY_POLICY],
            APP_BUNDLE_CONTENT_SECURITY_POLICY
        );
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
