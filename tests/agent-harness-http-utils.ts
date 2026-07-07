import { createDatabase } from "../backend/src/db/client";

export async function createHttpHarness(input: {
  databasePath?: string;
  backfillPersistedAgentErrorEvents?: boolean;
} = {}) {
  const databasePath = input.databasePath ?? `/tmp/geochat-agent-harness-${crypto.randomUUID()}.sqlite`;
  const previousDatabasePath = Bun.env.GEOCHAT_DESKTOP_DB_PATH;
  try {
    Bun.env.GEOCHAT_DESKTOP_DB_PATH = databasePath;
    const { createBackendHttpContext } = await import("../backend/src/http/context");
    const { createBackendHttpHandler } = await import("../backend/src/http/handler");
    const handler = createBackendHttpHandler(createBackendHttpContext(), {
      backfillPersistedAgentErrorEvents: input.backfillPersistedAgentErrorEvents ?? false
    });

    async function request(path: string, init?: RequestInit) {
      const response = await handler.handleRequest(new Request(`http://127.0.0.1:17365${path}`, init));
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
      handler,
      handleRequest: handler.handleRequest,
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
