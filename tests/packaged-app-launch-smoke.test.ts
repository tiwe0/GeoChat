import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  describeLaunchTarget,
  verifyLaunchedBackendBoundary,
  writePackagedAppLaunchEvidence,
} from "../scripts/smoke-packaged-app-launch.mjs";

function runningChild() {
  return { exitCode: null, signalCode: null } as Parameters<typeof verifyLaunchedBackendBoundary>[1];
}

describe("packaged app launch smoke", () => {
  test("accepts a healthy launched backend that protects application routes", async () => {
    const seenAuthorization: Array<string | null> = [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health") return Response.json({ ok: true });
        const authorization = request.headers.get("authorization");
        seenAuthorization.push(authorization);
        return Response.json({ error: "unauthorized" }, { status: 401 });
      },
    });

    try {
      await expect(
        verifyLaunchedBackendBoundary(`http://${server.hostname}:${server.port}`, runningChild(), 1_000),
      ).resolves.toEqual({
        healthStatus: 200,
        missingTokenStatus: 401,
        incorrectTokenStatus: 401,
        stayedRunningThroughChecks: true,
      });
      expect(seenAuthorization).toEqual([null, "Bearer incorrect-packaged-launch-smoke-token"]);
    } finally {
      server.stop(true);
    }
  });

  test("rejects a launched backend that exposes protected routes", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        return new URL(request.url).pathname === "/health"
          ? Response.json({ ok: true })
          : Response.json({ conversations: [] });
      },
    });

    try {
      await expect(
        verifyLaunchedBackendBoundary(`http://${server.hostname}:${server.port}`, runningChild(), 1_000),
      ).rejects.toThrow("without authentication");
    } finally {
      server.stop(true);
    }
  });

  test("writes launch evidence without claiming signing, notarization, or provider access", () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-launch-evidence-test-"));
    const path = join(root, "nested", "launch.json");
    const evidence = {
      kind: "geochat-platform-launch-target-smoke-evidence",
      status: "complete",
      launchTarget: {
        kind: "windows-release-build-executable",
        path: "src-tauri/target/release/geochat-desktop-tauri.exe",
      },
      launch: { providerRequestsMade: false },
      installer: { installationVerified: false, postInstallLaunchVerified: false },
    };

    try {
      writePackagedAppLaunchEvidence(path, evidence);
      const written = JSON.parse(readFileSync(path, "utf8"));
      expect(written).toEqual(evidence);
      expect(written.launch.providerRequestsMade).toBeFalse();
      expect(written.launch.actualBundleExecutable).toBeUndefined();
      expect(written.installer.installationVerified).toBeFalse();
      expect(written.installer.postInstallLaunchVerified).toBeFalse();
      expect(written.signing).toBeUndefined();
      expect(written.notarization).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("describes the macOS app bundle executable as the launch target", () => {
    expect(
      describeLaunchTarget(
        "darwin",
        "/repo/src-tauri/target/release/bundle/macos/GeoChat.app",
        "/repo/src-tauri/target/release/bundle/macos/GeoChat.app/Contents/MacOS/geochat-desktop-tauri",
      ),
    ).toEqual({
      kind: "macos-app-bundle-executable",
      path: relativeToCwd(
        "/repo/src-tauri/target/release/bundle/macos/GeoChat.app/Contents/MacOS/geochat-desktop-tauri",
      ),
      containerPath: relativeToCwd("/repo/src-tauri/target/release/bundle/macos/GeoChat.app"),
    });
  });

  test("describes the Windows release build without claiming installer installation", () => {
    expect(
      describeLaunchTarget(
        "win32",
        "/repo/src-tauri/target/release/geochat-desktop-tauri.exe",
        "/repo/src-tauri/target/release/geochat-desktop-tauri.exe",
      ),
    ).toEqual({
      kind: "windows-release-build-executable",
      path: relativeToCwd("/repo/src-tauri/target/release/geochat-desktop-tauri.exe"),
    });
  });
});

function relativeToCwd(path: string) {
  return relative(process.cwd(), path);
}
