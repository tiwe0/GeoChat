import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSigningCredentials, buildSignedMacos } from "../scripts/build-signed-macos.mjs";
import { runCommand, verifyMacosRelease } from "../scripts/verify-macos-release.mjs";

const identity = "Developer ID Application: Test Team (ABCDEFGHIJ)";
const credentials = {
  APPLE_CERTIFICATE: Buffer.from("test p12 bytes").toString("base64"),
  APPLE_CERTIFICATE_PASSWORD: "fixture-export-password",
  APPLE_SIGNING_IDENTITY: identity,
  APPLE_ID: "fixture@example.test",
  APPLE_PASSWORD: "fixture-app-password",
  APPLE_TEAM_ID: "ABCDEFGHIJ",
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "geochat-signing-test-"));
  const app = join(root, "src-tauri/target/release/bundle/macos/GeoChat.app");
  const runtime = join(app, "Contents/Resources/_up_/dist/runtime/bun");
  const executable = join(app, "Contents/MacOS/geochat-desktop-tauri");
  const dmg = join(root, "src-tauri/target/release/bundle/dmg/GeoChat.dmg");
  for (const path of [runtime, executable, join(app, "Contents/_CodeSignature/CodeResources"), dmg, join(root, "dist/runtime/bun")]) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "fixture");
  }
  return { root, app, runtime, executable, dmg };
}

function commandFixture(_f: ReturnType<typeof fixture>, fail?: string) {
  const calls: Array<{ command: string; args: string[]; environment?: Record<string, string>; visible?: boolean }> = [];
  const run = (command: string, args: string[], options?: { environment?: Record<string, string>; visible?: boolean }) => {
    calls.push({ command, args, environment: options?.environment, visible: options?.visible });
    if (fail === `${command} ${args[0]}`) throw new Error("fixture command failed");
    let stdout = "";
    let stderr = "";
    if (command === "security" && args[0] === "list-keychains" && !args.includes("-s")) {
      stdout = '    "/tmp/original login.keychain-db"\n';
    }
    if (command === "security" && args[0] === "find-identity") stdout = `1) ABCD "${identity}"`;
    if (command === "codesign" && args.includes("--verbose=4")) {
      stderr = `Authority=${identity}\nTeamIdentifier=ABCDEFGHIJ\nTimestamp=fixture\nflags=0x10000(runtime)\n`;
    }
    if (command === "codesign" && args.includes("--entitlements")) {
      stdout = readFileSync(join(import.meta.dir, "../src-tauri/Bun.entitlements.plist"), "utf8");
    }
    if (command === "xcrun" && args[0] === "notarytool") stdout = '{"id":"fixture-id","status":"Accepted"}';
    if (command === "hdiutil" && args[0] === "attach") {
      const mount = args[args.indexOf("-mountpoint") + 1];
      for (const suffix of ["Contents/MacOS/geochat-desktop-tauri", "Contents/Resources/_up_/dist/runtime/bun", "Contents/_CodeSignature/CodeResources"]) {
        const path = join(mount, "GeoChat.app", suffix);
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, "fixture");
      }
    }
    if (command === "hdiutil" && args[0] === "detach") {
      rmSync(join(args[1], "GeoChat.app"), { recursive: true, force: true });
    }
    return { stdout, stderr };
  };
  return { run, calls };
}

