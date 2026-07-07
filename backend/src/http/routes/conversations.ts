import {
  isAgentRunTimestamp,
  isBlackboardCategory,
  type DesktopConversationBlackboardResponse,
  type DesktopConversationDetailResponse,
  type DesktopConversationListResponse,
  type ReadBlackboardArgs,
  type UpsertDesktopConversationMessageInput
} from "@geochat-ai/app";
import { ConversationOwnershipError, type ConversationDataScope } from "../../db/conversation-repository";
import type { BackendHttpContext } from "../context";
import {
  conversationBlackboardPath,
  conversationDetailPath,
  conversationMessagesPath
} from "../paths";
import { json, readJson } from "../response";
import type { DataScopeResolver } from "../scope";

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
    const payload = await readJson(request);
    if (!isUpsertDesktopConversationMessageInput(payload) || payload.conversationId !== conversationMessagePath) {
      return json({ error: "invalid_request", message: "Invalid conversation message payload." }, { status: 400 });
    }
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
        return json({ error: "conversation_scope_conflict", message: "Conversation belongs to another account or offline scope." }, { status: 409 });
      }
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
    await conversationRepository.deleteConversation(conversationPath, dataScope.scope);
    return new Response(null, { status: 204 });
  }

  return undefined;
}

function isDesktopConversationMessagePayload(value: unknown): value is UpsertDesktopConversationMessageInput["message"] {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    Boolean(message.id.trim()) &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    Boolean(message.content.trim()) &&
    typeof message.createdAt === "string" &&
    isAgentRunTimestamp(message.createdAt) &&
    isDesktopConversationMessageSnapshot(message.payload)
  );
}

function isDesktopConversationMessageSnapshot(value: unknown): value is UpsertDesktopConversationMessageInput["message"]["payload"] {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.id === "string" &&
    Boolean(payload.id.trim()) &&
    (payload.role === "user" || payload.role === "assistant") &&
    typeof payload.content === "string" &&
    typeof payload.createdAt === "string" &&
    (payload.attachments === undefined || Array.isArray(payload.attachments)) &&
    (payload.toolCalls === undefined || Array.isArray(payload.toolCalls)) &&
    (payload.cards === undefined || Array.isArray(payload.cards)) &&
    (payload.usage === undefined || isDesktopConversationMessageUsage(payload.usage))
  );
}

function isDesktopConversationMessageUsage(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const usage = value as Record<string, unknown>;
  return (
    (usage.inputTokens === undefined || typeof usage.inputTokens === "number") &&
    (usage.outputTokens === undefined || typeof usage.outputTokens === "number") &&
    (usage.totalTokens === undefined || typeof usage.totalTokens === "number")
  );
}

function isUpsertDesktopConversationMessageInput(value: unknown): value is UpsertDesktopConversationMessageInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return typeof input.conversationId === "string" && isDesktopConversationMessagePayload(input.message);
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
