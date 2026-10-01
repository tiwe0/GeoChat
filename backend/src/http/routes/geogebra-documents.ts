import {
  decodeUpsertGeoGebraDocumentInput,
  type GeoGebraDocumentListResponse,
  type GeoGebraDocumentResponse,
} from "@geochat-ai/app/geogebra-documents";
import type { BackendHttpContext } from "../context";
import { geogebraDocumentPath } from "../paths";
import { json, readJson } from "../response";
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
    return json({ documents: await repository.listDocuments(dataScope.scope) } satisfies GeoGebraDocumentListResponse);
  }

  if (request.method === "POST" && url.pathname === "/v1/geogebra-documents") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const decoded = decodeUpsertGeoGebraDocumentInput(await readJson(request));
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
