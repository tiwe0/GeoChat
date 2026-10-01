import {
  isBoundedRuntimeString,
  isRuntimeIsoTimestamp,
  isRuntimeNonNegativeInteger,
  isRuntimeRecord,
  runtimeDecodeFailure,
  runtimeDecodeSuccess,
  type RuntimeDecodeResult,
} from "./runtime-decode";

export const MAX_GEOGEBRA_DOCUMENT_BYTES = 16 * 1024 * 1024;

export type GeoGebraDocumentContentKind = "text" | "binary";

export type GeoGebraDocumentMetadata = {
  id: string;
  title: string;
  mimeType: string;
  contentKind: GeoGebraDocumentContentKind;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type GeoGebraDocument = GeoGebraDocumentMetadata & {
  /** UTF-8 text for `text`, RFC 4648 base64 for `binary`. */
  content: string;
};

export type UpsertGeoGebraDocumentInput = Pick<
  GeoGebraDocument,
  "id" | "title" | "mimeType" | "contentKind" | "content"
>;

export type GeoGebraDocumentListResponse = { documents: GeoGebraDocumentMetadata[] };
export type GeoGebraDocumentResponse = { document: GeoGebraDocument };

export function decodeUpsertGeoGebraDocumentInput(
  value: unknown,
): RuntimeDecodeResult<UpsertGeoGebraDocumentInput, "geogebra_document_input_invalid"> {
  if (!isRuntimeRecord(value) || !isGeoGebraDocumentIdentity(value)) {
    return runtimeDecodeFailure("geogebra_document_input_invalid");
  }
  if (value.contentKind !== "text" && value.contentKind !== "binary") {
    return runtimeDecodeFailure("geogebra_document_input_invalid");
  }
  if (typeof value.content !== "string") return runtimeDecodeFailure("geogebra_document_input_invalid");
  if (value.contentKind === "binary" && !isCanonicalBase64(value.content)) {
    return runtimeDecodeFailure("geogebra_document_input_invalid");
  }
  const sizeBytes = contentByteLength(value.contentKind, value.content);
  if (sizeBytes > MAX_GEOGEBRA_DOCUMENT_BYTES) {
    return runtimeDecodeFailure("geogebra_document_input_invalid");
  }
  return runtimeDecodeSuccess(value as UpsertGeoGebraDocumentInput);
}

export function decodeGeoGebraDocumentResponse(
  value: unknown,
): RuntimeDecodeResult<GeoGebraDocumentResponse, "geogebra_document_response_invalid"> {
  if (!isRuntimeRecord(value) || !isGeoGebraDocument(value.document)) {
    return runtimeDecodeFailure("geogebra_document_response_invalid");
  }
  return runtimeDecodeSuccess(value as GeoGebraDocumentResponse);
}

export function decodeGeoGebraDocumentListResponse(
  value: unknown,
): RuntimeDecodeResult<GeoGebraDocumentListResponse, "geogebra_document_list_response_invalid"> {
  if (!isRuntimeRecord(value) || !Array.isArray(value.documents) || !value.documents.every(isGeoGebraDocumentMetadata)) {
    return runtimeDecodeFailure("geogebra_document_list_response_invalid");
  }
  return runtimeDecodeSuccess(value as GeoGebraDocumentListResponse);
}

export function contentByteLength(kind: GeoGebraDocumentContentKind, content: string): number {
  if (kind === "text") return new TextEncoder().encode(content).byteLength;
  if (!isCanonicalBase64(content)) return Number.POSITIVE_INFINITY;
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return (content.length / 4) * 3 - padding;
}

function isGeoGebraDocumentIdentity(value: Record<string, unknown>) {
  return isBoundedRuntimeString(value.id, 160)
    && isBoundedRuntimeString(value.title, 500)
    && isBoundedRuntimeString(value.mimeType, 200);
}

function isGeoGebraDocumentMetadata(value: unknown): value is GeoGebraDocumentMetadata {
  if (!isRuntimeRecord(value) || !isGeoGebraDocumentIdentity(value)) return false;
  return (value.contentKind === "text" || value.contentKind === "binary")
    && isRuntimeNonNegativeInteger(value.sizeBytes)
    && value.sizeBytes <= MAX_GEOGEBRA_DOCUMENT_BYTES
    && isRuntimeIsoTimestamp(value.createdAt)
    && isRuntimeIsoTimestamp(value.updatedAt);
}

function isGeoGebraDocument(value: unknown): value is GeoGebraDocument {
  if (!isRuntimeRecord(value)) return false;
  const content = value.content;
  if (!isGeoGebraDocumentMetadata(value) || typeof content !== "string") return false;
  return contentByteLength(value.contentKind, content) === value.sizeBytes;
}

function isCanonicalBase64(value: string) {
  return value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}
