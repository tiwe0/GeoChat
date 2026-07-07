import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export type AppBundleInstallResult = {
  bundleVersion: string;
  assetCount: number;
  installedRoot: string;
};

export type AppBundleRollbackResult = {
  bundleVersion: string;
  rolledBackRoot: string;
  failedRoot: string | null;
};

type AppBundleAsset = {
  path: string;
  sha256: string;
  url?: string;
};

export type AppBundleManifest = {
  kind: "geochat-app-bundle";
  bundleVersion: string;
  shellVersion: string;
  minShellVersion?: string;
  maxShellVersion?: string;
  requiresShellUpdate?: boolean;
  assets: AppBundleAsset[];
  backend: {
    entry: string;
  };
  renderer: {
    entry: string;
  };
};

export type SignatureConfig = {
  publicKeyPem: string;
  signatureBase64?: string;
  signatureUrl?: string;
};

export type AppBundleInstallOptions = {
  manifestUrl: string;
  updatesRoot: string;
  shellVersion?: string;
  signature?: SignatureConfig;
  allowUnsigned?: boolean;
};

export type AppBundleRollbackOptions = {
  updatesRoot: string;
};

export type AppBundleManifestInfo = {
  manifest: AppBundleManifest;
  manifestBytes: Uint8Array;
  signatureBytes?: Uint8Array;
};

const mutableBundleRoots = new Set(["backend", "renderer", "vendor"]);

