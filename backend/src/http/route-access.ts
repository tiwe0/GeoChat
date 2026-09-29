import type { BackendHttpContext } from "./context";
import type { DataScopeResolver } from "./scope";
import { handleAgentRunObservabilityRoute } from "./routes/agent-run-observability";
import { handleBenchmarkRoute } from "./routes/benchmark";
import { handleConversationRoute } from "./routes/conversations";
import { handleHealthAndAssetRoute } from "./routes/health-assets";
import { handleMessageRoute } from "./routes/messages";
import { handleMigrationRoute } from "./routes/migration";
import { handleModelDiscoveryRoute } from "./routes/model-discovery";
import { handleNativeChatRoute } from "./routes/native-chat";
import { handleProblemBankRoute } from "./routes/problem-bank";
import { handleSkillCatalogRoute } from "./routes/skills";
import { handleLegacyConversationImportRoute } from "./routes/legacy-conversation-import";

export type BackendRouteAccess = "public" | "authenticated";

export type BackendRouteMethod = "GET" | "HEAD" | "POST" | "DELETE";

export type BackendRouteHandler = (
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver
) => Promise<Response | undefined>;

type BackendRouteAccessEntry = {
  id: string;
  access: BackendRouteAccess;
  methods: readonly BackendRouteMethod[];
  matches: (pathname: string) => boolean;
  handle: BackendRouteHandler;
};

const exactPath = (expected: string) => (pathname: string) => pathname === expected;
const dynamicPath = (pattern: RegExp) => (pathname: string) => pattern.test(pathname);
const pathPrefix = (prefix: string) => (pathname: string) => pathname.startsWith(prefix);

