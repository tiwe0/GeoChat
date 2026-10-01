import { describe, expect, test } from "bun:test";
import {
  BACKEND_ROUTE_ACCESS_CATALOG,
  matchBackendRouteAccess,
  type BackendRouteAccess
} from "../backend/src/http/route-access";
import { createBackendHttpHandler } from "../backend/src/http/handler";
import { createHttpHarness } from "./agent-harness-http-utils";

const routeCases: ReadonlyArray<{
  id: string;
  path: string;
  access: BackendRouteAccess;
  methods: readonly string[];
}> = [
  { id: "health", path: "/health", access: "public", methods: ["GET"] },
  { id: "geogebra-assets-v2", path: "/tools/geogebra-assets-v2/deployggb.js", access: "public", methods: ["GET", "HEAD"] },
  { id: "skills", path: "/v1/skills", access: "authenticated", methods: ["GET"] },
  { id: "conversations", path: "/v1/conversations", access: "authenticated", methods: ["GET"] },
  { id: "conversation-messages", path: "/v1/conversations/conversation-1/messages", access: "authenticated", methods: ["POST"] },
  { id: "conversation-blackboard", path: "/v1/conversations/conversation-1/blackboard", access: "authenticated", methods: ["GET"] },
  { id: "conversation-detail", path: "/v1/conversations/conversation-1", access: "authenticated", methods: ["GET", "DELETE"] },
  { id: "geogebra-documents", path: "/v1/geogebra-documents", access: "authenticated", methods: ["GET", "POST"] },
  { id: "geogebra-document-detail", path: "/v1/geogebra-documents/document-1", access: "authenticated", methods: ["GET", "DELETE"] },
  { id: "problem-bank-import", path: "/v1/problem-bank/import", access: "authenticated", methods: ["POST"] },
  { id: "problem-sets", path: "/v1/problem-sets", access: "authenticated", methods: ["GET"] },
  { id: "problem-set-problems", path: "/v1/problem-sets/set-1/problems", access: "authenticated", methods: ["GET"] },
  { id: "problem-detail", path: "/v1/problems/problem-1", access: "authenticated", methods: ["GET"] },
  { id: "problem-attempts", path: "/v1/problems/problem-1/attempts", access: "authenticated", methods: ["POST"] },
  { id: "benchmark-runs", path: "/v1/benchmark-runs", access: "authenticated", methods: ["GET", "POST"] },
  { id: "benchmark-run-results", path: "/v1/benchmark-runs/run-1/results", access: "authenticated", methods: ["POST"] },
  { id: "benchmark-run-complete", path: "/v1/benchmark-runs/run-1/complete", access: "authenticated", methods: ["POST"] },
  { id: "benchmark-run-cancel", path: "/v1/benchmark-runs/run-1/cancel", access: "authenticated", methods: ["POST"] },
  { id: "benchmark-run-fail", path: "/v1/benchmark-runs/run-1/fail", access: "authenticated", methods: ["POST"] },
  { id: "benchmark-run-interrupt", path: "/v1/benchmark-runs/run-1/interrupt", access: "authenticated", methods: ["POST"] },
  { id: "benchmark-run-detail", path: "/v1/benchmark-runs/run-1", access: "authenticated", methods: ["GET"] },
  { id: "native-chat", path: "/v1/chat", access: "authenticated", methods: ["POST"] },
  { id: "agent-runs-recoverable", path: "/v1/agent-runs/recoverable", access: "authenticated", methods: ["GET"] },
  { id: "agent-run-cancel", path: "/v1/agent-runs/run-1/cancel", access: "authenticated", methods: ["POST"] },
  { id: "agent-runs", path: "/v1/agent-runs", access: "authenticated", methods: ["GET"] },
  { id: "agent-command-usage", path: "/v1/agent-command-usage", access: "authenticated", methods: ["GET"] },
  { id: "agent-error-events", path: "/v1/agent-error-events", access: "authenticated", methods: ["GET"] },
  { id: "model-discovery", path: "/v1/models/discover", access: "authenticated", methods: ["POST"] }
];

