import type { ProblemSummary } from "@geochat-ai/app";

export type ProblemBankFilters = {
  query: string;
  difficulty: "all" | "easy" | "medium" | "hard";
  questionType: "all" | ProblemSummary["questionType"];
  year: "all" | string;
  paper: "all" | string;
  visualOnly: boolean;
};

const internalProblemPromptSuffixes = [
  "请先完成数学分析，再生成适合教学复核的 GeoGebra 可视化，并说明图形如何支持结论。",
  "请完成数学分析，必要时用表格、数轴、函数图像或简洁示意辅助讲解，并给出适合学生复盘的说明。",
  "请完成数学分析，必要时生成适合教学复核的 GeoGebra 可视化，并说明图形如何支持结论。"
];

const internalProblemPromptMarkers = [
  /(?:\s*\n\s*)+请先完成数学分析[\s\S]*$/u,
  /(?:\s*\n\s*)+请完成数学分析[\s\S]*$/u,
  /请围绕[^。]*GeoGebra 可视化。/gu,
  /题目没有额外配图[^。]*。/gu
];

const internalProblemPromptInlineReplacements: Array<[RegExp, string]> = [
  [/，并给出每个选项的解析和适合教学的 GeoGebra 可视化。/gu, "。"],
  [/，并生成适合教学的 GeoGebra 可视化。/gu, "。"]
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function problemDisplayPrompt(prompt: string) {
  const withoutKnownSuffixes = internalProblemPromptSuffixes
    .reduce((display, suffix) => display.replace(new RegExp(`(?:\\s*\\n\\s*)*${escapeRegExp(suffix)}\\s*$`), ""), prompt.trim())
    .trim();
  const withoutInlineInstructions = internalProblemPromptInlineReplacements
    .reduce((display, [pattern, replacement]) => display.replace(pattern, replacement), withoutKnownSuffixes);
  return internalProblemPromptMarkers.reduce((display, marker) => display.replace(marker, "").trim(), withoutInlineInstructions).trim();
}
