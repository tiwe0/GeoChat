import { Effect } from "effect";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId
} from "@geochat-ai/app/request-correlation";
import { createAgentRunDiagnosticsService } from "../services/agent-run-diagnostics";
import { createAgentRunEventService } from "../services/agent-run-events";
import type { BackendHttpContext } from "./context";
import { isValidPathEncoding } from "./paths";
import { json, withCorrelationId, withCors } from "./response";
import { matchBackendRouteAccess } from "./route-access";
import type { DataScopeResolver } from "./scope";
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  isAllowedOrigin,
  readBackendHttpSecurity,
  requestIsAuthorized,
  type BackendHttpSecurity
} from "./security";

const logger = createStructuredLogger("http.handler");
export function createBackendHttpHandler(
  context: BackendHttpContext,
  options: {
    authenticatedDataScope?: DataScopeResolver;
    backfillPersistedAgentErrorEvents?: boolean;
    security?: BackendHttpSecurity;
  } = {}
) {
  const {
    agentRuns: agentRunRepository
  } = context.repositories;
  const agentRunEvents = createAgentRunEventService(agentRunRepository);
  const agentRunDiagnostics = createAgentRunDiagnosticsService(agentRunRepository);
  const authenticateDataScope = options.authenticatedDataScope ?? authenticatedDataScope;
  const security = options.security ?? readBackendHttpSecurity();

  if (options.backfillPersistedAgentErrorEvents ?? true) {
    void agentRunEvents.backfillPersistedAgentErrorEvents();
  }

  async function handleRequest(request: Request) {
    const startedAt = performance.now();
    const response = await Effect.runPromise(
      Effect.tryPromise({
        try: () => routeRequest(request, context, authenticateDataScope, security),
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
    const correlationId = resolveCorrelationId(
      response.headers.get(CORRELATION_ID_HEADER),
      request.headers.get(CORRELATION_ID_HEADER)
    );
    const path = new URL(request.url).pathname;
    const requestCompletedContext = {
      correlationId,
      method: request.method,
      path,
      status: response.status,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    };
    if (request.method === "GET" && path === "/health" && response.status === 200) {
      logger.debug("request_completed", "HTTP_REQUEST_COMPLETED", requestCompletedContext);
    } else {
      logger.info("request_completed", "HTTP_REQUEST_COMPLETED", requestCompletedContext);
    }
    return withCors(withCorrelationId(response, correlationId), request, security);
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
  authenticateDataScope: DataScopeResolver,
  security: BackendHttpSecurity
) {
  const url = new URL(request.url);
  const routeAccess = matchBackendRouteAccess(url.pathname);

  if (!routeAccess) {
    return json(
      { error: "not_found", message: "The requested resource was not found." },
      { status: 404 }
    );
  }

  if (!isValidPathEncoding(url.pathname)) {
    return json(
      { error: "invalid_path", message: "The request path is not valid." },
      { status: 400 }
    );
  }

  const origin = request.headers.get("origin");
  if (origin !== null && !isAllowedOrigin(origin, security)) {
    return json(
      { error: "cors_origin_forbidden", message: "The request origin is not allowed." },
      { status: 403 }
    );
  }

  if (request.method === "OPTIONS") {
    return handleCorsPreflight(request, security, routeAccess.methods);
  }

  if (!routeAccess.methods.includes(request.method as typeof routeAccess.methods[number])) {
    return json(
      { error: "method_not_allowed", message: "The requested method is not allowed." },
      {
        status: 405,
        headers: { allow: routeAccess.methods.join(", ") }
      }
    );
  }

  if (routeAccess.access === "authenticated" && !requestIsAuthorized(request, security.authentication)) {
    return json(
      {
        error: "unauthorized",
        message: "A valid local backend bearer token is required."
      },
      {
        status: 401,
        headers: { "www-authenticate": "Bearer" }
      }
    );
  }

  const routeResponse = await routeAccess.handle(request, url, context, authenticateDataScope);
  if (routeResponse) return routeResponse;

  return json({ error: "not_found", message: "The requested resource was not found." }, { status: 404 });
}

function handleCorsPreflight(
  request: Request,
  security: BackendHttpSecurity,
  routeMethods: readonly string[]
) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, security)) {
    return json(
      { error: "cors_origin_forbidden", message: "The request origin is not allowed." },
      { status: 403 }
    );
  }

  const requestedMethod = request.headers.get("access-control-request-method")?.toUpperCase();
  if (
    !requestedMethod
    || !CORS_ALLOWED_METHODS.includes(requestedMethod as typeof CORS_ALLOWED_METHODS[number])
    || !routeMethods.includes(requestedMethod)
  ) {
    return json(
      { error: "cors_method_forbidden", message: "The requested CORS method is not allowed." },
      { status: 403 }
    );
  }

  const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const forbiddenHeader = requestedHeaders.find(
    (header) => !CORS_ALLOWED_HEADERS.includes(header as typeof CORS_ALLOWED_HEADERS[number])
  );
  if (forbiddenHeader) {
    return json(
      {
        error: "cors_header_forbidden",
        message: `The requested CORS header is not allowed: ${forbiddenHeader}`
      },
      { status: 403 }
    );
  }

  return new Response(null, { status: 204 });
}

async function authenticatedDataScope(request: Request): ReturnType<DataScopeResolver> {
  void request;
  return { scope: { ownerUserId: null } };
}

export type BackendHttpHandler = ReturnType<typeof createBackendHttpHandler>;