export async function installAppBundleFromManifest(options: AppBundleInstallOptions): Promise<AppBundleInstallResult> {
  if (!options.signature && options.allowUnsigned !== true) {
    throw new Error("App bundle install requires a manifest signature.");
  }

  const { manifest, manifestBytes, signatureBytes } = await readAppBundleManifestInfo(options.manifestUrl, options.signature);
  if (manifest.requiresShellUpdate === true) {
    throw new Error(
      `App bundle ${manifest.bundleVersion} requires a newer application shell.`
    );
  }
  if (options.shellVersion && !isShellVersionCompatible(manifest, options.shellVersion)) {
    throw new Error(
      `App bundle ${manifest.bundleVersion} is not compatible with shell ${options.shellVersion}.`
    );
  }
  const stagingRoot = resolve(options.updatesRoot, `staging-${process.pid}-${Date.now()}`);
  const currentRoot = resolve(options.updatesRoot, "current");
  const previousRoot = resolve(options.updatesRoot, "previous");

  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });

  try {
    for (const asset of manifest.assets) {
      const assetUrl = resolveAssetUrl(options.manifestUrl, asset);
      const bytes = await readUrlBytes(assetUrl);
      const actualHash = sha256(bytes);
      if (actualHash !== asset.sha256.toLowerCase()) {
        throw new Error(`App bundle asset hash mismatch: ${asset.path}`);
      }

      const target = resolve(stagingRoot, asset.path);
      ensureInside(stagingRoot, target, asset.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }

    writeFileSync(resolve(stagingRoot, "app-bundle-manifest.json"), manifestBytes);
    if (signatureBytes) {
      writeFileSync(resolve(stagingRoot, "app-bundle-manifest.json.sig"), signatureBytes);
    }
    verifyInstalledBundle(stagingRoot, manifest);

    rmSync(previousRoot, { recursive: true, force: true });
    if (existsPath(currentRoot)) {
      renameSync(currentRoot, previousRoot);
    }
    renameSync(stagingRoot, currentRoot);

    return {
      bundleVersion: manifest.bundleVersion,
      assetCount: manifest.assets.length,
      installedRoot: currentRoot
    };
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export function rollbackAppBundleInstallation(options: AppBundleRollbackOptions): AppBundleRollbackResult {
  const currentRoot = resolve(options.updatesRoot, "current");
  const previousRoot = resolve(options.updatesRoot, "previous");
  const failedRoot = resolve(options.updatesRoot, `failed-${Date.now()}`);
  if (!existsPath(previousRoot)) {
    throw new Error("No previous app bundle is available for rollback.");
  }

  const previousManifest = parseManifest(readFileSync(resolve(previousRoot, "app-bundle-manifest.json"), "utf8"));
  verifyInstalledBundle(previousRoot, previousManifest);

  let failed: string | null = null;
  if (existsPath(currentRoot)) {
    renameSync(currentRoot, failedRoot);
    failed = failedRoot;
  }
  renameSync(previousRoot, currentRoot);

  return {
    bundleVersion: previousManifest.bundleVersion,
    rolledBackRoot: currentRoot,
    failedRoot: failed
  };
}

export async function readAppBundleManifestInfo(manifestUrl: string, signature?: SignatureConfig): Promise<AppBundleManifestInfo> {
  const manifestBytes = await readUrlBytes(manifestUrl);
  let signatureBytes: Uint8Array | undefined;
  if (signature) {
    signatureBytes = await verifyManifestSignature(manifestBytes, manifestUrl, signature);
  }
  return {
    manifest: parseManifest(Buffer.from(manifestBytes).toString("utf8")),
    manifestBytes,
    ...(signatureBytes ? { signatureBytes } : {})
  };
}

export function parseManifest(input: string): AppBundleManifest {
  const value = JSON.parse(input) as Partial<AppBundleManifest>;
  if (value.kind !== "geochat-app-bundle") throw new Error("Invalid app bundle kind.");
  if (!value.bundleVersion || typeof value.bundleVersion !== "string") throw new Error("Missing bundle version.");
  if (!value.shellVersion || typeof value.shellVersion !== "string") throw new Error("Missing shell version.");
  if (value.requiresShellUpdate !== undefined && typeof value.requiresShellUpdate !== "boolean") {
    throw new Error("Invalid requiresShellUpdate flag.");
  }
  if (!Array.isArray(value.assets) || value.assets.length === 0) throw new Error("Missing bundle assets.");
  if (!value.backend?.entry || typeof value.backend.entry !== "string") throw new Error("Missing backend entry.");
  if (!value.renderer?.entry || typeof value.renderer.entry !== "string") throw new Error("Missing renderer entry.");
  assertBundleAssetPath(value.backend.entry);
  assertBundleAssetPath(value.renderer.entry);

  const assets = value.assets.map((asset) => {
    if (!asset || typeof asset.path !== "string" || typeof asset.sha256 !== "string") {
      throw new Error("Invalid bundle asset.");
    }
    assertBundleAssetPath(asset.path);
    if (!/^[a-f0-9]{64}$/i.test(asset.sha256)) {
      throw new Error(`Invalid bundle asset hash: ${asset.path}`);
    }
    if (asset.url !== undefined && typeof asset.url !== "string") {
      throw new Error(`Invalid bundle asset URL: ${asset.path}`);
    }
    if (asset.url !== undefined) {
      assertBundleAssetUrlPath(asset.url, asset.path);
    }
    return {
      path: asset.path,
      sha256: asset.sha256.toLowerCase(),
      ...(asset.url ? { url: asset.url } : {})
    };
  });

  const assetPaths = new Set(assets.map((asset) => asset.path));
  if (assetPaths.size !== assets.length) throw new Error("Duplicate bundle asset path.");
  for (const required of [value.backend.entry, value.renderer.entry]) {
    if (!assetPaths.has(required)) throw new Error(`Required entry is not listed as an asset: ${required}`);
  }

  return {
    kind: "geochat-app-bundle",
    bundleVersion: value.bundleVersion,
    shellVersion: value.shellVersion,
    ...(value.requiresShellUpdate === true ? { requiresShellUpdate: true } : {}),
    ...(typeof value.minShellVersion === "string" ? { minShellVersion: value.minShellVersion } : {}),
    ...(typeof value.maxShellVersion === "string" ? { maxShellVersion: value.maxShellVersion } : {}),
    assets,
    backend: { entry: value.backend.entry },
    renderer: { entry: value.renderer.entry }
  };
}

function assertBundleAssetPath(path: string) {
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    throw new Error(`Unsafe bundle asset path: ${path}`);
  }

  if (path === "runtime" || path.startsWith("runtime/")) {
    throw new Error(`Runtime assets must not be included in app bundles: ${path}`);
  }

  const [root] = path.split("/");
  if (!mutableBundleRoots.has(root)) {
    throw new Error(`Bundle assets must stay under backend, renderer, or vendor: ${path}`);
  }
}

function assertBundleAssetUrlPath(path: string, label: string) {
  if (path.length === 0 || path.trim() !== path) {
    throw new Error(`Unsafe bundle asset URL for ${label}: ${path}`);
  }
  if (path.startsWith("/") || path.includes("\\") || path.includes("?") || path.includes("#")) {
    throw new Error(`Unsafe bundle asset URL for ${label}: ${path}`);
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) {
    throw new Error(`Unsafe bundle asset URL for ${label}: ${path}`);
  }

  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new Error(`Unsafe bundle asset URL for ${label}: ${path}`);
  }
  const segments = decoded.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`Unsafe bundle asset URL for ${label}: ${path}`);
  }
}

