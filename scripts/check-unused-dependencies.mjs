#!/usr/bin/env bun

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".mts", ".cts", ".ts", ".tsx"]);
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".artifacts",
  ".omx",
  "dist",
  "fixtures",
  "node_modules",
  "public",
  "release-assets",
  "src-tauri/target",
  "vendor",
  "website",
]);

/**
 * Dependencies intentionally consumed through package scripts or compiler
 * conventions instead of source imports. Every exception needs a concrete
 * reason so this list cannot become a silent dumping ground.
 */
export const UNUSED_DEPENDENCY_ALLOWLIST = Object.freeze({
  "@biomejs/biome": "invoked by the lint:source package script as the repository source-rule gate",
  "@tauri-apps/cli": "invoked by the tauri:* package scripts and CI packaging jobs",
  "@types/bun": "loaded through tsconfig compilerOptions.types for Bun globals",
  "@types/node": "loaded through tsconfig compilerOptions.types for Node globals",
  "typescript": "the tsc binary implements the typecheck and lint package scripts",
});

function isSkippedDirectory(root, candidate) {
  const path = relative(root, candidate).split("\\").join("/");
  return [...SKIPPED_DIRECTORIES].some((entry) => path === entry || path.startsWith(`${entry}/`));
}

function walkSourceFiles(root, directory = root, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const candidate = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!isSkippedDirectory(root, candidate)) walkSourceFiles(root, candidate, files);
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(candidate);
  }
  return files;
}

export function packageNameFromSpecifier(specifier) {
  if (
    !specifier
    || specifier.startsWith(".")
    || specifier.startsWith("/")
    || specifier.startsWith("node:")
    || specifier.startsWith("bun:")
  ) {
    return null;
  }
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

export function extractPackageSpecifiers(sourceText, fileName = "source.ts") {
  const specifiers = new Set();
  const parseableSource = sourceText.startsWith("#!")
    ? sourceText.replace(/^#![^\n]*(?:\n|$)/, "")
    : sourceText;
  const extension = extname(fileName);
  const loader = extension === ".tsx"
    ? "tsx"
    : extension === ".jsx"
      ? "jsx"
      : [".ts", ".mts", ".cts"].includes(extension)
        ? "ts"
        : "js";
  const transpiler = new Bun.Transpiler({ loader });
  for (const imported of transpiler.scanImports(parseableSource)) {
    const packageName = packageNameFromSpecifier(imported.path);
    if (packageName) specifiers.add(packageName);
  }

  // Bun's parser deliberately elides type-only imports. Keep those visible to
  // dependency accounting with a narrow, line-anchored supplement; all
  // executable imports above still come from the parser rather than regexes.
  const typeOnlyImport = /^\s*import\s+type\b[^;\n]*?\bfrom\s*["']([^"']+)["']/gm;
  for (const match of parseableSource.matchAll(typeOnlyImport)) {
    const packageName = packageNameFromSpecifier(match[1]);
    if (packageName) specifiers.add(packageName);
  }
  return specifiers;
}

function correspondingRuntimePackage(typePackage) {
  const suffix = typePackage.slice("@types/".length);
  if (suffix.includes("__")) {
    const [scope, name] = suffix.split("__", 2);
    return `@${scope}/${name}`;
  }
  return suffix;
}

export function inspectUnusedDependencies(projectRoot = process.cwd()) {
  const root = resolve(projectRoot);
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const declared = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
  const used = new Set();
  for (const sourceFile of walkSourceFiles(root)) {
    const sourceText = readFileSync(sourceFile, "utf8");
    try {
      for (const packageName of extractPackageSpecifiers(sourceText, sourceFile)) used.add(packageName);
    } catch (error) {
      throw new Error(`Could not parse ${relative(root, sourceFile)}: ${error.message}`, { cause: error });
    }
  }

  // A direct dependency can be runtime infrastructure for another direct
  // package without appearing in application imports (MUI's styling engine is
  // the canonical example). Honor installed peer contracts instead of forcing
  // those packages into an unrelated source file or an allowlist.
  const requiredPeers = new Set();
  for (const dependency of used) {
    if (!Object.hasOwn(declared, dependency)) continue;
    try {
      const dependencyManifest = JSON.parse(
        readFileSync(join(root, "node_modules", dependency, "package.json"), "utf8"),
      );
      for (const peer of Object.keys(dependencyManifest.peerDependencies ?? {})) requiredPeers.add(peer);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const unused = [];
  for (const dependency of Object.keys(declared).sort()) {
    const runtimePackage = dependency.startsWith("@types/")
      ? correspondingRuntimePackage(dependency)
      : null;
    if (
      used.has(dependency)
      || requiredPeers.has(dependency)
      || (runtimePackage && used.has(runtimePackage))
      || Object.hasOwn(UNUSED_DEPENDENCY_ALLOWLIST, dependency)
    ) continue;
    unused.push(dependency);
  }
  return { unused, used };
}

export function formatUnusedDependencyReport(unused) {
  if (unused.length === 0) return "Dependency usage check passed.";
  return [
    "Unused direct dependencies:",
    ...unused.map((dependency) => `  - ${dependency}`),
    "Remove each dependency or add a narrowly justified UNUSED_DEPENDENCY_ALLOWLIST entry.",
  ].join("\n");
}

const invokedPath = process.argv[1] && statSync(process.argv[1], { throwIfNoEntry: false })?.isFile()
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  const { unused } = inspectUnusedDependencies();
  console.log(formatUnusedDependencyReport(unused));
  if (unused.length > 0) process.exitCode = 1;
}
