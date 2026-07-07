import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const requirePackage = args.includes("--require-package");
const evidenceArg = args.find((arg) => !arg.startsWith("--"));
const evidencePath = resolve(evidenceArg ?? "dist/app-bundle-evidence.json");
const manifestPath = resolve(process.env.GEOCHAT_APP_BUNDLE_MANIFEST_PATH ?? "dist/app-bundle-manifest.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path, label) {
  if (!existsSync(path)) fail(`Missing ${label}: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Invalid ${label}: ${message}`);
  }
}

function normalizeEvidencePath(path) {
  return path.replace(/\\/g, "/");
}

const evidence = readJson(evidencePath, "app-bundle evidence JSON");

assert(evidence.kind === "geochat-app-bundle-evidence", "Invalid app-bundle evidence kind.");
assert(typeof evidence.bundleVersion === "string" && evidence.bundleVersion.length > 0, "Missing evidence bundleVersion.");
assert(typeof evidence.shellVersion === "string" && evidence.shellVersion.length > 0, "Missing evidence shellVersion.");
assert(evidence.buildBoundary?.scripts?.backend === "bun scripts/build-backend-bundle.mjs", "Evidence must identify the backend bundle build step.");
assert(evidence.buildBoundary?.scripts?.runtime === "bun scripts/stage-runtime-sidecar.mjs", "Evidence must identify the runtime sidecar staging step.");
assert(evidence.buildBoundary?.scripts?.vendor === "bun scripts/stage-vendor-bundle.mjs", "Evidence must identify the vendor bundle staging step.");
assert(
  Array.isArray(evidence.buildBoundary?.appBundleRoots) &&
    evidence.buildBoundary.appBundleRoots.join(",") === "backend,renderer,vendor",
  "Evidence must list backend, renderer, and vendor as the app-bundle roots."
);
assert(evidence.buildBoundary?.runtimeExcludedFromAppBundle === true, "Evidence must prove runtime is excluded from the app bundle.");
assert(evidence.buildBoundary?.backendBuildTouchesRuntime === false, "Backend build must not stage the Bun runtime sidecar.");
assert(evidence.buildBoundary?.backendBuildTouchesVendor === false, "Backend build must not stage vendor resources.");
assert(evidence.buildBoundary?.runtimeStageCopiesBun === true, "Runtime staging must copy the Bun executable.");
assert(evidence.buildBoundary?.runtimeStageTouchesBackend === false, "Runtime staging must not touch backend code.");
assert(evidence.buildBoundary?.vendorStageCopiesVendor === true, "Vendor staging must copy vendor resources.");
assert(evidence.buildBoundary?.vendorStageTouchesBackend === false, "Vendor staging must not touch backend code.");
assert(evidence.manifest?.backendEntry === "backend/backend.bundle.js", "Unexpected evidence backend entry.");
assert(evidence.manifest?.rendererEntry === "renderer/index.html", "Unexpected evidence renderer entry.");
assert(evidence.manifest?.runtimeIncluded === false, "Bun runtime must not be included in app-bundle evidence assets.");
assert(Number.isInteger(evidence.manifest?.assetCount) && evidence.manifest.assetCount > 0, "Missing evidence asset count.");

const assetRoots = evidence.manifest?.assetRoots ?? {};
for (const root of ["backend", "renderer", "vendor"]) {
  assert(Number.isInteger(assetRoots[root]) && assetRoots[root] > 0, `Missing evidence asset root: ${root}.`);
}
assert(!("runtime" in assetRoots), "Evidence asset roots must not contain runtime.");

const packagedResourceRoots = Array.isArray(evidence.packagedResourceRoots) ? evidence.packagedResourceRoots : [];
if (requirePackage) {
  assert(packagedResourceRoots.length > 0, "Evidence must include at least one packaged resource root.");
}
let newestPackagedManifestModifiedAtMs = 0;
if (requirePackage) {
  for (const root of packagedResourceRoots) {
    assert(typeof root.path === "string" && root.path.length > 0, "Packaged resource root is missing path.");
    assert(
      typeof root.manifestPath === "string" && root.manifestPath.length > 0,
      `Packaged resource root is missing manifestPath: ${root.path}.`
    );
    assert(/^[a-f0-9]{64}$/i.test(root.manifestSha256 ?? ""), `Packaged resource root has invalid manifestSha256: ${root.path}.`);
    assert(
      root.manifestSha256 === evidence.manifest.sha256,
      `Packaged resource manifest does not match the built manifest: ${root.path}.`
    );
    assert(
      Number.isInteger(root.manifestModifiedAtMs) && root.manifestModifiedAtMs > 0,
      `Packaged resource root is missing manifestModifiedAtMs: ${root.path}.`
    );
    newestPackagedManifestModifiedAtMs = Math.max(newestPackagedManifestModifiedAtMs, root.manifestModifiedAtMs);
    assert(
      typeof root.runtimePath === "string" && root.runtimePath.length > 0,
      `Packaged resource root is missing runtimePath: ${root.path}.`
    );
    assert(
      /(^|\/)runtime\/bun(\.exe)?$/.test(normalizeEvidencePath(root.runtimePath)),
      `Packaged runtime must be the fixed Bun sidecar: ${root.runtimePath}.`
    );
  }
}

const artifacts = Array.isArray(evidence.installerArtifacts) ? evidence.installerArtifacts : [];
if (requirePackage) {
  assert(artifacts.length > 0, "Evidence must include installer artifacts.");
}
if (requirePackage) {
  for (const artifact of artifacts) {
    assert(typeof artifact.path === "string" && artifact.path.length > 0, "Installer artifact is missing path.");
    assert(Number.isInteger(artifact.sizeBytes) && artifact.sizeBytes > 0, `Installer artifact has invalid size: ${artifact.path}.`);
    assert(/^[a-f0-9]{64}$/i.test(artifact.sha256 ?? ""), `Installer artifact has invalid sha256: ${artifact.path}.`);
    assert(
      Number.isInteger(artifact.modifiedAtMs) && artifact.modifiedAtMs > 0,
      `Installer artifact has invalid modifiedAtMs: ${artifact.path}.`
    );
    if (newestPackagedManifestModifiedAtMs > 0) {
      assert(
        artifact.modifiedAtMs >= newestPackagedManifestModifiedAtMs,
        `Installer artifact appears stale relative to the packaged app bundle manifest: ${artifact.path}.`
      );
    }
  }
}

assert(/^[a-f0-9]{64}$/i.test(evidence.manifest?.sha256 ?? ""), "Evidence manifest sha256 is invalid.");
if (existsSync(manifestPath)) {
  assert(evidence.manifest.sha256 === sha256(manifestPath), "Evidence manifest sha256 does not match the built manifest.");
}

console.log(`App-bundle evidence ok: ${evidencePath}`);
