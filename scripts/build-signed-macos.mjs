import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runCommand, verifyMacosRelease } from "./verify-macos-release.mjs";

const requiredSecrets = [
  "APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_SIGNING_IDENTITY",
  "APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID",
];

export function assertSigningCredentials(environment) {
  for (const key of requiredSecrets) {
    if (!environment[key]?.trim()) throw new Error(`Missing macOS release secret: ${key}`);
  }
  const encoded = environment.APPLE_CERTIFICATE.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0 ||
    Buffer.from(encoded, "base64").toString("base64") !== encoded) {
    throw new Error("APPLE_CERTIFICATE must contain the Base64-encoded .p12 file.");
  }
  if (!environment.APPLE_SIGNING_IDENTITY.startsWith("Developer ID Application: ")) {
    throw new Error("APPLE_SIGNING_IDENTITY must be a Developer ID Application identity.");
  }
  if (!/^[A-Z0-9]{10}$/.test(environment.APPLE_TEAM_ID) ||
    !environment.APPLE_SIGNING_IDENTITY.endsWith(` (${environment.APPLE_TEAM_ID})`)) {
    throw new Error("Signing identity and Apple Team ID do not match.");
  }
}

export function buildSignedMacos({
  cwd = process.cwd(), environment = process.env, platform = process.platform,
  run = runCommand, verify = verifyMacosRelease,
} = {}) {
  assertSigningCredentials(environment);
  if (platform !== "darwin") throw new Error("Developer ID packaging requires macOS.");
  const buildEnvironment = { ...environment };
  // Frontend/backend build hooks do not need certificate or notarization secrets.
  for (const key of Object.keys(buildEnvironment)) {
    if (key.startsWith("APPLE_")) delete buildEnvironment[key];
  }
  const signedEnvironment = {
    ...buildEnvironment,
    APPLE_SIGNING_IDENTITY: environment.APPLE_SIGNING_IDENTITY,
    APPLE_ID: environment.APPLE_ID,
    APPLE_PASSWORD: environment.APPLE_PASSWORD,
    APPLE_TEAM_ID: environment.APPLE_TEAM_ID,
  };
  const execute = (command, args, visible = false) => run(command, args, {
    cwd, environment: buildEnvironment, visible,
  });
  // Compile before importing the signing key. Cargo and dependency build scripts
  // must never receive notarization credentials or an unlocked signing keychain.
  execute("bun", ["run", "tauri:prepare"], true);
  execute("bunx", ["tauri", "build", "--ci", "--no-bundle", "--config",
    JSON.stringify({ build: { beforeBuildCommand: "" } })], true);
  const keychains = execute("security", ["list-keychains", "-d", "user"]).stdout
    .split("\n").map((line) => line.trim().replace(/^"|"$/g, "")).filter(Boolean);
  const directory = mkdtempSync(join(environment.RUNNER_TEMP || tmpdir(), "geochat-signing-"));
  const keychain = join(directory, "signing.keychain-db");
  const certificate = join(directory, "certificate.p12");
  const password = randomBytes(32).toString("hex");
  let keychainAttempted = false;
  let searchListChanged = false;
  let failure;
  let evidence;
  try {
    writeFileSync(certificate, Buffer.from(environment.APPLE_CERTIFICATE.replace(/\s/g, ""), "base64"), { mode: 0o600 });
    keychainAttempted = true;
    execute("security", ["create-keychain", "-p", password, keychain]);
    execute("security", ["set-keychain-settings", "-lut", "21600", keychain]);
    execute("security", ["unlock-keychain", "-p", password, keychain]);
    execute("security", ["import", certificate, "-P", environment.APPLE_CERTIFICATE_PASSWORD,
      "-T", "/usr/bin/codesign", "-k", keychain]);
    execute("security", ["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", password, keychain]);
    unlinkSync(certificate);
    const identities = execute("security", ["find-identity", "-v", "-p", "codesigning", keychain]).stdout;
    if (!identities.includes(`"${environment.APPLE_SIGNING_IDENTITY}"`)) {
      throw new Error("Imported .p12 has no valid private-key signing identity matching APPLE_SIGNING_IDENTITY.");
    }
    searchListChanged = true;
    execute("security", ["list-keychains", "-d", "user", "-s", keychain, ...keychains]);
    const runtime = join(cwd, "dist/runtime/bun");
    if (!existsSync(runtime)) throw new Error("Prepared Bun runtime is missing.");
    execute("codesign", ["--force", "--sign", environment.APPLE_SIGNING_IDENTITY,
      "--keychain", keychain, "--timestamp", "--options", "runtime",
      "--entitlements", join(cwd, "src-tauri/Bun.entitlements.plist"), runtime]);
    // Identity-only certificate env reuses our keychain instead of importing twice.
    // Only the pinned bundler and its signing/notary tools receive account
    // credentials. Disable arbitrary hooks and capture output, never stream it.
    run("bunx", ["tauri", "bundle", "--ci", "--bundles", "app,dmg", "--config",
      JSON.stringify({ build: { beforeBundleCommand: "" } })], {
      cwd, environment: signedEnvironment, visible: false,
    });
    evidence = verify({ cwd, environment: signedEnvironment, run });
  } catch (error) {
    failure = error;
  } finally {
    for (const args of [
      ...(searchListChanged ? [["list-keychains", "-d", "user", "-s", ...keychains]] : []),
      ...(keychainAttempted ? [["delete-keychain", keychain]] : []),
    ]) {
      try { execute("security", args); } catch { failure ??= new Error("Temporary signing keychain cleanup failed."); }
    }
    rmSync(directory, { recursive: true, force: true });
  }
  if (failure) throw failure;
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    buildSignedMacos();
    console.log("macOS release signing, notarization and Gatekeeper checks passed.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