describe("macOS release signing", () => {
  test("keeps local signing exports and keychains out of Git", () => {
    for (const name of ["certificate.p12", "certificate.pfx", "private.pem", "private.key", "signing.keychain", "signing.keychain-db"]) {
      const result = Bun.spawnSync(["git", "check-ignore", "--no-index", "--quiet", `local-signing/${name}`], {
        cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe",
      });
      expect(result.exitCode).toBe(0);
    }
  });

  test("CI exposes signing secrets only after trusted-source validation, never to PRs", () => {
    const workflow = Bun.YAML.parse(readFileSync(join(import.meta.dir, "../.github/workflows/tauri-package.yml"), "utf8"));
    const job = workflow.jobs.package;
    const guard = job.env.MACOS_RELEASE_SIGNING;
    expect(guard).toContain("matrix.platform == 'macos'");
    expect(guard).toContain("github.repository == 'tiwe0/GeoChat'");
    expect(guard).toContain("github.event_name == 'push' || github.event_name == 'workflow_dispatch'");
    expect(guard).toContain("github.ref == 'refs/heads/master'");
    expect(guard).not.toContain("pull_request");
    for (const workflowJob of Object.values(workflow.jobs) as Array<{ steps: Array<{ uses?: string }> }>) {
      for (const step of workflowJob.steps) {
        if (step.uses) expect(step.uses).toMatch(/^[\w-]+\/[\w-]+@[a-f0-9]{40}$/);
      }
    }
    const checkout = job.steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/checkout@"));
    expect(checkout.with["fetch-depth"]).toBe(0);
    const validation = job.steps.findIndex((step: { name: string }) => step.name === "Validate trusted macOS signing source");
    const signedBuild = job.steps.findIndex((step: { name: string }) => step.name === "Build and verify Developer ID macOS bundles");
    expect(validation).toBeGreaterThan(-1);
    expect(signedBuild).toBeGreaterThan(validation);
    expect(job.steps[validation].run).toContain("git merge-base --is-ancestor HEAD origin/master");
    expect(job.steps[validation].if).toContain("github.event_name == 'workflow_dispatch' && inputs.release_tag != ''");
    expect(job.steps[validation].run).toContain("Refusing to publish unsigned macOS installers");
    expect(job.steps[signedBuild].if).toBe("env.MACOS_RELEASE_SIGNING == 'true'");
    for (const [index, step] of job.steps.entries()) {
      if (JSON.stringify(step.env ?? {}).includes("secrets.APPLE_")) expect(index).toBe(signedBuild);
    }
  });

  test("command failures never include credentials from arguments or stderr", () => {
    try {
      runCommand(process.execPath, ["-e", `process.stderr.write('${credentials.APPLE_PASSWORD}'); process.exit(1)`]);
      throw new Error("Expected command failure");
    } catch (error) {
      expect(String(error)).toContain("failed");
      expect(String(error)).not.toContain(credentials.APPLE_PASSWORD);
    }
  });

  test("requires every credential and rejects malformed values without disclosing secrets", () => {
    expect(() => assertSigningCredentials(credentials)).not.toThrow();
    for (const key of Object.keys(credentials)) {
      expect(() => assertSigningCredentials({ ...credentials, [key]: "" })).toThrow(key);
    }
    for (const APPLE_CERTIFICATE of ["not a certificate!", "YQ", "===="]) {
      expect(() => assertSigningCredentials({ ...credentials, APPLE_CERTIFICATE })).toThrow("Base64");
    }
    expect(() => assertSigningCredentials({ ...credentials, APPLE_SIGNING_IDENTITY: "Apple Development: fixture" })).toThrow("Developer ID Application");
    expect(() => assertSigningCredentials({ ...credentials, APPLE_TEAM_ID: "OTHERTEAM1" })).toThrow("Team ID");
  });

  test("imports once, stages before signing Bun, avoids re-staging, and always cleans its keychain", () => {
    const f = fixture();
    const { run, calls } = commandFixture(f);
    try {
      buildSignedMacos({ cwd: f.root, environment: credentials, platform: "darwin", run, verify: () => {} });
      expect(calls.filter((call) => call.command === "security" && call.args[0] === "import")).toHaveLength(1);
      const prepare = calls.findIndex((call) => call.command === "bun" && call.args.join(" ") === "run tauri:prepare");
      const runtimeSign = calls.findIndex((call) => call.command === "codesign" && call.args.at(-1) === join(f.root, "dist/runtime/bun"));
      const build = calls.findIndex((call) => call.command === "bunx" && call.args[1] === "build");
      const bundle = calls.findIndex((call) => call.command === "bunx" && call.args[1] === "bundle");
      expect(prepare).toBeGreaterThan(-1);
      expect(runtimeSign).toBeGreaterThan(prepare);
      expect(build).toBeGreaterThan(prepare);
      expect(runtimeSign).toBeGreaterThan(build);
      expect(bundle).toBeGreaterThan(runtimeSign);
      expect(calls[runtimeSign].args).toContain("--timestamp");
      expect(calls[runtimeSign].args).toContain("runtime");
      expect(calls[runtimeSign].args).not.toContain("--deep");
      expect(calls[prepare].environment?.APPLE_PASSWORD).toBeUndefined();
      expect(Object.keys(calls[build].environment ?? {}).filter((key) => key.startsWith("APPLE_"))).toEqual([]);
      expect(calls[build].args).toContain("--no-bundle");
      expect(calls[bundle].environment?.APPLE_CERTIFICATE).toBeUndefined();
      expect(calls[bundle].environment?.APPLE_CERTIFICATE_PASSWORD).toBeUndefined();
      expect(calls[bundle].environment?.APPLE_PASSWORD).toBe(credentials.APPLE_PASSWORD);
      expect(calls[bundle].visible).toBe(false);
      const override = JSON.parse(calls[build].args[calls[build].args.indexOf("--config") + 1]);
      expect(override.build.beforeBuildCommand).toBe("");
      const bundleOverride = JSON.parse(calls[bundle].args[calls[bundle].args.indexOf("--config") + 1]);
      expect(bundleOverride.build.beforeBundleCommand).toBe("");
      const importIndex = calls.findIndex((call) => call.command === "security" && call.args[0] === "import");
      expect(importIndex).toBeGreaterThan(build);
      expect(calls.some((call) => call.command === "security" && call.args[0] === "delete-keychain")).toBe(true);
      expect(calls.filter((call) => call.command === "security" && call.args.includes("-s")).at(-1)?.args).toContain("/tmp/original login.keychain-db");
      const certificatePath = calls.find((call) => call.command === "security" && call.args[0] === "import")?.args[1];
      expect(() => readFileSync(certificatePath!)).toThrow();
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  test("compile failures never import a signing key or pass Apple credentials", () => {
    const f = fixture();
    const { run, calls } = commandFixture(f, "bunx tauri");
    try {
      expect(() => buildSignedMacos({ cwd: f.root, environment: credentials, platform: "darwin", run, verify: () => {} })).toThrow("fixture command failed");
      expect(calls.some((call) => call.command === "security")).toBe(false);
      expect(calls.every((call) => !Object.keys(call.environment ?? {}).some((key) => key.startsWith("APPLE_")))).toBe(true);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  test("cleans temporary credentials even when import or bundling fails", () => {
    for (const failure of ["security import", "bundle failure"]) {
      const f = fixture();
      const base = commandFixture(f, failure);
      const { calls } = base;
      const run = (command: string, args: string[], options?: { environment?: Record<string, string>; visible?: boolean }) => {
        const result = base.run(command, args, options);
        if (failure === "bundle failure" && command === "bunx" && args[1] === "bundle") throw new Error("fixture command failed");
        return result;
      };
      try {
        expect(() => buildSignedMacos({ cwd: f.root, environment: credentials, platform: "darwin", run, verify: () => {} })).toThrow("fixture command failed");
        expect(calls.some((call) => call.command === "security" && call.args[0] === "delete-keychain")).toBe(true);
      } finally {
        rmSync(f.root, { recursive: true, force: true });
      }
    }
  });

  test("checks the actual packaged Bun and App, notarizes the DMG and inspects its embedded App", () => {
    const f = fixture();
    const { run, calls } = commandFixture(f);
    try {
      const evidence = verifyMacosRelease({ cwd: f.root, environment: credentials, run });
      expect(evidence.status).toBe("complete");
      expect(JSON.stringify(evidence)).not.toContain(credentials.APPLE_PASSWORD);
      expect(evidence.notarizationId).toBe("fixture-id");
      expect(calls.some((call) => call.command === "codesign" && call.args.at(-1) === f.runtime)).toBe(true);
      expect(calls.some((call) => call.command === "xcrun" && call.args.join(" ") === `stapler validate ${f.app}`)).toBe(true);
      expect(calls.some((call) => call.command === "xcrun" && call.args.join(" ") === `stapler validate ${f.dmg}`)).toBe(true);
      expect(calls.some((call) => call.command === "spctl" && call.args.includes("context:primary-signature"))).toBe(true);
      expect(calls.some((call) => call.command === "hdiutil" && call.args[0] === "detach")).toBe(true);
      expect(calls.every((call) => !Object.keys(call.environment ?? {}).some((key) => key.startsWith("APPLE_")))).toBe(true);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  test("rejects ad-hoc signatures, failed tickets, rejected notarization and tampered DMG contents", () => {
    const f = fixture();
    try {
      for (const failure of ["codesign --verify", "xcrun stapler"]) {
        const { run } = commandFixture(f, failure);
        expect(() => verifyMacosRelease({ cwd: f.root, environment: credentials, run })).toThrow("fixture command failed");
      }
      for (const invalid of ["adhoc", "Rejected", "tamper", "no-runtime", "no-timestamp", "wrong-team", "missing-entitlements"]) {
        const base = commandFixture(f);
        const run = (command: string, args: string[]) => {
          const result = base.run(command, args);
          if (invalid === "adhoc" && command === "codesign" && args.includes("--verbose=4")) result.stderr = "Signature=adhoc";
          if (invalid === "no-runtime" && command === "codesign" && args.includes("--verbose=4")) result.stderr = result.stderr.replace("(runtime)", "()");
          if (invalid === "no-timestamp" && command === "codesign" && args.includes("--verbose=4")) result.stderr = result.stderr.replace("Timestamp=fixture", "");
          if (invalid === "wrong-team" && command === "codesign" && args.includes("--verbose=4")) result.stderr = result.stderr.replace("ABCDEFGHIJ", "OTHERTEAM1");
          if (invalid === "missing-entitlements" && command === "codesign" && args.includes("--entitlements")) result.stdout = "<plist><dict/></plist>";
          if (invalid === "Rejected" && command === "xcrun" && args[0] === "notarytool") result.stdout = '{"status":"Rejected"}';
          if (invalid === "tamper" && command === "hdiutil" && args[0] === "attach") {
            writeFileSync(join(args[args.indexOf("-mountpoint") + 1], "GeoChat.app/Contents/Resources/_up_/dist/runtime/bun"), "different runtime");
          }
          return result;
        };
        expect(() => verifyMacosRelease({ cwd: f.root, environment: credentials, run })).toThrow();
        if (invalid === "tamper") expect(base.calls.some((call) => call.command === "hdiutil" && call.args[0] === "detach")).toBe(true);
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  test("attempts detachment after partial attach failure without recursively removing its mountpoint", () => {
    const f = fixture();
    const base = commandFixture(f);
    const run = (command: string, args: string[]) => {
      const result = base.run(command, args);
      if (command === "hdiutil" && args[0] === "attach") throw new Error("fixture partial attach failure");
      return result;
    };
    try {
      expect(() => verifyMacosRelease({ cwd: f.root, environment: credentials, run })).toThrow("fixture partial attach failure");
      expect(base.calls.some((call) => call.command === "hdiutil" && call.args[0] === "detach")).toBe(true);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
});
