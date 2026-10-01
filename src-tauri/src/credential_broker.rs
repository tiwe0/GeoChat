use crate::credentials::{CredentialError, CredentialVault};
use ring::hmac;
use serde::Deserialize;
use serde_json::json;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use uuid::Uuid;

const MAX_HEADER_BYTES: usize = 8 * 1024;
const MAX_BODY_BYTES: usize = 1024;
const MAX_CORRELATION_ID_BYTES: usize = 160;
const SOCKET_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone)]
pub(crate) struct CredentialBrokerConnection {
    pub(crate) base_url: String,
    pub(crate) token: String,
}

pub(crate) struct CredentialBrokerRuntime {
    connection: CredentialBrokerConnection,
    shutdown: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl CredentialBrokerRuntime {
    pub(crate) fn start(vault: Arc<CredentialVault>) -> Result<Self, String> {
        let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
            .map_err(|error| format!("Failed to bind credential broker: {error}"))?;
        let address = listener
            .local_addr()
            .map_err(|error| format!("Failed to read credential broker address: {error}"))?;
        let connection = CredentialBrokerConnection {
            base_url: format!("http://127.0.0.1:{}/", address.port()),
            token: format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()),
        };
        let shutdown = Arc::new(AtomicBool::new(false));
        let worker_shutdown = shutdown.clone();
        let worker_token = connection.token.clone();
        let thread = thread::Builder::new()
            .name("geochat-credential-broker".to_owned())
            .spawn(move || run_broker(listener, vault, worker_token, worker_shutdown))
            .map_err(|error| format!("Failed to start credential broker: {error}"))?;

        Ok(Self {
            connection,
            shutdown,
            thread: Some(thread),
        })
    }

    pub(crate) fn connection(&self) -> &CredentialBrokerConnection {
        &self.connection
    }
}

impl Drop for CredentialBrokerRuntime {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Release);
        if let Ok(url) = url::Url::parse(&self.connection.base_url) {
            if let Some(port) = url.port() {
                let _ = TcpStream::connect_timeout(
                    &SocketAddrV4::new(Ipv4Addr::LOCALHOST, port).into(),
                    Duration::from_millis(100),
                );
            }
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn run_broker(
    listener: TcpListener,
    vault: Arc<CredentialVault>,
    token: String,
    shutdown: Arc<AtomicBool>,
) {
    for incoming in listener.incoming() {
        if shutdown.load(Ordering::Acquire) {
            break;
        }
        let Ok(stream) = incoming else {
            continue;
        };
        if let Err(error) = handle_connection(stream, &vault, token.as_bytes()) {
            log::warn!(
                target: "geochat::credential_broker",
                "Credential broker rejected a request: {error}"
            );
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResolveRequest {
    credential_ref: String,
}

fn handle_connection(
    mut stream: TcpStream,
    vault: &CredentialVault,
    expected_token: &[u8],
) -> Result<(), &'static str> {
    let _ = stream.set_read_timeout(Some(SOCKET_TIMEOUT));
    let _ = stream.set_write_timeout(Some(SOCKET_TIMEOUT));
    let cloned = stream.try_clone().map_err(|_| "stream_clone_failed")?;
    let mut reader = BufReader::new(cloned);
    let mut total_header_bytes = 0usize;
    let request_line = read_header_line(&mut reader, &mut total_header_bytes)?;
    if request_line != "POST /v1/credentials/resolve HTTP/1.1" {
        write_error(&mut stream, 404, "not_found")?;
        return Ok(());
    }

    let mut authorization: Option<String> = None;
    let mut content_length: Option<usize> = None;
    let mut content_type_valid = false;
    let mut origin_present = false;
    let mut correlation_id: Option<String> = None;
    loop {
        let line = read_header_line(&mut reader, &mut total_header_bytes)?;
        if line.is_empty() {
            break;
        }
        let (name, value) = line.split_once(':').ok_or("malformed_header")?;
        let name = name.trim().to_ascii_lowercase();
        let value = value.trim();
        match name.as_str() {
            "authorization" if authorization.is_none() => authorization = Some(value.to_owned()),
            "authorization" => return write_rejected(&mut stream, 400, "duplicate_header"),
            "content-length" if content_length.is_none() => {
                content_length = value.parse::<usize>().ok();
                if content_length.is_none() {
                    return write_rejected(&mut stream, 400, "invalid_content_length");
                }
            }
            "content-length" => return write_rejected(&mut stream, 400, "duplicate_header"),
            "content-type" => {
                content_type_valid = value
                    .split(';')
                    .next()
                    .is_some_and(|mime| mime.trim().eq_ignore_ascii_case("application/json"));
            }
            "x-correlation-id" if correlation_id.is_none() && valid_correlation_id(value) => {
                correlation_id = Some(value.to_owned())
            }
            "x-correlation-id" if correlation_id.is_some() => {
                return write_rejected(&mut stream, 400, "duplicate_header")
            }
            "x-correlation-id" => {
                return write_rejected(&mut stream, 400, "invalid_correlation_id")
            }
            "origin" => origin_present = true,
            "transfer-encoding" => {
                return write_rejected(&mut stream, 400, "transfer_encoding_unsupported")
            }
            _ => {}
        }
    }

    let content_length = content_length.ok_or("content_length_required")?;
    if content_length == 0 || content_length > MAX_BODY_BYTES {
        return write_rejected(&mut stream, 413, "request_too_large");
    }
    let mut body = vec![0u8; content_length];
    reader
        .read_exact(&mut body)
        .map_err(|_| "request_body_incomplete")?;
    if reader
        .buffer()
        .iter()
        .any(|byte| !byte.is_ascii_whitespace())
    {
        return write_rejected(&mut stream, 400, "request_pipelining_forbidden");
    }
    if origin_present {
        return write_rejected(&mut stream, 403, "origin_forbidden");
    }
    if !authorized(authorization.as_deref(), expected_token) {
        return write_rejected(&mut stream, 401, "unauthorized");
    }
    if !content_type_valid {
        return write_rejected(&mut stream, 415, "unsupported_media_type");
    }
    let request: ResolveRequest = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(_) => return write_rejected(&mut stream, 400, "invalid_request"),
    };

    match vault.resolve(&request.credential_ref) {
        Ok(resolved) => {
            log::info!(
                target: "geochat::credential_broker",
                "Credential broker request completed: correlation_id={} status=200",
                correlation_id.as_deref().unwrap_or("unavailable")
            );
            let body = serde_json::to_vec(&json!({
                "schemaVersion": 1,
                "secret": resolved.secret(),
                "provider": resolved.metadata.provider,
                "protocol": resolved.metadata.protocol,
                "canonicalBaseUrl": resolved.metadata.canonical_base_url,
            }))
            .map_err(|_| "response_serialization_failed")?;
            write_response(&mut stream, 200, &body)
        }
        Err(error) => {
            let (status, code) = broker_error(error);
            log::warn!(
                target: "geochat::credential_broker",
                "Credential broker request failed: correlation_id={} status={status} error_code={code}",
                correlation_id.as_deref().unwrap_or("unavailable")
            );
            write_error(&mut stream, status, code)
        }
    }
}

fn valid_correlation_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_CORRELATION_ID_BYTES
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_alphanumeric() || (index > 0 && matches!(byte, b'.' | b'_' | b':' | b'-'))
        })
}

