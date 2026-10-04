import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadProductionCsp,
  parseSmokeArguments,
  resolveSmokeBundleRoot,
  writeCanvasSmokeEvidence,
} from "../scripts/smoke-geogebra-canvas.mjs";

describe("GeoGebra native canvas smoke", () => {
  test("requires one packaged bundle source and an evidence path", () => {
    expect(parseSmokeArguments(["--bundle-root", "dist", "--json-out", "result.json"])).toEqual({
      bundleRoot: "dist", app: undefined, jsonOut: "result.json", withoutNonce: false,
    });
    expect(parseSmokeArguments(["--app", "GeoChat.app", "--json-out", "result.json", "--without-nonce"])).toEqual({
      bundleRoot: undefined, app: "GeoChat.app", jsonOut: "result.json", withoutNonce: true,
    });
    expect(() => parseSmokeArguments(["--json-out", "result.json"])).toThrow("exactly one");
    expect(() => parseSmokeArguments(["--bundle-root", "dist"])).toThrow("--json-out");
    expect(() => parseSmokeArguments(["--bundle-root", "dist", "--app", "GeoChat.app", "--json-out", "x"])).toThrow("exactly one");
  });

  test("resolves the signed app resource layout without probing unrelated paths", () => {
    expect(resolveSmokeBundleRoot({ app: "/tmp/GeoChat.app" })).toBe(
      "/tmp/GeoChat.app/Contents/Resources/_up_/dist",
    );
    expect(resolveSmokeBundleRoot({ bundleRoot: "/tmp/dist" })).toBe("/tmp/dist");
  });

  test("loads the exact production CSP and writes status-only evidence", () => {
    const policy = loadProductionCsp();
    expect(policy).toContain("script-src 'self' geochat-bundle:");
    const root = mkdtempSync(join(tmpdir(), "geochat-canvas-evidence-"));
    try {
      const path = join(root, "nested", "result.json");
      writeCanvasSmokeEvidence(path, { kind: "canvas", status: "complete" });
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ kind: "canvas", status: "complete" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Swift harness uses an ephemeral real WKWebView and proves functional drawing", () => {
    const source = readFileSync("scripts/macos/geogebra-canvas-smoke.swift", "utf8");
    expect(source).toContain("WKWebViewConfiguration");
    expect(source).toContain(".nonPersistent()");
    expect(source).toContain("setURLSchemeHandler");
    expect(source).toContain("securitypolicyviolation");
    expect(source).toContain("appletOnLoad(api)");
    expect(source).toContain("evalCommand('A=(1,2)')");
    expect(source).toContain("getXcoord('A')");
    expect(source).toContain("GeoGebraFrame canvas");
    expect(source).toContain("exitCode: 2");
  });

  test("wrapper compiles in an owned temporary directory and bounds native execution", () => {
    const source = readFileSync("scripts/smoke-geogebra-canvas.mjs", "utf8");
    expect(source).toContain("mkdtempSync");
    expect(source).toContain('timeout: 45_000');
    expect(source).toContain('rmSync(buildRoot, { recursive: true, force: true })');
    expect(source).toContain('platform !== "darwin"');
  });
});
