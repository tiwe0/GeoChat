#!/usr/bin/env node
/**
 * Serves dist/ the way Cloudflare Pages does, which `vite preview` does not.
 *
 * vite preview applies an SPA fallback: it answers /privacy with the root
 * index.html (the prerendered home page) instead of dist/privacy/index.html.
 * That produces a hydration mismatch locally which cannot happen in
 * production, and it hides genuine prerender bugs behind a false one — so
 * verify against this server, not against vite preview.
 *
 *   node scripts/serve-static.mjs [port]
 *
 * Resolution order, matching Pages: exact file -> <path>/index.html -> 404.html.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist");
const port = Number(process.argv[2] ?? 4180);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  // Reject traversal before touching the filesystem.
  const target = path.normalize(path.join(dist, clean));
  if (!target.startsWith(dist)) return null;

  if (existsSync(target) && statSync(target).isFile()) return target;

  const indexed = path.join(target, "index.html");
  if (existsSync(indexed)) return indexed;

  return null;
}

createServer((req, res) => {
  const file = resolveFile(req.url ?? "/");

  if (!file) {
    const notFound = path.join(dist, "404.html");
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    if (existsSync(notFound)) {
      createReadStream(notFound).pipe(res);
      return;
    }
    res.end("404");
    return;
  }

  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving dist/ like Cloudflare Pages on http://127.0.0.1:${port}`);
});
