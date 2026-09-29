import { describe, expect, test } from "bun:test";
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

  test("reports no unused direct dependency in the repository", () => {
    const { unused } = inspectUnusedDependencies();
    expect(formatUnusedDependencyReport(unused)).toBe("Dependency usage check passed.");
    expect(unused).toEqual([]);
  });
});