describe("backend HTTP route access catalog", () => {
  test.each(routeCases)("classifies $id as $access", ({ id, path, access, methods }) => {
    const match = matchBackendRouteAccess(path);
    expect(match).toMatchObject({ id, access, methods });
    expect(match?.handle).toBe(BACKEND_ROUTE_ACCESS_CATALOG.find((route) => route.id === id)?.handle);
  });

  test("keeps the table in one-to-one coverage with the router catalog", () => {
    expect(routeCases.map(({ id }) => id).sort()).toEqual(
      BACKEND_ROUTE_ACCESS_CATALOG.map(({ id }) => id).sort()
    );
  });

  test("does not register removed compatibility and migration routes", async () => {
    const removedPaths = [
      "/v1/messages",
      "/v1/migration/export",
      "/v1/migration/import",
      "/tools/geogebra-assets/deployggb.js"
    ] as const;
    const { rawHandleRequest } = await createHttpHarness();
    for (const path of removedPaths) {
      expect(matchBackendRouteAccess(path), path).toBeUndefined();
      const response = await rawHandleRequest(new Request(`http://127.0.0.1:17365${path}`));
      expect(response.status, path).toBe(404);
    }
  });

  test("classifies malformed encoded dynamic segments without decoding them", () => {
    expect(matchBackendRouteAccess("/v1/conversations/%E0%A4%A/messages")).toMatchObject({
      id: "conversation-messages",
      access: "authenticated"
    });
  });

  test("returns 400 at the route boundary for invalid percent encoding", async () => {
    const { rawHandleRequest } = await createHttpHarness();
    const invalidPathCases = [
      ["GET", "/tools/geogebra-assets-v2/%E0%A4%A.js"],
      ["POST", "/v1/conversations/%E0%A4%A/messages"],
      ["GET", "/v1/conversations/%E0%A4%A/blackboard"],
      ["GET", "/v1/conversations/%E0%A4%A"],
      ["GET", "/v1/geogebra-documents/%E0%A4%A"],
      ["GET", "/v1/problem-sets/%E0%A4%A/problems"],
      ["GET", "/v1/problems/%E0%A4%A"],
      ["POST", "/v1/problems/%E0%A4%A/attempts"],
      ["POST", "/v1/benchmark-runs/%E0%A4%A/results"],
      ["POST", "/v1/benchmark-runs/%E0%A4%A/complete"],
      ["POST", "/v1/benchmark-runs/%E0%A4%A/cancel"],
      ["POST", "/v1/benchmark-runs/%E0%A4%A/fail"],
      ["POST", "/v1/benchmark-runs/%E0%A4%A/interrupt"],
      ["GET", "/v1/benchmark-runs/%E0%A4%A"],
      ["POST", "/v1/agent-runs/%E0%A4%A/cancel"]
    ] as const;

    for (const [method, path] of invalidPathCases) {
      const response = await rawHandleRequest(new Request(`http://127.0.0.1:17365${path}`, { method }));
      expect(response.status, `${method} ${path}`).toBe(400);
      if (method !== "HEAD") {
        expect(await response.json()).toEqual({
          error: "invalid_path",
          message: "The request path is not valid."
        });
      }
    }
  });

  test("returns 405 with Allow for registered paths with the wrong method", async () => {
    const { rawHandleRequest } = await createHttpHarness();
    for (const { path, methods } of routeCases) {
      const wrongMethod = methods.includes("POST") ? "PUT" : "POST";
      const response = await rawHandleRequest(new Request(`http://127.0.0.1:17365${path}`, {
        method: wrongMethod
      }));
      expect(response.status, `${wrongMethod} ${path}`).toBe(405);
      expect(response.headers.get("allow"), path).toBe(methods.join(", "));
    }
  });

  test("short-circuits unregistered paths before authentication and business handlers", async () => {
    const { context } = await createHttpHarness();
    let authenticatedScopeCalls = 0;
    const { handleRequest } = createBackendHttpHandler(context, {
      backfillPersistedAgentErrorEvents: false,
      authenticatedDataScope: async () => {
        authenticatedScopeCalls += 1;
        return { scope: { ownerUserId: null } };
      },
      security: {
        authentication: { mode: "required", token: "secret" },
        allowedOrigins: new Set(["http://127.0.0.1:1421"])
      }
    });

    for (const path of ["/v1/future-route", "/v1/benchmark-runs-extra"]) {
      const response = await handleRequest(new Request(`http://127.0.0.1:17365${path}`));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "not_found",
        message: "The requested resource was not found."
      });
    }
    expect(authenticatedScopeCalls).toBe(0);
  });

  test("runs CORS preflight only for registered paths", async () => {
    const { rawHandleRequest } = await createHttpHarness();
    const headers = {
      origin: "http://127.0.0.1:1421",
      "access-control-request-method": "GET"
    };
    const known = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/skills", {
      method: "OPTIONS",
      headers
    }));
    expect(known.status).toBe(204);

    const unknown = await rawHandleRequest(new Request("http://127.0.0.1:17365/v1/future-route", {
      method: "OPTIONS",
      headers
    }));
    expect(unknown.status).toBe(404);
  });
});
