import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const distRoot = resolve("dist");
const manifestPath = resolve(distRoot, "app-bundle-manifest.json");
const mutableBundleRoots = new Set(["backend", "renderer", "vendor"]);
const includedRoots = ["backend", "renderer", "vendor"];
const bundleVersion = normalizeBundleVersion(
  process.env.GEOCHAT_APP_BUNDLE_VERSION?.trim() || `${packageJson.version}+${Date.now()}`
);
const bundleObjectPrefix = safeBundleObjectPrefix(bundleVersion);

function normalizeBundleVersion(version) {
  return version.replace(/^v(?=\d)/, "");
}

function safeBundleObjectPrefix(version) {
  const normalized = version.replace(/[^A-Za-z0-9.+_-]/g, "-").replace(/-+/g, "-");
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error(`Invalid app bundle version for object prefix: ${version}`);
  }
  return normalized;
}

function assertAppBundleAssetPath(path) {
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    throw new Error(`Unsafe app bundle asset path: ${path}`);
  }

  if (path === "runtime" || path.startsWith("runtime/")) {
    throw new Error(`Bun runtime must stay outside app bundle assets: ${path}`);
  }

  const [root] = path.split("/");
  if (!mutableBundleRoots.has(root)) {
    throw new Error(`App bundle assets must stay under backend, renderer, or vendor: ${path}`);
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function collectFiles(root, prefix = "") {
  const files = [];
  for (const entry of readdirSync(root).sort()) {
    const absolute = join(root, entry);
    const relativePath = prefix ? `${prefix}/${entry}` : entry;
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...collectFiles(absolute, relativePath));
    } else if (stat.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

const assets = includedRoots.flatMap((rootName) => {
  if (!mutableBundleRoots.has(rootName)) {
    throw new Error(`App bundle included root is not mutable app code: ${rootName}`);
  }

  const root = resolve(distRoot, rootName);
  return collectFiles(root, rootName)
    .filter((path) => !path.endsWith("/manifest.json"))
    .map((path) => {
      assertAppBundleAssetPath(path);
      return {
        path,
        url: `${bundleObjectPrefix}/${path}`,
        sha256: sha256(resolve(distRoot, path))
      };
    });
});

writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      kind: "geochat-app-bundle",
      bundleVersion,
      shellVersion: packageJson.version,
      requiresShellUpdate: false,
      backend: {
        entry: "backend/backend.bundle.js"
      },
      renderer: {
        entry: "renderer/index.html"
      },
      assets
    },
    null,
    2
  )
);

console.log(`Wrote ${relative(process.cwd(), manifestPath)} with ${assets.length} assets.`);
