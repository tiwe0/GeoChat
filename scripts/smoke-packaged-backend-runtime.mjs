import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function runPackagedBackendSmoke(
  args = process.argv.slice(2),
  environment = process.env,
) {
  const jsonOutIndex = args.indexOf("--json-out");
  const jsonOutArg = jsonOutIndex >= 0 ? args[jsonOutIndex + 1] : undefined;
  if (jsonOutIndex >= 0 && (!jsonOutArg || jsonOutArg.startsWith("--"))) {
    throw new Error("Missing path after --json-out.");
  }
  const positionalArgs = args.filter((argument, index) => (
    argument !== "--"
    && argument !== "--json-out"
    && index !== jsonOutIndex + 1
  ));
  const explicitRoots = [
    ...positionalArgs,
    ...(environment.GEOCHAT_PACKAGED_RESOURCES_ROOT ? [environment.GEOCHAT_PACKAGED_RESOURCES_ROOT] : [])
  ].filter(Boolean);
  const resourceRoots = explicitRoots.length > 0 ? explicitRoots.map((root) => resolve(root)) : discoverResourceRoots();

  if (resourceRoots.length === 0) {
    throw new Error("No packaged resources root found. Pass GEOCHAT_PACKAGED_RESOURCES_ROOT or a path argument.");
  }

  const checks = [];
  for (const root of resourceRoots) {
    checks.push(await smokeBackendRuntime(root));
  }
  const evidence = {
    kind: "geochat-packaged-backend-smoke-evidence",
    status: "complete",
    checks,
  };
  const jsonOut = jsonOutArg ?? environment.GEOCHAT_PACKAGED_BACKEND_EVIDENCE_PATH;
  if (jsonOut) writePackagedBackendSmokeEvidence(jsonOut, evidence);
  return evidence;
}

export function writePackagedBackendSmokeEvidence(path, evidence) {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
}

function discoverResourceRoots() {
  const matches = [];
  const stack = [resolve("release"), resolve("src-tauri/target/release")];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (existsDirectory(current) && existsFile(join(current, "app-bundle-manifest.json"))) {
      matches.push(current);
      continue;
    }
    if (!existsDirectory(current)) continue;
    for (const entry of readdirSync(current)) {
      const absolute = join(current, entry);
      if (statSync(absolute).isDirectory()) stack.push(absolute);
    }
  }
  const uniqueMatches = [...new Set(matches)].sort();
  const tauriMatches = uniqueMatches.filter((match) => match.includes("src-tauri/target/release"));
  return tauriMatches.length > 0 ? tauriMatches : uniqueMatches;
}

async function smokeBackendRuntime(root) {
  const manifest = JSON.parse(readFileSync(join(root, "app-bundle-manifest.json"), "utf8"));
  const runtimeName = process.platform === "win32" ? "bun.exe" : "bun";
  const runtime = join(root, "runtime", runtimeName);
  const backendEntry = join(root, manifest.backend?.entry ?? "backend/backend.bundle.js");
  const port = await bindEphemeralLoopbackPort();
  const tmp = mkdtempSync(join(tmpdir(), "geochat-packaged-backend-"));
  const authToken = "packaged-backend-smoke";
  const child = spawn(runtime, [backendEntry], {
    cwd: root,
    env: {
      ...process.env,
      GEOCHAT_DESKTOP_BACKEND_HOST: "127.0.0.1",
      GEOCHAT_DESKTOP_BACKEND_PORT: String(port),
      GEOCHAT_DESKTOP_RESOURCE_ROOT: root,
      GEOCHAT_DESKTOP_DB_PATH: join(tmp, "geochat-desktop.sqlite"),
      GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN: authToken
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  let evidence;
  try {
    const origin = `http://127.0.0.1:${port}`;
    const healthStatus = await waitForHealth(`${origin}/health`, child);
    const authentication = await verifyAuthenticationBoundary(origin, authToken);
    console.log(`Packaged backend runtime ok: ${root}`);
    evidence = {
      status: "complete",
      resourceRoot: relative(process.cwd(), root),
      runtime: relative(process.cwd(), runtime),
      backendEntry: relative(process.cwd(), backendEntry),
      health: { status: healthStatus },
      authentication,
      sha256: {
        manifest: sha256File(join(root, "app-bundle-manifest.json")),
        runtime: sha256File(runtime),
        backendEntry: sha256File(backendEntry),
      },
    };
  } finally {
    await stopChild(child);
    rmSync(tmp, { recursive: true, force: true });
  }

  if (child.exitCode !== null && child.exitCode !== 0) {
    fail(`Packaged backend exited with code ${child.exitCode}.\n${stderr}`);
  }
  return evidence;
}

export async function verifyAuthenticationBoundary(origin, authToken) {
  const conversationsUrl = `${origin}/v1/conversations`;
  const missing = await fetch(conversationsUrl, { signal: AbortSignal.timeout(2_000) });
  if (missing.status !== 401) {
    throw new Error(`Packaged backend accepted a protected route without authentication: status=${missing.status}.`);
  }

  const incorrect = await fetch(conversationsUrl, {
    headers: { authorization: "Bearer incorrect-packaged-smoke-token" },
    signal: AbortSignal.timeout(2_000),
  });
  if (incorrect.status !== 401) {
    throw new Error(`Packaged backend accepted an incorrect bearer token: status=${incorrect.status}.`);
  }

  const authorized = await fetch(conversationsUrl, {
    headers: { authorization: `Bearer ${authToken}` },
    signal: AbortSignal.timeout(2_000),
  });
  if (!authorized.ok) {
    throw new Error(`Packaged backend rejected its injected bearer token: status=${authorized.status}.`);
  }
  return {
    missingTokenStatus: missing.status,
    incorrectTokenStatus: incorrect.status,
    authorizedStatus: authorized.status,
  };
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 12000;
  let exitMessage = null;
  child.once("exit", (code, signal) => {
    exitMessage = `code=${code ?? "null"} signal=${signal ?? "null"}`;
  });

  while (Date.now() < deadline) {
    if (exitMessage) {
      throw new Error(`Packaged backend exited before health check passed: ${exitMessage}`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (response.ok) return response.status;
    } catch {
      // Keep polling until the backend has finished booting or exits.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }

  throw new Error("Packaged backend did not pass health check within 12000ms.");
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function bindEphemeralLoopbackPort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => {
        if (port > 0) resolvePort(port);
        else reject(new Error("Failed to allocate a loopback port."));
      });
    });
  });
}

async function stopChild(child) {
  if (child.killed || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolveStop) => {
    const timer = setTimeout(resolveStop, 2000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveStop();
    });
    child.kill();
  });
}

function existsDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function existsFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const invokedPath = process.argv[1] && statSync(process.argv[1], { throwIfNoEntry: false })?.isFile()
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    await runPackagedBackendSmoke();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
