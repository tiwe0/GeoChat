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
export const GEOGEBRA_FILE_MIME_TYPE = "application/vnd.geogebra.file";
export const DEFAULT_GEOGEBRA_DOCUMENT_LIST_LIMIT = 100;
export const MAX_GEOGEBRA_DOCUMENT_LIST_LIMIT = 200;
// Binary document content is base64 encoded in JSON. Reserve enough room for
// the bounded identity fields and JSON punctuation without accepting an
// unbounded request body.
export const MAX_GEOGEBRA_DOCUMENT_REQUEST_BYTES = 4 * Math.ceil(MAX_GEOGEBRA_DOCUMENT_BYTES / 3) + 16 * 1024;

export type GeoGebraDocumentContentKind = "binary";

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
  /** RFC 4648 base64 for a complete `.ggb` file. */
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
  if (value.contentKind !== "binary" || value.mimeType !== GEOGEBRA_FILE_MIME_TYPE) {
    return runtimeDecodeFailure("geogebra_document_input_invalid");
  }
  if (typeof value.content !== "string") return runtimeDecodeFailure("geogebra_document_input_invalid");
  if (value.contentKind === "binary" && !isCanonicalBase64(value.content)) {
    return runtimeDecodeFailure("geogebra_document_input_invalid");
  }
  const sizeBytes = contentByteLength(value.content);
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

export function contentByteLength(content: string): number {
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
  return value.contentKind === "binary"
    && value.mimeType === GEOGEBRA_FILE_MIME_TYPE
    && isRuntimeNonNegativeInteger(value.sizeBytes)
    && value.sizeBytes <= MAX_GEOGEBRA_DOCUMENT_BYTES
    && isRuntimeIsoTimestamp(value.createdAt)
    && isRuntimeIsoTimestamp(value.updatedAt);
}

function isGeoGebraDocument(value: unknown): value is GeoGebraDocument {
  if (!isRuntimeRecord(value)) return false;
  const content = value.content;
  if (!isGeoGebraDocumentMetadata(value) || typeof content !== "string") return false;
  return contentByteLength(content) === value.sizeBytes;
}

function isCanonicalBase64(value: string) {
  if (value.length % 4 !== 0) return false;
  const firstPadding = value.indexOf("=");
  const contentLength = firstPadding === -1 ? value.length : firstPadding;
  const paddingLength = value.length - contentLength;
  if (paddingLength > 2 || (paddingLength > 0 && contentLength < 2)) return false;
  for (let index = 0; index < contentLength; index += 1) {
    const code = value.charCodeAt(index);
    const isAlphaNumeric = (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57);
    if (!isAlphaNumeric && code !== 43 && code !== 47) return false;
  }
  for (let index = contentLength; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 61) return false;
  }
  return paddingLength === 0
    || (paddingLength === 1 && contentLength % 4 === 3)
    || (paddingLength === 2 && contentLength % 4 === 2);
}
