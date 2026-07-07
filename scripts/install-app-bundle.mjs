import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { installAppBundleFromManifest } from "./lib/app-bundle-installer.ts";

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const manifestInput = process.env.GEOCHAT_APP_BUNDLE_MANIFEST_URL ?? positionalArgs[0];
const updatesRoot = resolve(process.env.GEOCHAT_APP_BUNDLE_UPDATES_ROOT ?? positionalArgs[1] ?? "dist/app-bundle-updates");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const allowUnsigned = process.argv.includes("--allow-unsigned") || process.env.GEOCHAT_ALLOW_UNSIGNED_APP_BUNDLE === "1";

if (!manifestInput) {
  console.error("Usage: bun scripts/install-app-bundle.mjs <manifest-url-or-path> [updates-root] [--allow-unsigned]");
  process.exit(1);
}

const manifestUrl = /^[a-z]+:/i.test(manifestInput)
  ? manifestInput
  : pathToFileURL(resolve(manifestInput)).href;

const result = await installAppBundleFromManifest({
  manifestUrl,
  updatesRoot,
  shellVersion: process.env.GEOCHAT_APP_BUNDLE_SHELL_VERSION ?? packageJson.version,
  signature: process.env.GEOCHAT_APP_BUNDLE_PUBLIC_KEY_PEM
    ? {
        publicKeyPem: process.env.GEOCHAT_APP_BUNDLE_PUBLIC_KEY_PEM,
        signatureBase64: process.env.GEOCHAT_APP_BUNDLE_SIGNATURE_BASE64,
        signatureUrl: process.env.GEOCHAT_APP_BUNDLE_SIGNATURE_URL
      }
    : undefined,
  allowUnsigned
});

console.log(
  `Installed app bundle ${result.bundleVersion} with ${result.assetCount} assets at ${result.installedRoot}`
);