export function isShellVersionCompatible(manifest: AppBundleManifest, shellVersion: string) {
  if (!manifest.minShellVersion && !manifest.maxShellVersion) {
    return normalizeVersionTag(manifest.shellVersion) === normalizeVersionTag(shellVersion);
  }

  if (manifest.minShellVersion && compareVersions(shellVersion, manifest.minShellVersion) < 0) return false;
  if (manifest.maxShellVersion && !versionMatchesUpperBound(shellVersion, manifest.maxShellVersion)) return false;
  return true;
}

export function compareAppBundleVersions(left: string, right: string): -1 | 0 | 1 | null {
  const normalizedLeft = normalizeVersionTag(left);
  const normalizedRight = normalizeVersionTag(right);
  if (normalizedLeft === normalizedRight) return 0;

  const leftParts = parseSortableAppBundleVersion(normalizedLeft);
  const rightParts = parseSortableAppBundleVersion(normalizedRight);
  if (!leftParts || !rightParts) return null;

  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1;
  }
  return 0;
}

function parseSortableAppBundleVersion(version: string) {
  if (!/^\d+(?:[.+-]\d+)*$/.test(version)) return null;
  return version.split(/[.+-]/).map((part) => Number(part));
}

function versionMatchesUpperBound(version: string, upperBound: string) {
  const normalizedVersion = normalizeVersionTag(version);
  const normalizedUpperBound = normalizeVersionTag(upperBound);
  if (normalizedUpperBound.endsWith(".x")) {
    return normalizedVersion.startsWith(`${normalizedUpperBound.slice(0, -2)}.`);
  }
  return compareVersions(normalizedVersion, normalizedUpperBound) <= 0;
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersionTag(left).split(".").map((part) => Number(part));
  const rightParts = normalizeVersionTag(right).split(".").map((part) => Number(part));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1;
  }
  return 0;
}

function normalizeVersionTag(version: string) {
  return version.trim().replace(/^v(?=\d)/, "");
}

function resolveAssetUrl(manifestUrl: string, asset: AppBundleAsset) {
  if (asset.url) {
    assertBundleAssetUrlPath(asset.url, asset.path);
    return new URL(asset.url, manifestUrl).href;
  }
  return new URL(asset.path, manifestUrl).href;
}

async function verifyManifestSignature(manifestBytes: Uint8Array, manifestUrl: string, signature: SignatureConfig) {
  const signatureBytes = signature.signatureBase64
    ? Buffer.from(signature.signatureBase64, "base64")
    : await readUrlBytes(signature.signatureUrl ?? `${manifestUrl}.sig`);
  const publicKey = createPublicKey(signature.publicKeyPem);
  const ok = verifySignature(null, manifestBytes, publicKey, signatureBytes);
  if (!ok) {
    throw new Error("App bundle manifest signature verification failed.");
  }
  return signatureBytes;
}

function verifyInstalledBundle(root: string, manifest: AppBundleManifest) {
  if (existsDirectory(resolve(root, "runtime"))) {
    throw new Error("Installed app bundle must not contain a runtime directory.");
  }

  for (const asset of manifest.assets) {
    const assetPath = resolve(root, asset.path);
    ensureInside(root, assetPath, asset.path);
    const bytes = readFileSync(assetPath);
    if (sha256(bytes) !== asset.sha256) {
      throw new Error(`Installed app bundle asset hash mismatch: ${asset.path}`);
    }
  }
}

async function readUrlBytes(url: string): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (parsed.protocol === "file:") {
    return readFileSync(parsed);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported app bundle URL protocol: ${parsed.protocol}`);
  }

  const response = await fetch(parsed);
  if (!response.ok) {
    throw new Error(`Failed to fetch app bundle URL ${url}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function existsPath(path: string) {
  return existsSync(path);
}

function existsDirectory(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function ensureInside(root: string, path: string, label: string) {
  const resolvedRoot = resolve(root);
  const relativePath = relative(resolvedRoot, resolve(path));
  if (relativePath !== "" && (relativePath.startsWith("..") || isAbsolute(relativePath))) {
    throw new Error(`App bundle path escapes root: ${label}`);
  }
}
