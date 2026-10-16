import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  UNUSED_DEPENDENCY_ALLOWLIST,
  extractPackageSpecifiers,
  formatUnusedDependencyReport,
  inspectUnusedDependencies,
  packageNameFromSpecifier,
} from "../scripts/check-unused-dependencies.mjs";

describe("unused dependency gate", () => {
  test("extracts static, type-only, re-exported, CommonJS and dynamic package imports", () => {
    const source = `
      import type { Config } from "@scope/static/types";
      export { value } from "plain-package/subpath";
      import legacy = require("legacy-package");
      const runtime = require("required-package/subpath");
      const lazy = import("dynamic-package");
      const local = import("./local-file.ts");
    `;

    expect([...extractPackageSpecifiers(source)].sort()).toEqual([
      "@scope/static",
      "dynamic-package",
      "legacy-package",
      "plain-package",
      "required-package",
    ]);
    expect(packageNameFromSpecifier("node:fs")).toBeNull();
    expect(packageNameFromSpecifier("bun:test")).toBeNull();
    expect(packageNameFromSpecifier("/absolute/file.ts")).toBeNull();
  });

  test("fails closed when a checked source file cannot be parsed", () => {
    expect(() => extractPackageSpecifiers("import {", "broken.mjs")).toThrow();
  });

  test("keeps every non-import exception documented", () => {
    for (const reason of Object.values(UNUSED_DEPENDENCY_ALLOWLIST)) {
      expect(reason.trim().length).toBeGreaterThan(20);
    }
  });

  test("ignores nested dependency and build directories without skipping plugin sources", () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-dependency-gate-"));
    try {
      writeFileSync(join(root, "package.json"), JSON.stringify({
        dependencies: { "plugin-runtime": "1.0.0", "vendor-only": "1.0.0" },
      }));
      const plugin = join(root, "plugins", "example");
      mkdirSync(join(plugin, "src"), { recursive: true });
      writeFileSync(join(plugin, "src", "index.ts"), 'import "plugin-runtime";');
      for (const directory of ["node_modules", "dist", ".artifacts"]) {
        mkdirSync(join(plugin, directory), { recursive: true });
        writeFileSync(join(plugin, directory, "broken.ts"), "import {");
        writeFileSync(join(plugin, directory, "vendor.ts"), 'import "vendor-only";');
      }
      const { unused, used } = inspectUnusedDependencies(root);
      expect([...used]).toEqual(["plugin-runtime"]);
      expect(unused).toEqual(["vendor-only"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports no unused direct dependency in the repository", () => {
    const { unused } = inspectUnusedDependencies();
    expect(formatUnusedDependencyReport(unused)).toBe("Dependency usage check passed.");
    expect(unused).toEqual([]);
  });
});
