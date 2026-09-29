import { Buffer } from "node:buffer";
import {
  getAgentProviderProxyPolicy,
  isAgentProviderProxyHostAllowed,
  normalizeProviderProxyMethod,
  parseProviderProxyUrl,
  providerProxyBase64ByteLength,
  sanitizeProviderProxyHeaders,
  sanitizeProviderProxyResponseHeaders,
  validateProviderProxyBodyBase64,
  validateProviderProxyHeaders,
  validateProviderProxyMethodBody
} from "@geochat-ai/app";
import { sanitizeProviderError } from "../agent/provider-error";

export type ProviderProxyLimits = {
  maxProviderRequestBodyBytes: number;
  maxProviderResponseBodyBytes: number;
};

export type ProviderProxyResult = {
  httpStatus: number;
  body: unknown;
};

const PROVIDER_FETCH_TIMEOUT_MS = 120_000;

export type ProviderProxyRuntime = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  downstreamSignal?: AbortSignal;
};

export class ProviderResponseTooLargeError extends Error {
  constructor() {
    super("Provider response body is too large.");
    this.name = "ProviderResponseTooLargeError";
  }
}

export class ProviderResponseReadError extends Error {
  constructor(cause: unknown) {
    super("Failed to read the provider response body.", { cause });
    this.name = "ProviderResponseReadError";
  }
}

export async function proxyProviderFetch(
  payload: unknown,
  limits: ProviderProxyLimits,
  runtime: ProviderProxyRuntime = {}
): Promise<ProviderProxyResult> {
  if (!isProviderFetchPayload(payload)) {
    return providerProxyResult(400, { error: "invalid_request", message: "Invalid provider fetch payload." });
  }

  const targetUrl = parseProviderProxyUrl(payload.url);
  if (!targetUrl) {
    return providerProxyResult(400, { error: "invalid_url", message: "Only http and https provider URLs are supported." });
  }
  const providerPolicy = getAgentProviderProxyPolicy(payload.provider);
  if (!providerPolicy) {
    return providerProxyResult(400, { error: "unknown_provider", message: "Provider is not registered for proxy access." });
  }
  if (
    !isAgentProviderProxyHostAllowed({
      targetUrl,
      allowedHosts: providerPolicy.allowedHosts,
      customBaseUrl: payload.customBaseUrl
    })
  ) {
    console.warn(`[WARN] Provider proxy blocked provider=${payload.provider} host=${targetUrl.host}`);
    return providerProxyResult(403, {
      error: "provider_host_blocked",
      message: `Provider proxy blocked outbound host: ${targetUrl.host}`
    });
  }
  const bodyBase64PolicyError = validateProviderProxyBodyBase64(payload.bodyBase64);
  if (bodyBase64PolicyError) {
    return providerProxyResult(400, bodyBase64PolicyError);
  }
  if (payload.bodyBase64 && providerProxyBase64ByteLength(payload.bodyBase64) > limits.maxProviderRequestBodyBytes) {
    return providerProxyResult(413, { error: "request_too_large", message: "Provider request body is too large." });
  }
  const method = normalizeProviderProxyMethod(payload.method);
  if (!method) {
    return providerProxyResult(405, {
      error: "provider_method_blocked",
      message: "Provider proxy only supports GET and POST requests."
    });
  }
  const bodyPolicyError = validateProviderProxyMethodBody({
    method,
    bodyBase64: payload.bodyBase64
  });
  if (bodyPolicyError) {
    return providerProxyResult(400, bodyPolicyError);
  }

  const headersPolicyError = validateProviderProxyHeaders(payload.headers);
  if (headersPolicyError) {
    return providerProxyResult(400, headersPolicyError);
  }
  const headers = new Headers(sanitizeProviderProxyHeaders((payload.headers ?? {}) as Record<string, string>));
  console.debug(`[DEBUG] Provider proxy request provider=${payload.provider} method=${method} host=${targetUrl.host}`);

  const abortController = new AbortController();
  let timedOut = false;
  let downstreamAborted = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort(new DOMException("Provider request timed out.", "TimeoutError"));
  }, runtime.timeoutMs ?? PROVIDER_FETCH_TIMEOUT_MS);
  const abortFromDownstream = () => {
    downstreamAborted = true;
    clearTimeout(timeout);
    abortController.abort(runtime.downstreamSignal?.reason ?? new DOMException("Downstream request aborted.", "AbortError"));
  };
  const cleanupAbortState = () => {
    clearTimeout(timeout);
    runtime.downstreamSignal?.removeEventListener("abort", abortFromDownstream);
  };
  if (runtime.downstreamSignal?.aborted) {
    abortFromDownstream();
  } else {
    runtime.downstreamSignal?.addEventListener("abort", abortFromDownstream, { once: true });
  }

  let response: Response;
  try {
    response = await (runtime.fetch ?? fetch)(targetUrl, {
      method,
      headers,
      body: payload.bodyBase64 ? Buffer.from(payload.bodyBase64, "base64") : undefined,
      signal: abortController.signal
    });
  } catch (error) {
    cleanupAbortState();
    if (downstreamAborted) {
      return providerProxyResult(499, {
        error: "provider_request_aborted",
        message: "Provider proxy request was cancelled by the downstream client."
      });
    }
    if (timedOut) {
      console.warn(`[WARN] Provider proxy request timed out provider=${payload.provider} host=${targetUrl.host}`);
      return providerProxyResult(504, {
        error: "provider_fetch_timeout",
        message: "Provider proxy request timed out."
      });
    }
    console.error(`[ERROR] Provider proxy connection failed: ${sanitizeProviderError(error)}`);
    return providerProxyResult(502, {
      error: "provider_fetch_failed",
      message: `Provider proxy request failed: ${sanitizeProviderError(error)}`
    });
  }

  let responseBuffer: Buffer;
  try {
    responseBuffer = await readBoundedProviderResponseBody(
      response,
      limits.maxProviderResponseBodyBytes,
      () => abortController.abort(new DOMException("Provider response exceeded the configured limit.", "AbortError"))
    );
  } catch (error) {
    cleanupAbortState();
    if (error instanceof ProviderResponseTooLargeError) {
      console.warn(`[WARN] Provider proxy response exceeded limit provider=${payload.provider} host=${targetUrl.host}`);
      return providerProxyResult(502, { error: "response_too_large", message: error.message });
    }
    if (downstreamAborted) {
      return providerProxyResult(499, {
        error: "provider_request_aborted",
        message: "Provider proxy request was cancelled by the downstream client."
      });
    }
    if (timedOut) {
      console.warn(`[WARN] Provider proxy response timed out provider=${payload.provider} host=${targetUrl.host}`);
      return providerProxyResult(504, {
        error: "provider_fetch_timeout",
        message: "Provider proxy request timed out while reading the response."
      });
    }
    console.error(`[ERROR] Provider proxy response read failed: ${sanitizeProviderError(error)}`);
    return providerProxyResult(502, {
      error: "provider_response_read_failed",
      message: `Provider proxy response read failed: ${sanitizeProviderError(error)}`
    });
  } finally {
    cleanupAbortState();
  }

  const responseHeaders = sanitizeProviderProxyResponseHeaders(Object.fromEntries(response.headers.entries()));
  const responseBody = {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    bodyBase64: responseBuffer.toString("base64")
  };
  if (!response.ok) {
    console.warn(`[WARN] Provider proxy upstream error provider=${payload.provider} status=${response.status} host=${targetUrl.host}`);
    return providerProxyResult(502, {
      error: "provider_http_error",
      message: `Provider responded with HTTP ${response.status}.`,
      ...responseBody
    });
  }
  console.debug(`[DEBUG] Provider proxy response provider=${payload.provider} status=${response.status} bytes=${responseBuffer.byteLength}`);
  return providerProxyResult(200, responseBody);
}

