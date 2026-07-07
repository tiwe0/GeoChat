import type { MigrationExportResponse, MigrationImportResponse } from "@geochat-ai/app";
import {
  createMigrationExportPackage,
  importMigrationPackage
} from "../../services/migration";
import type { BackendHttpContext } from "../context";
import { json, readJson } from "../response";
import type { DataScopeResolver } from "../scope";

export async function handleMigrationRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver
) {
  if (request.method === "GET" && url.pathname === "/v1/migration/export") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const migrationPackage = await createMigrationExportPackage(context, dataScope.scope);
    const filename = `geochat-migration-${migrationPackage.scope.mode}-${migrationPackage.exportedAt.slice(0, 10)}.json`;
    return json({ migrationPackage } satisfies MigrationExportResponse, {
      headers: {
        "content-disposition": `attachment; filename="${filename}"`
      }
    });
  }

  if (request.method === "POST" && url.pathname === "/v1/migration/import") {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const result = await importMigrationPackage(context, await readJson(request), dataScope.scope);
    if (!result.imported) {
      return json({ error: "invalid_migration_package", message: "Migration package is missing, unsupported, or exceeds import limits." }, { status: 400 });
    }
    return json({ importResult: result.importResult } satisfies MigrationImportResponse);
  }

  return undefined;
}
