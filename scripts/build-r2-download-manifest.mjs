#!/usr/bin/env node
/**
 * Builds the download manifest that the website reads instead of the GitHub
 * Releases API.
 *
 *   node scripts/build-r2-download-manifest.mjs \
 *     --assets release-assets --tag v0.2.9 \
 *     --base https://downloads.example.com/geochat --out release-assets/latest.json
 *
 * Why a manifest at all: unauthenticated api.github.com is rate-limited per
 * client IP, so a visitor behind a busy NAT sees the download page fall back
 * to a hardcoded version. Serving a static JSON file from the same CDN as the
 * installers removes that failure mode, and is markedly faster from mainland
 * China, which is this product's primary audience.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

const assetsDir = arg("assets");
const tag = arg("tag");
const base = arg("base");
const out = arg("out");
const repo = arg("repo", "tiwe0/GeoChat");

for (const [name, value] of Object.entries({ assets: assetsDir, tag, base, out })) {
  if (!value) {
    console.error(`build-r2-download-manifest: --${name} is required`);
    process.exit(1);
  }
}

const INSTALLER = /\.(dmg|exe|msi)$/i;

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (INSTALLER.test(entry.name)) found.push(full);
  }
  return found;
}

const version = tag.replace(/^v/, "");
const files = walk(assetsDir).sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

if (files.length === 0) {
  console.error(`build-r2-download-manifest: no .dmg/.exe/.msi found under ${assetsDir}`);
  process.exit(1);
}

const trimmedBase = base.replace(/\/+$/, "");

const assets = files.map((file) => {
  const name = path.basename(file);
  const body = readFileSync(file);
  return {
    name,
    // Matches the R2 key layout written by the release workflow.
    url: `${trimmedBase}/${tag}/${name}`,
    size: statSync(file).size,
    // Published so a cautious user can verify a download; the installers are
    // not code-signed, so a checksum is the only integrity check on offer.
    sha256: createHash("sha256").update(body).digest("hex")
  };
});

const manifest = {
  version,
  tag,
  publishedAt: new Date().toISOString(),
  releaseUrl: `https://github.com/${repo}/releases/tag/${tag}`,
  assets
};

writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Wrote ${out} for ${tag}:`);
for (const asset of assets) {
  console.log(`  ${asset.name}  ${(asset.size / 1024 / 1024).toFixed(1)} MB  ${asset.sha256.slice(0, 12)}…`);
}
