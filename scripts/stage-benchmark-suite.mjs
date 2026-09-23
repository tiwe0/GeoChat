#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "benchmarks");
const destination = resolve(root, "dist/benchmarks");

const validation = spawnSync("bun", ["tools/validate-benchmark-suite.ts"], {
  cwd: root,
  stdio: "inherit"
});
if (validation.status !== 0) process.exit(validation.status ?? 1);

await rm(destination, { recursive: true, force: true });
await mkdir(resolve(root, "dist"), { recursive: true });
await cp(source, destination, { recursive: true });
console.log(`Staged benchmark suites at ${destination}`);
