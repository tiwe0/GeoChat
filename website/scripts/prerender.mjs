#!/usr/bin/env node
/**
 * Turns the client build into real static HTML, one file per route.
 *
 * Runs after `vite build` (client) and `vite build --ssr` (server), reading
 * dist/index.html as the shell and dist-ssr/entry-server.js as the renderer.
 * Also emits sitemap.xml and robots.txt so the two are never out of sync with
 * the route list in src/routes-meta.ts.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const dist = path.join(root, "dist");
const distSsr = path.join(root, "dist-ssr");

const shell = readFileSync(path.join(dist, "index.html"), "utf8");

for (const marker of ["<!--app-html-->", "<!--app-head-->"]) {
  if (!shell.includes(marker)) {
    throw new Error(`index.html is missing the ${marker} placeholder`);
  }
}

const { render, allRoutes, SITE_URL } = await import(
  pathToFileURL(path.join(distSsr, "entry-server.js")).href
);

const routes = allRoutes();
const written = [];

for (const route of routes) {
  const { html, head, htmlLang } = render(route.url, route.locale, route.key);

  const page = shell
    .replace('<html lang="zh-Hans">', `<html lang="${htmlLang}">`)
    .replace("<!--app-head-->", head)
    .replace("<!--app-html-->", html);

  // "/" -> dist/index.html; "/en/download" -> dist/en/download/index.html
  const target =
    route.url === "/"
      ? path.join(dist, "index.html")
      : path.join(dist, route.url.replace(/^\//, ""), "index.html");

  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, page, "utf8");
  written.push({ url: route.url, bytes: Buffer.byteLength(page) });
}

/* --- 404 --------------------------------------------------------------------
   Cloudflare Pages serves dist/404.html for unmatched paths. Rendering it from
   an unmatched URL gives the app's own not-found page rather than a bare host
   error, and the client router takes over from there. */
{
  const { html, head, htmlLang } = render("/__not-found__", "zh", "notFound");
  const page = shell
    .replace('<html lang="zh-Hans">', `<html lang="${htmlLang}">`)
    .replace("<!--app-head-->", head)
    .replace("<!--app-html-->", html);
  writeFileSync(path.join(dist, "404.html"), page, "utf8");
  written.push({ url: "/404.html", bytes: Buffer.byteLength(page) });
}

/* --- sitemap + robots ----------------------------------------------------
   Both need the canonical origin. Without one they are skipped rather than
   written with a guessed host: a sitemap full of wrong URLs is worse than no
   sitemap. check-prerender.mjs fails a production build that lacks SITE_URL. */
if (SITE_URL) {
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...routes.map((route) => {
      const loc = `${SITE_URL}${route.url === "/" ? "" : route.url}`;
      const priority =
        route.key === "home" ? "1.0" : route.key === "download" ? "0.9" : "0.4";
      return `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><priority>${priority}</priority></url>`;
    }),
    "</urlset>"
  ].join("\n");

  writeFileSync(path.join(dist, "sitemap.xml"), sitemap, "utf8");
  writeFileSync(
    path.join(dist, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    "utf8"
  );
} else {
  console.warn(
    "prerender: VITE_SITE_URL is unset, so sitemap.xml and robots.txt were skipped."
  );
}

// The SSR bundle is a build artifact, not something to deploy.
rmSync(distSsr, { recursive: true, force: true });

const total = written.reduce((sum, entry) => sum + entry.bytes, 0);
console.log(`Prerendered ${written.length} pages (${(total / 1024).toFixed(1)} KB of HTML):`);
for (const entry of written) {
  console.log(`  ${entry.url.padEnd(20)} ${(entry.bytes / 1024).toFixed(1)} KB`);
}
console.log("  sitemap.xml, robots.txt");
