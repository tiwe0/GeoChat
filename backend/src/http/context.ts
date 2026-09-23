import { resolve } from "node:path";
import { createBlackboardRepository } from "../db/blackboard-repository";
import { createDatabase } from "../db/client";
import { createConversationRepository } from "../db/conversation-repository";
import { createMessageRepository } from "../db/message-repository";
import { createMigrationRepository } from "../db/migration-repository";
import { createProblemBankRepository } from "../db/problem-bank-repository";
import { createAgentRunRepository } from "../db/agent-run-repository";
import { createBenchmarkRepository } from "../db/benchmark-repository";
import { readDatabaseRuntimeConfig } from "../db/runtime";
import { defaultProblemCasesRoot } from "../problem-cases";

export function createBackendHttpContext() {
  const database = createDatabase();
  const databaseRuntime = readDatabaseRuntimeConfig();
  const resourceRoot = resolve(Bun.env.GEOCHAT_DESKTOP_RESOURCE_ROOT ?? resolve(import.meta.dir, "../../.."));

  return {
    database,
    databaseRuntime,
    repositories: {
      conversations: createConversationRepository(databaseRuntime, database),
      blackboard: createBlackboardRepository(databaseRuntime, database),
      problemBank: createProblemBankRepository(databaseRuntime, database),
      migration: createMigrationRepository(databaseRuntime, database),
      messages: createMessageRepository(databaseRuntime, database),
      agentRuns: createAgentRunRepository(databaseRuntime, database),
      benchmarks: createBenchmarkRepository(database)
    },
    resources: {
      root: resourceRoot,
      geogebraAssetRoot: resolve(resourceRoot, "vendor/geogebra"),
      problemCasesDefaultRoot: defaultProblemCasesRoot(resourceRoot)
    },
    routeLimits: {
      maxProviderRequestBodyBytes: 24 * 1024 * 1024,
      maxProviderResponseBodyBytes: 48 * 1024 * 1024
    }
  };
}

export type BackendHttpContext = ReturnType<typeof createBackendHttpContext>;

export const backendHttpContext = createBackendHttpContext();
