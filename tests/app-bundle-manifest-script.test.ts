import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function writeFile(root: string, path: string, content: string) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

async function runManifestWriter(cwd: string, env: Record<string, string> = {}) {
  const proc = Bun.spawn([process.execPath, join(process.cwd(), "scripts/write-app-bundle-manifest.mjs")], {
    cwd,
    env: {
      ...process.env,
      GEOCHAT_APP_BUNDLE_VERSION: "",
      ...env
    },
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  return { stdout, stderr, exitCode };
}

describe("app bundle manifest writer", () => {
  let root = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "geochat-manifest-writer-"));
    writeFile(root, "package.json", JSON.stringify({ version: "9.8.7" }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("writes only backend, renderer, and vendor assets, never the Bun runtime", async () => {
    writeFile(root, "dist/backend/backend.bundle.js", "backend bundle");
    writeFile(root, "dist/backend/manifest.json", "backend manifest");
    writeFile(root, "dist/renderer/index.html", "renderer html");
    writeFile(root, "dist/renderer/manifest.json", "renderer manifest");
    writeFile(root, "dist/vendor/geogebra/deployggb.js", "geogebra vendor");
    writeFile(root, "dist/runtime/bun", "bun runtime");

    const result = await runManifestWriter(root);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const manifest = JSON.parse(await readFile(join(root, "dist/app-bundle-manifest.json"), "utf8"));
    expect(manifest).toMatchObject({
      kind: "geochat-app-bundle",
      shellVersion: "9.8.7",
      requiresShellUpdate: false,
      backend: { entry: "backend/backend.bundle.js" },
      renderer: { entry: "renderer/index.html" }
    });
    expect(manifest.bundleVersion).toStartWith("9.8.7+");

    const assets = manifest.assets as Array<{ path: string; url: string; sha256: string }>;
    expect(assets.map((asset) => asset.path).sort()).toEqual([
      "backend/backend.bundle.js",
      "renderer/index.html",
      "vendor/geogebra/deployggb.js"
    ]);
    expect(assets.map((asset) => asset.url).sort()).toEqual([
      `${manifest.bundleVersion}/backend/backend.bundle.js`,
      `${manifest.bundleVersion}/renderer/index.html`,
      `${manifest.bundleVersion}/vendor/geogebra/deployggb.js`
    ]);
    expect(assets.find((asset) => asset.path === "backend/backend.bundle.js")?.sha256).toBe(sha256("backend bundle"));
    expect(assets.some((asset) => asset.path === "runtime/bun" || asset.path.startsWith("runtime/"))).toBe(false);
    expect(assets.some((asset) => asset.path.endsWith("/manifest.json"))).toBe(false);
  });

  test("uses an explicit bundle version when CI needs cross-job manifest stability", async () => {
    writeFile(root, "dist/backend/backend.bundle.js", "backend bundle");
    writeFile(root, "dist/renderer/index.html", "renderer html");
    writeFile(root, "dist/vendor/geogebra/deployggb.js", "geogebra vendor");

    const result = await runManifestWriter(root, {
      GEOCHAT_APP_BUNDLE_VERSION: "ci-run-1234-abcdef"
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const manifest = JSON.parse(await readFile(join(root, "dist/app-bundle-manifest.json"), "utf8"));
    expect(manifest.bundleVersion).toBe("ci-run-1234-abcdef");
    expect(manifest.assets).toContainEqual(
      expect.objectContaining({
        path: "backend/backend.bundle.js",
        url: "ci-run-1234-abcdef/backend/backend.bundle.js"
      })
    );
  });

  test("normalizes release tag bundle versions before writing manifest asset URLs", async () => {
    writeFile(root, "dist/backend/backend.bundle.js", "backend bundle");
    writeFile(root, "dist/renderer/index.html", "renderer html");
    writeFile(root, "dist/vendor/geogebra/deployggb.js", "geogebra vendor");

    const result = await runManifestWriter(root, {
      GEOCHAT_APP_BUNDLE_VERSION: "v9.8.7"
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const manifest = JSON.parse(await readFile(join(root, "dist/app-bundle-manifest.json"), "utf8"));
    expect(manifest.bundleVersion).toBe("9.8.7");
    expect(manifest.assets).toContainEqual(
      expect.objectContaining({
        path: "backend/backend.bundle.js",
        url: "9.8.7/backend/backend.bundle.js"
      })
    );
  });
});
