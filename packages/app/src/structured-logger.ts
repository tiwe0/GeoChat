export type LogSeverity = "debug" | "info" | "warn" | "error";

export type StructuredLogContext = Record<string, unknown>;

export type StructuredLogRecord = {
  timestamp: string;
  module: string;
  event: string;
  severity: LogSeverity;
  errorCode: string;
  context?: StructuredLogContext;
};

export type StructuredLogSink = (record: StructuredLogRecord) => void;

export type StructuredLogger = {
  debug(event: string, errorCode: string, context?: StructuredLogContext): void;
  info(event: string, errorCode: string, context?: StructuredLogContext): void;
  warn(event: string, errorCode: string, context?: StructuredLogContext): void;
  error(event: string, errorCode: string, context?: StructuredLogContext): void;
};

export type StructuredLoggerOptions = {
  sink?: StructuredLogSink;
  now?: () => Date;
};

const REDACTED = "[REDACTED]";
const MAX_SANITIZE_DEPTH = 6;
const MAX_TEXT_LENGTH = 600;
const SENSITIVE_KEY = /(?:authorization|cookie|credential|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password|private[-_]?key|^(?:token|session[-_]?token|auth[-_]?token)$)/i;
const SIGNED_QUERY_KEY = `(?:${[
  "key",
  "api[-_]?key",
  "access[-_]?token",
  "refresh[-_]?token",
  "token",
  "secret",
  "password",
  "credential",
  "signature",
  "access[-_]?key(?:[-_]?id)?",
  "secret[-_]?id",
  "security[-_]?token",
  "ossaccesskeyid",
  "googleaccessid",
  "x-(?:amz|goog|oss)-(?:credential|signature|security-token|access-key-id)",
  "q-(?:ak|signature|key-time)",
].join("|")})`;

function sanitizeText(value: string): string {
  return value
    .replace(/\bBasic\s+[A-Za-z0-9+/=_-]+/gi, `Basic ${REDACTED}`)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/\s@]+)@/gi, `$1${REDACTED}@`)
    .replace(new RegExp(`([?&]${SIGNED_QUERY_KEY}=)[^&#\\s]+`, "gi"), `$1${REDACTED}`)
    .replace(/\b(api[-_]?key|x-api-key|authorization|access[-_]?token|refresh[-_]?token|token|secret|password)\s*["']?\s*[:=]\s*["']?([^\s,;}&"']+)/gi, `$1=${REDACTED}`)
    .replace(/\b(?:sk-(?:ant-|proj-|or-)?[A-Za-z0-9._-]{8,}|AIza[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AKID[A-Za-z0-9]{13,}|LTAI[A-Za-z0-9]{12,})\b/g, REDACTED)
    .slice(0, MAX_TEXT_LENGTH);
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_SANITIZE_DEPTH) return "[TRUNCATED]";
  if (typeof value === "string") return sanitizeText(value);
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return String(value);

  if (value instanceof Error) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const error = value as Error & { code?: unknown; cause?: unknown };
    const sanitized: StructuredLogContext = {
      name: sanitizeText(error.name),
      message: sanitizeText(error.message),
    };
    if (typeof error.code === "string" || typeof error.code === "number") sanitized.code = sanitizeValue(error.code, depth + 1, seen);
    if (error.cause !== undefined) sanitized.cause = sanitizeValue(error.cause, depth + 1, seen);
    return sanitized;
  }

  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1, seen));

  const sanitized: StructuredLogContext = {};
  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeValue(entry, depth + 1, seen);
  }
  return sanitized;
}

export function sanitizeLogContext(context: StructuredLogContext): StructuredLogContext {
  try {
    return sanitizeValue(context, 0, new WeakSet<object>()) as StructuredLogContext;
  } catch {
    return { serialization: "[UNAVAILABLE]" };
  }
}

function defaultSink(record: StructuredLogRecord): void {
  const output = JSON.stringify(record);
  if (record.severity === "error") console.error(output);
  else if (record.severity === "warn") console.warn(output);
  else if (record.severity === "info") console.info(output);
  else console.debug(output);
}

export function createStructuredLogger(module: string, options: StructuredLoggerOptions = {}): StructuredLogger {
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date());

  const write = (severity: LogSeverity, event: string, errorCode: string, context?: StructuredLogContext) => {
    try {
      sink({
        timestamp: now().toISOString(),
        module,
        event,
        severity,
        errorCode,
        ...(context && Object.keys(context).length > 0 ? { context: sanitizeLogContext(context) } : {}),
      });
    } catch {
      // Logging must never change application control flow.
    }
  };

  return {
    debug: (event, errorCode, context) => write("debug", event, errorCode, context),
    info: (event, errorCode, context) => write("info", event, errorCode, context),
    warn: (event, errorCode, context) => write("warn", event, errorCode, context),
    error: (event, errorCode, context) => write("error", event, errorCode, context),
  };
}
