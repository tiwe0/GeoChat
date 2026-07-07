import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function writeEvidenceBundle(root: string, runtimeAsset = false) {
  const backend = 'console.log("backend");\n';
  const renderer = "<!doctype html><title>renderer</title>\n";
  const vendor = "vendor payload\n";
  mkdirSync(join(root, "backend"), { recursive: true });
  mkdirSync(join(root, "renderer"), { recursive: true });
  mkdirSync(join(root, "vendor", "geogebra"), { recursive: true });
  if (runtimeAsset) mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(join(root, "backend", "backend.bundle.js"), backend);
  writeFileSync(join(root, "renderer", "index.html"), renderer);
  writeFileSync(join(root, "vendor", "geogebra", "deployggb.js"), vendor);
  if (runtimeAsset) writeFileSync(join(root, "runtime", "bun"), "runtime");

  const assets = [
    {
      path: "backend/backend.bundle.js",
      sha256: sha256(backend)
    },
    {
      path: "renderer/index.html",
      sha256: sha256(renderer)
    },
    {
      path: "vendor/geogebra/deployggb.js",
      sha256: sha256(vendor)
    }
  ];
  if (runtimeAsset) {
    assets.push({
      path: "runtime/bun",
      sha256: sha256("runtime")
    });
  }

  writeFileSync(
    join(root, "app-bundle-manifest.json"),
    JSON.stringify(
      {
        kind: "geochat-app-bundle",
        bundleVersion: "0.1.1+evidence-test",
        shellVersion: "0.1.1",
        backend: { entry: "backend/backend.bundle.js" },
        renderer: { entry: "renderer/index.html" },
        assets
      },
      null,
      2
    )
  );
}

function writeReleaseEvidence(root: string, options: { staleArtifact?: boolean } = {}) {
  const releaseRoot = join(root, "release", "mac-arm64", "GeoChat Desktop.app", "Contents", "Resources");
  mkdirSync(join(releaseRoot, "runtime"), { recursive: true });
  writeFileSync(join(releaseRoot, "app-bundle-manifest.json"), readFileSync(join(root, "app-bundle-manifest.json")));
  writeFileSync(join(releaseRoot, "runtime", "bun"), "runtime");
  const artifactPath = join(root, "release", "GeoChat Desktop-0.1.1-arm64-mac.zip");
  writeFileSync(artifactPath, "zip payload");
  if (options.staleArtifact) {
    const staleTime = new Date("2001-01-01T00:00:00.000Z");
    utimesSync(artifactPath, staleTime, staleTime);
  }
}