fn read_header_line(
    reader: &mut BufReader<TcpStream>,
    total_header_bytes: &mut usize,
) -> Result<String, &'static str> {
    let mut line = String::new();
    let bytes = reader
        .read_line(&mut line)
        .map_err(|_| "request_read_failed")?;
    if bytes == 0 {
        return Err("request_closed");
    }
    *total_header_bytes += bytes;
    if *total_header_bytes > MAX_HEADER_BYTES {
        return Err("request_headers_too_large");
    }
    let line = line.strip_suffix("\r\n").ok_or("invalid_line_ending")?;
    Ok(line.to_owned())
}

fn authorized(header: Option<&str>, expected_token: &[u8]) -> bool {
    let Some(token) = header.and_then(|value| value.strip_prefix("Bearer ")) else {
        return false;
    };
    const PROOF_MESSAGE: &[u8] = b"geochat-credential-broker-token-proof";
    let candidate_key = hmac::Key::new(hmac::HMAC_SHA256, token.as_bytes());
    let candidate_tag = hmac::sign(&candidate_key, PROOF_MESSAGE);
    let expected_key = hmac::Key::new(hmac::HMAC_SHA256, expected_token);
    hmac::verify(&expected_key, PROOF_MESSAGE, candidate_tag.as_ref()).is_ok()
}

fn broker_error(error: CredentialError) -> (u16, &'static str) {
    match error {
        CredentialError::InvalidReference | CredentialError::InvalidInput => {
            (400, "invalid_request")
        }
        CredentialError::NotFound => (404, "credential_not_found"),
        CredentialError::StoreUnavailable => (503, "credential_store_unavailable"),
        _ => (502, "credential_resolution_failed"),
    }
}

fn write_rejected(
    stream: &mut TcpStream,
    status: u16,
    code: &'static str,
) -> Result<(), &'static str> {
    write_error(stream, status, code)?;
    Ok(())
}

fn write_error(
    stream: &mut TcpStream,
    status: u16,
    code: &'static str,
) -> Result<(), &'static str> {
    let body = serde_json::to_vec(&json!({ "error": code }))
        .map_err(|_| "response_serialization_failed")?;
    write_response(stream, status, &body)
}

