import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const bundleRoot = resolve(process.env.GEOCHAT_APP_BUNDLE_ROOT ?? "dist");
const manifestPath = resolve(bundleRoot, "app-bundle-manifest.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (!existsSync(manifestPath)) {
  fail(`Missing app bundle manifest: ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const mutableBundleRoots = new Set(["backend", "renderer", "vendor"]);
if (manifest.kind !== "geochat-app-bundle") fail("Invalid app bundle manifest kind.");
if (!manifest.bundleVersion) fail("Missing app bundle version.");
if (!manifest.shellVersion) fail("Missing app bundle shell version.");
if (manifest.requiresShellUpdate !== undefined && typeof manifest.requiresShellUpdate !== "boolean") {
  fail("Invalid app bundle requiresShellUpdate flag.");
}
if (manifest.backend?.entry !== "backend/backend.bundle.js") fail("Unexpected backend bundle entry.");
if (manifest.renderer?.entry !== "renderer/index.html") fail("Unexpected renderer bundle entry.");
if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) fail("Missing app bundle assets.");

const assetPaths = new Set(manifest.assets.map((asset) => asset.path));
for (const required of [manifest.backend.entry, manifest.renderer.entry]) {
  if (!assetPaths.has(required)) fail(`Required entry not listed in assets: ${required}`);
}

for (const asset of manifest.assets) {
  if (typeof asset.path !== "string" || typeof asset.sha256 !== "string") {
    fail("Invalid app bundle asset shape.");
  }

  if (asset.path.startsWith("/") || asset.path.includes("..") || asset.path.includes("\\")) {
    fail(`Unsafe app bundle asset path: ${asset.path}`);
  }

  if (asset.path === "runtime" || asset.path.startsWith("runtime/")) {
    fail(`Runtime assets must not be included in app bundle manifests: ${asset.path}`);
  }

  const [root] = asset.path.split("/");
  if (!mutableBundleRoots.has(root)) {
    fail(`App bundle assets must stay under backend, renderer, or vendor: ${asset.path}`);
  }

  if (!/^[a-f0-9]{64}$/i.test(asset.sha256)) {
    fail(`Invalid app bundle asset hash: ${asset.path}`);
  }

  const assetUrlPath = asset.url ?? asset.path;
  if (typeof assetUrlPath !== "string" || !isSafeAssetUrlPath(assetUrlPath)) {
    fail(`Unsafe app bundle asset URL for ${asset.path}: ${assetUrlPath}`);
  }

  const absolute = resolve(bundleRoot, asset.path);
  if (!existsSync(absolute)) fail(`Missing app bundle asset: ${asset.path}`);
  const actual = sha256(absolute);
  if (actual !== asset.sha256.toLowerCase()) {
    fail(`Hash mismatch for app bundle asset: ${asset.path}`);
  }
}

console.log(
  `App bundle manifest ok: ${manifest.bundleVersion}, ${manifest.assets.length} assets, shell ${manifest.shellVersion}`
);

function isSafeAssetUrlPath(path) {
  if (!path || path.trim() !== path) return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes("?") || path.includes("#")) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) return false;
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  return decoded.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