async function runEvidence(
  root: string,
  options: { githubSummaryPath?: string; json?: boolean; jsonOutPath?: string } = {}
) {
  const args = [process.execPath, "scripts/write-app-bundle-evidence.mjs"];
  if (options.githubSummaryPath) args.push("--github-summary");
  if (options.json) args.push("--json");
  if (options.jsonOutPath) args.push("--json-out", options.jsonOutPath);
  const proc = Bun.spawn(args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GEOCHAT_APP_BUNDLE_ROOT: root,
      GEOCHAT_RELEASE_ROOT: join(root, "release"),
      ...(options.githubSummaryPath ? { GITHUB_STEP_SUMMARY: options.githubSummaryPath } : {})
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

async function runEvidenceChecker(root: string, evidencePath: string, options: { requirePackage?: boolean } = {}) {
  const proc = Bun.spawn(
    [
      process.execPath,
      "scripts/check-app-bundle-evidence.mjs",
      evidencePath,
      ...(options.requirePackage ? ["--require-package"] : [])
    ],
    {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GEOCHAT_APP_BUNDLE_MANIFEST_PATH: join(root, "app-bundle-manifest.json")
    },
    stdout: "pipe",
    stderr: "pipe"
    }
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  return { stdout, stderr, exitCode };
}

describe("app bundle evidence writer", () => {
  test("prints a markdown summary for a valid app bundle", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-ok-"));
    try {
      writeEvidenceBundle(root);
      const result = await runEvidence(root);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("## GeoChat App Bundle Evidence");
      expect(result.stdout).toContain("0.1.1+evidence-test");
      expect(result.stdout).toContain("Runtime included in app-bundle manifest: `no`");
      expect(result.stdout).toContain("Backend build touches runtime: `no`");
      expect(result.stdout).toContain("| Backend bundle | `bun scripts/build-backend-bundle.mjs` | no runtime/vendor staging |");
      expect(result.stdout).toContain("| Runtime sidecar | `bun scripts/stage-runtime-sidecar.mjs` | copies Bun executable only |");
      expect(result.stdout).toContain("| `backend` | 1 |");
      expect(result.stdout).toContain("| `renderer` | 1 |");
      expect(result.stdout).toContain("| `vendor` | 1 |");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects evidence when runtime files appear in the app bundle manifest", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-runtime-"));
    try {
      writeEvidenceBundle(root, true);
      const result = await runEvidence(root);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Runtime assets must not be app-bundle evidence assets");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("appends the markdown summary to GitHub step summary when requested", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-summary-"));
    const summaryPath = join(root, "github-step-summary.md");
    try {
      writeEvidenceBundle(root);
      const result = await runEvidence(root, { githubSummaryPath: summaryPath });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("");
      expect(existsSync(summaryPath)).toBe(true);
      const summary = readFileSync(summaryPath, "utf8");
      expect(summary).toContain("## GeoChat App Bundle Evidence");
      expect(summary).toContain("0.1.1+evidence-test");
      expect(summary).toContain("Runtime included in app-bundle manifest: `no`");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("prints machine-readable JSON evidence when requested", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-json-"));
    try {
      writeEvidenceBundle(root);
      writeReleaseEvidence(root);
      const result = await runEvidence(root, { json: true });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const evidence = JSON.parse(result.stdout) as {
        kind?: string;
        bundleVersion?: string;
        buildBoundary?: {
          scripts?: { backend?: string; runtime?: string; vendor?: string };
          appBundleRoots?: string[];
          runtimeExcludedFromAppBundle?: boolean;
          backendBuildTouchesRuntime?: boolean;
          backendBuildTouchesVendor?: boolean;
          runtimeStageCopiesBun?: boolean;
          runtimeStageTouchesBackend?: boolean;
          vendorStageCopiesVendor?: boolean;
          vendorStageTouchesBackend?: boolean;
        };
        manifest?: {
          runtimeIncluded?: boolean;
        assetRoots?: Record<string, number>;
          sha256?: string;
        };
        packagedResourceRoots?: Array<{ path?: string; runtimePath?: string | null }>;
        installerArtifacts?: Array<{ path?: string; sizeBytes?: number; sha256?: string; modifiedAtMs?: number }>;
      };

      expect(evidence.kind).toBe("geochat-app-bundle-evidence");
      expect(evidence.bundleVersion).toBe("0.1.1+evidence-test");
      expect(evidence.buildBoundary).toMatchObject({
        scripts: {
          backend: "bun scripts/build-backend-bundle.mjs",
          runtime: "bun scripts/stage-runtime-sidecar.mjs",
          vendor: "bun scripts/stage-vendor-bundle.mjs"
        },
        appBundleRoots: ["backend", "renderer", "vendor"],
        runtimeExcludedFromAppBundle: true,
        backendBuildTouchesRuntime: false,
        backendBuildTouchesVendor: false,
        runtimeStageCopiesBun: true,
        runtimeStageTouchesBackend: false,
        vendorStageCopiesVendor: true,
        vendorStageTouchesBackend: false
      });
      expect(evidence.manifest?.runtimeIncluded).toBe(false);
      expect(evidence.manifest?.assetRoots).toEqual({ backend: 1, renderer: 1, vendor: 1 });
      expect(evidence.manifest?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(evidence.packagedResourceRoots?.[0]?.runtimePath).toContain("runtime/bun");
      expect(evidence.packagedResourceRoots?.[0]).toMatchObject({
        manifestPath: expect.stringContaining("app-bundle-manifest.json"),
        manifestSha256: evidence.manifest?.sha256
      });
      expect(evidence.installerArtifacts?.[0]?.path).toEndWith("release/GeoChat Desktop-0.1.1-arm64-mac.zip");
      expect(evidence.installerArtifacts?.[0]).toMatchObject({
        sizeBytes: "zip payload".length,
        sha256: sha256("zip payload"),
        modifiedAtMs: expect.any(Number)
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ignores helper executables inside unpacked package resource directories", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-helper-exe-"));
    try {
      writeEvidenceBundle(root);
      writeReleaseEvidence(root);
      mkdirSync(join(root, "release", "win-unpacked", "resources"), { recursive: true });
      writeFileSync(join(root, "release", "win-unpacked", "resources", "elevate.exe"), "helper exe");

      const result = await runEvidence(root, { json: true });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const evidence = JSON.parse(result.stdout) as {
        installerArtifacts?: Array<{ path?: string }>;
      };

      expect(evidence.installerArtifacts?.map((artifact) => artifact.path)).toEqual([
        expect.stringContaining("GeoChat Desktop-0.1.1-arm64-mac.zip")
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("can write GitHub markdown and JSON evidence files in the same run", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-files-"));
    const summaryPath = join(root, "github-step-summary.md");
    const jsonOutPath = join(root, "dist", "app-bundle-evidence.json");
    try {
      writeEvidenceBundle(root);
      const result = await runEvidence(root, { githubSummaryPath: summaryPath, jsonOutPath });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("");
      expect(readFileSync(summaryPath, "utf8")).toContain("## GeoChat App Bundle Evidence");
      const evidence = JSON.parse(readFileSync(jsonOutPath, "utf8")) as { bundleVersion?: string };
      expect(evidence.bundleVersion).toBe("0.1.1+evidence-test");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("checker accepts evidence that proves only Bun is the fixed sidecar", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-check-ok-"));
    const jsonOutPath = join(root, "dist", "app-bundle-evidence.json");
    try {
      writeEvidenceBundle(root);
      writeReleaseEvidence(root);
      const writeResult = await runEvidence(root, { jsonOutPath });
      expect(writeResult.exitCode).toBe(0);

      const checkResult = await runEvidenceChecker(root, jsonOutPath, { requirePackage: true });
      expect(checkResult.exitCode).toBe(0);
      expect(checkResult.stderr).toBe("");
      expect(checkResult.stdout).toContain("App-bundle evidence ok");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("checker accepts Windows-style packaged runtime paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-check-windows-path-"));
    const jsonOutPath = join(root, "dist", "app-bundle-evidence.json");
    try {
      writeEvidenceBundle(root);
      writeReleaseEvidence(root);
      const writeResult = await runEvidence(root, { jsonOutPath });
      expect(writeResult.exitCode).toBe(0);

      const evidence = JSON.parse(readFileSync(jsonOutPath, "utf8")) as {
        packagedResourceRoots: Array<{ runtimePath: string }>;
      };
      evidence.packagedResourceRoots[0].runtimePath = "release\\win-unpacked\\resources\\runtime\\bun.exe";
      writeFileSync(jsonOutPath, JSON.stringify(evidence, null, 2));

      const checkResult = await runEvidenceChecker(root, jsonOutPath, { requirePackage: true });
      expect(checkResult.exitCode).toBe(0);
      expect(checkResult.stderr).toBe("");
      expect(checkResult.stdout).toContain("App-bundle evidence ok");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("checker accepts app-bundle-only evidence before installer artifacts exist", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-check-bundle-only-"));
    const jsonOutPath = join(root, "dist", "app-bundle-evidence.json");
    try {
      writeEvidenceBundle(root);
      const writeResult = await runEvidence(root, { jsonOutPath });
      expect(writeResult.exitCode).toBe(0);

      const checkResult = await runEvidenceChecker(root, jsonOutPath);
      expect(checkResult.exitCode).toBe(0);
      expect(checkResult.stderr).toBe("");
      expect(checkResult.stdout).toContain("App-bundle evidence ok");

      const strictResult = await runEvidenceChecker(root, jsonOutPath, { requirePackage: true });
      expect(strictResult.exitCode).toBe(1);
      expect(strictResult.stderr).toContain("Evidence must include at least one packaged resource root");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("checker ignores stale packaged output unless package proof is required", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-check-stale-package-"));
    const jsonOutPath = join(root, "dist", "app-bundle-evidence.json");
    try {
      writeEvidenceBundle(root);
      writeReleaseEvidence(root);
      writeFileSync(join(root, "backend", "backend.bundle.js"), 'console.log("new backend");\n');
      writeFileSync(
        join(root, "app-bundle-manifest.json"),
        JSON.stringify(
          {
            kind: "geochat-app-bundle",
            bundleVersion: "0.1.1+new-bundle",
            shellVersion: "0.1.1",
            backend: { entry: "backend/backend.bundle.js" },
            renderer: { entry: "renderer/index.html" },
            assets: [
              { path: "backend/backend.bundle.js", sha256: sha256('console.log("new backend");\n') },
              { path: "renderer/index.html", sha256: sha256("<!doctype html><title>renderer</title>\n") },
              { path: "vendor/geogebra/deployggb.js", sha256: sha256("vendor payload\n") }
            ]
          },
          null,
          2
        )
      );

      const writeResult = await runEvidence(root, { jsonOutPath });
      expect(writeResult.exitCode).toBe(0);

      const checkResult = await runEvidenceChecker(root, jsonOutPath);
      expect(checkResult.exitCode).toBe(0);
      expect(checkResult.stderr).toBe("");

      const strictResult = await runEvidenceChecker(root, jsonOutPath, { requirePackage: true });
      expect(strictResult.exitCode).toBe(1);
      expect(strictResult.stderr).toContain("Packaged resource manifest does not match the built manifest");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("checker rejects evidence that does not include the replaceable vendor root", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-check-vendor-"));
    const jsonOutPath = join(root, "app-bundle-evidence.json");
    try {
      writeEvidenceBundle(root);
      writeReleaseEvidence(root);
      const writeResult = await runEvidence(root, { jsonOutPath });
      expect(writeResult.exitCode).toBe(0);

      const evidence = JSON.parse(readFileSync(jsonOutPath, "utf8")) as {
        manifest: { assetRoots: Record<string, number> };
      };
      delete evidence.manifest.assetRoots.vendor;
      writeFileSync(jsonOutPath, JSON.stringify(evidence, null, 2));

      const checkResult = await runEvidenceChecker(root, jsonOutPath);
      expect(checkResult.exitCode).toBe(1);
      expect(checkResult.stderr).toContain("Missing evidence asset root: vendor");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("checker rejects evidence whose backend build step owns runtime staging", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-check-build-boundary-"));
    const jsonOutPath = join(root, "app-bundle-evidence.json");
    try {
      writeEvidenceBundle(root);
      writeReleaseEvidence(root);
      const writeResult = await runEvidence(root, { jsonOutPath });
      expect(writeResult.exitCode).toBe(0);

      const evidence = JSON.parse(readFileSync(jsonOutPath, "utf8")) as {
        buildBoundary: { backendBuildTouchesRuntime: boolean };
      };
      evidence.buildBoundary.backendBuildTouchesRuntime = true;
      writeFileSync(jsonOutPath, JSON.stringify(evidence, null, 2));

      const checkResult = await runEvidenceChecker(root, jsonOutPath);
      expect(checkResult.exitCode).toBe(1);
      expect(checkResult.stderr).toContain("Backend build must not stage the Bun runtime sidecar");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("checker rejects installer artifacts older than the packaged app bundle manifest", async () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-evidence-check-stale-artifact-"));
    const jsonOutPath = join(root, "app-bundle-evidence.json");
    try {
      writeEvidenceBundle(root);
      writeReleaseEvidence(root, { staleArtifact: true });
      const writeResult = await runEvidence(root, { jsonOutPath });
      expect(writeResult.exitCode).toBe(0);

      const checkResult = await runEvidenceChecker(root, jsonOutPath, { requirePackage: true });
      expect(checkResult.exitCode).toBe(1);
      expect(checkResult.stderr).toContain("Installer artifact appears stale relative to the packaged app bundle manifest");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
