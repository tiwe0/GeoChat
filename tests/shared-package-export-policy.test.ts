import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

describe("@geochat-ai/app export policy", () => {
  test("documents shared export classes and verification gates", () => {
    expect(existsSync("packages/app/README.md")).toBe(true);
    const readme = readFileSync("packages/app/README.md", "utf8");

    for (const heading of [
      "Stable Contracts",
      "Policy Modules",
      "Implementation Helpers",
      "Generated Or Bulky Data"
    ]) {
      expect(readme).toContain(`### ${heading}`);
    }

    for (const heading of [
      "Adding Exports",
      "Verification"
    ]) {
      expect(readme).toContain(`## ${heading}`);
    }

    expect(readme).toContain("bun run typecheck");
    expect(readme).toContain("tests/model-registry-schema.test.ts");
    expect(readme).toContain("tests/agent-harness.test.ts");
    expect(readme).toContain("tests/agent-harness-runner-policy.test.ts");
  });

  test("classifies current public exports from the package barrel", () => {
    const index = readFileSync("packages/app/src/index.ts", "utf8");
    const readme = readFileSync("packages/app/README.md", "utf8");

    const publicExports = [...index.matchAll(/^export \* from "\.\/([^"]+)";$/gm)].map((match) => match[1]);
    expect(publicExports.length).toBeGreaterThan(20);

    for (const exportedModule of publicExports) {
      expect(readme).toContain(`\`${exportedModule}\``);
    }
  });

  test("keeps function-call ownership modules internal behind public facades", () => {
    const index = readFileSync("packages/app/src/index.ts", "utf8");

    for (const internalModule of [
      "functioncall-types",
      "functioncall-registry",
      "functioncall-display",
      "functioncall-executors",
      "geogebra-command-normalization"
    ]) {
      expect(index).not.toContain(`export * from "./${internalModule}";`);
    }

    expect(index).toContain('export * from "./functioncalls";');
    expect(index).toContain('export * from "./functioncall-schemas";');
  });

  test("keeps grouped schema implementation modules internal behind the schema facade", () => {
    const index = readFileSync("packages/app/src/index.ts", "utf8");

    expect(index).not.toMatch(/export \* from "\.\/functioncall-schemas\//);
    expect(index).toContain('export * from "./functioncall-schemas";');
  });

  test("marks GeoGebra command reference as generated opaque data", () => {
    const readme = readFileSync("packages/app/README.md", "utf8");
    const index = readFileSync("packages/app/src/index.ts", "utf8");

    expect(index).toContain('export * from "./geogebra-command-reference";');
    expect(readme).toContain("`geogebra-command-reference`");
    expect(readme).toContain("generated or vendor-derived reference data");
    expect(readme).toContain("Do not make\nmanual semantic edits directly in generated reference data.");
  });
});
