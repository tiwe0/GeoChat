import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

const writeGithubSummary = process.argv.includes("--github-summary");
const writeJson = process.argv.includes("--json");
const jsonOutArgIndex = process.argv.indexOf("--json-out");
const jsonOutPath = jsonOutArgIndex >= 0 ? process.argv[jsonOutArgIndex + 1] : undefined;
const bundleRoot = resolve(process.env.GEOCHAT_APP_BUNDLE_ROOT ?? "dist");
const manifestPath = resolve(process.env.GEOCHAT_APP_BUNDLE_MANIFEST_PATH ?? join(bundleRoot, "app-bundle-manifest.json"));
const releaseRoot = resolve(process.env.GEOCHAT_RELEASE_ROOT ?? "release");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const scripts = packageJson.scripts ?? {};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function walk(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current).sort()) {
      const absolute = join(current, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        stack.push(absolute);
      } else if (stat.isFile()) {
        files.push(absolute);
      }
    }
  }
  return files.sort();
}

function discoverPackagedResourceRoots() {
  if (!existsSync(releaseRoot)) return [];
  return walk(releaseRoot)
    .filter((path) => basename(path) === "app-bundle-manifest.json")
    .map((path) => resolve(path, ".."))
    .sort();
}

function discoverInstallerArtifacts() {
  const allowed = new Set([".dmg", ".zip", ".exe", ".yml"]);
  if (!existsSync(releaseRoot)) return [];
  return readdirSync(releaseRoot)
    .map((entry) => join(releaseRoot, entry))
    .filter((path) => {
      if (!statSync(path).isFile()) return false;
      const extension = extname(path).toLowerCase();
      if (!allowed.has(extension)) return false;
      return extension !== ".yml" || basename(path).startsWith("latest");
    })
    .sort();
}

function assetCounts(manifest) {
  const counts = new Map();
  for (const asset of manifest.assets) {
    const root = asset.path.split("/")[0] ?? "";
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function readOptionalText(path) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return "";
  return readFileSync(absolute, "utf8");
}

function assertManifest(manifest) {
  if (manifest.kind !== "geochat-app-bundle") fail("Invalid app bundle manifest kind.");
  if (!manifest.bundleVersion) fail("Missing app bundle bundleVersion.");
  if (!manifest.shellVersion) fail("Missing app bundle shellVersion.");
  if (manifest.backend?.entry !== "backend/backend.bundle.js") fail("Unexpected backend entry.");
  if (manifest.renderer?.entry !== "renderer/index.html") fail("Unexpected renderer entry.");
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) fail("Missing app bundle assets.");
  for (const asset of manifest.assets) {
    if (typeof asset.path !== "string" || typeof asset.sha256 !== "string") fail("Invalid app bundle asset.");
    if (asset.path === "runtime" || asset.path.startsWith("runtime/")) {
      fail(`Runtime assets must not be app-bundle evidence assets: ${asset.path}`);
    }
  }
}

if (!existsSync(manifestPath)) fail(`Missing app bundle manifest: ${manifestPath}`);

const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
assertManifest(manifest);

const resourceRoots = discoverPackagedResourceRoots();
const artifacts = discoverInstallerArtifacts();
const hasRuntimeAsset = manifest.assets.some((asset) => asset.path === "runtime" || asset.path.startsWith("runtime/"));
const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
const backendBuildSource = readOptionalText("scripts/build-backend-bundle.mjs");
const runtimeStageSource = readOptionalText("scripts/stage-runtime-sidecar.mjs");
const vendorStageSource = readOptionalText("scripts/stage-vendor-bundle.mjs");
const evidence = {
  kind: "geochat-app-bundle-evidence",
  bundleVersion: manifest.bundleVersion,
  shellVersion: manifest.shellVersion,
  buildBoundary: {
    scripts: {
      backend: scripts["build:backend"] ?? null,
      runtime: scripts["stage:runtime"] ?? null,
      vendor: scripts["stage:vendor"] ?? null,
      desktopBuild: scripts["desktop:build"] ?? null
    },
    appBundleRoots: ["backend", "renderer", "vendor"],
    runtimeExcludedFromAppBundle: !hasRuntimeAsset,
    backendBuildTouchesRuntime: backendBuildSource.includes('resolve("dist/runtime")'),
    backendBuildTouchesVendor: backendBuildSource.includes('resolve("dist/vendor")'),
    runtimeStageCopiesBun: runtimeStageSource.includes("copyFileSync(process.execPath, runtimeOutfile)"),
    runtimeStageTouchesBackend: runtimeStageSource.includes("backend.bundle.js"),
    vendorStageCopiesVendor: vendorStageSource.includes('resolve("vendor/geogebra")'),
    vendorStageTouchesBackend: vendorStageSource.includes("backend.bundle.js")
  },
  manifest: {
    path: relative(process.cwd(), manifestPath),
    sha256: manifestHash,
    backendEntry: manifest.backend.entry,
    rendererEntry: manifest.renderer.entry,
    assetCount: manifest.assets.length,
    assetRoots: Object.fromEntries(assetCounts(manifest)),
    runtimeIncluded: hasRuntimeAsset
  },
  packagedResourceRoots: resourceRoots.map((root) => {
    const runtimeName = existsSync(join(root, "runtime", "bun.exe")) ? "bun.exe" : "bun";
    const runtimePath = join(root, "runtime", runtimeName);
    const packagedManifestPath = join(root, "app-bundle-manifest.json");
    const packagedManifestStat = statSync(packagedManifestPath);
    return {
      path: relative(process.cwd(), root),
      manifestPath: relative(process.cwd(), packagedManifestPath),
      manifestSha256: sha256File(packagedManifestPath),
      manifestModifiedAtMs: Math.floor(packagedManifestStat.mtimeMs),
      runtimePath: existsSync(runtimePath) ? relative(process.cwd(), runtimePath) : null
    };
  }),
  installerArtifacts: artifacts.map((artifact) => {
    const stat = statSync(artifact);
    return {
      path: relative(process.cwd(), artifact),
      sizeBytes: stat.size,
      sha256: sha256File(artifact),
      modifiedAtMs: Math.floor(stat.mtimeMs)
    };
  })
};
const lines = [];

