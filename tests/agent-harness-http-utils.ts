import { afterEach } from "bun:test";
import { createDatabase } from "../backend/src/db/client";

export const TEST_BACKEND_AUTH_TOKEN = "geochat-test-backend-token";

const activeHarnessContexts = new Set<{ close(): void }>();

afterEach(() => {
  for (const context of activeHarnessContexts) context.close();
  activeHarnessContexts.clear();
});

export async function createHttpHarness(input: {
  databasePath?: string;
  backfillPersistedAgentErrorEvents?: boolean;
  authToken?: string;
  reconcileInterruptedRuntimeState?: boolean;
} = {}) {
  const databasePath = input.databasePath ?? `/tmp/geochat-agent-harness-${crypto.randomUUID()}.sqlite`;
  const { createBackendHttpContext } = await import("../backend/src/http/context");
  const { createBackendHttpHandler } = await import("../backend/src/http/handler");
  const context = createBackendHttpContext({
    databasePath,
    reconcileInterruptedRuntimeState: input.reconcileInterruptedRuntimeState ?? false
  });
  activeHarnessContexts.add(context);
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
    if (!headers.has("x-client-installation-id")) headers.set("x-client-installation-id", "test-installation");
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

  const close = () => {
    activeHarnessContexts.delete(context);
    context.close();
  };

  return {
    databasePath,
    context,
    handler,
    handleRequest: (request: Request) => {
      const headers = new Headers(request.headers);
      if (!headers.has("authorization")) headers.set("authorization", `Bearer ${authToken}`);
      if (!headers.has("x-client-installation-id")) headers.set("x-client-installation-id", "test-installation");
      return handler.handleRequest(new Request(request, { headers }));
    },
    rawHandleRequest: handler.handleRequest,
    request,
    close
  };
}

export function createDatabaseForPath(databasePath: string) {
  return createDatabase({ databasePath });
}
