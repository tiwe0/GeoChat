export type RuntimeDecodeFailure<ErrorCode extends string> = {
  ok: false;
  errorCode: ErrorCode;
};

export type RuntimeDecodeResult<Value, ErrorCode extends string> =
  | { ok: true; value: Value }
  | RuntimeDecodeFailure<ErrorCode>;

export class RuntimeContractDecodeError<ErrorCode extends string = string> extends Error {
  readonly errorCode: ErrorCode;

  constructor(errorCode: ErrorCode, message: string) {
    super(message);
    this.name = "RuntimeContractDecodeError";
    this.errorCode = errorCode;
  }
}

export function runtimeDecodeSuccess<Value>(value: Value): RuntimeDecodeResult<Value, never> {
  return { ok: true, value };
}

export function runtimeDecodeFailure<ErrorCode extends string>(errorCode: ErrorCode): RuntimeDecodeFailure<ErrorCode> {
  return { ok: false, errorCode };
}

export function isRuntimeRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isBoundedRuntimeString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return typeof value === "string" && (allowEmpty || value.length > 0) && value.length <= maxLength;
}

export function isRuntimeIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function isRuntimeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
