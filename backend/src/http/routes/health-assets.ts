import { join, normalize, resolve, sep } from "node:path";
import type { BackendHttpContext } from "../context";
import { isGeoGebraAssetPath } from "../paths";
import { json } from "../response";

export async function handleHealthAndAssetRoute(request: Request, url: URL, context: BackendHttpContext) {
  if ((request.method === "GET" || request.method === "HEAD") && isGeoGebraAssetPath(url.pathname)) {
    return serveGeoGebraAsset(url.pathname, request.method, context.resources.geogebraAssetRoot);
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return json({
      status: "ok",
      service: "geochat-desktop-backend",
      version: "0.1.0",
      database: {
        requestedDriver: context.databaseRuntime.requestedDriver,
        migrationsSchema: context.databaseRuntime.migrationsSchema
      }
    });
  }

  return undefined;
}

async function serveGeoGebraAsset(pathname: string, method: string, geogebraAssetRoot: string) {
  const relativePath = normalize(
    decodeURIComponent(pathname)
      .replace(/^\/tools\/geogebra-assets-v2\/?/, "")
      .replace(/^\/tools\/geogebra-assets\/?/, "")
  );

  if (!relativePath || relativePath.startsWith("..") || relativePath.includes(`${sep}..${sep}`)) {
    return json({ error: "invalid_asset_path" }, { status: 400 });
  }

  const assetPath = resolve(join(geogebraAssetRoot, relativePath));
  if (!assetPath.startsWith(geogebraAssetRoot)) {
    return json({ error: "invalid_asset_path" }, { status: 400 });
  }

  const file = Bun.file(assetPath);
  if (!(await file.exists())) {
    return json({ error: "asset_not_found", path: relativePath }, { status: 404 });
  }

  const headers = {
    "content-type": file.type || contentTypeForPath(assetPath),
    "cache-control": "public, max-age=31536000, immutable",
    "cross-origin-resource-policy": "cross-origin"
  };

  if (method === "HEAD") {
    return new Response(null, { headers });
  }

  if (assetPath.endsWith(".js")) {
    return new Response(stripJavaScriptSourceMaps(await file.text()), { headers });
  }

  return new Response(file, { headers });
}

function stripJavaScriptSourceMaps(source: string) {
  return source
    .replace(/^[ \t]*\/\/# sourceMappingURL=.*(?:\r?\n)?/gm, "")
    .replace(/\\n\/\/# sourceMappingURL=.*?\\n/g, "\\n");
}

function contentTypeForPath(path: string) {
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".wasm")) return "application/wasm";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".woff2")) return "font/woff2";
  if (path.endsWith(".ttf")) return "font/ttf";
  return "application/octet-stream";
}
