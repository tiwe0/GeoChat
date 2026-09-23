import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  benchmarkSuiteHash,
  validateBenchmarkSuite,
  type BenchmarkCase,
  type BenchmarkSuite
} from "@geochat-ai/app";

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

async function loadJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

const args = process.argv.slice(2);
const writeHash = args.includes("--write-hash");
const positional = args.filter((arg) => !arg.startsWith("--"));
const suitePath = resolve(positional[0] ?? "benchmarks/core-v1/suite.json");
const suite = await loadJson(suitePath) as BenchmarkSuite;
const calculatedHash = benchmarkSuiteHash(suite);

if (writeHash && suite.contentHash !== calculatedHash) {
  suite.contentHash = calculatedHash;
  await writeFile(suitePath, `${JSON.stringify(suite, null, 2)}\n`, "utf8");
}

const validation = validateBenchmarkSuite(suite);
const errors = validation.issues.map((entry) => `${entry.path} [${entry.code}] ${entry.message}`);
const suiteDir = dirname(suitePath);
if (Array.isArray(suite.cases)) {
  for (const benchmarkCase of suite.cases) {
    const casePath = resolve(suiteDir, benchmarkCase.path);
    if (!casePath.startsWith(`${suiteDir}/`)) {
      errors.push(`${benchmarkCase.path} [invalid_path] Case escapes the suite directory.`);
      continue;
    }
    try {
      const standalone = await loadJson(casePath) as BenchmarkCase;
      if (canonical(standalone) !== canonical(benchmarkCase)) {
        errors.push(`${benchmarkCase.path} [case_mismatch] Standalone case does not match suite entry.`);
      }
    } catch (error) {
      errors.push(`${benchmarkCase.path} [unreadable_case] ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Benchmark suite validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Benchmark suite valid: ${suite.id}@${suite.version}`);
  console.log(`Cases: ${suite.cases.length}`);
  console.log(`Content hash: ${validation.contentHash}`);
}
