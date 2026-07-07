import type { DesktopDebugMcpConfig } from "./config";

export type RedactionOptions = {
  includeSensitive?: boolean;
  includeFullContent?: boolean;
  contentLimit?: number;
};

const sensitiveKeyPattern =
  /(^|_|-)?(api.?key|authorization|password|passwordhash|password_hash|tokenhash|token_hash|sessiontoken|session_token|secret|credential)(_|-|$)?/i;
const bulkyKeyPattern = /(base64|dataurl|data_url|rawprovider|raw_provider|rawresponse|raw_response|image|attachment|filebytes|bytes)/i;

export function redactionContext(config: DesktopDebugMcpConfig, options: RedactionOptions = {}) {
  return {
    includeSensitive: options.includeSensitive === true && config.includeSensitiveByDefault,
    includeFullContent: options.includeFullContent === true,
    contentLimit: Math.max(100, options.contentLimit ?? config.defaultContentLimit)
  };
}

export function redactRow<T>(row: T, options: ReturnType<typeof redactionContext>): T {
  return redactValue(row, options) as T;
}

export function redactValue(value: unknown, options: ReturnType<typeof redactionContext>, key = ""): unknown {
  if (value == null) return value;
  if (sensitiveKeyPattern.test(key)) return "[redacted]";
  if (!options.includeSensitive && bulkyKeyPattern.test(key)) return "[redacted bulky payload]";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    if (!options.includeSensitive && looksSensitiveString(value)) return "[redacted]";
    const parsed = maybeJson(value);
    if (parsed !== undefined) return redactValue(parsed, options, key);
    if (!options.includeFullContent && value.length > options.contentLimit) {
      return `${value.slice(0, options.contentLimit)}... [truncated ${value.length - options.contentLimit} chars]`;
    }
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => redactValue(item, options, key));

  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    if (childKey === "email") {
      output[childKey] = redactEmail(childValue, options.includeSensitive);
      continue;
    }
    output[childKey] = redactValue(childValue, options, childKey);
  }
  return output;
}

function redactEmail(email: unknown, includeSensitive = false) {
  if (typeof email !== "string") return email;
  if (includeSensitive) return email;
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

function maybeJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function looksSensitiveString(value: string) {
  if (/Bearer\s+[A-Za-z0-9._~+/-]+=*/i.test(value)) return true;
  if (/sk-[A-Za-z0-9_-]{20,}/.test(value)) return true;
  if (/data:image\/[a-zA-Z+.-]+;base64,/.test(value)) return true;
  return false;
}
