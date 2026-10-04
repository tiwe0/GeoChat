import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RESULT_PREFIX = "GEOGEBRA_CANVAS_SMOKE_RESULT ";
const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_ROOT, "..");

export function parseSmokeArguments(args) {
  let bundleRoot;
  let app;
  let jsonOut;
  let withoutNonce = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--without-nonce") {
      withoutNonce = true;
      continue;
    }
    if (!["--bundle-root", "--app", "--json-out"].includes(argument)) {
      throw new Error(`Unknown GeoGebra canvas smoke argument: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing path after ${argument}.`);
    index += 1;
    if (argument === "--bundle-root") bundleRoot = value;
    if (argument === "--app") app = value;
    if (argument === "--json-out") jsonOut = value;
  }
  if (Boolean(bundleRoot) === Boolean(app)) {
    throw new Error("Provide exactly one of --bundle-root or --app.");
  }
  if (!jsonOut) throw new Error("Missing required --json-out path.");
  return { bundleRoot, app, jsonOut, withoutNonce };
}

export function resolveSmokeBundleRoot(options) {
  return resolve(options.bundleRoot
    ?? join(options.app, "Contents", "Resources", "_up_", "dist"));
}

export function loadProductionCsp(repositoryRoot = REPOSITORY_ROOT) {
  const config = JSON.parse(readFileSync(join(repositoryRoot, "src-tauri", "tauri.conf.json"), "utf8"));
  const policy = config?.app?.security?.csp;
  if (typeof policy !== "string" || !policy.trim()) throw new Error("Production Tauri CSP is missing.");
  return policy;
}

export function writeCanvasSmokeEvidence(path, evidence) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(evidence, null, 2)}\n`);
}

export function runGeoGebraCanvasSmoke({
  args = process.argv.slice(2),
  platform = process.platform,
  repositoryRoot = REPOSITORY_ROOT,
} = {}) {
  if (platform !== "darwin") throw new Error("The GeoGebra canvas smoke requires macOS WebKit.");
  const options = parseSmokeArguments(args);
  const bundleRoot = resolveSmokeBundleRoot(options);
  for (const required of [
    "app-bundle-manifest.json",
    "vendor/geogebra/deployggb.js",
    "vendor/geogebra/HTML5/5.0/web3d/web3d.nocache.js",
  ]) {
    if (!existsSync(join(bundleRoot, required))) throw new Error(`Missing packaged GeoGebra asset: ${required}`);
  }

  const buildRoot = mkdtempSync(join(tmpdir(), "geochat-geogebra-canvas-smoke-"));
  const executable = join(buildRoot, "geogebra-canvas-smoke");
  try {
    const compile = spawnSync("xcrun", [
      "swiftc", join(repositoryRoot, "scripts/macos/geogebra-canvas-smoke.swift"),
      "-framework", "AppKit", "-framework", "WebKit", "-o", executable,
    ], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SWIFT_MODULECACHE_PATH: join(buildRoot, "swift-module-cache"),
        CLANG_MODULE_CACHE_PATH: join(buildRoot, "clang-module-cache"),
      },
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    if (compile.error || compile.status !== 0) {
      throw new Error(`Unable to compile the macOS GeoGebra canvas smoke (${compile.error?.code ?? compile.status ?? "unknown"}).`);
    }

    const policy = loadProductionCsp(repositoryRoot);
    const swiftArgs = [
      "--bundle-root", bundleRoot,
      "--csp-base64", Buffer.from(policy, "utf8").toString("base64"),
    ];
    if (options.withoutNonce) swiftArgs.push("--without-nonce");
    const run = spawnSync(executable, swiftArgs, {
      cwd: buildRoot,
      encoding: "utf8",
      timeout: 45_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (run.error?.code === "ETIMEDOUT") throw new Error("GeoGebra canvas smoke process exceeded 45 seconds.");
    const line = (run.stdout ?? "").split(/\r?\n/).find((entry) => entry.startsWith(RESULT_PREFIX));
    if (!line) throw new Error(`GeoGebra canvas smoke produced no structured result (exit ${run.status ?? "unknown"}).`);
    const evidence = JSON.parse(line.slice(RESULT_PREFIX.length));
    writeCanvasSmokeEvidence(options.jsonOut, evidence);
    process.stdout.write(`${evidence.status === "complete" ? "GeoGebra canvas smoke passed" : "GeoGebra canvas smoke failed"}.\n`);
    return { evidence, exitCode: run.status ?? 1 };
  } finally {
    rmSync(buildRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    const result = runGeoGebraCanvasSmoke();
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "GeoGebra canvas smoke failed.");
    process.exitCode = 1;
  }
}
