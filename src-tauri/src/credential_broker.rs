use crate::credentials::{CredentialError, CredentialVault};
use ring::hmac;
use serde::Deserialize;
use serde_json::json;
use std::{
    io::{BufReader, Read, Write},
    net::{Ipv4Addr, Shutdown, SocketAddrV4, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use uuid::Uuid;

const MAX_HEADER_BYTES: usize = 8 * 1024;
const MAX_BODY_BYTES: usize = 1024;
const MAX_CORRELATION_ID_BYTES: usize = 160;
const PRE_AUTH_TIMEOUT: Duration = Duration::from_millis(250);
const SOCKET_TIMEOUT: Duration = Duration::from_secs(2);
const REJECT_DRAIN_TIMEOUT: Duration = Duration::from_millis(100);
const MAX_REJECT_DRAIN_BYTES: usize = MAX_BODY_BYTES + 1024;
const MAX_CONCURRENT_CONNECTIONS: usize = 16;
const MAX_PRE_AUTH_CONNECTIONS: usize = 8;
const MAX_OVERLOAD_DRAIN_CONNECTIONS: usize = 4;
const RATE_LIMIT: usize = 240;
const RATE_WINDOW: Duration = Duration::from_secs(60);

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

#[derive(Clone, Copy)]
struct BrokerLimits {
    max_concurrent: usize,
    rate_limit: usize,
    rate_window: Duration,
}

impl Default for BrokerLimits {
    fn default() -> Self {
        Self {
            max_concurrent: MAX_CONCURRENT_CONNECTIONS,
            rate_limit: RATE_LIMIT,
            rate_window: RATE_WINDOW,
        }
    }
}

impl CredentialBrokerRuntime {
    pub(crate) fn start(vault: Arc<CredentialVault>) -> Result<Self, String> {
        Self::start_with_limits(vault, BrokerLimits::default())
    }

    fn start_with_limits(
        vault: Arc<CredentialVault>,
        limits: BrokerLimits,
    ) -> Result<Self, String> {
        if limits.max_concurrent == 0 || limits.rate_limit == 0 {
            return Err("Credential broker limits must be non-zero".to_owned());
        }
        let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
            .map_err(|error| format!("Failed to bind credential broker: {error}"))?;
        listener
            .set_nonblocking(true)
            .map_err(|error| format!("Failed to configure credential broker: {error}"))?;
        let address = listener
            .local_addr()
            .map_err(|error| format!("Failed to read credential broker address: {error}"))?;
        let connection = CredentialBrokerConnection {
            base_url: format!("http://127.0.0.1:{}/", address.port()),
            token: format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()),
        };
        let shutdown = Arc::new(AtomicBool::new(false));
        let thread_shutdown = shutdown.clone();
        let thread_token = connection.token.clone();
        let thread = thread::Builder::new()
            .name("geochat-credential-broker".to_owned())
            .spawn(move || run_broker(listener, vault, thread_token, thread_shutdown, limits))
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

struct RateWindow {
    started_at: Instant,
    accepted: usize,
}

impl RateWindow {
    fn allow(&mut self, limit: usize, duration: Duration) -> bool {
        if self.started_at.elapsed() >= duration {
            self.started_at = Instant::now();
            self.accepted = 0;
        }
        if self.accepted >= limit {
            return false;
        }
        self.accepted += 1;
        true
    }
}

struct CounterGuard(Option<Arc<AtomicUsize>>);

impl CounterGuard {
    fn release(&mut self) {
        if let Some(counter) = self.0.take() {
            counter.fetch_sub(1, Ordering::AcqRel);
        }
    }
}

impl Drop for CounterGuard {
    fn drop(&mut self) {
        self.release();
    }
}

fn run_broker(
    listener: TcpListener,
    vault: Arc<CredentialVault>,
    token: String,
    shutdown: Arc<AtomicBool>,
    limits: BrokerLimits,
) {
    let active = Arc::new(AtomicUsize::new(0));
    let pre_auth = Arc::new(AtomicUsize::new(0));
    let overload_drains = Arc::new(AtomicUsize::new(0));
    let business_rate = Arc::new(Mutex::new(RateWindow {
        started_at: Instant::now(),
        accepted: 0,
    }));
    let token = Arc::<[u8]>::from(token.into_bytes());
    let mut workers = Vec::<JoinHandle<()>>::new();

    while !shutdown.load(Ordering::Acquire) {
        let mut running = Vec::with_capacity(workers.len());
        for worker in workers.drain(..) {
            if worker.is_finished() {
                let _ = worker.join();
            } else {
                running.push(worker);
            }
        }
        workers = running;

        let (stream, _) = match listener.accept() {
            Ok(connection) => connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(10));
                continue;
            }
            Err(_) => continue,
        };
        if shutdown.load(Ordering::Acquire) {
            break;
        }
        if active
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |value| {
                (value < limits.max_concurrent).then_some(value + 1)
            })
            .is_err()
        {
            if let Some(worker) =
                spawn_overload_rejection(stream, "too_many_connections", overload_drains.clone())
            {
                workers.push(worker);
            }
            continue;
        }
        if pre_auth
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |value| {
                (value < limits.max_concurrent.min(MAX_PRE_AUTH_CONNECTIONS)).then_some(value + 1)
            })
            .is_err()
        {
            active.fetch_sub(1, Ordering::AcqRel);
            if let Some(worker) = spawn_overload_rejection(
                stream,
                "too_many_unauthenticated_connections",
                overload_drains.clone(),
            ) {
                workers.push(worker);
            }
            continue;
        }
        if stream.set_nonblocking(false).is_err() {
            active.fetch_sub(1, Ordering::AcqRel);
            pre_auth.fetch_sub(1, Ordering::AcqRel);
            continue;
        }

        let worker_vault = vault.clone();
        let worker_token = token.clone();
        let worker_active = active.clone();
        let worker_pre_auth = pre_auth.clone();
        let worker_business_rate = business_rate.clone();
        match thread::Builder::new()
            .name("geochat-credential-broker-connection".to_owned())
            .spawn(move || {
                let _active_guard = CounterGuard(Some(worker_active));
                let pre_auth_guard = CounterGuard(Some(worker_pre_auth));
                if let Err(error) = handle_connection(
                    stream,
                    &worker_vault,
                    &worker_token,
                    pre_auth_guard,
                    &worker_business_rate,
                    limits,
                ) {
                    log::warn!(target: "geochat::credential_broker", "Credential broker rejected a request: {error}");
                }
            }) {
            Ok(worker) => workers.push(worker),
            Err(_) => {
                active.fetch_sub(1, Ordering::AcqRel);
                pre_auth.fetch_sub(1, Ordering::AcqRel);
            }
        }
    }
    for worker in workers {
        let _ = worker.join();
    }
}

