export const CORRELATION_ID_HEADER = "x-correlation-id";

const MAX_CORRELATION_ID_LENGTH = 160;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function normalizeCorrelationId(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized.length > MAX_CORRELATION_ID_LENGTH || !CORRELATION_ID_PATTERN.test(normalized))
    return undefined;
  return normalized;
}

export function createCorrelationId(prefix = "request") {
  const normalizedPrefix = normalizeCorrelationId(prefix) ?? "request";
  return `${normalizedPrefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function resolveCorrelationId(preferred: string | null | undefined, fallback?: string | null) {
  return normalizeCorrelationId(preferred) ?? normalizeCorrelationId(fallback) ?? createCorrelationId();
}
