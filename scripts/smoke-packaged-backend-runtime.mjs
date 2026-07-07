import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const explicitRoots = [
  ...process.argv.slice(2),
  ...(process.env.GEOCHAT_PACKAGED_RESOURCES_ROOT ? [process.env.GEOCHAT_PACKAGED_RESOURCES_ROOT] : [])
].filter(Boolean);
const resourceRoots = explicitRoots.length > 0 ? explicitRoots.map((root) => resolve(root)) : discoverResourceRoots();

if (resourceRoots.length === 0) {
  fail("No packaged resources root found. Pass GEOCHAT_PACKAGED_RESOURCES_ROOT or a path argument.");
}

for (const root of resourceRoots) {
  await smokeBackendRuntime(root);
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
  const child = spawn(runtime, [backendEntry], {
    cwd: root,
    env: {
      ...process.env,
      GEOCHAT_DESKTOP_BACKEND_HOST: "127.0.0.1",
      GEOCHAT_DESKTOP_BACKEND_PORT: String(port),
      GEOCHAT_DESKTOP_RESOURCE_ROOT: root,
      GEOCHAT_DESKTOP_DB_PATH: join(tmp, "geochat-desktop.sqlite"),
      GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN: "packaged-backend-smoke"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealth(`http://127.0.0.1:${port}/health`, child);
    console.log(`Packaged backend runtime ok: ${root}`);
  } finally {
    await stopChild(child);
    rmSync(tmp, { recursive: true, force: true });
  }

  if (child.exitCode !== null && child.exitCode !== 0) {
    fail(`Packaged backend exited with code ${child.exitCode}.\n${stderr}`);
  }
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
      if (response.ok) return;
    } catch {
      // Keep polling until the backend has finished booting or exits.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }

  throw new Error("Packaged backend did not pass health check within 12000ms.");
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
