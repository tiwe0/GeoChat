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
import { sanitizeRunnerModelError } from "../agent/model-error";

export type ProviderProxyLimits = {
  maxProviderRequestBodyBytes: number;
  maxProviderResponseBodyBytes: number;
};

export type ProviderProxyResult = {
  httpStatus: number;
  body: unknown;
};

export async function proxyProviderFetch(payload: unknown, limits: ProviderProxyLimits): Promise<ProviderProxyResult> {
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

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method,
      headers,
      body: payload.bodyBase64 ? Buffer.from(payload.bodyBase64, "base64") : undefined,
      signal: AbortSignal.timeout(120_000)
    });
  } catch (error) {
    return providerProxyResult(502, {
      error: "provider_fetch_failed",
      message: `Provider proxy request failed: ${sanitizeRunnerModelError(error)}`
    });
  }
  const responseBuffer = await response.arrayBuffer();
  if (responseBuffer.byteLength > limits.maxProviderResponseBodyBytes) {
    return providerProxyResult(502, { error: "response_too_large", message: "Provider response body is too large." });
  }
  return providerProxyResult(200, {
    status: response.status,
    statusText: response.statusText,
    headers: sanitizeProviderProxyResponseHeaders(Object.fromEntries(response.headers.entries())),
    bodyBase64: Buffer.from(responseBuffer).toString("base64")
  });
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
