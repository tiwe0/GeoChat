#!/usr/bin/env node
/**
 * Keeps FALLBACK_VERSION in src/site.ts equal to the desktop app's version in
 * the repository root package.json.
 *
 * That constant is only shown when the GitHub API is unreachable, which makes
 * it exactly the kind of value that silently rots — nobody notices a wrong
 * number on a path they never hit. Running this from the build means it cannot
 * drift, rather than relying on someone remembering to bump it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sitePath = path.join(here, "..", "src", "site.ts");
const appPackagePath = path.join(here, "..", "..", "package.json");

let appVersion;
try {
  appVersion = JSON.parse(readFileSync(appPackagePath, "utf8")).version;
} catch (error) {
  // A standalone checkout of just website/ is a legitimate state; keep whatever
  // is committed rather than failing the build.
  console.warn(
    `sync-version: could not read ${appPackagePath} (${error.message}); leaving FALLBACK_VERSION as committed.`
  );
  process.exit(0);
}

if (typeof appVersion !== "string" || !appVersion) {
  console.warn("sync-version: root package.json has no version; leaving FALLBACK_VERSION as committed.");
  process.exit(0);
}

const source = readFileSync(sitePath, "utf8");
const pattern = /(export const FALLBACK_VERSION = ")([^"]*)(";)/;
const match = source.match(pattern);

if (!match) {
  console.error("sync-version: FALLBACK_VERSION declaration not found in src/site.ts");
  process.exit(1);
}

if (match[2] === appVersion) {
  console.log(`sync-version: FALLBACK_VERSION already ${appVersion}`);
  process.exit(0);
}

writeFileSync(sitePath, source.replace(pattern, `$1${appVersion}$3`), "utf8");
console.log(`sync-version: FALLBACK_VERSION ${match[2]} -> ${appVersion}`);