export const BACKEND_ROUTE_ACCESS_CATALOG = [
  {
    id: "health",
    access: "public",
    methods: ["GET"],
    matches: exactPath("/health"),
    handle: handleHealthAndAssetRoute
  },
  {
    id: "geogebra-assets-v2",
    access: "public",
    methods: ["GET", "HEAD"],
    matches: pathPrefix("/tools/geogebra-assets-v2/"),
    handle: handleHealthAndAssetRoute
  },
  {
    id: "geogebra-assets-legacy",
    access: "public",
    methods: ["GET", "HEAD"],
    matches: pathPrefix("/tools/geogebra-assets/"),
    handle: handleHealthAndAssetRoute
  },
  {
    id: "skills",
    access: "authenticated",
    methods: ["GET"],
    matches: exactPath("/v1/skills"),
    handle: handleSkillCatalogRoute
  },
  {
    id: "conversations",
    access: "authenticated",
    methods: ["GET"],
    matches: exactPath("/v1/conversations"),
    handle: handleConversationRoute
  },
  {
    id: "conversation-messages",
    access: "authenticated",
    methods: ["POST"],
    matches: dynamicPath(/^\/v1\/conversations\/[^/]+\/messages$/),
    handle: handleConversationRoute
  },
  {
    id: "conversation-blackboard",
    access: "authenticated",
    methods: ["GET"],
    matches: dynamicPath(/^\/v1\/conversations\/[^/]+\/blackboard$/),
    handle: handleConversationRoute
  },
  {
    id: "conversation-detail",
    access: "authenticated",
    methods: ["GET", "DELETE"],
    matches: dynamicPath(/^\/v1\/conversations\/[^/]+$/),
    handle: handleConversationRoute
  },
  {
    id: "messages",
    access: "authenticated",
    methods: ["GET", "POST"],
    matches: exactPath("/v1/messages"),
    handle: handleMessageRoute
  },
  {
    id: "migration-export",
    access: "authenticated",
    methods: ["GET"],
    matches: exactPath("/v1/migration/export"),
    handle: handleMigrationRoute
  },
  {
    id: "migration-import",
    access: "authenticated",
    methods: ["POST"],
    matches: exactPath("/v1/migration/import"),
    handle: handleMigrationRoute
  },
  {
    id: "legacy-conversation-import",
    access: "authenticated",
    methods: ["POST"],
    matches: exactPath("/v1/legacy-conversations/import"),
    handle: handleLegacyConversationImportRoute
  },
  {
    id: "problem-bank-import",
    access: "authenticated",
    methods: ["POST"],
    matches: exactPath("/v1/problem-bank/import"),
    handle: handleProblemBankRoute
  },
  {
    id: "problem-sets",
    access: "authenticated",
    methods: ["GET"],
    matches: exactPath("/v1/problem-sets"),
    handle: handleProblemBankRoute
  },
  {
    id: "problem-set-problems",
    access: "authenticated",
    methods: ["GET"],
    matches: dynamicPath(/^\/v1\/problem-sets\/[^/]+\/problems$/),
    handle: handleProblemBankRoute
  },
  {
    id: "problem-detail",
    access: "authenticated",
    methods: ["GET"],
    matches: dynamicPath(/^\/v1\/problems\/[^/]+$/),
    handle: handleProblemBankRoute
  },
  {
    id: "problem-attempts",
    access: "authenticated",
    methods: ["POST"],
    matches: dynamicPath(/^\/v1\/problems\/[^/]+\/attempts$/),
    handle: handleProblemBankRoute
  },
  {
    id: "benchmark-runs",
    access: "authenticated",
    methods: ["GET", "POST"],
    matches: exactPath("/v1/benchmark-runs"),
    handle: handleBenchmarkRoute
  },
  {
    id: "benchmark-run-results",
    access: "authenticated",
    methods: ["POST"],
    matches: dynamicPath(/^\/v1\/benchmark-runs\/[^/]+\/results$/),
    handle: handleBenchmarkRoute
  },
  {
    id: "benchmark-run-complete",
    access: "authenticated",
    methods: ["POST"],
    matches: dynamicPath(/^\/v1\/benchmark-runs\/[^/]+\/complete$/),
    handle: handleBenchmarkRoute
  },
  {
    id: "benchmark-run-cancel",
    access: "authenticated",
    methods: ["POST"],
    matches: dynamicPath(/^\/v1\/benchmark-runs\/[^/]+\/cancel$/),
    handle: handleBenchmarkRoute
  },
  {
    id: "benchmark-run-fail",
    access: "authenticated",
    methods: ["POST"],
    matches: dynamicPath(/^\/v1\/benchmark-runs\/[^/]+\/fail$/),
    handle: handleBenchmarkRoute
  },
  {
    id: "benchmark-run-interrupt",
    access: "authenticated",
    methods: ["POST"],
    matches: dynamicPath(/^\/v1\/benchmark-runs\/[^/]+\/interrupt$/),
    handle: handleBenchmarkRoute
  },
  {
    id: "benchmark-run-detail",
    access: "authenticated",
    methods: ["GET"],
    matches: dynamicPath(/^\/v1\/benchmark-runs\/[^/]+$/),
    handle: handleBenchmarkRoute
  },
  {
    id: "native-chat",
    access: "authenticated",
    methods: ["POST"],
    matches: exactPath("/v1/chat"),
    handle: handleNativeChatRoute
  },
  {
    id: "agent-run-cancel",
    access: "authenticated",
    methods: ["POST"],
    matches: dynamicPath(/^\/v1\/agent-runs\/[^/]+\/cancel$/),
    handle: handleAgentRunObservabilityRoute
  },
  {
    id: "agent-runs",
    access: "authenticated",
    methods: ["GET"],
    matches: exactPath("/v1/agent-runs"),
    handle: handleAgentRunObservabilityRoute
  },
  {
    id: "agent-command-usage",
    access: "authenticated",
    methods: ["GET"],
    matches: exactPath("/v1/agent-command-usage"),
    handle: handleAgentRunObservabilityRoute
  },
  {
    id: "agent-error-events",
    access: "authenticated",
    methods: ["GET"],
    matches: exactPath("/v1/agent-error-events"),
    handle: handleAgentRunObservabilityRoute
  },
  {
    id: "model-discovery",
    access: "authenticated",
    methods: ["POST"],
    matches: exactPath("/v1/models/discover"),
    handle: handleModelDiscoveryRoute
  }
] as const satisfies readonly BackendRouteAccessEntry[];

export type BackendRouteAccessMatch = {
  id: string;
  access: BackendRouteAccess;
  methods: readonly BackendRouteMethod[];
  handle: BackendRouteHandler;
};

export function matchBackendRouteAccess(pathname: string): BackendRouteAccessMatch | undefined {
  const route = BACKEND_ROUTE_ACCESS_CATALOG.find((candidate) => candidate.matches(pathname));
  if (!route) return undefined;
  return {
    id: route.id,
    access: route.access,
    methods: route.methods,
    handle: route.handle
  };
}
