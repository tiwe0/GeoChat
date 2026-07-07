import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const rawArgs = process.argv.slice(2);
const jsonOut = valueAfter("--json-out") ?? process.env.GEOCHAT_TAURI_PACKAGE_EVIDENCE_PATH;
const explicitApp =
  valueAfter("--app") ?? process.env.GEOCHAT_TAURI_APP_PATH ?? process.env.GEOCHAT_PACKAGED_APP_PATH;
const discoveredApp = explicitApp ?? discoverTauriAppPath();
if (!discoveredApp) fail("No Tauri packaged app found. Build with `bun run tauri:build` or pass --app.");
const appPath = resolve(discoveredApp);
const resourceRootArg = valueAfter("--resource-root") ?? process.env.GEOCHAT_PACKAGED_RESOURCES_ROOT;
const discoveredResourceRoot = resourceRootArg ?? discoverTauriResourceRoot(appPath);
if (!discoveredResourceRoot) {
  fail("No Tauri packaged app-bundle resource root found. Pass --resource-root or GEOCHAT_PACKAGED_RESOURCES_ROOT.");
}
const resourceRoot =
  discoveredResourceRoot;
const expectedManifestPath = resolve(
  process.env.GEOCHAT_EXPECTED_APP_BUNDLE_MANIFEST_PATH ?? "dist/app-bundle-manifest.json"
);
const expectedManifestBytes =
  process.env.GEOCHAT_PACKAGED_SKIP_DIST_MANIFEST_MATCH === "1" || !existsSync(expectedManifestPath)
    ? undefined
    : readFileSync(expectedManifestPath);

if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
  console.log(`Usage: bun scripts/smoke-tauri-packaged-layout.mjs [options]

Options:
  --app <path>            Tauri packaged app bundle or executable. Defaults to platform discovery under src-tauri/target/release.
  --resource-root <path>  Packaged app-bundle resource root. Defaults to platform discovery under the packaged app.
  --json-out <path>      Write machine-readable Tauri package evidence JSON.

This validates the Tauri package boundary: the shell executable is
outside the replaceable app bundle, the fixed Bun runtime is present, and the
backend/renderer/vendor bundle manifest matches the local build output.`);
  process.exit(0);
}

const evidence = smokeTauriPackage(resolve(appPath), resolve(resourceRoot));
if (jsonOut) {
  const target = resolve(jsonOut);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
}
console.log(`Tauri packaged layout ok: ${appPath}`);
console.log(`- Resource root: ${resourceRoot}`);

function smokeTauriPackage(app, root) {
  assertExists(app, "Tauri packaged app");
  if (process.platform === "darwin") {
    assertExists(join(app, "Contents", "Info.plist"), "Info.plist");
  }
  const executable = tauriExecutable(app);
  assertExists(executable, "Tauri shell executable");
  assertExists(root, "Tauri packaged app-bundle resources root");
  assertAbsent(join(root, "app.asar"), "Electron app.asar in Tauri resources");
  assertExists(join(root, "runtime", runtimeName()), "fixed Bun runtime sidecar");
  assertExists(join(root, "app-bundle-manifest.json"), "app bundle manifest");
  assertExists(join(root, "backend", "backend.bundle.js"), "compiled backend bundle");
  assertExists(join(root, "backend", "manifest.json"), "backend bundle manifest");
  assertExists(join(root, "renderer", "index.html"), "compiled renderer entry");
  assertExists(join(root, "vendor", "geogebra", "deployggb.js"), "GeoGebra vendor bundle");
  assertNonEmptyDirectory(join(root, "vendor", "geogebra"), "GeoGebra vendor directory");

  const manifest = assertManifest(root);
  const installerPath = discoverInstaller();
  if (installerPath) assertExists(installerPath, "Tauri installer");

  return {
    kind: "geochat-tauri-package-evidence",
    status: "complete",
    appPath: relative(process.cwd(), app),
    executable: relative(process.cwd(), executable),
    resourceRoot: relative(process.cwd(), root),
    runtime: relative(process.cwd(), join(root, "runtime", runtimeName())),
    installer: installerPath ? relative(process.cwd(), installerPath) : null,
    dmg: installerPath?.endsWith(".dmg") ? relative(process.cwd(), installerPath) : null,
    manifest: {
      bundleVersion: manifest.bundleVersion,
      shellVersion: manifest.shellVersion,
      assetCount: manifest.assets.length,
      runtimeIncluded: manifest.assets.some((asset) => asset.path === "runtime" || asset.path.startsWith("runtime/"))
    },
    sizes: {
      appBytes: directorySize(app),
      resourceRootBytes: directorySize(root),
      installerBytes: installerPath ? statSync(installerPath).size : null,
      dmgBytes: installerPath?.endsWith(".dmg") ? statSync(installerPath).size : null
    },
    sha256: {
      executable: sha256File(executable),
      manifest: sha256File(join(root, "app-bundle-manifest.json")),
      installer: installerPath ? sha256File(installerPath) : null,
      dmg: installerPath?.endsWith(".dmg") ? sha256File(installerPath) : null
    }
  };
}

