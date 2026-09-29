import type {
  LegacyConversationImportRequest,
  LegacyConversationImportResponse,
} from "@geochat-ai/app/legacy-conversation-import";
import type { BackendHttpContext } from "../context";
import { json, readJson } from "../response";
import type { DataScopeResolver } from "../scope";

const MAX_LEGACY_MESSAGES = 5_000;

export async function handleLegacyConversationImportRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver,
) {
  if (request.method !== "POST" || url.pathname !== "/v1/legacy-conversations/import") return undefined;
  const dataScope = await authenticatedDataScope(request);
  if ("response" in dataScope) return dataScope.response;
  const body = await readJson(request);
  if (!isLegacyConversationImportRequest(body)) {
    return json({
      error: "invalid_legacy_conversation_import",
      message: "The legacy conversation import payload is invalid.",
    }, { status: 400 });
  }

  const importResult = await context.repositories.legacyConversationImports.importConversation(body, dataScope.scope);
  return json(
    { importResult } satisfies LegacyConversationImportResponse,
    { status: importResult.outcome === "imported" ? 201 : importResult.outcome === "conflict" ? 409 : 200 },
  );
}

function isLegacyConversationImportRequest(value: unknown): value is LegacyConversationImportRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  if (request.schemaVersion !== 1 || typeof request.sourceFingerprint !== "string"
    || !/^[a-f0-9]{64}$/.test(request.sourceFingerprint)) return false;
  const conversation = request.conversation;
  if (!conversation || typeof conversation !== "object" || Array.isArray(conversation)) return false;
  const record = conversation as Record<string, unknown>;
  if (!boundedString(record.id, 160) || !boundedString(record.model, 200)
    || !(record.title === null || boundedString(record.title, 500))
    || !isIsoDate(record.createdAt) || !isIsoDate(record.updatedAt)
    || !Array.isArray(record.messages) || record.messages.length > MAX_LEGACY_MESSAGES) return false;
  const ids = new Set<string>();
  return record.messages.every((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) return false;
    const item = message as Record<string, unknown>;
    if (!boundedString(item.id, 160) || ids.has(item.id as string)
      || (item.role !== "user" && item.role !== "assistant")
      || (item.createdAt !== undefined && !isIsoDate(item.createdAt))
      || !Array.isArray(item.parts)
      || (item.metadata !== undefined && (!item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata)))) return false;
    ids.add(item.id as string);
    const usage = (item.metadata as Record<string, unknown> | undefined)?.tokenUsage;
    return usage === undefined || isTokenUsage(usage);
  });
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isTokenUsage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const usage = value as Record<string, unknown>;
  return [usage.inputTokens, usage.outputTokens, usage.totalTokens].every((token) =>
    token === undefined || (typeof token === "number" && Number.isInteger(token) && token >= 0));
}

