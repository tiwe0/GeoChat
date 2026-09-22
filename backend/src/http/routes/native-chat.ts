import { createNativeChatResponse, isNativeChatRequest } from "../../agent/native-chat";
import type { BackendHttpContext } from "../context";
import { json, readJson } from "../response";
import type { DataScopeResolver } from "../scope";

export async function handleNativeChatRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver,
) {
  if (request.method !== "POST" || url.pathname !== "/v1/chat") return undefined;
  const dataScope = await authenticatedDataScope(request);
  if ("response" in dataScope) return dataScope.response;
  const payload = await readJson(request);
  if (!isNativeChatRequest(payload)) {
    return json({ error: "invalid_request", message: "Invalid native AI SDK chat payload." }, { status: 400 });
  }
  const ownerUserId = await context.repositories.conversations.getConversationOwnerUserId(payload.conversationId);
  if (ownerUserId !== undefined && ownerUserId !== (dataScope.scope.ownerUserId ?? null)) {
    return json({ error: "not_found", message: "Conversation was not found." }, { status: 404 });
  }
  return createNativeChatResponse(payload, context, { abortSignal: request.signal, dataScope: dataScope.scope });
}
