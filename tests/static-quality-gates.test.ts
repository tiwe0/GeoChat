import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

describe("static quality gate configuration", () => {
  test("typechecks the live Vite entry instead of removed configs", () => {
    const nodeConfig = JSON.parse(readFileSync(resolve(root, "tsconfig.node.json"), "utf8"));
    expect(nodeConfig.include).toContain("vite.react.config.ts");
    expect(nodeConfig.include).not.toContain("vite.web.config.ts");
    expect(nodeConfig.include).not.toContain("vite.tauri.config.ts");
  });

  test("keeps unused checks and dependency analysis in the shared local gate", () => {
    expect(packageJson.scripts.lint).toContain("--noUnusedLocals --noUnusedParameters");
    expect(packageJson.scripts.lint).toContain("bun run dependencies:check");
    expect(packageJson.scripts["quality:check"]).toBe("bun run lint && bun run typecheck");
    expect(packageJson.devDependencies["canvas-confetti"]).toBeUndefined();
    expect(packageJson.devDependencies["@types/canvas-confetti"]).toBeUndefined();
  });

  test("uses frozen installs and warning-failing Rust checks in packaging CI", () => {
    const workflow = readFileSync(resolve(root, ".github/workflows/tauri-package.yml"), "utf8");
    expect(workflow.match(/bun install --frozen-lockfile/g)).toHaveLength(2);
    expect(workflow).not.toContain("bun install --no-save");
    expect(workflow).toContain("bun run quality:check");
    expect(workflow).toContain("cargo fmt --manifest-path src-tauri/Cargo.toml --check");
    expect(workflow).toContain("cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings");
  });

  test("runs both package smokes and uploads their evidence before installers", () => {
    const workflow = readFileSync(resolve(root, ".github/workflows/tauri-package.yml"), "utf8");
    const layoutSmoke = workflow.indexOf("run: bun run tauri:package:smoke");
    const backendSmoke = workflow.indexOf("run: bun run package:backend-smoke");
    const evidenceUpload = workflow.indexOf("name: package-smoke-${{ matrix.platform }}-${{ github.sha }}");
    const packageUpload = workflow.indexOf("name: geochat-${{ matrix.platform }}-${{ github.sha }}");

    expect(layoutSmoke).toBeGreaterThan(-1);
    expect(backendSmoke).toBeGreaterThan(layoutSmoke);
    expect(evidenceUpload).toBeGreaterThan(backendSmoke);
    expect(packageUpload).toBeGreaterThan(evidenceUpload);
    expect(workflow).toContain("GEOCHAT_TAURI_PACKAGE_EVIDENCE_PATH");
    expect(workflow).toContain("GEOCHAT_PACKAGED_BACKEND_EVIDENCE_PATH");
  });
});