fn spawn_overload_rejection(
    mut stream: TcpStream,
    code: &'static str,
    active: Arc<AtomicUsize>,
) -> Option<JoinHandle<()>> {
    if active
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |value| {
            (value < MAX_OVERLOAD_DRAIN_CONNECTIONS).then_some(value + 1)
        })
        .is_err()
    {
        // The accept loop must never perform a best-effort nonblocking HTTP write: it can
        // produce a truncated response and delay accepting healthy connections. Once the
        // bounded rejection pool is full, close the excess connection explicitly.
        let _ = stream.shutdown(Shutdown::Both);
        return None;
    }
    let worker_active = active.clone();
    match thread::Builder::new()
        .name("geochat-credential-broker-overload".to_owned())
        .spawn(move || {
            let _guard = CounterGuard(Some(worker_active));
            if stream.set_nonblocking(false).is_ok() {
                let _ = write_early_rejection(&mut stream, 429, code, None);
            }
        }) {
        Ok(worker) => Some(worker),
        Err(_) => {
            active.fetch_sub(1, Ordering::AcqRel);
            None
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
    mut pre_auth_guard: CounterGuard,
    business_rate: &Mutex<RateWindow>,
    limits: BrokerLimits,
) -> Result<(), &'static str> {
    let _ = stream.set_write_timeout(Some(SOCKET_TIMEOUT));
    let mut reader = BufReader::new(stream.try_clone().map_err(|_| "stream_clone_failed")?);
    let mut header_bytes = 0;
    let pre_auth_deadline = Instant::now() + PRE_AUTH_TIMEOUT;
    let request_line = match read_header_line(&mut reader, &mut header_bytes, pre_auth_deadline) {
        Ok(line) => line,
        Err(code) => return write_early_rejection(&mut stream, 400, code, None),
    };
    let mut authorization = None;
    let mut content_length = None;
    let mut content_type = None;
    let mut origin_present = false;
    let mut correlation_id = None;

    loop {
        let line = match read_header_line(&mut reader, &mut header_bytes, pre_auth_deadline) {
            Ok(line) => line,
            Err(code) => return write_early_rejection(&mut stream, 400, code, content_length),
        };
        if line.is_empty() {
            break;
        }
        let Some((name, value)) = line.split_once(':') else {
            return write_early_rejection(&mut stream, 400, "malformed_header", content_length);
        };
        let name = name.trim().to_ascii_lowercase();
        let value = value.trim();
        match name.as_str() {
            "authorization" if authorization.is_none() => authorization = Some(value.to_owned()),
            "authorization" => {
                return write_early_rejection(&mut stream, 400, "duplicate_header", content_length)
            }
            "content-length" if content_length.is_none() => {
                let Some(parsed) = value.parse::<usize>().ok() else {
                    return write_early_rejection(&mut stream, 400, "invalid_content_length", None);
                };
                content_length = Some(parsed);
            }
            "content-length" => {
                return write_early_rejection(&mut stream, 400, "duplicate_header", content_length)
            }
            "content-type" if content_type.is_none() => content_type = Some(value.to_owned()),
            "content-type" => {
                return write_early_rejection(&mut stream, 400, "duplicate_header", content_length)
            }
            "x-correlation-id" if correlation_id.is_none() && valid_correlation_id(value) => {
                correlation_id = Some(value.to_owned())
            }
            "x-correlation-id" if correlation_id.is_some() => {
                return write_early_rejection(&mut stream, 400, "duplicate_header", content_length)
            }
            "x-correlation-id" => {
                return write_early_rejection(
                    &mut stream,
                    400,
                    "invalid_correlation_id",
                    content_length,
                )
            }
            "origin" => origin_present = true,
            "transfer-encoding" => {
                return write_early_rejection(
                    &mut stream,
                    400,
                    "transfer_encoding_unsupported",
                    content_length,
                )
            }
            _ => {}
        }
    }

    let drain_hint = content_length.filter(|length| *length <= MAX_REJECT_DRAIN_BYTES);
    if request_line != "POST /v1/credentials/resolve HTTP/1.1" {
        return write_early_rejection(&mut stream, 404, "not_found", drain_hint);
    }
    if origin_present {
        return write_early_rejection(&mut stream, 403, "origin_forbidden", drain_hint);
    }
    if !authorized(authorization.as_deref(), expected_token) {
        return write_early_rejection(&mut stream, 401, "unauthorized", drain_hint);
    }
    pre_auth_guard.release();
    let json_content_type = content_type.as_deref().is_some_and(|value: &str| {
        value
            .split(';')
            .next()
            .is_some_and(|mime| mime.trim().eq_ignore_ascii_case("application/json"))
    });
    if !json_content_type {
        return write_early_rejection(&mut stream, 415, "unsupported_media_type", drain_hint);
    }
    let Some(content_length) = content_length else {
        return write_early_rejection(&mut stream, 411, "content_length_required", None);
    };
    if content_length == 0 || content_length > MAX_BODY_BYTES {
        return write_early_rejection(&mut stream, 413, "request_too_large", drain_hint);
    }
    let rate_allowed = business_rate
        .lock()
        .map(|mut window| window.allow(limits.rate_limit, limits.rate_window))
        .unwrap_or(false);
    if !rate_allowed {
        return write_early_rejection(&mut stream, 429, "rate_limited", drain_hint);
    }
    let mut body = vec![0; content_length];
    if read_exact_until_deadline(&mut reader, &mut body, Instant::now() + SOCKET_TIMEOUT).is_err() {
        return write_rejected(&mut stream, 400, "request_body_incomplete");
    }
    if reader
        .buffer()
        .iter()
        .any(|byte| !byte.is_ascii_whitespace())
    {
        return write_rejected(&mut stream, 400, "request_pipelining_forbidden");
    }
    let request: ResolveRequest = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(_) => return write_rejected(&mut stream, 400, "invalid_request"),
    };
    match vault.resolve(&request.credential_ref) {
        Ok(resolved) => {
            log::info!(target: "geochat::credential_broker", "Credential broker request completed: correlation_id={} status=200", correlation_id.as_deref().unwrap_or("unavailable"));
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
            log::warn!(target: "geochat::credential_broker", "Credential broker request failed: correlation_id={} status={status} error_code={code}", correlation_id.as_deref().unwrap_or("unavailable"));
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
    total: &mut usize,
    deadline: Instant,
) -> Result<String, &'static str> {
    let mut line = Vec::with_capacity(256);
    loop {
        if *total >= MAX_HEADER_BYTES {
            return Err("request_headers_too_large");
        }
        let timeout = deadline
            .checked_duration_since(Instant::now())
            .filter(|remaining| !remaining.is_zero())
            .ok_or("request_headers_timeout")?;
        reader
            .get_mut()
            .set_read_timeout(Some(timeout))
            .map_err(|_| "request_read_failed")?;
        let mut byte = [0_u8; 1];
        match reader.read(&mut byte) {
            Ok(0) => return Err("request_closed"),
            Ok(_) => {
                *total += 1;
                line.push(byte[0]);
                if byte[0] == b'\n' {
                    break;
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                ) =>
            {
                return Err("request_headers_timeout")
            }
            Err(_) => return Err("request_read_failed"),
        }
    }
    let line = std::str::from_utf8(&line).map_err(|_| "invalid_header_encoding")?;
    Ok(line
        .strip_suffix("\r\n")
        .ok_or("invalid_line_ending")?
        .to_owned())
}

fn read_exact_until_deadline(
    reader: &mut BufReader<TcpStream>,
    body: &mut [u8],
    deadline: Instant,
) -> Result<(), &'static str> {
    let mut offset = 0;
    while offset < body.len() {
        let timeout = deadline
            .checked_duration_since(Instant::now())
            .filter(|remaining| !remaining.is_zero())
            .ok_or("request_body_timeout")?;
        reader
            .get_mut()
            .set_read_timeout(Some(timeout))
            .map_err(|_| "request_read_failed")?;
        match reader.read(&mut body[offset..]) {
            Ok(0) => return Err("request_body_incomplete"),
            Ok(read) => offset += read,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                ) =>
            {
                return Err("request_body_timeout")
            }
            Err(_) => return Err("request_read_failed"),
        }
    }
    Ok(())
}

