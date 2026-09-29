import { createDatabase } from "../backend/src/db/client";

export const TEST_BACKEND_AUTH_TOKEN = "geochat-test-backend-token";

export async function createHttpHarness(input: {
  databasePath?: string;
  backfillPersistedAgentErrorEvents?: boolean;
  authToken?: string;
} = {}) {
  const databasePath = input.databasePath ?? `/tmp/geochat-agent-harness-${crypto.randomUUID()}.sqlite`;
  const previousDatabasePath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
  try {
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    const { createBackendHttpContext } = await import("../backend/src/http/context");
    const { createBackendHttpHandler } = await import("../backend/src/http/handler");
    const context = createBackendHttpContext();
    const authToken = input.authToken ?? TEST_BACKEND_AUTH_TOKEN;
    const handler = createBackendHttpHandler(context, {
      backfillPersistedAgentErrorEvents: input.backfillPersistedAgentErrorEvents ?? false,
      security: {
        authentication: { mode: "required", token: authToken },
        allowedOrigins: new Set(["http://127.0.0.1:1421"])
      }
    });

    async function request(path: string, init?: RequestInit) {
      const headers = new Headers(init?.headers);
      if (!headers.has("authorization")) headers.set("authorization", `Bearer ${authToken}`);
      const response = await handler.handleRequest(new Request(
        `http://127.0.0.1:17365${path}`,
        { ...init, headers }
      ));
      const text = await response.text();
      return {
        response,
        status: response.status,
        headers: response.headers,
        text,
        json: text ? JSON.parse(text) : undefined
      };
    }

    return {
      databasePath,
      context,
      handler,
      handleRequest: (request: Request) => {
        const headers = new Headers(request.headers);
        if (!headers.has("authorization")) headers.set("authorization", `Bearer ${authToken}`);
        return handler.handleRequest(new Request(request, { headers }));
      },
      rawHandleRequest: handler.handleRequest,
      request
    };
  } finally {
    if (previousDatabasePath === undefined) {
      delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    } else {
      Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousDatabasePath;
    }
  }
}

export function createDatabaseForPath(databasePath: string) {
  const previousDatabasePath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
  try {
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    return createDatabase();
  } finally {
    if (previousDatabasePath === undefined) {
      delete Bun.env.GEOCHAT_DESKTOP_DB_PATH;
    } else {
      Bun.env.GEOCHAT_DESKTOP_DB_PATH = previousDatabasePath;
    }
  }
}
