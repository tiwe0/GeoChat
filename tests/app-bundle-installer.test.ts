import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";
import {
  compareAppBundleVersions,
  installAppBundleFromManifest,
  isShellVersionCompatible,
  parseManifest,
  rollbackAppBundleInstallation,
  type SignatureConfig
} from "../scripts/lib/app-bundle-installer";

type FixtureBundle = {
  root: string;
  manifestPath: string;
  manifestUrl: string;
  signature: SignatureConfig;
};

const shellVersion = "0.1.1";
const hashZero = "0".repeat(64);

function sha256(bytes: string | Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function createSigningKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  };
}

function writeFile(root: string, path: string, content: string) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return { path, sha256: sha256(content) };
}

function writeBundle(parent: string, name: string, version: string, key = createSigningKey()): FixtureBundle {
  const root = join(parent, name);
  mkdirSync(root, { recursive: true });
  const assets = [
    writeFile(root, "backend/backend.bundle.js", `backend ${version}`),
    writeFile(root, "renderer/index.html", `<html>${version}</html>`),
    writeFile(root, "vendor/geogebra/deployggb.js", `vendor ${version}`)
  ];
  const manifest = {
    kind: "geochat-app-bundle",
    bundleVersion: version,
    shellVersion,
    backend: {
      entry: "backend/backend.bundle.js"
    },
    renderer: {
      entry: "renderer/index.html"
    },
    assets
  };
  const manifestPath = join(root, "app-bundle-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const signature = sign(null, readFileSync(manifestPath), key.privateKeyPem);
  return {
    root,
    manifestPath,
    manifestUrl: pathToFileURL(manifestPath).href,
    signature: {
      publicKeyPem: key.publicKeyPem,
      signatureBase64: signature.toString("base64")
    }
  };
}

function validManifestPatch(patch: Record<string, unknown>) {
  const extraAssets = Array.isArray(patch.assets) ? patch.assets : [];
  const { assets: _assets, ...rest } = patch;
  return JSON.stringify({
    kind: "geochat-app-bundle",
    bundleVersion: "test",
    shellVersion,
    backend: {
      entry: "backend/backend.bundle.js"
    },
    renderer: {
      entry: "renderer/index.html"
    },
    assets: [
      { path: "backend/backend.bundle.js", sha256: hashZero },
      { path: "renderer/index.html", sha256: hashZero },
      ...extraAssets
    ],
    ...rest
  });
}

describe("app bundle installer", () => {
  test("installs signed bundles and rolls back to the previous bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "geochat-app-bundle-installer-"));
    try {
      const updatesRoot = join(root, "updates");
      const key = createSigningKey();
      const v1 = writeBundle(root, "source-v1", "bundle-v1", key);
      const v2 = writeBundle(root, "source-v2", "bundle-v2", key);

      const firstInstall = await installAppBundleFromManifest({
        manifestUrl: v1.manifestUrl,
        updatesRoot,
        shellVersion,
        signature: v1.signature
      });
      expect(firstInstall).toMatchObject({
        bundleVersion: "bundle-v1",
        assetCount: 3
      });
      expect(readFileSync(join(updatesRoot, "current/backend/backend.bundle.js"), "utf8")).toBe("backend bundle-v1");
      expect(readFileSync(join(updatesRoot, "current/app-bundle-manifest.json.sig")).length).toBeGreaterThan(0);
      expect(readFileSync(join(updatesRoot, "current/app-bundle-manifest.json"), "utf8")).toBe(
        readFileSync(v1.manifestPath, "utf8")
      );
      expect(
        verify(
          null,
          readFileSync(join(updatesRoot, "current/app-bundle-manifest.json")),
          createPublicKey(v1.signature.publicKeyPem),
          readFileSync(join(updatesRoot, "current/app-bundle-manifest.json.sig"))
        )
      ).toBe(true);

      await installAppBundleFromManifest({
        manifestUrl: v2.manifestUrl,
        updatesRoot,
        shellVersion,
        signature: v2.signature
      });
      expect(readFileSync(join(updatesRoot, "current/backend/backend.bundle.js"), "utf8")).toBe("backend bundle-v2");
      expect(readFileSync(join(updatesRoot, "previous/backend/backend.bundle.js"), "utf8")).toBe("backend bundle-v1");

      const rollback = rollbackAppBundleInstallation({ updatesRoot });
      expect(rollback.bundleVersion).toBe("bundle-v1");
      expect(readFileSync(join(updatesRoot, "current/backend/backend.bundle.js"), "utf8")).toBe("backend bundle-v1");
      expect(readFileSync(join(updatesRoot, "current/app-bundle-manifest.json.sig")).length).toBeGreaterThan(0);
      expect(rollback.failedRoot).not.toBeNull();
      expect(existsSync(rollback.failedRoot ?? "")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("downloads versioned asset URLs while installing stable asset paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "geochat-app-bundle-versioned-url-"));
    try {
      const source = join(root, "source");
      mkdirSync(source, { recursive: true });
      const key = createSigningKey();
      const assets = [
        writeFile(source, "bundle-v3/backend/backend.bundle.js", "backend bundle-v3"),
        writeFile(source, "bundle-v3/renderer/index.html", "<html>bundle-v3</html>")
      ];
      const manifest = {
        kind: "geochat-app-bundle",
        bundleVersion: "bundle-v3",
        shellVersion,
        backend: {
          entry: "backend/backend.bundle.js"
        },
        renderer: {
          entry: "renderer/index.html"
        },
        assets: [
          {
            path: "backend/backend.bundle.js",
            url: assets[0].path,
            sha256: assets[0].sha256
          },
          {
            path: "renderer/index.html",
            url: assets[1].path,
            sha256: assets[1].sha256
          }
        ]
      };
      const manifestPath = join(source, "app-bundle-manifest.json");
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      const signature = sign(null, readFileSync(manifestPath), key.privateKeyPem);

      const installed = await installAppBundleFromManifest({
        manifestUrl: pathToFileURL(manifestPath).href,
        updatesRoot: join(root, "updates"),
        shellVersion,
        signature: {
          publicKeyPem: key.publicKeyPem,
          signatureBase64: signature.toString("base64")
        }
      });

      expect(readFileSync(join(installed.installedRoot, "backend/backend.bundle.js"), "utf8")).toBe("backend bundle-v3");
      expect(existsSync(join(installed.installedRoot, "bundle-v3/backend/backend.bundle.js"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects bundles that require a newer shell before downloading assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "geochat-app-bundle-shell-required-"));
    try {
      const key = createSigningKey();
      const bundle = writeBundle(root, "source", "bundle-shell-required", key);
      const manifest = JSON.parse(readFileSync(bundle.manifestPath, "utf8"));
      manifest.requiresShellUpdate = true;
      writeFileSync(bundle.manifestPath, JSON.stringify(manifest, null, 2));
      const signature = sign(null, readFileSync(bundle.manifestPath), key.privateKeyPem);

      await expect(
        installAppBundleFromManifest({
          manifestUrl: bundle.manifestUrl,
          updatesRoot: join(root, "updates"),
          shellVersion,
          signature: {
            publicKeyPem: key.publicKeyPem,
            signatureBase64: signature.toString("base64")
          }
        })
      ).rejects.toThrow("requires a newer application shell");
      expect(existsSync(join(root, "updates/current"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects tampered assets without replacing current", async () => {
    const root = await mkdtemp(join(tmpdir(), "geochat-app-bundle-tamper-"));
    try {
      const updatesRoot = join(root, "updates");
      const key = createSigningKey();
      const good = writeBundle(root, "source-good", "bundle-good", key);
      const bad = writeBundle(root, "source-bad", "bundle-bad", key);
      await installAppBundleFromManifest({
        manifestUrl: good.manifestUrl,
        updatesRoot,
        shellVersion,
        signature: good.signature
      });

      writeFileSync(join(bad.root, "backend/backend.bundle.js"), "tampered");
      await expect(
        installAppBundleFromManifest({
          manifestUrl: bad.manifestUrl,
          updatesRoot,
          shellVersion,
          signature: bad.signature
        })
      ).rejects.toThrow("hash mismatch");
      expect(readFileSync(join(updatesRoot, "current/backend/backend.bundle.js"), "utf8")).toBe("backend bundle-good");
      expect(readdirSync(updatesRoot).some((entry) => entry.startsWith("staging-"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects invalid signatures", async () => {
    const root = await mkdtemp(join(tmpdir(), "geochat-app-bundle-signature-"));
    try {
      const bundle = writeBundle(root, "source", "bundle-signature");
      await expect(
        installAppBundleFromManifest({
          manifestUrl: bundle.manifestUrl,
          updatesRoot: join(root, "updates"),
          shellVersion,
          signature: {
            publicKeyPem: createSigningKey().publicKeyPem,
            signatureBase64: bundle.signature.signatureBase64
          }
        })
      ).rejects.toThrow("signature verification failed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects unsigned installs unless explicitly allowed for local diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "geochat-app-bundle-unsigned-"));
    try {
      const bundle = writeBundle(root, "source", "bundle-unsigned");
      const updatesRoot = join(root, "updates");

      await expect(
        installAppBundleFromManifest({
          manifestUrl: bundle.manifestUrl,
          updatesRoot,
          shellVersion
        })
      ).rejects.toThrow("requires a manifest signature");
      expect(existsSync(join(updatesRoot, "current"))).toBe(false);

      const installed = await installAppBundleFromManifest({
        manifestUrl: bundle.manifestUrl,
        updatesRoot,
        shellVersion,
        allowUnsigned: true
      });
      expect(installed.bundleVersion).toBe("bundle-unsigned");
      expect(existsSync(join(updatesRoot, "current/runtime"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects runtime assets, unsafe paths, and duplicate assets at manifest parsing", () => {
    expect(() =>
      parseManifest(
        validManifestPatch({
          assets: [{ path: "runtime/bun", sha256: hashZero }]
        })
      )
    ).toThrow("Runtime assets");

    expect(() =>
      parseManifest(
        validManifestPatch({
          assets: [{ path: "renderer\\index.html", sha256: hashZero }]
        })
      )
    ).toThrow("Unsafe bundle asset path");

    expect(() =>
      parseManifest(
        validManifestPatch({
          backend: { entry: "../backend.bundle.js" }
        })
      )
    ).toThrow("Unsafe bundle asset path");

    expect(() =>
      parseManifest(
        validManifestPatch({
          assets: [{ path: "package.json", sha256: hashZero }]
        })
      )
    ).toThrow("Bundle assets must stay under backend, renderer, or vendor");

    expect(() =>
      parseManifest(
        validManifestPatch({
          assets: [{ path: "out/main/index.js", sha256: hashZero }]
        })
      )
    ).toThrow("Bundle assets must stay under backend, renderer, or vendor");

    expect(() =>
      parseManifest(
        validManifestPatch({
          assets: [{ path: "backend/backend.bundle.js", sha256: hashZero }]
        })
      )
    ).toThrow("Duplicate bundle asset path");

    expect(() =>
      parseManifest(
        validManifestPatch({
          assets: [{ path: "vendor/geogebra/deployggb.js", url: "https://example.test/deployggb.js", sha256: hashZero }]
        })
      )
    ).toThrow("Unsafe bundle asset URL");

    expect(() =>
      parseManifest(
        validManifestPatch({
          assets: [{ path: "vendor/geogebra/deployggb.js", url: "bundle/%2e%2e/deployggb.js", sha256: hashZero }]
        })
      )
    ).toThrow("Unsafe bundle asset URL");
  });

  test("rollback rejects previous bundle directories that contain a runtime even when manifest omits it", async () => {
    const root = await mkdtemp(join(tmpdir(), "geochat-app-bundle-runtime-dir-"));
    try {
      const updatesRoot = join(root, "updates");
      const key = createSigningKey();
      const v1 = writeBundle(root, "source-v1", "bundle-v1", key);
      const v2 = writeBundle(root, "source-v2", "bundle-v2", key);

      await installAppBundleFromManifest({
        manifestUrl: v1.manifestUrl,
        updatesRoot,
        shellVersion,
        signature: v1.signature
      });
      await installAppBundleFromManifest({
        manifestUrl: v2.manifestUrl,
        updatesRoot,
        shellVersion,
        signature: v2.signature
      });

      writeFile(updatesRoot, "previous/runtime/bun", "runtime that must stay in the shell");

      expect(() => rollbackAppBundleInstallation({ updatesRoot })).toThrow("must not contain a runtime directory");
      expect(readFileSync(join(updatesRoot, "current/backend/backend.bundle.js"), "utf8")).toBe("backend bundle-v2");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects manifests whose backend or renderer entry is not listed as an asset", () => {
    expect(() =>
      parseManifest(
        validManifestPatch({
          assets: [],
          backend: { entry: "backend/missing.bundle.js" }
        })
      )
    ).toThrow("Required entry");

    expect(() =>
      parseManifest(
        validManifestPatch({
          assets: [],
          renderer: { entry: "renderer/missing.html" }
        })
      )
    ).toThrow("Required entry");
  });

  test("accepts shell version ranges without allowing incompatible shells", () => {
    const exactManifest = parseManifest(validManifestPatch({}));
    expect(isShellVersionCompatible(exactManifest, shellVersion)).toBe(true);
    expect(isShellVersionCompatible(parseManifest(validManifestPatch({ shellVersion: `v${shellVersion}` })), shellVersion)).toBe(true);
    expect(isShellVersionCompatible(exactManifest, "0.1.2")).toBe(false);

    const rangedManifest = parseManifest(
      validManifestPatch({
        shellVersion: "0.1.0",
        minShellVersion: "0.1.0",
        maxShellVersion: "0.1.x"
      })
    );
    expect(isShellVersionCompatible(rangedManifest, "0.1.0")).toBe(true);
    expect(isShellVersionCompatible(rangedManifest, "0.1.9")).toBe(true);
    expect(isShellVersionCompatible(rangedManifest, "0.0.9")).toBe(false);
    expect(isShellVersionCompatible(rangedManifest, "1.0.0")).toBe(false);
  });

  test("compares sortable app-bundle versions while leaving opaque versions unranked", () => {
    expect(compareAppBundleVersions("0.1.1+1781400000000", "0.1.1+1781390000000")).toBe(1);
    expect(compareAppBundleVersions("2026.06.14.2", "2026.06.14.10")).toBe(-1);
    expect(compareAppBundleVersions("2026.06.14.1", "2026.06.14.1")).toBe(0);
    expect(compareAppBundleVersions("v0.1.2", "0.1.1+9999999999999")).toBe(1);
    expect(compareAppBundleVersions("v0.1.2", "0.1.2")).toBe(0);
    expect(compareAppBundleVersions("0.1.2", "0.1.1+9999999999999")).toBe(1);
    expect(compareAppBundleVersions("release-a", "release-b")).toBeNull();
    expect(compareAppBundleVersions("release-a", "release-a")).toBe(0);
  });
});