lines.push("## GeoChat App Bundle Evidence");
lines.push("");
lines.push(`- Bundle version: \`${manifest.bundleVersion}\``);
lines.push(`- Shell version: \`${manifest.shellVersion}\``);
lines.push(`- Manifest: \`${relative(process.cwd(), manifestPath)}\``);
lines.push(`- Manifest sha256: \`${manifestHash}\``);
lines.push(`- Backend entry: \`${manifest.backend.entry}\``);
lines.push(`- Renderer entry: \`${manifest.renderer.entry}\``);
lines.push(`- Asset count: \`${manifest.assets.length}\``);
lines.push(`- Runtime included in app-bundle manifest: \`${hasRuntimeAsset ? "yes" : "no"}\``);
lines.push(`- Backend build touches runtime: \`${evidence.buildBoundary.backendBuildTouchesRuntime ? "yes" : "no"}\``);
lines.push(`- Backend build touches vendor: \`${evidence.buildBoundary.backendBuildTouchesVendor ? "yes" : "no"}\``);
lines.push("");
lines.push("### Asset Roots");
lines.push("");
lines.push("| Root | Assets |");
lines.push("| --- | ---: |");
for (const [root, count] of assetCounts(manifest)) {
  lines.push(`| \`${root}\` | ${count} |`);
}

lines.push("");
lines.push("### Build Boundary");
lines.push("");
lines.push("| Step | Script | Evidence |");
lines.push("| --- | --- | --- |");
lines.push(`| Backend bundle | \`${evidence.buildBoundary.scripts.backend ?? "missing"}\` | no runtime/vendor staging |`);
lines.push(`| Runtime sidecar | \`${evidence.buildBoundary.scripts.runtime ?? "missing"}\` | copies Bun executable only |`);
lines.push(`| Vendor bundle | \`${evidence.buildBoundary.scripts.vendor ?? "missing"}\` | stages vendor resources only |`);

lines.push("");
lines.push("### Packaged Resource Roots");
lines.push("");
if (resourceRoots.length === 0) {
  lines.push("- No packaged resource roots found under `release/`.");
} else {
  for (const root of resourceRoots) {
    const runtimeName = existsSync(join(root, "runtime", "bun.exe")) ? "bun.exe" : "bun";
    const runtimePath = join(root, "runtime", runtimeName);
    lines.push(
      `- \`${relative(process.cwd(), root)}\` ` +
        `(runtime: \`${existsSync(runtimePath) ? relative(process.cwd(), runtimePath) : "missing"}\`)`
    );
  }
}

lines.push("");
lines.push("### Installer Artifacts");
lines.push("");
if (artifacts.length === 0) {
  lines.push("- No installer/update artifacts found under `release/`.");
} else {
  lines.push("| File | Size | sha256 |");
  lines.push("| --- | ---: | --- |");
  for (const artifact of evidence.installerArtifacts) {
    lines.push(
      `| \`${artifact.path}\` | ${formatBytes(artifact.sizeBytes)} | \`${artifact.sha256.slice(0, 16)}...\` |`
    );
  }
}

const output = `${lines.join("\n")}\n`;
if (writeGithubSummary) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) fail("Missing GITHUB_STEP_SUMMARY for --github-summary.");
  appendFileSync(summaryPath, output);
}

if (jsonOutArgIndex >= 0 && !jsonOutPath) fail("Missing path after --json-out.");

if (jsonOutPath) {
  const target = resolve(jsonOutPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
}

if (writeJson) {
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} else if (!writeGithubSummary && !jsonOutPath) {
  process.stdout.write(output);
}
