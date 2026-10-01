import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:[cm]?[jt]sx?|rs)$/.test(entry.name) ? [path] : [];
  });
}

function referencesWebViewStorage(path: string, source: string) {
  void path;
  return /\b(?:localStorage|sessionStorage|indexedDB|caches)\b|document\.cookie|navigator\.(?:serviceWorker|storage)/.test(source);
}

const RETIRED_PRODUCTION_PATHS = [
  "backend/src/db/legacy-conversation-import-repository.ts",
  "backend/src/db/message-repository.ts",
  "backend/src/db/migration-repository.ts",
  "backend/src/http/routes/legacy-conversation-import.ts",
  "backend/src/http/routes/messages.ts",
  "backend/src/http/routes/migration.ts",
  "backend/src/services/migration.ts",
  "packages/app/src/legacy-conversation-import.ts",
  "packages/app/src/migration.ts",
  "src-tauri/src/credential_migration.rs",
  "src/renderer-react/src/features/conversations/legacyMigration.ts",
  "src/renderer-react/src/features/conversations/localStore.ts",
  "src/renderer-react/src/platform-web.ts",
  "src/shared/desktop/desktop-credential-bootstrap.ts",
] as const;

const RETIRED_PRODUCTION_SYMBOLS = [
  "/v1/legacy-conversations/import",
  "/v1/migration/export",
  "/v1/migration/import",
  '"/v1/messages"',
  "GEOCHAT_DESKTOP_LOCAL_AUTH_TOKEN",
  "credential_migration",
  "import_legacy_credential",
  "geogebraCopilotReasoningMode",
  "activateSkill",
] as const;