export async function readBoundedProviderResponseBody(
  response: Response,
  maxBytes: number,
  abortUpstream: () => void = () => undefined
): Promise<Buffer> {
  const contentLength = parseContentLength(response.headers.get("content-length"));
  if (contentLength !== undefined && contentLength > maxBytes) {
    const error = new ProviderResponseTooLargeError();
    abortUpstream();
    await cancelResponseBody(response.body, error);
    throw error;
  }

  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        const error = new ProviderResponseTooLargeError();
        abortUpstream();
        await cancelReader(reader, error);
        throw error;
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ProviderResponseTooLargeError) throw error;
    throw new ProviderResponseReadError(error);
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, byteLength);
}

function parseContentLength(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function cancelResponseBody(body: ReadableStream<Uint8Array> | null, reason: unknown) {
  if (!body) return;
  try {
    await body.cancel(reason);
  } catch {
    // Best effort: the abort controller still terminates the upstream request.
  }
}

async function cancelReader(reader: { cancel(reason?: unknown): Promise<void> }, reason: unknown) {
  try {
    await reader.cancel(reason);
  } catch {
    // Best effort: the abort controller still terminates the upstream request.
  }
}

function providerProxyResult(httpStatus: number, body: unknown): ProviderProxyResult {
  return { httpStatus, body };
}

function isProviderFetchPayload(value: unknown): value is {
  provider: string;
  customBaseUrl?: string;
  url: string;
  method?: string;
  headers?: Record<string, unknown>;
  bodyBase64?: string;
} {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.provider === "string" &&
    (payload.customBaseUrl === undefined || typeof payload.customBaseUrl === "string") &&
    typeof payload.url === "string" &&
    (payload.method === undefined || typeof payload.method === "string") &&
    (payload.headers === undefined || (typeof payload.headers === "object" && payload.headers !== null)) &&
    (payload.bodyBase64 === undefined || typeof payload.bodyBase64 === "string")
  );
}
