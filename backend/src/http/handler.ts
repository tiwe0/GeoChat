import { Effect } from "effect";
import { type ConversationDataScope } from "../db/conversation-repository";
import { createAgentRunDiagnosticsService } from "../services/agent-run-diagnostics";
import { createAgentRunEventService } from "../services/agent-run-events";
import type { BackendHttpContext } from "./context";
import { json, withCors } from "./response";
import { handleAgentRunWriteRoute } from "./routes/agent-run-write";
import { handleAgentRunObservabilityRoute } from "./routes/agent-run-observability";
import { handleHealthAndAssetRoute } from "./routes/health-assets";
import { handleConversationRoute } from "./routes/conversations";
import { handleMessageRoute } from "./routes/messages";
import { handleMigrationRoute } from "./routes/migration";
import { handleProblemBankRoute } from "./routes/problem-bank";
import { handleProviderProxyRoute } from "./routes/provider-proxy";

type AuthenticatedDataScope = (
  request: Request
) => Promise<
  | { scope: ConversationDataScope }
  | { response: Response }
>;

export function createBackendHttpHandler(
  context: BackendHttpContext,
  options: {
    authenticatedDataScope?: AuthenticatedDataScope;
    backfillPersistedAgentErrorEvents?: boolean;
  } = {}
) {
  const {
    agentRuns: agentRunRepository
  } = context.repositories;
  const agentRunEvents = createAgentRunEventService(agentRunRepository);
  const agentRunDiagnostics = createAgentRunDiagnosticsService(agentRunRepository);
  const authenticateDataScope = options.authenticatedDataScope ?? authenticatedDataScope;

  if (options.backfillPersistedAgentErrorEvents ?? true) {
    void agentRunEvents.backfillPersistedAgentErrorEvents();
  }

  async function handleRequest(request: Request) {
    const response = await Effect.runPromise(
      Effect.tryPromise({
        try: () => routeRequest(request, context, authenticateDataScope),
        catch: (error) => error
      }).pipe(
        Effect.catchAll((error) =>
          Effect.succeed(
            json(
              {
                error: "internal_error",
                message: error instanceof Error ? error.message : "Unexpected backend error"
              },
              { status: 500 }
            )
          )
        )
      )
    );
    return withCors(response, request);
  }

  function getConversationPersistenceDiagnostics(conversationId: string, expectedRunIds: string[] = []) {
    return agentRunDiagnostics.persistenceDiagnostics(conversationId, expectedRunIds);
  }

  return {
    handleRequest,
    getConversationPersistenceDiagnostics
  };
}

async function routeRequest(
  request: Request,
  context: BackendHttpContext,
  authenticateDataScope: AuthenticatedDataScope
) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const healthOrAssetResponse = await handleHealthAndAssetRoute(request, url, context);
  if (healthOrAssetResponse) return healthOrAssetResponse;

  const authResponse = authorizeLocalBackendRequest(request);
  if (authResponse) return authResponse;

  const conversationResponse = await handleConversationRoute(request, url, context, authenticateDataScope);
  if (conversationResponse) return conversationResponse;

  const migrationResponse = await handleMigrationRoute(request, url, context, authenticateDataScope);
  if (migrationResponse) return migrationResponse;

  const messageResponse = await handleMessageRoute(request, url, context, authenticateDataScope);
  if (messageResponse) return messageResponse;

  const problemBankResponse = await handleProblemBankRoute(request, url, context, authenticateDataScope);
  if (problemBankResponse) return problemBankResponse;

  const agentRunObservabilityResponse = await handleAgentRunObservabilityRoute(request, url, context, authenticateDataScope);
  if (agentRunObservabilityResponse) return agentRunObservabilityResponse;

  const agentRunWriteResponse = await handleAgentRunWriteRoute(request, url, context, authenticateDataScope);
  if (agentRunWriteResponse) return agentRunWriteResponse;

  const providerProxyResponse = await handleProviderProxyRoute(request, url, context);
  if (providerProxyResponse) return providerProxyResponse;

  return json(
    {
      error: "not_found",
      message: `${request.method} ${url.pathname} is not available.`
    },
    { status: 404 }
  );
}

function authorizeLocalBackendRequest(request: Request) {
  const token = Bun.env.GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN;
  if (!token) return undefined;
  const expected = `Bearer ${token}`;
  if (request.headers.get("authorization") === expected) return undefined;
  return json(
    {
      error: "unauthorized",
      message: "Desktop backend requests require the local runtime authorization token."
    },
    { status: 401 }
  );
}

async function authenticatedDataScope(request: Request): ReturnType<AuthenticatedDataScope> {
  void request;
  return { scope: { ownerUserId: null } };
}

export type BackendHttpHandler = ReturnType<typeof createBackendHttpHandler>;