function assertManifest(root) {
  const manifestPath = join(root, "app-bundle-manifest.json");
  const manifestBytes = readFileSync(manifestPath);
  if (expectedManifestBytes && !manifestBytes.equals(expectedManifestBytes)) {
    fail(`Packaged app bundle manifest does not match ${expectedManifestPath}: ${manifestPath}`);
  }

  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.kind !== "geochat-app-bundle") fail("Invalid app bundle manifest kind.");
  if (manifest.backend?.entry !== "backend/backend.bundle.js") fail("Unexpected backend bundle entry.");
  if (manifest.renderer?.entry !== "renderer/index.html") fail("Unexpected renderer bundle entry.");
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) fail("Missing app bundle assets.");

  const assetPaths = new Set();
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
    if (!["backend", "renderer", "vendor"].includes(asset.path.split("/")[0])) {
      fail(`Unexpected app bundle asset root: ${asset.path}`);
    }
    if (assetPaths.has(asset.path)) fail(`Duplicate app bundle asset path: ${asset.path}`);
    assetPaths.add(asset.path);
    if (!/^[a-f0-9]{64}$/i.test(asset.sha256)) fail(`Invalid app bundle asset hash: ${asset.path}`);

    const absolute = join(root, asset.path);
    assertExists(absolute, `app bundle asset ${asset.path}`);
    const actual = sha256File(absolute);
    if (actual !== asset.sha256.toLowerCase()) {
      fail(`Hash mismatch for app bundle asset: ${asset.path}`);
    }
  }

  for (const required of [manifest.backend.entry, manifest.renderer.entry]) {
    if (!assetPaths.has(required)) fail(`Required entry not listed in assets: ${required}`);
  }
  return manifest;
}

function tauriExecutable(app) {
  if (process.platform === "win32") return app.endsWith(".exe") ? app : join(app, "geochat-desktop-tauri.exe");
  if (process.platform !== "darwin" && statSync(app).isFile()) return app;
  return join(app, "Contents", "MacOS", "geochat-desktop-tauri");
}

function runtimeName() {
  return process.platform === "win32" ? "bun.exe" : "bun";
}

function discoverInstaller() {
  const root = resolve("src-tauri/target/release/bundle");
  if (!existsSync(root)) return null;
  const extensions = process.platform === "win32" ? [".exe", ".msi"] : [".dmg"];
  const matches = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) stack.push(join(current, entry));
    } else if (stat.isFile() && extensions.some((extension) => current.endsWith(extension))) {
      matches.push(current);
    }
  }
  return matches.sort().at(-1) ?? null;
}

function discoverTauriAppPath() {
  const candidates =
    process.platform === "darwin"
      ? discoverMacAppBundles()
      : process.platform === "win32"
        ? [resolve("src-tauri/target/release/geochat-desktop-tauri.exe")]
        : [resolve("src-tauri/target/release/geochat-desktop-tauri")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function discoverMacAppBundles() {
  const root = resolve("src-tauri/target/release/bundle/macos");
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => entry.endsWith(".app"))
    .map((entry) => join(root, entry))
    .sort();
}

function discoverTauriResourceRoot(app) {
  const candidates =
    process.platform === "darwin"
      ? [join(app, "Contents", "Resources", "_up_", "dist")]
      : [
          join(dirname(app), "_up_", "dist"),
          join(dirname(app), "resources", "_up_", "dist"),
          resolve("src-tauri/target/release/_up_/dist"),
          resolve("src-tauri/target/release/resources/_up_/dist")
        ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "app-bundle-manifest.json"))) return candidate;
  }
  return discoverResourceRootUnder(resolve("src-tauri/target/release"));
}

function discoverResourceRootUnder(root) {
  if (!existsSync(root)) return null;
  const stack = [root];
  const matches = [];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (existsSync(join(current, "app-bundle-manifest.json"))) {
      matches.push(current);
      continue;
    }
    if (!statSync(current).isDirectory()) continue;
    for (const entry of readdirSync(current)) stack.push(join(current, entry));
  }
  return matches.sort()[0] ?? null;
}

function directorySize(path) {
  let total = 0;
  const stack = [path];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) stack.push(join(current, entry));
    } else if (stat.isFile()) {
      total += stat.size;
    }
  }
  return total;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function valueAfter(flag) {
  const index = rawArgs.indexOf(flag);
  if (index === -1) return null;
  const value = rawArgs[index + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

function assertExists(path, label) {
  if (!existsSync(path)) fail(`Missing ${label}: ${path}`);
}

function assertAbsent(path, label) {
  if (existsSync(path)) fail(`Unexpected ${label}: ${path}`);
}

function assertNonEmptyDirectory(path, label) {
  assertExists(path, label);
  if (!statSync(path).isDirectory() || readdirSync(path).length === 0) {
    fail(`${label} must be a non-empty directory: ${path}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
