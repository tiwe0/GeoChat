import {
  decodeLegacyConversationImportRequest,
  type LegacyConversationImportResponse,
} from "@geochat-ai/app/legacy-conversation-import";
import type { BackendHttpContext } from "../context";
import { json, readJson } from "../response";
import type { DataScopeResolver } from "../scope";

export async function handleLegacyConversationImportRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver,
) {
  if (request.method !== "POST" || url.pathname !== "/v1/legacy-conversations/import") return undefined;
  const dataScope = await authenticatedDataScope(request);
  if ("response" in dataScope) return dataScope.response;
  const decoded = decodeLegacyConversationImportRequest(await readJson(request));
  if (!decoded.ok) {
    return json({
      error: "invalid_legacy_conversation_import",
      errorCode: decoded.errorCode,
      message: "The legacy conversation import payload is invalid.",
    }, { status: 400 });
  }

  const importResult = await context.repositories.legacyConversationImports.importConversation(decoded.value, dataScope.scope);
  return json(
    { importResult } satisfies LegacyConversationImportResponse,
    { status: importResult.outcome === "imported" ? 201 : importResult.outcome === "conflict" ? 409 : 200 },
  );
}
