import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

type Conic10kSplit = "train" | "dev" | "test";

type Conic10kItem = {
  text?: unknown;
  fact_expressions?: unknown;
  query_expressions?: unknown;
  answer_expressions?: unknown;
  fact_spans?: unknown;
  query_spans?: unknown;
  process?: unknown;
};

const splits: Conic10kSplit[] = ["train", "dev", "test"];
const sourceCommit = "9458b879e82e57d37ecc94dea09676d59a160483";
const sourceRepository = "https://github.com/whyNLP/Conic10K";

const sourceRoot = resolve(process.argv[2] ?? Bun.env.CONIC10K_SOURCE_DIR ?? "/tmp/geochat-conic10k-source");
const datasetRoot = join(sourceRoot, "conic10k");
const outputRoot = resolve(process.argv[3] ?? Bun.env.GEOCHAT_PROBLEM_CASES_DIR ?? "data/problem-cases");
const outputDatasetRoot = join(outputRoot, "conic10k");

if (!existsSync(datasetRoot)) {
  throw new Error(`Conic10K dataset directory not found: ${datasetRoot}`);
}

mkdirSync(outputDatasetRoot, { recursive: true });

const counts: Record<Conic10kSplit, number> = { train: 0, dev: 0, test: 0 };

for (const split of splits) {
  const inputPath = join(datasetRoot, `${split}.json`);
  const outputPath = join(outputDatasetRoot, `${split}.json`);
  const rawItems = JSON.parse(readFileSync(inputPath, "utf8")) as Conic10kItem[];
  const cases = rawItems.map((item, index) => transformConic10kItem(item, split, index));
  writeFileSync(outputPath, `${JSON.stringify(cases, null, 2)}\n`);
  counts[split] = cases.length;
}

writeFileSync(
  join(outputDatasetRoot, "README.md"),
  [
    "# Conic10K Converted Cases",
    "",
    `Generated from ${sourceRepository} at ${sourceCommit}.`,
    "",
    "Each split file is an array of GeoChat problem-case objects converted from the upstream Conic10K fields.",
    "The upstream dataset is MIT licensed; see `../LICENSE.Conic10K`.",
    ""
  ].join("\n")
);

console.log(`Imported Conic10K from ${datasetRoot} into ${outputDatasetRoot}`);
console.log(`Counts: train=${counts.train}, dev=${counts.dev}, test=${counts.test}, total=${counts.train + counts.dev + counts.test}`);

function transformConic10kItem(item: Conic10kItem, split: Conic10kSplit, index: number) {
  const sourceItemId = `${split}-${String(index + 1).padStart(5, "0")}`;
  const text = requiredString(item.text, `${basename(split)}#${index + 1}.text`);
  const answer = stringOrEmpty(item.answer_expressions);
  const factExpressions = stringOrEmpty(item.fact_expressions);
  const queryExpressions = stringOrEmpty(item.query_expressions);
  const process = stringOrEmpty(item.process);
  const promptParts = [
    `【Conic10K 源题 ${sourceItemId}】${text}`,
    "",
    "请完成解析几何推理，并生成适合 GeoGebra 画板复核的构造或可视化说明。",
    "作图时优先表达题目给定对象、关键关系和结论验证；不要为了美化调整颜色、字体、线宽或点大小。",
    "",
    "形式化信息：",
    `- 已知表达式：${factExpressions || "无"}`,
    `- 待求表达式：${queryExpressions || "无"}`
  ];

  return {
    id: `conic10k-${sourceItemId}`,
    title: `Conic10K ${split} #${index + 1}: ${shortTitle(text)}`,
    kind: "math_problem",
    input: {
      type: "text",
      text: promptParts.join("\n"),
      imageRefs: []
    },
    expected: {
      pipeline: "single_agent_react",
      problemType: "conic10k_analytic_geometry",
      answer,
      artifacts: ["geogebra_commands", "solution_walkthrough", "teaching_explanation", "visual_explanation"]
    },
    split,
    taskType: "solve",
    scoringProfile: "geometry-agent-v2",
    oracle: {
      knownAnswer: answer,
      objects: [],
      relations: [],
      notes: "Conic10K expressions are preserved in metadata for model/tool evaluation."
    },
    rubric: [
      "正确识别圆锥曲线、焦点、切线、交点、距离或表达式关系。",
      "给出可复核的代数推理或几何解释。",
      "GeoGebra 画板应服务于题目关系验证，不应依赖颜色、线宽、字体等样式调整。"
    ],
    tags: ["conic10k", `conic10k-${split}`, "analytic-geometry", "conic-section", "visual-candidate"],
    difficulty: split === "train" ? "medium" : "hard",
    notes: "Converted from whyNLP/Conic10K under the MIT license.",
    metadata: {
      sourceCollection: "conic10k",
      sourceDataset: "Conic10K",
      sourceLicense: "MIT",
      sourceRepository,
      sourceCommit,
      sourceItemId,
      sourcePath: `conic10k/${split}.json`,
      sourceSplit: split,
      sourceIndex: index,
      sourcePaper: "Conic10K",
      sourceQuestionType: "open_ended",
      sourceCategory: "conic_section",
      sourceTopics: ["analytic_geometry", "conic_section"],
      visualPotential: true,
      conversionStatus: "converted_from_conic10k",
      sourceAnalysis: process,
      factExpressions,
      queryExpressions,
      answerExpressions: answer,
      factSpans: parseJsonString(item.fact_spans),
      querySpans: parseJsonString(item.query_spans)
    }
  };
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing required Conic10K field: ${field}`);
  return value.trim();
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function shortTitle(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 54);
}
