import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";

export const CANVAS_ASSET_PATH = "/geochat-assets";
const MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".html": "text/html; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf"
};

export async function readVerifiedAsset(path: string, expected: { size: number; sha256: string }): Promise<Buffer> {
  const bytes = await readFile(path);
  if (bytes.length !== expected.size || createHash("sha256").update(bytes).digest("hex") !== expected.sha256)
    throw new Error("Packaged GeoGebra asset failed integrity verification.");
  return bytes;
}

export function resolveAssetRequest(
  url: string,
  method: string,
  files: ReadonlySet<string>
): { status: number; path?: string } {
  if (method !== "GET" && method !== "HEAD") return { status: 405 };
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.split("?")[0] ?? "");
  } catch {
    return { status: 400 };
  }
  if (!pathname.startsWith(`${CANVAS_ASSET_PATH}/`)) return { status: 404 };
  const path = pathname.slice(CANVAS_ASSET_PATH.length + 1);
  if (
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    return { status: 403 };
  return files.has(path) ? { status: 200, path } : { status: 404 };
}

/** Files only, on the existing Harness Web carrier. Never accepts tool calls. */
export function registerCanvasAssets(ctx: Context): void {
  const root = realpathSync(fileURLToPath(new URL("./geogebra/", import.meta.url)));
  const manifest: Record<string, { size: number; sha256: string }> = JSON.parse(
    readFileSync(join(dirname(root), "geogebra-manifest.json"), "utf8")
  );
  const files = new Set(Object.keys(manifest));
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: CANVAS_ASSET_PATH,
        async handler(request, response) {
          const target = resolveAssetRequest(request.url ?? "", request.method ?? "", files);
          if (!target.path) {
            response.writeHead(target.status, {
              "Cache-Control": "no-store",
              ...(target.status === 405 ? { Allow: "GET, HEAD" } : {})
            });
            response.end();
            return;
          }
          try {
            const path = realpathSync(resolve(root, target.path));
            if (!path.startsWith(`${root}${sep}`)) {
              response.writeHead(403);
              response.end();
              return;
            }
            const expected = manifest[target.path];
            if (!expected) throw new Error("Packaged asset manifest entry is missing.");
            const bytes = await readVerifiedAsset(path, expected);
            response.writeHead(200, {
              "Content-Type": MIME[extname(path)] ?? "application/octet-stream",
              "Content-Length": bytes.length,
              "Cache-Control": "no-cache",
              "X-Content-Type-Options": "nosniff",
              ETag: `"${expected.sha256}"`
            });
            if (request.method === "HEAD") response.end();
            else response.end(bytes);
          } catch (error) {
            const missing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
            if (!missing) console.error("[geochat] Packaged canvas asset could not be verified or read.");
            if (!response.headersSent) response.writeHead(missing ? 404 : 500);
            response.end();
          }
        }
      }),
    "geochat.local-assets"
  );
}