fn authorized(header: Option<&str>, expected_token: &[u8]) -> bool {
    let Some(token) = header.and_then(|value| value.strip_prefix("Bearer ")) else {
        return false;
    };
    const PROOF: &[u8] = b"geochat-credential-broker-token-proof";
    let candidate = hmac::sign(&hmac::Key::new(hmac::HMAC_SHA256, token.as_bytes()), PROOF);
    hmac::verify(
        &hmac::Key::new(hmac::HMAC_SHA256, expected_token),
        PROOF,
        candidate.as_ref(),
    )
    .is_ok()
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

fn write_early_rejection(
    stream: &mut TcpStream,
    status: u16,
    code: &'static str,
    drain_hint: Option<usize>,
) -> Result<(), &'static str> {
    write_error(stream, status, code)?;
    let _ = stream.shutdown(Shutdown::Write);
    let deadline = Instant::now() + REJECT_DRAIN_TIMEOUT;
    let mut remaining = drain_hint
        .unwrap_or(MAX_REJECT_DRAIN_BYTES)
        .min(MAX_REJECT_DRAIN_BYTES);
    let mut buffer = [0_u8; 512];
    while remaining > 0 {
        let Some(timeout) = deadline
            .checked_duration_since(Instant::now())
            .filter(|remaining| !remaining.is_zero())
        else {
            break;
        };
        if stream.set_read_timeout(Some(timeout)).is_err() {
            break;
        }
        let read_limit = buffer.len().min(remaining);
        match stream.read(&mut buffer[..read_limit]) {
            Ok(0) | Err(_) => break,
            Ok(read) => remaining -= read,
        }
    }
    let _ = stream.shutdown(Shutdown::Both);
    Ok(())
}

