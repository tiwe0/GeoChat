import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STARTUP_TIMEOUT_MS = 20_000;

export async function runPackagedAppLaunchSmoke(
  args = process.argv.slice(2),
  environment = process.env,
) {
  const options = parseOptions(args, environment);
  const appPath = resolve(options.appPath ?? discoverPackagedAppPath());
  const executable = resolvePackagedExecutable(appPath);
  assertFile(executable, "packaged Tauri executable");

  const port = await bindEphemeralLoopbackPort();
  const temporaryRoot = mkdtempSync(join(tmpdir(), "geochat-packaged-launch-"));
  const userDataDir = join(temporaryRoot, "user-data");
  mkdirSync(userDataDir, { recursive: true });

  const childEnvironment = isolatedLaunchEnvironment(environment, userDataDir, port);
  const child = spawn(executable, [], {
    cwd: dirname(executable),
    detached: process.platform !== "win32",
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const output = captureOutput(child);
  let boundary;
  let cleanup;

  try {
    await waitForSpawn(child);
    boundary = await verifyLaunchedBackendBoundary(`http://127.0.0.1:${port}`, child);
  } catch (error) {
    throw addLaunchDiagnostics(error, output);
  } finally {
    cleanup = await cleanupLaunchedApp(child, port, temporaryRoot);
  }

  if (!cleanup.appStopped || !cleanup.backendPortReleased || !cleanup.userDataRemoved) {
    throw new Error(`Packaged app launch cleanup failed: ${JSON.stringify(cleanup)}`);
  }

  const launchTarget = describeLaunchTarget(process.platform, appPath, executable);
  const evidence = {
    kind: "geochat-platform-launch-target-smoke-evidence",
    status: "complete",
    platform: process.platform,
    arch: process.arch,
    launchTarget,
    launch: {
      isolatedUserData: true,
      providerRequestsMade: false,
      stayedRunningThroughChecks: boundary.stayedRunningThroughChecks,
    },
    backend: {
      healthStatus: boundary.healthStatus,
      missingTokenStatus: boundary.missingTokenStatus,
      incorrectTokenStatus: boundary.incorrectTokenStatus,
    },
    cleanup,
    installer: {
      installationVerified: false,
      postInstallLaunchVerified: false,
    },
    sha256: {
      executable: sha256File(executable),
    },
  };

  if (options.jsonOut) writePackagedAppLaunchEvidence(options.jsonOut, evidence);
  console.log(`Platform launch target ok (${launchTarget.kind}): ${launchTarget.path}`);
  console.log("- Backend health: 200");
  console.log("- Protected route without/with incorrect token: 401/401");
  console.log("- App process, backend process, and isolated user data cleaned");
  return evidence;
}

export function describeLaunchTarget(platform, appPath, executable) {
  const path = relative(process.cwd(), executable);
  if (platform === "darwin") {
    return {
      kind: "macos-app-bundle-executable",
      path,
      containerPath: relative(process.cwd(), appPath),
    };
  }
  if (platform === "win32") {
    return {
      kind: "windows-release-build-executable",
      path,
    };
  }
  return {
    kind: "release-build-executable",
    path,
  };
}

export async function verifyLaunchedBackendBoundary(origin, child, timeoutMs = STARTUP_TIMEOUT_MS) {
  const healthStatus = await waitForHealth(`${origin}/health`, child, timeoutMs);
  const conversationsUrl = `${origin}/v1/conversations`;
  const missing = await fetch(conversationsUrl, { signal: AbortSignal.timeout(2_000) });
  if (missing.status !== 401) {
    throw new Error(`Launched packaged backend accepted a protected route without authentication: status=${missing.status}.`);
  }
  const incorrect = await fetch(conversationsUrl, {
    headers: { authorization: "Bearer incorrect-packaged-launch-smoke-token" },
    signal: AbortSignal.timeout(2_000),
  });
  if (incorrect.status !== 401) {
    throw new Error(`Launched packaged backend accepted an incorrect bearer token: status=${incorrect.status}.`);
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error("Packaged app exited before its backend boundary checks completed.");
  }
  return {
    healthStatus,
    missingTokenStatus: missing.status,
    incorrectTokenStatus: incorrect.status,
    stayedRunningThroughChecks: true,
  };
}

export function writePackagedAppLaunchEvidence(path, evidence) {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
}

function parseOptions(args, environment) {
  const appPath = valueAfter(args, "--app") ?? environment.GEOCHAT_PACKAGED_APP_PATH;
  const jsonOut = valueAfter(args, "--json-out") ?? environment.GEOCHAT_PACKAGED_LAUNCH_EVIDENCE_PATH;
  for (const flag of ["--app", "--json-out"]) {
    if (args.includes(flag) && !valueAfter(args, flag)) throw new Error(`Missing path after ${flag}.`);
  }
  return { appPath, jsonOut };
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function discoverPackagedAppPath() {
  if (process.platform === "darwin") {
    const root = resolve("src-tauri/target/release/bundle/macos");
    const app = existsSync(root)
      ? readdirSync(root).filter((entry) => entry.endsWith(".app")).sort().at(-1)
      : undefined;
    if (app) return join(root, app);
  }
  const executable = resolve(
    "src-tauri/target/release",
    process.platform === "win32" ? "geochat-desktop-tauri.exe" : "geochat-desktop-tauri",
  );
  if (existsSync(executable)) return executable;
  throw new Error("No packaged Tauri app found. Build it first or pass --app.");
}

function resolvePackagedExecutable(appPath) {
  const stat = statSync(appPath, { throwIfNoEntry: false });
  if (stat?.isFile()) return appPath;
  if (process.platform === "darwin") {
    return join(appPath, "Contents", "MacOS", "geochat-desktop-tauri");
  }
  return join(appPath, "geochat-desktop-tauri.exe");
}

function isolatedLaunchEnvironment(environment, userDataDir, port) {
  const result = { ...environment };
  for (const name of [
    "GEOCHAT_DESKTOP_BACKEND_URL",
    "GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN",
    "GEOCHAT_DESKTOP_DB_PATH",
    "GEOCHAT_DESKTOP_RESOURCE_ROOT",
    "GEOCHAT_APP_BUNDLE_INSTALLED_CLIENT_SMOKE",
    "GEOCHAT_APP_BUNDLE_INSTALLED_CLIENT_SMOKE_CLI",
    "GEOCHAT_APP_BUNDLE_INSTALLED_CLIENT_SMOKE_EXTERNAL_RELAUNCH",
  ]) {
    delete result[name];
  }
  result.GEOCHAT_DESKTOP_USER_DATA_DIR = userDataDir;
  result.GEOCHAT_DESKTOP_BACKEND_PORT = String(port);
  result.GEOCHAT_DESKTOP_MCP_AUTO_START = "0";
  return result;
}

async function waitForHealth(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Packaged app exited before health check passed: code=${child.exitCode} signal=${child.signalCode}.`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (response.ok) return response.status;
    } catch {
      // The native shell and bundled backend are still starting.
    }
    await delay(150);
  }
  throw new Error(`Packaged app backend did not pass /health within ${timeoutMs}ms.`);
}

function captureOutput(child) {
  const output = { stdout: "", stderr: "" };
  child.stdout?.on("data", (chunk) => {
    output.stdout = appendBounded(output.stdout, chunk.toString());
  });
  child.stderr?.on("data", (chunk) => {
    output.stderr = appendBounded(output.stderr, chunk.toString());
  });
  return output;
}

function waitForSpawn(child) {
  return new Promise((resolveSpawn, rejectSpawn) => {
    const onSpawn = () => {
      child.off("error", onError);
      resolveSpawn();
    };
    const onError = (error) => {
      child.off("spawn", onSpawn);
      rejectSpawn(error);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
}

function appendBounded(previous, next) {
  return `${previous}${next}`.slice(-8_000);
}

function addLaunchDiagnostics(error, output) {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostics = [output.stdout.trim(), output.stderr.trim()].filter(Boolean).join("\n");
  return new Error(diagnostics ? `${message}\nPackaged app output:\n${diagnostics}` : message);
}

async function cleanupLaunchedApp(child, port, temporaryRoot) {
  await stopProcessTree(child);
  const backendPortReleased = await waitForPortRelease(port, 5_000);
  rmSync(temporaryRoot, { recursive: true, force: true });
  return {
    appStopped: child.exitCode !== null || child.signalCode !== null,
    backendPortReleased,
    userDataRemoved: !existsSync(temporaryRoot),
  };
}

async function stopProcessTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!Number.isInteger(child.pid)) return;
  if (process.platform === "win32") {
    await runTaskkill(child.pid);
  } else {
    signalProcessGroup(child.pid, "SIGTERM");
  }
  if (await waitForExit(child, 3_000)) return;
  if (process.platform === "win32") {
    await runTaskkill(child.pid);
  } else {
    signalProcessGroup(child.pid, "SIGKILL");
  }
  await waitForExit(child, 2_000);
}

function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function runTaskkill(pid) {
  return new Promise((resolveTaskkill) => {
    const taskkill = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    taskkill.once("error", () => resolveTaskkill());
    taskkill.once("exit", () => resolveTaskkill());
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => resolveExit(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit(true);
    });
  });
}

async function waitForPortRelease(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canBindLoopback(port)) return true;
    await delay(100);
  }
  return false;
}

function bindEphemeralLoopbackPort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => port > 0 ? resolvePort(port) : reject(new Error("Failed to allocate a loopback port.")));
    });
  });
}

function canBindLoopback(port) {
  return new Promise((resolveBind) => {
    const server = createServer();
    server.once("error", () => resolveBind(false));
    server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolveBind(true)));
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertFile(path, label) {
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) throw new Error(`Missing ${label}: ${path}`);
}

const invokedPath = process.argv[1] && statSync(process.argv[1], { throwIfNoEntry: false })?.isFile()
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    await runPackagedAppLaunchSmoke();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
