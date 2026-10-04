import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function runCommand(command, args, { cwd, environment = process.env, visible = false } = {}) {
  const result = spawnSync(command, args, {
    cwd, env: environment, encoding: "utf8", stdio: visible ? "inherit" : "pipe", maxBuffer: 16 * 1024 * 1024,
  });
  // Never include full arguments or child stderr: security/notarytool take passwords.
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args[0] || ""} failed (${result.error?.code || result.status || result.signal}).`);
  }
  return { stdout: result.stdout || "", stderr: result.stderr || "" };
}

export function verifyMacosRelease({ cwd = process.cwd(), environment = process.env, run = runCommand } = {}) {
  const app = join(cwd, "src-tauri/target/release/bundle/macos/GeoChat.app");
  const dmgDirectory = join(cwd, "src-tauri/target/release/bundle/dmg");
  const images = readdirSync(dmgDirectory).filter((name) => name.endsWith(".dmg"));
  if (images.length !== 1) throw new Error("Expected exactly one macOS release DMG.");
  const dmg = join(dmgDirectory, images[0]);
  const toolEnvironment = { ...environment };
  for (const key of Object.keys(toolEnvironment)) {
    if (key.startsWith("APPLE_")) delete toolEnvironment[key];
  }
  const execute = (command, args) => run(command, args, { cwd, environment: toolEnvironment });
  const identity = environment.APPLE_SIGNING_IDENTITY;
  const teamId = environment.APPLE_TEAM_ID;
  if (!identity || !teamId) throw new Error("Missing expected Developer ID signing identity or Team ID.");
  const metadata = (path, runtimeRequired) => {
    const result = execute("codesign", ["--display", "--verbose=4", path]);
    const output = `${result.stdout}\n${result.stderr}`;
    if (!output.split("\n").includes(`Authority=${identity}`) ||
      !output.split("\n").includes(`TeamIdentifier=${teamId}`) ||
      !/^Timestamp=.+$/m.test(output) || output.includes("Signature=adhoc") ||
      (runtimeRequired && !/flags=.*\(.*runtime.*\)/.test(output))) {
      throw new Error(`Invalid Developer ID signature, timestamp or hardened runtime: ${relative(cwd, path)}`);
    }
  };
  const appPaths = (path) => ({
    executable: join(path, "Contents/MacOS/geochat-desktop-tauri"),
    runtime: join(path, "Contents/Resources/_up_/dist/runtime/bun"),
    resourceSeal: join(path, "Contents/_CodeSignature/CodeResources"),
  });
  const checkApp = (path) => {
    const paths = appPaths(path);
    for (const item of [path, paths.executable, paths.runtime]) {
      if (!existsSync(item)) throw new Error(`Missing signed package target: ${relative(cwd, item)}`);
      execute("codesign", ["--verify", "--deep", "--strict", item]);
      metadata(item, true);
    }
    const entitlementResult = execute("codesign", ["--display", "--entitlements", "-", "--xml", paths.runtime]);
    const entitlements = `${entitlementResult.stdout}\n${entitlementResult.stderr}`;
    for (const name of ["allow-jit", "allow-unsigned-executable-memory", "disable-executable-page-protection",
      "allow-dyld-environment-variables", "disable-library-validation"]) {
      const key = `com.apple.security.cs.${name}`.replaceAll(".", "\\.");
      if (!new RegExp(`<key>${key}</key>\\s*<true\\s*/>`).test(entitlements)) {
        throw new Error(`Packaged Bun is missing its ${name} entitlement.`);
      }
    }
    execute("xcrun", ["stapler", "validate", path]);
    execute("spctl", ["--assess", "--type", "execute", "--verbose=4", path]);
    return paths;
  };
  const original = checkApp(app);
  execute("codesign", ["--verify", "--strict", dmg]);
  metadata(dmg, false);
  execute("hdiutil", ["verify", dmg]);
  for (const key of ["APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"]) {
    if (!environment[key]?.trim()) throw new Error(`Missing notarization credential: ${key}`);
  }
  const submit = execute("xcrun", ["notarytool", "submit", dmg, "--apple-id", environment.APPLE_ID,
    "--password", environment.APPLE_PASSWORD, "--team-id", teamId, "--wait", "--output-format", "json"]);
  let notarization;
  try { notarization = JSON.parse(submit.stdout); } catch { throw new Error("Invalid DMG notarization response."); }
  if (notarization.status !== "Accepted" || typeof notarization.id !== "string" || !notarization.id) {
    throw new Error("Apple did not accept DMG notarization. Inspect its submission in Apple's notarization history.");
  }
  execute("xcrun", ["stapler", "staple", dmg]);
  execute("xcrun", ["stapler", "validate", dmg]);
  execute("codesign", ["--verify", "--strict", dmg]);
  execute("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", dmg]);

  const mount = mkdtempSync(join(environment.RUNNER_TEMP || tmpdir(), "geochat-dmg-verify-"));
  let attachmentAttempted = false;
  let mountFailure;
  try {
    attachmentAttempted = true;
    execute("hdiutil", ["attach", dmg, "-readonly", "-nobrowse", "-mountpoint", mount]);
    const embedded = checkApp(join(mount, "GeoChat.app"));
    for (const key of ["executable", "runtime", "resourceSeal"]) {
      if (hash(original[key]) !== hash(embedded[key])) throw new Error(`DMG contains a different ${key}.`);
    }
  } catch (error) {
    mountFailure = error;
  } finally {
    let detached = !attachmentAttempted;
    // attach can mount successfully and still report a command failure.
    if (attachmentAttempted) {
      try {
        execute("hdiutil", ["detach", mount]);
        detached = true;
      } catch {
        mountFailure ??= new Error("Disk image detach failed; its mountpoint was left untouched.");
      }
    }
    if (detached) rmdirSync(mount);
  }
  if (mountFailure) throw mountFailure;
  const evidence = {
    kind: "geochat-macos-release-signing-evidence", status: "complete",
    appPath: relative(cwd, app), dmgPath: relative(cwd, dmg),
    teamId, signingIdentity: identity, notarizationId: notarization.id,
    checks: ["app-and-bun-developer-id", "secure-timestamps", "hardened-runtime", "bun-entitlements",
      "app-staple", "app-gatekeeper", "dmg-notarization", "dmg-staple", "dmg-gatekeeper", "embedded-app-and-bun"],
    dmgSha256: hash(dmg),
  };
  const evidencePath = resolve(cwd, ".artifacts/package-smoke/signing-macos.json");
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
