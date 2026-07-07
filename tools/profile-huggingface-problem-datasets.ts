import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const inputRoot = resolve(process.argv[2] ?? Bun.env.GEOCHAT_HF_DATASETS_DIR ?? "data/raw/huggingface");
const outputPath = resolve(process.argv[3] ?? "docs/huggingface-problem-dataset-profile.md");
const pyarrowPath = resolve(Bun.env.GEOCHAT_PYARROW_PATH ?? "/tmp/geochat-hf-profiler-py");

type DatasetProfile = {
  requestedId: string;
  repoId: string;
  group: string;
  localDir: string;
  sha: string;
  files: Array<{
    path: string;
    format: string;
    rows: number | null;
    fields: string[];
    sample: unknown;
  }>;
};

const manifest = JSON.parse(readFileSync(join(inputRoot, "manifest.json"), "utf8")) as {
  datasets: Array<{ requestedId: string; repoId: string; group: string; localDir: string; sha: string }>;
};

const profiles: DatasetProfile[] = [];

for (const dataset of manifest.datasets) {
  const files = listDataFiles(dataset.localDir).map((file) => profileFile(file, dataset.localDir));
  profiles.push({ ...dataset, files });
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, renderMarkdown(profiles));
console.log(outputPath);

function listDataFiles(root: string) {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === ".cache" || name === ".gitattributes" || name === "README.md" || name === "LICENSE") continue;
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) visit(path);
      else if (/\.(json|jsonl|parquet|ya?ml)$/i.test(name)) files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function profileFile(path: string, datasetRoot: string) {
  const relativePath = path.slice(datasetRoot.length + 1);
  if (path.endsWith(".jsonl")) return profileJsonl(path, relativePath);
  if (path.endsWith(".json")) return profileJson(path, relativePath);
  if (path.endsWith(".parquet")) return profileParquet(path, relativePath);
  return { path: relativePath, format: "metadata", rows: null, fields: [], sample: readFileSync(path, "utf8").slice(0, 800) };
}

function profileJsonl(path: string, relativePath: string) {
  const lines = readFileSync(path, "utf8").split(/\n/).filter(Boolean);
  const sample = lines[0] ? JSON.parse(lines[0]) : null;
  return {
    path: relativePath,
    format: "jsonl",
    rows: lines.length,
    fields: objectFields(sample),
    sample
  };
}

function profileJson(path: string, relativePath: string) {
  const raw = readFileSync(path, "utf8");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    const lines = raw.split(/\n/).filter(Boolean);
    const sample = lines[0] ? JSON.parse(lines[0]) : null;
    return {
      path: relativePath,
      format: "jsonl-as-json",
      rows: lines.length,
      fields: objectFields(sample),
      sample
    };
  }
  const sample = Array.isArray(data) ? data[0] : data;
  return {
    path: relativePath,
    format: "json",
    rows: Array.isArray(data) ? data.length : null,
    fields: objectFields(sample),
    sample
  };
}

function profileParquet(path: string, relativePath: string) {
  const script = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(pyarrowPath)})`,
    "import pyarrow.parquet as pq",
    "p = sys.argv[1]",
    "pf = pq.ParquetFile(p)",
    "fields = pf.schema_arrow.names",
    "sample = pf.read_row_group(0, columns=fields).slice(0, 1).to_pylist()[0] if pf.metadata.num_rows else None",
    "def safe(v):",
    "    if isinstance(v, bytes): return {'__bytes__': len(v)}",
    "    if isinstance(v, dict): return {str(k): safe(val) for k, val in v.items()}",
    "    if isinstance(v, list): return [safe(x) for x in v[:5]]",
    "    return v",
    "sample = safe(sample)",
    "print(json.dumps({'rows': pf.metadata.num_rows, 'fields': fields, 'sample': sample}, ensure_ascii=False))"
  ].join("\n");
  const result = spawnSync("python3", ["-c", script, path], { encoding: "utf8" });
  if (result.status !== 0) {
    return {
      path: relativePath,
      format: "parquet",
      rows: null,
      fields: [],
      sample: { error: result.stderr.trim() }
    };
  }
  const profile = JSON.parse(result.stdout) as { rows: number; fields: string[]; sample: unknown };
  return { path: relativePath, format: "parquet", ...profile };
}

function objectFields(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

function renderMarkdown(profiles: DatasetProfile[]) {
  const lines = [
    "# Hugging Face Problem Dataset Profile",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "This is a raw field profile for designing GeoChat's unified problem-bank abstraction. It intentionally describes source fields before any conversion into `ProblemCase`.",
    ""
  ];
  for (const profile of profiles) {
    lines.push(`## ${profile.group}: ${profile.requestedId}`);
    if (profile.requestedId !== profile.repoId) lines.push(`Resolved repo: \`${profile.repoId}\``);
    lines.push(`Commit: \`${profile.sha}\``);
    lines.push("");
    for (const file of profile.files) {
      lines.push(`### \`${file.path}\``);
      lines.push(`- Format: \`${file.format}\``);
      if (file.rows !== null) lines.push(`- Rows: ${file.rows}`);
      if (file.fields.length) lines.push(`- Fields: ${file.fields.map((field) => `\`${field}\``).join(", ")}`);
      lines.push("- Sample:");
      lines.push("```json");
      lines.push(JSON.stringify(file.sample, null, 2).slice(0, 3000));
      lines.push("```");
      lines.push("");
    }
  }
  lines.push("## Unified Abstraction Notes");
  lines.push("");
  lines.push("Raw sources differ mainly along these axes:");
  lines.push("- Text-only solved problems: `problem/question` plus `solution/answer/analysis`.");
  lines.push("- Multiple-choice problems: `options` or `choices` plus answer labels.");
  lines.push("- Multimodal problems: image filename/path/url arrays plus question text.");
  lines.push("- Reasoning corpora: solution traces and source tags without grade/subject metadata.");
  lines.push("- Evaluation corpora: fixed split/config semantics and smaller metadata surface.");
  lines.push("");
  lines.push("A unified source record should preserve raw payload and expose normalized `prompt`, `answer`, `solution`, `choices`, `images`, `grade`, `subject`, `knowledge`, `difficulty`, `split`, `license`, and `source` metadata.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}
