#!/usr/bin/env node
/**
 * Asserts that dist/ actually contains prerendered content.
 *
 * The failure this exists to catch is silent: if prerendering regresses to an
 * empty SPA shell, the site still works in a browser, so nothing looks wrong
 * locally — but every share card goes blank and crawlers index nothing. That
 * would be discovered weeks later, via traffic. So the build fails instead.
 *
 *   node scripts/check-prerender.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist");

/** Each page, and a string that can only be present if React actually rendered. */
const EXPECT = [
  { file: "index.html", needle: "已知", label: "zh home headline" },
  { file: "index.html", needle: "PerpendicularBisector", label: "zh pipeline commands" },
  { file: "en/index.html", needle: "Given", label: "en home headline" },
  { file: "download/index.html", needle: "首次打开需要多一步", label: "zh unsigned-install steps" },
  { file: "en/download/index.html", needle: "Run anyway", label: "en unsigned-install steps" },
  { file: "privacy/index.html", needle: "不使用 Cookie", label: "zh privacy body" },
  { file: "en/privacy/index.html", needle: "no cookies", label: "en privacy body" },
  { file: "terms/index.html", needle: "Apache License 2.0", label: "zh terms body" },
  { file: "en/terms/index.html", needle: "Apache-2.0", label: "en terms body" },
  { file: "404.html", needle: "noindex", label: "404 robots directive" }
];

/** Assets referenced by the markup that must exist on disk. */
const ASSETS = [
  "og.png",
  "favicon.png",
  "fonts/archivo-latin.woff2",
  "fonts/source-serif-4-latin.woff2",
  "media/demo-zh.mp4",
  "media/demo-en.mp4",
  "media/poster-zh.webp",
  "media/poster-en.webp",
  "media/shot-zh-1600.webp",
  "media/shot-en-1600.webp",
  "media/app-icon.webp",
  "_headers"
];

// Generated CSP must actually name the mirror the site was built against, or
// the download page's manifest fetch is silently blocked in the browser.
const mirrorBase = (process.env.VITE_DOWNLOADS_BASE ?? "").replace(/\/+$/, "");

const failures = [];

/**
 * VITE_SITE_URL drives canonical, hreflang, og:url and the sitemap. It is not
 * committed (this is a public repository), so the one thing that could go
 * wrong unnoticed is a production build without it — which would ship pages
 * with no canonical and no sitemap. Assert it explicitly.
 */
const siteUrl = (process.env.VITE_SITE_URL ?? "").replace(/\/+$/, "");
if (!siteUrl) {
  failures.push(
    "VITE_SITE_URL is unset: pages have no canonical/hreflang/og:url and no sitemap was written"
  );
} else {
  EXPECT.push(
    { file: "index.html", needle: `<link rel="canonical" href="${siteUrl}"`, label: "zh home canonical" },
    { file: "en/index.html", needle: `<link rel="canonical" href="${siteUrl}/en"`, label: "en home canonical" },
    { file: "download/index.html", needle: 'hreflang="en"', label: "download hreflang" },
    { file: "index.html", needle: `og:image" content="${siteUrl}/og.png`, label: "absolute og:image" },
    { file: "sitemap.xml", needle: `${siteUrl}/download`, label: "sitemap download entry" },
    { file: "robots.txt", needle: `${siteUrl}/sitemap.xml`, label: "robots sitemap pointer" }
  );
}

for (const { file, needle, label } of EXPECT) {
  const full = path.join(dist, file);
  if (!existsSync(full)) {
    failures.push(`missing file: ${file}`);
    continue;
  }
  const body = readFileSync(full, "utf8");
  if (!body.includes(needle)) {
    failures.push(`${file}: no ${label} (expected to contain ${JSON.stringify(needle)})`);
  }
  // An unreplaced placeholder means the shell was copied without rendering.
  for (const marker of ["<!--app-html-->", "<!--app-head-->"]) {
    if (body.includes(marker)) {
      failures.push(`${file}: placeholder ${marker} was never replaced`);
    }
  }
}

for (const asset of ASSETS) {
  if (!existsSync(path.join(dist, asset))) {
    failures.push(`missing asset: ${asset}`);
  }
}

if (mirrorBase) {
  const headersPath = path.join(dist, "_headers");
  if (existsSync(headersPath)) {
    const origin = new URL(mirrorBase).origin;
    const headers = readFileSync(headersPath, "utf8");
    if (!headers.includes(origin)) {
      failures.push(
        `_headers CSP does not allow ${origin}, so the download manifest fetch would be blocked`
      );
    }
  }
}

// The whole point of prerendering is that the HTML is not an empty shell.
const home = path.join(dist, "index.html");
if (existsSync(home)) {
  const bytes = readFileSync(home).byteLength;
  if (bytes < 20_000) {
    failures.push(`index.html is only ${bytes} bytes — prerendering likely produced an empty shell`);
  }
}

if (failures.length > 0) {
  console.error("Prerender check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Prerender check passed: ${EXPECT.length} content assertions, ${ASSETS.length} assets.`);