describe("static quality gate configuration", () => {
  test("typechecks the live Vite entry instead of removed configs", () => {
    const nodeConfig = JSON.parse(readFileSync(resolve(root, "tsconfig.node.json"), "utf8"));
    expect(nodeConfig.include).toContain("vite.react.config.ts");
    expect(nodeConfig.include).not.toContain("vite.web.config.ts");
    expect(nodeConfig.include).not.toContain("vite.tauri.config.ts");
  });

  test("isolates ordinary dev data from the installed production profile", () => {
    const production = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
    const development = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.dev.conf.json"), "utf8"));
    expect(development.identifier).toBe("ai.geochat.desktop.dev");
    expect(development.identifier).not.toBe(production.identifier);
    expect(packageJson.scripts.dev).toContain("src-tauri/tauri.dev.conf.json");
    expect(packageJson.scripts["tauri:dev"]).toContain("src-tauri/tauri.dev.conf.json");
  });

  test("keeps unused checks and dependency analysis in the shared local gate", () => {
    expect(packageJson.scripts.lint).toContain("bun run lint:source");
    expect(packageJson.scripts["lint:source"]).toBe("biome lint");
    expect(packageJson.scripts.lint).toContain("--noUnusedLocals --noUnusedParameters");
    expect(packageJson.scripts.lint).toContain("bun run dependencies:check");
    expect(packageJson.scripts.format).toBe("biome format --write");
    expect(packageJson.scripts["format:check"]).toBe("biome format");
    expect(packageJson.scripts["quality:check"]).toBe("bun run format:check && bun run lint && bun run typecheck");
    expect(packageJson.devDependencies["@biomejs/biome"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.devDependencies["canvas-confetti"]).toBeUndefined();
    expect(packageJson.devDependencies["@types/canvas-confetti"]).toBeUndefined();
  });

  test("keeps the incremental Biome gate narrow and deterministic", () => {
    const biome = JSON.parse(readFileSync(resolve(root, "biome.json"), "utf8"));
    expect(biome.$schema).toContain(packageJson.devDependencies["@biomejs/biome"]);
    expect(biome.formatter.enabled).toBe(true);
    expect(biome.formatter.includes).toContain("packages/app/src/conversation-message-contract.ts");
    expect(biome.assist.enabled).toBe(false);
    expect(biome.linter.rules.preset).toBe("none");
    expect(biome.linter.rules.correctness.noUndeclaredVariables).toBe("error");
    expect(biome.linter.rules.suspicious.noDebugger).toBe("error");
  });

  test("uses frozen installs and warning-failing Rust checks in packaging CI", () => {
    const workflow = readFileSync(resolve(root, ".github/workflows/tauri-package.yml"), "utf8");
    expect(workflow.match(/bun install --frozen-lockfile/g)).toHaveLength(2);
    expect(workflow).not.toContain("bun install --no-save");
    expect(workflow).toContain("bun run quality:check");
    expect(workflow).toContain("cargo fmt --manifest-path src-tauri/Cargo.toml --check");
    expect(workflow).toContain("cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings");
  });

  test("runs layout, backend, and platform-accurate launch smokes before artifact upload", () => {
    const workflow = readFileSync(resolve(root, ".github/workflows/tauri-package.yml"), "utf8");
    const layoutSmoke = workflow.indexOf("run: bun run tauri:package:smoke");
    const backendSmoke = workflow.indexOf("run: bun run package:backend-smoke");
    const launchSmoke = workflow.indexOf("run: bun run package:launch-smoke");
    const evidenceUpload = workflow.indexOf("name: package-smoke-${{ matrix.platform }}-${{ github.sha }}");
    const packageUpload = workflow.indexOf("name: geochat-${{ matrix.platform }}-${{ github.sha }}");

    expect(layoutSmoke).toBeGreaterThan(-1);
    expect(backendSmoke).toBeGreaterThan(layoutSmoke);
    expect(launchSmoke).toBeGreaterThan(backendSmoke);
    expect(evidenceUpload).toBeGreaterThan(launchSmoke);
    expect(packageUpload).toBeGreaterThan(evidenceUpload);
    expect(workflow).toContain("GEOCHAT_TAURI_PACKAGE_EVIDENCE_PATH");
    expect(workflow).toContain("GEOCHAT_PACKAGED_BACKEND_EVIDENCE_PATH");
    expect(workflow).toContain("GEOCHAT_PACKAGED_LAUNCH_EVIDENCE_PATH");
    expect(workflow).toContain("Smoke platform launch target");
    expect(workflow).toContain("Windows launches target/release/geochat-desktop-tauri.exe");
    expect(packageJson.scripts["package:launch-smoke"]).toBe("bun scripts/smoke-packaged-app-launch.mjs");
  });

  test("documents that Windows launch evidence does not cover installer installation", () => {
    const boundaries = readFileSync(resolve(root, "docs/release-boundaries.md"), "utf8");
    expect(boundaries).toContain("inside the generated `.app` bundle");
    expect(boundaries).toContain("release-build executable at `src-tauri/target/release/geochat-desktop-tauri.exe`");
    expect(boundaries).toContain("successful installation of the Windows NSIS or MSI artifact");
    expect(boundaries).toContain("post-install launch from either installer");
  });

  test("forbids first-party persistence in WebView storage outside the in-memory compatibility facade", () => {
    const facadeAllowlist = new Set([
      "src/renderer-react/src/webview-storage-facades.ts"
    ]);
    const violations = sourceFiles(resolve(root, "src"))
      .map((path) => ({
        path: relative(root, path).replaceAll("\\", "/"),
        source: readFileSync(path, "utf8")
      }))
      .filter(({ path, source }) =>
        !facadeAllowlist.has(path) && referencesWebViewStorage(path, source)
      )
      .map(({ path }) => path);

    expect(violations).toEqual([]);
  });

  test("installs memory-only Web Storage facades before rendering vendored GeoGebra", () => {
    const main = readFileSync(resolve(root, "src/renderer-react/src/main.tsx"), "utf8");
    const bootstrap = readFileSync(resolve(root, "src/renderer-react/src/renderer-storage-bootstrap.ts"), "utf8");
    const facade = readFileSync(resolve(root, "src/renderer-react/src/webview-storage-facades.ts"), "utf8");
    const geogebraHtml = readFileSync(resolve(root, "vendor/geogebra/HTML5/5.0/GeoGebra.html"), "utf8");
    expect(bootstrap.indexOf("installWebViewStorageFacades()")).toBeGreaterThan(-1);
    expect(facade).toContain('replaceWindowStorage("localStorage", memoryStorage())');
    expect(facade).toContain('replaceWindowStorage("sessionStorage", memoryStorage())');
    expect(main.indexOf("await bootstrapRendererStorage(desktopApi)")).toBeGreaterThan(-1);
    expect(main.indexOf("createRoot(")).toBeGreaterThan(main.indexOf("await bootstrapRendererStorage(desktopApi)"));
    expect(geogebraHtml).not.toContain("document.cookie");
    expect(geogebraHtml).not.toContain("localStorage.translation");
  });

  test("creates the desktop WebView in native incognito mode", () => {
    const production = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
    const main = readFileSync(resolve(root, "src-tauri/src/main.rs"), "utf8");
    expect(production.app.windows[0].incognito).toBe(true);
    expect(main).toContain("WebviewWindowBuilder::from_config(app, &window_config)");
    expect(main).toContain(".incognito(true)");
  });

  test("does not retain legacy WebView migration code and renders actionable startup failures", () => {
    expect(() => readFileSync(resolve(root, "src/renderer-react/src/legacy-webview-storage-migration.ts"), "utf8")).toThrow();
    expect(() => readFileSync(resolve(root, "src/renderer-react/src/features/conversations/legacyMigration.ts"), "utf8")).toThrow();
    const bootstrap = readFileSync(resolve(root, "src/renderer-react/src/renderer-storage-bootstrap.ts"), "utf8");
    const main = readFileSync(resolve(root, "src/renderer-react/src/main.tsx"), "utf8");
    const startupFailure = readFileSync(resolve(root, "src/renderer-react/src/components/StartupFailure.tsx"), "utf8");
    expect(bootstrap).not.toContain("migrateLegacy");
    expect(bootstrap).not.toContain("prepareDesktopConfigBeforeLoad");
    expect(main).toContain("StartupFailure");
    expect(startupFailure).toContain("window.location.reload()");
    expect(startupFailure).toContain("openLogDirectory");

    const generatedSchemaDirectory = resolve(root, "src-tauri/gen/schemas");
    const generatedSchemas = readdirSync(generatedSchemaDirectory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readFileSync(resolve(root, "src-tauri/gen/schemas", name), "utf8"));
    for (const schema of generatedSchemas) {
      expect(() => JSON.parse(schema)).not.toThrow();
      expect(schema).not.toContain("credential_migration");
      expect(schema).not.toContain("import_legacy_credential");
    }
    const buildScript = readFileSync(resolve(root, "src-tauri/build.rs"), "utf8");
    expect(buildScript.indexOf("remove_dir_all(&autogenerated_permissions)")).toBeLessThan(
      buildScript.indexOf("tauri_build::try_build(attributes)"),
    );
    const generatedPermissions = readdirSync(resolve(root, "src-tauri/permissions/autogenerated"))
      .filter((name) => name.endsWith(".toml"));
    expect(generatedPermissions.some((name) => /legacy|migration/.test(name))).toBe(false);
  });

  test("keeps every retired migration and compatibility surface absent", () => {
    for (const path of RETIRED_PRODUCTION_PATHS) {
      expect(() => readFileSync(resolve(root, path), "utf8"), path).toThrow();
    }

    const productionSources = ["backend/src", "packages/app/src", "src", "src-tauri/src"]
      .flatMap((directory) => sourceFiles(resolve(root, directory)))
      .map((path) => ({
        path: relative(root, path).replaceAll("\\", "/"),
        source: readFileSync(path, "utf8"),
      }));
    for (const retired of RETIRED_PRODUCTION_SYMBOLS) {
      const matches = productionSources
        .filter(({ source }) => source.includes(retired))
        .map(({ path }) => path);
      expect(matches, retired).toEqual([]);
    }

    const appPackage = JSON.parse(readFileSync(resolve(root, "packages/app/package.json"), "utf8"));
    for (const subpath of ["./migration", "./legacy-conversation-import", "./credential-migration"]) {
      expect(appPackage.exports, subpath).not.toHaveProperty(subpath);
    }
    const permissions = readFileSync(resolve(root, "src-tauri/permissions/desktop-app.toml"), "utf8");
    expect(permissions).not.toMatch(/legacy|migration|import_legacy_credential/);
  });
});
