import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type DatasetCatalogItem = {
  group: "production" | "external" | "reasoning" | "evaluation";
  requestedId: string;
  repoId: string;
};

const catalog: DatasetCatalogItem[] = [
  { group: "production", requestedId: "THU-KEG/MM_Math", repoId: "THU-KEG/MM_Math" },
  { group: "production", requestedId: "FanqingM/MMK12", repoId: "FanqingM/MMK12" },
  { group: "production", requestedId: "aslawliet/cn-k12", repoId: "aslawliet/cn-k12" },
  { group: "external", requestedId: "CMM-Math", repoId: "ecnu-icalk/cmm-math" },
  { group: "external", requestedId: "CMMaTH", repoId: "lizhongzhi2022/cmmath" },
  { group: "reasoning", requestedId: "AI-MO/NuminaMath-CoT", repoId: "AI-MO/NuminaMath-CoT" },
  { group: "evaluation", requestedId: "openai/gsm8k", repoId: "openai/gsm8k" },
  { group: "evaluation", requestedId: "brucewlee1/mmlu-high-school-mathematics", repoId: "brucewlee1/mmlu-high-school-mathematics" }
];

const outputRoot = resolve(process.argv[2] ?? Bun.env.GEOCHAT_HF_DATASETS_DIR ?? "data/raw/huggingface");
const maxWorkers = process.argv[3] ?? Bun.env.HF_DOWNLOAD_MAX_WORKERS ?? "4";
const cacheDir = join(outputRoot, ".cache");
mkdirSync(outputRoot, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  outputRoot,
  datasets: [] as Array<DatasetCatalogItem & {
    localDir: string;
    status: "downloaded" | "failed";
    sha: string | null;
    gated: boolean | null;
    private: boolean | null;
    tags: string[];
    fileCount: number;
    totalBytes: number;
    error?: string;
  }>
};

for (const item of catalog) {
  const localDir = join(outputRoot, item.group, item.repoId.replaceAll("/", "__"));
  mkdirSync(localDir, { recursive: true });
  const metadata = await fetchDatasetMetadata(item.repoId);
  console.log(`\n==> ${item.group}: ${item.requestedId} -> ${item.repoId}`);
  const result = spawnSync("huggingface-cli", [
    "download",
    "--repo-type",
    "dataset",
    "--local-dir",
    localDir,
    "--cache-dir",
    cacheDir,
    "--max-workers",
    maxWorkers,
    item.repoId
  ], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, HF_HOME: cacheDir, HF_HUB_CACHE: join(cacheDir, "hub") }
  });
  const stats = existsSync(localDir) ? directoryStats(localDir) : { fileCount: 0, totalBytes: 0 };
  manifest.datasets.push({
    ...item,
    localDir,
    status: result.status === 0 ? "downloaded" : "failed",
    sha: metadata?.sha ?? null,
    gated: typeof metadata?.gated === "boolean" ? metadata.gated : null,
    private: typeof metadata?.private === "boolean" ? metadata.private : null,
    tags: Array.isArray(metadata?.tags) ? metadata.tags : [],
    fileCount: stats.fileCount,
    totalBytes: stats.totalBytes,
    ...(result.status === 0 ? {} : { error: `huggingface-cli exited with status ${result.status}` })
  });
}

const manifestPath = join(outputRoot, "manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const failed = manifest.datasets.filter((dataset) => dataset.status === "failed");
console.log(`\nManifest: ${manifestPath}`);
console.log(`Downloaded: ${manifest.datasets.length - failed.length}/${manifest.datasets.length}`);
if (failed.length) {
  console.error(`Failed: ${failed.map((dataset) => dataset.repoId).join(", ")}`);
  process.exitCode = 1;
}

async function fetchDatasetMetadata(repoId: string) {
  const response = await fetch(`https://huggingface.co/api/datasets/${repoId}`);
  if (!response.ok) return null;
  return await response.json() as { sha?: string; gated?: boolean; private?: boolean; tags?: string[] };
}

function directoryStats(dir: string) {
  let fileCount = 0;
  let totalBytes = 0;
  const visit = (path: string) => {
    for (const name of readdirSync(path)) {
      if (name === ".cache") continue;
      const child = join(path, name);
      const stats = statSync(child);
      if (stats.isDirectory()) {
        visit(child);
      } else {
        fileCount += 1;
        totalBytes += stats.size;
      }
    }
  };
  visit(dir);
  return { fileCount, totalBytes };
}
