import {
  DEFAULT_GEOGEBRA_DOCUMENT_LIST_LIMIT,
  decodeUpsertGeoGebraDocumentInput,
  MAX_GEOGEBRA_DOCUMENT_LIST_LIMIT,
  MAX_GEOGEBRA_DOCUMENT_REQUEST_BYTES,
  type GeoGebraDocumentListResponse,
  type GeoGebraDocumentResponse,
} from "@geochat-ai/app/geogebra-documents";
import type { BackendHttpContext } from "../context";
import { geogebraDocumentPath } from "../paths";
import { json } from "../response";
import type { DataScopeResolver } from "../scope";

export async function handleGeoGebraDocumentRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver,
) {
  const repository = context.repositories.geogebraDocuments;
  if (request.method === "GET" && url.pathname === "/v1/geogebra-documents") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const pagination = documentListPagination(url);
    if (!pagination) {
      return json({ error: "invalid_pagination", message: "Document pagination is invalid." }, { status: 400 });
    }
    return json({
      documents: await repository.listDocuments(dataScope.scope, pagination),
    } satisfies GeoGebraDocumentListResponse);
  }

  if (request.method === "POST" && url.pathname === "/v1/geogebra-documents") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const body = await readBoundedJson(request, MAX_GEOGEBRA_DOCUMENT_REQUEST_BYTES);
    if (body.status === "too_large") {
      return json({
        error: "payload_too_large",
        message: "The GeoGebra document payload exceeds the maximum allowed size.",
      }, { status: 413 });
    }
    const decoded = decodeUpsertGeoGebraDocumentInput(body.status === "ok" ? body.value : undefined);
    if (!decoded.ok) {
      return json({
        error: "invalid_geogebra_document",
        errorCode: decoded.errorCode,
        message: "The GeoGebra document payload is invalid.",
      }, { status: 400 });
    }
    const existed = Boolean(await repository.getDocument(decoded.value.id, dataScope.scope));
    const document = await repository.upsertDocument(decoded.value, dataScope.scope);
    return json({ document } satisfies GeoGebraDocumentResponse, { status: existed ? 200 : 201 });
  }

  const documentId = geogebraDocumentPath(url.pathname);
  if (request.method === "GET" && documentId) {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const document = await repository.getDocument(documentId, dataScope.scope);
    if (!document) return json({ error: "not_found", message: "GeoGebra document was not found." }, { status: 404 });
    return json({ document } satisfies GeoGebraDocumentResponse);
  }

  if (request.method === "DELETE" && documentId) {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    await repository.deleteDocument(documentId, dataScope.scope);
    return new Response(null, { status: 204 });
  }

  return undefined;
}

function documentListPagination(url: URL) {
  const limit = parseBoundedInteger(url.searchParams.get("limit"), DEFAULT_GEOGEBRA_DOCUMENT_LIST_LIMIT, 1, MAX_GEOGEBRA_DOCUMENT_LIST_LIMIT);
  const offset = parseBoundedInteger(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  return limit === undefined || offset === undefined ? undefined : { limit, offset };
}

function parseBoundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

type BoundedJsonResult =
  | { status: "ok"; value: unknown }
  | { status: "invalid" }
  | { status: "too_large" };

async function readBoundedJson(request: Request, maximumBytes: number): Promise<BoundedJsonResult> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return { status: "invalid" };
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength)) return { status: "invalid" };
    if (parsedLength > maximumBytes) return { status: "too_large" };
  }
  if (!request.body) return { status: "invalid" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      return { status: "too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { status: "ok", value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { status: "invalid" };
  }
}