fn write_response(stream: &mut TcpStream, status: u16, body: &[u8]) -> Result<(), &'static str> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        413 => "Content Too Large",
        415 => "Unsupported Media Type",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        _ => "Error",
    };
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .and_then(|_| stream.write_all(body))
    .and_then(|_| stream.flush())
    .map_err(|_| "response_write_failed")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::{InMemoryCredentialStore, SaveCredentialRequest, SecretValue};
    use std::sync::Arc;

    fn test_runtime() -> (CredentialBrokerRuntime, Arc<CredentialVault>, String) {
        let vault = Arc::new(CredentialVault::new(Arc::new(
            InMemoryCredentialStore::default(),
        )));
        let metadata = vault
            .save(SaveCredentialRequest {
                provider: "openai".to_owned(),
                protocol: "openai-compatible".to_owned(),
                base_url: "https://api.openai.com/v1".to_owned(),
                secret: SecretValue::new("canary-provider-secret".to_owned()),
            })
            .unwrap();
        let runtime = CredentialBrokerRuntime::start(vault.clone()).unwrap();
        (runtime, vault, metadata.credential_ref)
    }

    #[test]
    fn broker_requires_its_private_token_and_never_allows_origin_requests() {
        let (runtime, _vault, credential_ref) = test_runtime();
        let connection = runtime.connection();
        let unauthorized = send_chunked_request(connection, &credential_ref, "wrong", None);
        assert!(unauthorized.starts_with("HTTP/1.1 401"));
        assert!(!unauthorized.contains("canary-provider-secret"));

        let forbidden = send_chunked_request(
            connection,
            &credential_ref,
            &connection.token,
            Some("Origin: http://evil.example\r\n"),
        );
        assert!(forbidden.starts_with("HTTP/1.1 403"));
        assert!(!forbidden.contains("canary-provider-secret"));
    }

    #[test]
    fn broker_resolves_then_observes_deletion_without_a_secret_cache() {
        let (runtime, vault, credential_ref) = test_runtime();
        let connection = runtime.connection();
        let resolved = send_request(connection, &credential_ref, &connection.token, None);
        assert!(resolved.starts_with("HTTP/1.1 200"));
        assert!(resolved.contains("canary-provider-secret"));
        assert!(resolved.contains("Cache-Control: no-store"));

        vault.delete(&credential_ref).unwrap();
        let deleted = send_request(connection, &credential_ref, &connection.token, None);
        assert!(deleted.starts_with("HTTP/1.1 404"));
        assert!(!deleted.contains("canary-provider-secret"));
    }

    #[test]
    fn broker_accepts_only_bounded_opaque_correlation_ids() {
        let (runtime, _vault, credential_ref) = test_runtime();
        let connection = runtime.connection();
        let correlated = send_request(
            connection,
            &credential_ref,
            &connection.token,
            Some("X-Correlation-Id: run_broker_1\r\n"),
        );
        assert!(correlated.starts_with("HTTP/1.1 200"));

        let invalid = send_request(
            connection,
            &credential_ref,
            &connection.token,
            Some("X-Correlation-Id: user prompt\r\n"),
        );
        assert!(invalid.starts_with("HTTP/1.1 400"));
        assert!(!invalid.contains("canary-provider-secret"));
    }

    fn send_request(
        connection: &CredentialBrokerConnection,
        credential_ref: &str,
        token: &str,
        extra_headers: Option<&str>,
    ) -> String {
        send_request_with_delay(connection, credential_ref, token, extra_headers, None)
    }

    fn send_chunked_request(
        connection: &CredentialBrokerConnection,
        credential_ref: &str,
        token: &str,
        extra_headers: Option<&str>,
    ) -> String {
        send_request_with_delay(
            connection,
            credential_ref,
            token,
            extra_headers,
            Some(Duration::from_millis(10)),
        )
    }

    fn send_request_with_delay(
        connection: &CredentialBrokerConnection,
        credential_ref: &str,
        token: &str,
        extra_headers: Option<&str>,
        body_delay: Option<Duration>,
    ) -> String {
        let url = url::Url::parse(&connection.base_url).unwrap();
        let body = serde_json::to_string(&json!({ "credentialRef": credential_ref })).unwrap();
        let mut stream = TcpStream::connect(("127.0.0.1", url.port().unwrap())).unwrap();
        stream.set_nodelay(true).unwrap();
        let headers = format!(
            "POST /v1/credentials/resolve HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{}\r\n",
            body.len(),
            extra_headers.unwrap_or("")
        );
        stream.write_all(headers.as_bytes()).unwrap();
        stream.flush().unwrap();
        if let Some(delay) = body_delay {
            thread::sleep(delay);
        }
        stream.write_all(body.as_bytes()).unwrap();
        stream.flush().unwrap();
        let mut response = Vec::new();
        let mut buffer = [0_u8; 1024];
        while !http_response_is_complete(&response) {
            let read = stream.read(&mut buffer).unwrap();
            if read == 0 {
                break;
            }
            response.extend_from_slice(&buffer[..read]);
        }
        assert!(http_response_is_complete(&response));
        String::from_utf8(response).unwrap()
    }

    fn http_response_is_complete(response: &[u8]) -> bool {
        let Some(header_end) = response
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .map(|index| index + 4)
        else {
            return false;
        };
        let Ok(headers) = std::str::from_utf8(&response[..header_end]) else {
            return false;
        };
        let Some(content_length) = headers.lines().find_map(|line| {
            line.strip_prefix("Content-Length: ")
                .and_then(|value| value.parse::<usize>().ok())
        }) else {
            return false;
        };
        response.len() >= header_end + content_length
    }
}
