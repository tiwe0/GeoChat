import { CreateGeoChatMessageInput } from "@geochat-ai/app";
import { Either, Schema } from "effect";
import type { BackendHttpContext } from "../context";
import { json, readJson } from "../response";
import type { DataScopeResolver } from "../scope";

export async function handleMessageRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver
) {
  const messageRepository = context.repositories.messages;

  if (request.method === "GET" && url.pathname === "/v1/messages") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const rows = await messageRepository.listRecentMessages(50, dataScope.scope);
    return json({
      messages: rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.createdAt.toISOString()
      }))
    });
  }

  if (request.method === "POST" && url.pathname === "/v1/messages") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const decoded = Schema.decodeUnknownEither(CreateGeoChatMessageInput)(await readJson(request));

    if (Either.isLeft(decoded)) {
      return json(
        {
          error: "invalid_request",
          message: "Message content is required."
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const message = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: decoded.right.content,
      createdAt: now
    };

    await messageRepository.createMessage(message, dataScope.scope);

    return json(
      {
        message: {
          ...message,
          createdAt: now.toISOString()
        }
      },
      { status: 201 }
    );
  }

  return undefined;
}
