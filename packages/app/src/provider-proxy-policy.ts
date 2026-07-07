export const providerProxySensitiveHeaders = [
  "host",
  "content-length",
  "cookie",
  "origin",
  "referer",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "via",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user"
] as const;
export const providerProxySensitiveResponseHeaders = ["set-cookie", "set-cookie2", "content-length", "transfer-encoding"] as const;
export const providerProxyAllowedMethods = ["GET", "POST"] as const;

export type ProviderProxyAllowedMethod = (typeof providerProxyAllowedMethods)[number];
export type ProviderProxyMethodBodyPolicyError = {
  error: "provider_body_not_allowed";
  message: string;
};
export type ProviderProxyBodyBase64PolicyError = {
  error: "provider_body_invalid";
  message: string;
};
export type ProviderProxyHeadersPolicyError = {
  error: "provider_headers_invalid";
  message: string;
};

export function parseProviderProxyUrl(value: string): URL | undefined {
  const url = safeUrl(value);
  if (!url || !isProviderProxyProtocol(url.protocol)) return undefined;
  return url;
}

export function isAgentProviderProxyHostAllowed(input: {
  targetUrl: string | URL;
  allowedHosts: readonly string[];
  customBaseUrl?: string;
}) {
  const targetUrl = typeof input.targetUrl === "string" ? parseProviderProxyUrl(input.targetUrl) : input.targetUrl;
  if (!targetUrl || !isProviderProxyProtocol(targetUrl.protocol)) return false;
  if (input.allowedHosts.includes(targetUrl.host)) return true;
  if (!input.customBaseUrl?.trim()) return false;

  const customUrl = parseProviderProxyUrl(input.customBaseUrl);
  return Boolean(customUrl && targetUrl.host === customUrl.host);
}

function isProviderProxyProtocol(protocol: string) {
  return protocol === "http:" || protocol === "https:";
}

export function providerProxyBase64ByteLength(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export function validateProviderProxyBodyBase64(value: string | undefined): ProviderProxyBodyBase64PolicyError | undefined {
  if (value === undefined || value === "") return undefined;
  if (!isCanonicalBase64(value)) {
    return {
      error: "provider_body_invalid",
      message: "Provider proxy request body must be standard base64."
    };
  }
  return undefined;
}

export function sanitizeProviderProxyHeaders(headers: Record<string, string>) {
  const blocked = new Set<string>(providerProxySensitiveHeaders);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !blocked.has(key.toLowerCase())));
}

export function validateProviderProxyHeaders(headers: unknown): ProviderProxyHeadersPolicyError | undefined {
  if (headers === undefined) return undefined;
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return {
      error: "provider_headers_invalid",
      message: "Provider proxy headers must be a string map."
    };
  }

  for (const [name, value] of Object.entries(headers)) {
    if (!isProviderProxyHeaderName(name)) {
      return {
        error: "provider_headers_invalid",
        message: "Provider proxy header names must be valid HTTP tokens."
      };
    }
    if (typeof value !== "string" || !isProviderProxyHeaderValue(value)) {
      return {
        error: "provider_headers_invalid",
        message: "Provider proxy header values must be strings without control line breaks."
      };
    }
  }
  return undefined;
}

export function sanitizeProviderProxyResponseHeaders(headers: Record<string, string>) {
  const blocked = new Set<string>(providerProxySensitiveResponseHeaders);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !blocked.has(key.toLowerCase())));
}

export function normalizeProviderProxyMethod(method: string | undefined): ProviderProxyAllowedMethod | undefined {
  const normalized = (method ?? "GET").trim().toUpperCase();
  return providerProxyAllowedMethods.includes(normalized as ProviderProxyAllowedMethod) ? (normalized as ProviderProxyAllowedMethod) : undefined;
}

export function validateProviderProxyMethodBody(input: {
  method: string | undefined;
  bodyBase64?: string;
}): ProviderProxyMethodBodyPolicyError | undefined {
  const method = normalizeProviderProxyMethod(input.method);
  if (method === "GET" && input.bodyBase64) {
    return {
      error: "provider_body_not_allowed",
      message: "Provider proxy GET requests cannot include a request body."
    };
  }
  return undefined;
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isCanonicalBase64(value: string) {
  if (value.length % 4 !== 0) return false;
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function isProviderProxyHeaderName(value: string) {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value);
}

function isProviderProxyHeaderValue(value: string) {
  return !/[\r\n]/.test(value);
}
