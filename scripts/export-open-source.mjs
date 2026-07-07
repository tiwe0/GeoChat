#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const positional = args.filter((arg) => arg !== "--check");
const outputDir = positional[0] ? path.resolve(process.cwd(), positional[0]) : path.resolve(repoRoot, "dist/open-source-export");

function readIgnorePatterns() {
  const ignorePath = path.join(repoRoot, ".opensourceignore");
  return readFileSync(ignorePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const negated = line.startsWith("!");
      const pattern = (negated ? line.slice(1) : line).replace(/^\/+/, "");
      return { pattern, negated };
    });
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegex(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    source += escapeRegex(char);
  }
  source += "$";
  return new RegExp(source);
}

function matchesPattern(filePath, pattern) {
  const normalized = filePath.replaceAll(path.sep, "/");

  if (pattern.endsWith("/**")) {
    const dir = pattern.slice(0, -3);
    return normalized === dir || normalized.startsWith(`${dir}/`);
  }

  if (pattern.includes("*")) {
    return globToRegex(pattern).test(normalized);
  }

  if (!pattern.includes("/")) {
    return normalized === pattern || path.posix.basename(normalized) === pattern;
  }

  return normalized === pattern || normalized.startsWith(`${pattern}/`);
}

function listTrackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || "git ls-files failed");
  }

  return result.stdout.split("\0").filter(Boolean);
}

function classifyFiles(files, patterns) {
  const publicFiles = [];
  const excludedFiles = [];

  for (const file of files) {
    let excluded = false;
    let matchedPattern = null;

    for (const entry of patterns) {
      if (!matchesPattern(file, entry.pattern)) {
        continue;
      }

      excluded = !entry.negated;
      matchedPattern = entry.negated ? null : entry.pattern;
    }

    if (excluded) {
      excludedFiles.push({ file, pattern: matchedPattern });
    } else {
      publicFiles.push(file);
    }
  }

  return { publicFiles, excludedFiles };
}

function copyPublicFiles(publicFiles) {
  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  for (const file of publicFiles) {
    const source = path.join(repoRoot, file);
    const target = path.join(outputDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target, { recursive: false });
  }

  writeFileSync(
    path.join(outputDir, "OPEN_SOURCE_EXPORT.txt"),
    [
      "This tree was generated from the GeoChat Desktop monorepo.",
      "It contains the conservative public-core file set selected by .opensourceignore.",
      "Review docs/open-source-boundary.md before publishing.",
      "",
    ].join("\n"),
  );
}

const patterns = readIgnorePatterns();
const trackedFiles = listTrackedFiles();
const { publicFiles, excludedFiles } = classifyFiles(trackedFiles, patterns);

console.log(`Candidate files: ${trackedFiles.length}`);
console.log(`Public files:  ${publicFiles.length}`);
console.log(`Excluded:      ${excludedFiles.length}`);

const grouped = new Map();
for (const entry of excludedFiles) {
  const count = grouped.get(entry.pattern) ?? 0;
  grouped.set(entry.pattern, count + 1);
}

console.log("\nExcluded by pattern:");
for (const [pattern, count] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${pattern}: ${count}`);
}

if (!checkOnly) {
  copyPublicFiles(publicFiles);
  console.log(`\nExported public core to ${outputDir}`);
} else {
  console.log("\nCheck only; no files copied.");
}
