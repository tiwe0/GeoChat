import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import packageJson from "../packages/app/package.json";
import { getFunctionCallGroups, getFunctionCallSpec } from "@geochat-ai/app/functioncalls";
import {
  AGENT_MODEL_REGISTRY,
  AGENT_PROVIDER_REGISTRY,
  createAgentModelRegistrySchema,
  getAgentModelDefinition,
  getAgentProviderDefinition
} from "@geochat-ai/app/models";

const REQUIRED_DOMAIN_EXPORTS = [
  "./contracts",
  "./agent-run",
  "./functioncalls",
  "./geometry",
  "./models",
  "./problem-bank"
] as const;

const ROOT_EXPORTS = [
  "desktop-contracts",
  "agent-run",
  "blackboard",
  "benchmark",
  "functioncalls",
  "problem-bank",
  "structured-logger"
] as const;

describe("@geochat-ai/app export policy", () => {
  test("publishes the required stable domain subpaths", () => {
    for (const subpath of REQUIRED_DOMAIN_EXPORTS) {
      expect(packageJson.exports[subpath]).toBeDefined();
    }
  });

  test("keeps the root barrel narrow and stable", () => {
    const index = readFileSync("packages/app/src/index.ts", "utf8");
    const exports = [...index.matchAll(/^export \* from "\.\/([^"]+)";$/gm)].map((match) => match[1]);

    expect(exports).toEqual(ROOT_EXPORTS);
    expect(index).not.toMatch(/agent-prompts|workflow-policy|geogebra-command-reference/);
    expect(index).not.toContain("advanced-drawing-tools");
  });

  test("keeps internal registry and grouped schema modules behind public facades", () => {
    for (const internalSubpath of [
      "./functioncall-registry",
      "./functioncall-types",
      "./functioncall-schemas/cards",
      "./advanced-drawing/registry"
    ]) {
      expect(packageJson.exports).not.toHaveProperty(internalSubpath);
    }

    const functioncalls = readFileSync("packages/app/src/functioncalls.ts", "utf8");
    expect(functioncalls).not.toMatch(/export\s*\{[^}]*FUNCTION_CALL_REGISTRY/s);
  });

  test("keeps generated command data opaque", () => {
    expect(packageJson.exports).not.toHaveProperty("./geogebra-command-reference-data");
    expect(readFileSync("packages/app/src/index.ts", "utf8")).not.toContain("geogebra-command-reference");
    expect(readFileSync("packages/app/README.md", "utf8")).toContain("Generated Or Bulky Data");
  });

  test("returns isolated registry and lookup snapshots", () => {
    expect(Object.isFrozen(AGENT_PROVIDER_REGISTRY)).toBe(true);
    expect(Object.isFrozen(AGENT_PROVIDER_REGISTRY[0])).toBe(true);
    expect(Object.isFrozen(AGENT_MODEL_REGISTRY)).toBe(true);
    expect(Object.isFrozen(AGENT_MODEL_REGISTRY[0].capabilities)).toBe(true);

    const firstSchema = createAgentModelRegistrySchema();
    const secondSchema = createAgentModelRegistrySchema();
    (firstSchema.providers[0].allowedHosts as string[]).push("mutated.invalid");
    (firstSchema.models[0].capabilities as string[]).push("mutated" as never);
    expect(secondSchema.providers[0].allowedHosts).not.toContain("mutated.invalid");
    expect(secondSchema.models[0].capabilities).not.toContain("mutated");

    const firstProvider = getAgentProviderDefinition("openai")!;
    const secondProvider = getAgentProviderDefinition("openai")!;
    (firstProvider.allowedHosts as string[]).push("mutated.invalid");
    expect(secondProvider.allowedHosts).not.toContain("mutated.invalid");

    const firstModel = getAgentModelDefinition("openai", "gpt-5.6-sol")!;
    const secondModel = getAgentModelDefinition("openai", "gpt-5.6-sol")!;
    (firstModel.capabilities as string[]).push("mutated" as never);
    expect(secondModel.capabilities).not.toContain("mutated");

    const firstTool = getFunctionCallSpec("executeGeoGebraCommands");
    const secondTool = getFunctionCallSpec("executeGeoGebraCommands");
    firstTool.display.label = "mutated";
    expect(secondTool.display.label).not.toBe("mutated");

    const firstGroups = getFunctionCallGroups();
    const secondGroups = getFunctionCallGroups();
    (firstGroups[0].toolNames as string[]).push("mutated");
    expect(secondGroups[0].toolNames).not.toContain("mutated");
  });

  test("has no cycles reachable from public facades", () => {
    const roots = ["index", ...REQUIRED_DOMAIN_EXPORTS.map((entry) => entry.slice(2))]
      .map((name) => resolve("packages/app/src", `${name}.ts`));
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (file: string, ancestry: string[]) => {
      if (visiting.has(file)) throw new Error(`Public export cycle: ${[...ancestry, file].join(" -> ")}`);
      if (visited.has(file)) return;
      visiting.add(file);
      for (const dependency of relativeTypeScriptDependencies(file)) visit(dependency, [...ancestry, file]);
      visiting.delete(file);
      visited.add(file);
    };

    for (const root of roots) visit(root, []);
    expect(visited.size).toBeGreaterThan(20);
  });

  test("forbids backend and renderer source-path imports into the shared package", () => {
    const sourcePathImport = Bun.spawnSync([
      "rg",
      "-n",
      "packages/app/src/",
      "backend",
      "src/renderer-react",
      "src/shared",
      "--glob",
      "*.ts",
      "--glob",
      "*.tsx"
    ]);
    expect(sourcePathImport.exitCode).toBe(1);

    const broadRootImport = Bun.spawnSync([
      "rg",
      "-n",
      "from [\\\"']@geochat-ai/app[\\\"']",
      "backend",
      "src/renderer-react",
      "src/shared",
      "--glob",
      "*.ts",
      "--glob",
      "*.tsx"
    ]);
    expect(broadRootImport.exitCode).toBe(1);
  });
});

function relativeTypeScriptDependencies(file: string) {
  const source = readFileSync(file, "utf8")
    .replace(/import\s+type[\s\S]*?from\s+["'][^"']+["'];?/g, "")
    .replace(/export\s+type[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  const specifiers = [...source.matchAll(/(?:from\s+|import\s*\()\s*["'](\.[^"']+)["']/g)]
    .map((match) => match[1]);
  return specifiers.flatMap((specifier) => {
    const base = resolve(dirname(file), specifier);
    const candidates = [`${base}.ts`, resolve(base, "index.ts")];
    const dependency = candidates.find(existsSync);
    return dependency ? [normalize(dependency)] : [];
  });
}