fn write_rejected(
    stream: &mut TcpStream,
    status: u16,
    code: &'static str,
) -> Result<(), &'static str> {
    write_error(stream, status, code)
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
        411 => "Length Required",
        413 => "Content Too Large",
        415 => "Unsupported Media Type",
        429 => "Too Many Requests",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        _ => "Error",
    };
    write!(stream, "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len())
        .and_then(|_| stream.write_all(body)).and_then(|_| stream.flush()).map_err(|_| "response_write_failed")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::{InMemoryCredentialStore, SaveCredentialRequest, SecretValue};

    fn runtime(limits: BrokerLimits) -> (CredentialBrokerRuntime, String) {
        let vault = Arc::new(CredentialVault::new(Arc::new(
            InMemoryCredentialStore::default(),
        )));
        let credential_ref = vault
            .save(SaveCredentialRequest {
                provider: "openai".into(),
                protocol: "openai-compatible".into(),
                base_url: "https://api.openai.com/v1".into(),
                secret: SecretValue::new("canary-provider-secret".into()),
            })
            .unwrap()
            .credential_ref;
        (
            CredentialBrokerRuntime::start_with_limits(vault, limits).unwrap(),
            credential_ref,
        )
    }

    fn connect(connection: &CredentialBrokerConnection) -> TcpStream {
        let port = url::Url::parse(&connection.base_url)
            .unwrap()
            .port()
            .unwrap();
        let stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.set_read_timeout(Some(SOCKET_TIMEOUT)).unwrap();
        stream
    }

    fn headers(token: &str, length: usize, extra: &str) -> String {
        format!("POST /v1/credentials/resolve HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {length}\r\n{extra}\r\n")
    }

    fn send(connection: &CredentialBrokerConnection, request: impl AsRef<[u8]>) -> String {
        let mut stream = connect(connection);
        stream.write_all(request.as_ref()).unwrap();
        stream.shutdown(Shutdown::Write).unwrap();
        read_response(&mut stream)
    }

    fn valid(
        connection: &CredentialBrokerConnection,
        credential_ref: &str,
        token: &str,
        extra: &str,
    ) -> String {
        let body = serde_json::to_string(&json!({"credentialRef": credential_ref})).unwrap();
        send(
            connection,
            format!("{}{body}", headers(token, body.len(), extra)),
        )
    }

    fn read_response(stream: &mut TcpStream) -> String {
        let response = String::from_utf8(read_raw_response(stream)).unwrap();
        let (head, body) = response.split_once("\r\n\r\n").unwrap();
        let length = head
            .lines()
            .find_map(|line| line.strip_prefix("Content-Length: "))
            .unwrap()
            .parse::<usize>()
            .unwrap();
        assert_eq!(body.len(), length, "incomplete response: {response}");
        response
    }

    fn read_raw_response(stream: &mut TcpStream) -> Vec<u8> {
        let mut response = Vec::new();
        let mut buffer = [0_u8; 512];
        loop {
            match stream.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => response.extend_from_slice(&buffer[..read]),
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::ConnectionReset | std::io::ErrorKind::BrokenPipe
                    ) =>
                {
                    break
                }
                Err(error) => panic!("failed to read broker response: {error}"),
            }
        }
        response
    }

    fn assert_safe(response: &str, status: u16) {
        assert!(
            response.starts_with(&format!("HTTP/1.1 {status}")),
            "{response}"
        );
        assert!(response.contains("Content-Type: application/json\r\n"));
        assert!(response.contains("Cache-Control: no-store\r\n"));
        assert!(response.contains("Connection: close\r\n"));
        assert!(response.contains("Content-Length: "));
    }

    #[test]
    fn credential_broker_success_is_complete_and_no_store() {
        let (runtime, credential_ref) = runtime(BrokerLimits::default());
        let connection = runtime.connection();
        let response = valid(connection, &credential_ref, &connection.token, "");
        assert_safe(&response, 200);
        assert!(response.contains("canary-provider-secret"));
        assert!(response.contains("\"schemaVersion\":1"));
    }

    #[test]
    fn credential_broker_rejects_early_without_waiting_for_body() {
        let (runtime, credential_ref) = runtime(BrokerLimits::default());
        let connection = runtime.connection();
        for (token, extra, status) in [
            ("wrong", "", 401),
            (&connection.token, "Origin: http://evil\r\n", 403),
        ] {
            let response = valid(connection, &credential_ref, token, extra);
            assert_safe(&response, status);
            assert!(!response.contains("canary-provider-secret"));
        }
        let request = format!("POST /v1/credentials/resolve HTTP/1.1\r\nAuthorization: Bearer {}\r\nContent-Type: text/plain\r\nContent-Length: 100\r\n\r\n", connection.token);
        let started = Instant::now();
        assert_safe(&send(connection, request), 415);
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn credential_broker_rejects_smuggling_and_invalid_protocol_shapes() {
        let (runtime, credential_ref) = runtime(BrokerLimits::default());
        let c = runtime.connection();
        let body = serde_json::to_string(&json!({"credentialRef": credential_ref})).unwrap();
        let cases = [
            ("GET /v1/credentials/resolve HTTP/1.1\r\nContent-Length: 0\r\n\r\n".into(), 404),
            ("POST /wrong HTTP/1.1\r\nContent-Length: 0\r\n\r\n".into(), 404),
            (format!("{}{body}", headers(&c.token, body.len(), &format!("Authorization: Bearer {}\r\n", c.token))), 400),
            (format!("{}{body}", headers(&c.token, body.len(), &format!("Content-Length: {}\r\n", body.len()))), 400),
            (format!("POST /v1/credentials/resolve HTTP/1.1\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n", c.token), 400),
        ];
        for (request, status) in cases {
            let response = send(c, request);
            assert_safe(&response, status);
            assert!(!response.contains("canary-provider-secret"));
        }
    }

    #[test]
    fn credential_broker_enforces_framing_bounds_and_rejects_pipeline() {
        let (runtime, credential_ref) = runtime(BrokerLimits::default());
        let c = runtime.connection();
        assert_safe(
            &send(
                c,
                format!(
                    "POST /v1/credentials/resolve HTTP/1.1\r\nX: {}\r\n\r\n",
                    "a".repeat(MAX_HEADER_BYTES)
                ),
            ),
            400,
        );
        assert_safe(&send(c, headers(&c.token, MAX_BODY_BYTES + 1, "")), 413);
        let body = serde_json::to_string(&json!({"credentialRef": credential_ref})).unwrap();
        assert_safe(
            &send(c, format!("{}{{", headers(&c.token, body.len(), ""))),
            400,
        );
        assert_safe(
            &send(
                c,
                format!(
                    "{}{body}GET / HTTP/1.1\r\n\r\n",
                    headers(&c.token, body.len(), "")
                ),
            ),
            400,
        );
        assert_safe(&send(c, format!("POST /v1/credentials/resolve HTTP/1.1\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\n\r\n", c.token)), 411);
    }

    #[test]
    fn credential_broker_slow_rejection_does_not_block_valid_request() {
        let (runtime, credential_ref) = runtime(BrokerLimits::default());
        let c = runtime.connection().clone();
        let mut slow = connect(&c);
        slow.write_all(headers("wrong", 100, "").as_bytes())
            .unwrap();
        thread::sleep(Duration::from_millis(30));
        let started = Instant::now();
        assert_safe(&valid(&c, &credential_ref, &c.token, ""), 200);
        assert!(started.elapsed() < Duration::from_secs(1));
        assert_safe(&read_response(&mut slow), 401);
    }

    #[test]
    fn credential_broker_pre_auth_deadline_expires_slowloris_connections() {
        let (runtime, credential_ref) = runtime(BrokerLimits::default());
        let c = runtime.connection().clone();
        let mut slow_connections = (0..MAX_PRE_AUTH_CONNECTIONS)
            .map(|_| {
                let mut stream = connect(&c);
                stream.write_all(b"P").unwrap();
                stream
            })
            .collect::<Vec<_>>();

        // Keep sending before the per-read timeout. A relative timeout would let these
        // connections retain every pre-auth slot indefinitely; the absolute deadline must not.
        for byte in b"OST /" {
            thread::sleep(Duration::from_millis(75));
            for stream in &mut slow_connections {
                let _ = stream.write_all(&[*byte]);
            }
        }

        let started = Instant::now();
        assert_safe(&valid(&c, &credential_ref, &c.token, ""), 200);
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "expired pre-auth connections still occupied the broker"
        );
    }

    #[test]
    fn credential_broker_body_deadline_is_absolute_during_trickle_upload() {
        let (runtime, _) = runtime(BrokerLimits::default());
        let c = runtime.connection().clone();
        let mut slow = connect(&c);
        slow.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        slow.write_all(headers(&c.token, 64, "").as_bytes())
            .unwrap();
        slow.write_all(b"{").unwrap();

        let stop = Arc::new(AtomicBool::new(false));
        let writer_stop = stop.clone();
        let mut writer = slow.try_clone().unwrap();
        let trickle = thread::spawn(move || {
            for _ in 0..10 {
                thread::sleep(Duration::from_millis(350));
                if writer_stop.load(Ordering::Acquire) || writer.write_all(b" ").is_err() {
                    break;
                }
            }
            let _ = writer.shutdown(Shutdown::Write);
        });

        let started = Instant::now();
        assert_safe(&read_response(&mut slow), 400);
        let elapsed = started.elapsed();
        stop.store(true, Ordering::Release);
        trickle.join().unwrap();
        assert!(
            elapsed < SOCKET_TIMEOUT + Duration::from_millis(600),
            "body trickle extended the absolute socket deadline: {elapsed:?}"
        );
    }

    #[test]
    fn credential_broker_early_rejection_drain_releases_worker_after_absolute_deadline() {
        let (runtime, credential_ref) = runtime(BrokerLimits {
            max_concurrent: 1,
            rate_limit: 10,
            rate_window: Duration::from_secs(30),
        });
        let c = runtime.connection().clone();
        let mut rejected = connect(&c);
        rejected
            .write_all(headers("wrong", 100, "").as_bytes())
            .unwrap();

        let mut writer = rejected.try_clone().unwrap();
        assert_safe(&read_response(&mut rejected), 401);
        let trickle = thread::spawn(move || {
            for _ in 0..20 {
                thread::sleep(Duration::from_millis(25));
                if writer.write_all(b"x").is_err() {
                    break;
                }
            }
            let _ = writer.shutdown(Shutdown::Write);
        });

        thread::sleep(REJECT_DRAIN_TIMEOUT + Duration::from_millis(100));
        let response = valid(&c, &credential_ref, &c.token, "");
        assert_safe(&response, 200);
        trickle.join().unwrap();
    }

    #[test]
    fn credential_broker_returns_429_for_concurrency_and_rate_limits() {
        let (concurrency_runtime, credential_ref) = runtime(BrokerLimits {
            max_concurrent: 1,
            rate_limit: 10,
            rate_window: Duration::from_secs(30),
        });
        let c = concurrency_runtime.connection().clone();
        let mut held = connect(&c);
        held.write_all(headers(&c.token, 100, "").as_bytes())
            .unwrap();
        thread::sleep(Duration::from_millis(300));
        let concurrency_response = valid(&c, &credential_ref, &c.token, "");
        assert!(
            concurrency_response.starts_with("HTTP/1.1 429"),
            "concurrency limit failed: {concurrency_response}"
        );
        drop(held);
        drop(concurrency_runtime);

        let (rate_runtime, credential_ref) = runtime(BrokerLimits {
            max_concurrent: 2,
            rate_limit: 1,
            rate_window: Duration::from_secs(30),
        });
        let c = rate_runtime.connection();
        assert_safe(&valid(c, &credential_ref, &c.token, ""), 200);
        assert_safe(&valid(c, &credential_ref, &c.token, ""), 429);
    }

    #[test]
    fn credential_broker_invalid_auth_flood_does_not_consume_business_rate_limit() {
        let (runtime, credential_ref) = runtime(BrokerLimits {
            max_concurrent: 4,
            rate_limit: 1,
            rate_window: Duration::from_secs(30),
        });
        let c = runtime.connection();
        for _ in 0..20 {
            assert_safe(&valid(c, &credential_ref, "invalid-token", ""), 401);
        }
        assert_safe(&valid(c, &credential_ref, &c.token, ""), 200);
        assert_safe(&valid(c, &credential_ref, &c.token, ""), 429);
    }

    #[test]
    fn credential_broker_accept_loop_does_not_drain_overload_bodies() {
        let (runtime, _) = runtime(BrokerLimits {
            max_concurrent: 1,
            rate_limit: 10,
            rate_window: Duration::from_secs(30),
        });
        let c = runtime.connection().clone();
        let mut held = connect(&c);
        held.write_all(headers(&c.token, 100, "").as_bytes())
            .unwrap();
        thread::sleep(Duration::from_millis(50));

        let started = Instant::now();
        let mut overloaded_connections = Vec::new();
        for _ in 0..2 {
            let mut overloaded = connect(&c);
            overloaded
                .write_all(headers(&c.token, 100, "").as_bytes())
                .unwrap();
            overloaded_connections.push(overloaded);
        }
        for mut overloaded in overloaded_connections {
            assert_safe(&read_response(&mut overloaded), 429);
        }
        assert!(
            started.elapsed() < REJECT_DRAIN_TIMEOUT + Duration::from_millis(50),
            "accept loop waited for overload request bodies"
        );
    }

    #[test]
    fn credential_broker_overload_pool_saturation_never_returns_partial_http() {
        let (runtime, _) = runtime(BrokerLimits {
            max_concurrent: 1,
            rate_limit: 10,
            rate_window: Duration::from_secs(30),
        });
        let c = runtime.connection().clone();
        let mut held = connect(&c);
        held.write_all(headers(&c.token, 100, "").as_bytes())
            .unwrap();
        thread::sleep(Duration::from_millis(30));

        let mut overloaded = (0..(MAX_OVERLOAD_DRAIN_CONNECTIONS + 8))
            .map(|_| {
                let mut stream = connect(&c);
                stream
                    .write_all(headers(&c.token, 100, "").as_bytes())
                    .unwrap();
                stream
            })
            .collect::<Vec<_>>();

        let mut complete_rejections = 0;
        let mut silent_closes = 0;
        for stream in &mut overloaded {
            let raw = read_raw_response(stream);
            if raw.is_empty() {
                silent_closes += 1;
                continue;
            }
            let response = String::from_utf8(raw).unwrap();
            assert_safe(&response, 429);
            let (head, body) = response.split_once("\r\n\r\n").unwrap();
            let declared = head
                .lines()
                .find_map(|line| line.strip_prefix("Content-Length: "))
                .unwrap()
                .parse::<usize>()
                .unwrap();
            assert_eq!(
                body.len(),
                declared,
                "partial overload response: {response}"
            );
            complete_rejections += 1;
        }
        assert!(complete_rejections > 0);
        assert!(
            silent_closes > 0,
            "test did not saturate the bounded overload rejection pool"
        );
    }

    #[test]
    fn credential_broker_shutdown_is_bounded_with_slow_connection() {
        let (runtime, _) = runtime(BrokerLimits::default());
        let mut slow = connect(runtime.connection());
        slow.write_all(b"POST /v1/credentials/resolve HTTP/1.1\r\n")
            .unwrap();
        thread::sleep(Duration::from_millis(30));
        let started = Instant::now();
        drop(runtime);
        assert!(started.elapsed() < SOCKET_TIMEOUT + Duration::from_secs(1));
    }
}
