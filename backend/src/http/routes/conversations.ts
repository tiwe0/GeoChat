import {
  decodeUpsertDesktopConversationMessageInput,
  type DesktopConversationDetailResponse,
  type DesktopConversationListResponse
} from "@geochat-ai/app/desktop-contracts";
import {
  isBlackboardCategory,
  type DesktopConversationBlackboardResponse,
  type ReadBlackboardArgs
} from "@geochat-ai/app/blackboard";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import {
  ConversationOwnershipError,
  ConversationRunActiveError
} from "../../db/conversation-repository";
import type { BackendHttpContext } from "../context";
import {
  conversationBlackboardPath,
  conversationDetailPath,
  conversationMessagesPath
} from "../paths";
import { json, readJson } from "../response";
import type { DataScopeResolver } from "../scope";

const logger = createStructuredLogger("http.conversations");

export async function handleConversationRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver
) {
  const conversationRepository = context.repositories.conversations;
  const blackboardRepository = context.repositories.blackboard;

  if (request.method === "GET" && url.pathname === "/v1/conversations") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    return json({ conversations: await conversationRepository.listConversations(dataScope.scope) } satisfies DesktopConversationListResponse);
  }

  const conversationMessagePath = conversationMessagesPath(url.pathname);
  if (request.method === "POST" && conversationMessagePath) {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const decoded = decodeUpsertDesktopConversationMessageInput(await readJson(request));
    if (!decoded.ok || decoded.value.conversationId !== conversationMessagePath) {
      return json({
        error: "invalid_request",
        errorCode: decoded.ok ? "conversation_message_path_mismatch" : decoded.errorCode,
        message: "Invalid conversation message payload."
      }, { status: 400 });
    }
    const payload = decoded.value;
    const existingMessage = await conversationRepository.findMessageById(payload.message.id, dataScope.scope);
    if (existingMessage && existingMessage.conversationId !== conversationMessagePath) {
      return json(
        { error: "conflict", message: "Conversation message id already belongs to another conversation." },
        { status: 409 }
      );
    }
    try {
      const conversation = await conversationRepository.upsertConversationMessage(payload, dataScope.scope);
      return json(
        {
          conversation: {
            ...conversation,
            blackboardEntries: await blackboardRepository.listEntries(conversation.id)
          }
        } satisfies DesktopConversationDetailResponse,
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof ConversationOwnershipError) {
        logger.warn("conversation_scope_conflict", "CONVERSATION_SCOPE_CONFLICT", {
          error,
          conversationId: conversationMessagePath,
          requestId: request.headers.get("x-request-id") ?? undefined,
        });
        return json({ error: "conversation_scope_conflict", message: "Conversation belongs to another account or offline scope." }, { status: 409 });
      }
      logger.error("conversation_message_upsert_failed", "CONVERSATION_MESSAGE_UPSERT_FAILED", {
        error,
        conversationId: conversationMessagePath,
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
      throw error;
    }
  }

  const conversationBlackboardId = conversationBlackboardPath(url.pathname);
  if (request.method === "GET" && conversationBlackboardId) {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const conversation = await conversationRepository.getConversationDetail(conversationBlackboardId, dataScope.scope);
    if (!conversation) {
      return json({
        conversationId: conversationBlackboardId,
        entries: []
      } satisfies DesktopConversationBlackboardResponse);
    }
    return json({
      conversationId: conversationBlackboardId,
      entries: await blackboardRepository.listEntries(conversationBlackboardId, readBlackboardArgsFromUrl(url))
    } satisfies DesktopConversationBlackboardResponse);
  }

  const conversationPath = conversationDetailPath(url.pathname);
  if (request.method === "GET" && conversationPath) {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const conversation = await conversationRepository.getConversationDetail(conversationPath, dataScope.scope);
    if (!conversation) return json({ error: "not_found", message: "Conversation was not found." }, { status: 404 });
    return json({
      conversation: {
        ...conversation,
        blackboardEntries: await blackboardRepository.listEntries(conversationPath)
      }
    } satisfies DesktopConversationDetailResponse);
  }

  if (request.method === "DELETE" && conversationPath) {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const conversation = await conversationRepository.getConversationDetail(conversationPath, dataScope.scope);
    if (!conversation) return json({ error: "not_found", message: "Conversation was not found." }, { status: 404 });
    try {
      await conversationRepository.deleteConversation(conversationPath, dataScope.scope);
    } catch (error) {
      if (error instanceof ConversationRunActiveError) {
        return json(
          { error: "conversation_run_active", message: "Conversation cannot be deleted while an agent run is active." },
          { status: 409 }
        );
      }
      throw error;
    }
    return new Response(null, { status: 204 });
  }

  return undefined;
}

function readBlackboardArgsFromUrl(url: URL): ReadBlackboardArgs {
  const categories = url.searchParams
    .getAll("category")
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(isBlackboardCategory);
  const includeArchived = url.searchParams.get("includeArchived") === "1" || url.searchParams.get("includeArchived") === "true";
  const limit = Number(url.searchParams.get("limit") ?? 30);
  return {
    categories: categories.length ? categories : null,
    includeArchived,
    limit: Number.isFinite(limit) ? limit : 30
  };
}
