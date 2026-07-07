import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const inputRoot = resolve(Bun.env.GEOCHAT_HF_DATASETS_DIR ?? "data/raw/huggingface");
const dbPath = resolve(Bun.env.GEOCHAT_UNIFIED_PROBLEM_DB_PATH ?? "data/huggingface-unified-problems.sqlite");
const pyarrowPath = resolve(Bun.env.GEOCHAT_PYARROW_PATH ?? "/tmp/geochat-hf-profiler-py");
const limitPerDataset = Bun.env.GEOCHAT_HF_IMPORT_LIMIT_PER_DATASET ?? "";
const batchSize = Bun.env.GEOCHAT_HF_IMPORT_BATCH_SIZE ?? "1000";
const reset = Bun.env.GEOCHAT_HF_IMPORT_RESET === "1";
const importerPath = resolve("tools/hf_unified_importer.py");

if (!existsSync(importerPath)) {
  throw new Error(`Importer script not found: ${importerPath}`);
}

if (!existsSync(inputRoot)) {
  throw new Error(`Hugging Face dataset directory not found: ${inputRoot}`);
}

const args = [
  importerPath,
  "--input-root",
  inputRoot,
  "--db",
  dbPath,
  "--pyarrow-path",
  pyarrowPath,
  "--batch-size",
  batchSize
];

if (limitPerDataset) args.push("--limit-per-dataset", limitPerDataset);
if (reset) args.push("--reset");

const result = spawnSync("python3", args, { stdio: "inherit", env: process.env });

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  throw new Error(`Unified problem import failed with exit code ${result.status ?? "unknown"}`);
}
