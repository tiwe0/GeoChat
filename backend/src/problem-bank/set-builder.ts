import type { ImportedProblem, ProblemCaseSet } from "./types";

export function createProblemCaseSets(problemsInput: ImportedProblem[]): ProblemCaseSet[] {
  const isConic10kProblem = (problem: ImportedProblem) => problem.id.startsWith("conic10k-") || problem.tags.includes("conic10k");
  const gaokaoFull = problemsInput.filter((problem) => problem.id.startsWith("gaokao-full"));
  const conic10k = problemsInput.filter(isConic10kProblem);
  const conicTrain = conic10k.filter((problem) => problem.tags.includes("conic10k-train"));
  const conicDev = conic10k.filter((problem) => problem.tags.includes("conic10k-dev"));
  const conicTest = conic10k.filter((problem) => problem.tags.includes("conic10k-test"));
  const manual = problemsInput.filter((problem) => !problem.id.startsWith("gaokao-full") && !isConic10kProblem(problem));
  const visual = problemsInput.filter((problem) => problem.visualPotential);
  const analytic = problemsInput.filter((problem) => problem.topics.includes("analytic_geometry") || problem.tags.includes("analytic-geometry"));
  const animation = problemsInput.filter((problem) => problem.taskType === "animation");
  const yearSets = Array.from(new Set(problemsInput.map((problem) => problem.year).filter((year): year is string => Boolean(year))))
    .sort((a, b) => Number(b) - Number(a))
    .map((year) => ({
      id: `set-year-${year}`,
      slug: `year-${year}`,
      title: `${year} 年题库`,
      description: `${year} 年高考数学题，适合按年份练习、讲解和复盘。`,
      kind: "generated" as const,
      problemIds: problemsInput.filter((problem) => problem.year === year).map((problem) => problem.id)
    }));
  return [
    {
      id: "set-gaokao-all",
      slug: "gaokao-all",
      title: "GAOKAO 数学全量题库",
      description: "从 GeoChat benchmark 转换而来的 2010-2022 高考数学题，可用于讲解、构造和教学演示。",
      kind: "imported" as const,
      problemIds: gaokaoFull.map((problem) => problem.id)
    },
    {
      id: "set-conic10k-all",
      slug: "conic10k",
      title: "Conic10K 圆锥曲线题库",
      description: "基于 Conic10K 转换的圆锥曲线解析几何题，适合训练代数表达、几何关系和画板讲解。",
      kind: "imported" as const,
      problemIds: conic10k.map((problem) => problem.id)
    },
    {
      id: "set-conic10k-dev",
      slug: "conic10k-dev",
      title: "Conic10K 验证集",
      description: "Conic10K dev split，适合日常调优、回归测试和快速抽样评估。",
      kind: "generated" as const,
      problemIds: conicDev.map((problem) => problem.id)
    },
    {
      id: "set-conic10k-test",
      slug: "conic10k-test",
      title: "Conic10K 测试集",
      description: "Conic10K test split，适合保留作阶段性评测和泛化检查。",
      kind: "generated" as const,
      problemIds: conicTest.map((problem) => problem.id)
    },
    {
      id: "set-conic10k-train",
      slug: "conic10k-train",
      title: "Conic10K 训练集",
      description: "Conic10K train split，题量较大，适合批量训练、离线采样和题型覆盖分析。",
      kind: "generated" as const,
      problemIds: conicTrain.map((problem) => problem.id)
    },
    {
      id: "set-visual-candidates",
      slug: "visual-candidates",
      title: "可视化优先",
      description: "优先适合 GeoGebra 绘图、动态构造或几何解释的题目。",
      kind: "generated" as const,
      problemIds: visual.map((problem) => problem.id)
    },
    {
      id: "set-analytic-geometry",
      slug: "analytic-geometry",
      title: "解析几何精选",
      description: "圆锥曲线、直线、切线、焦点、轨迹等适合画板辅助理解的题目。",
      kind: "generated" as const,
      problemIds: analytic.map((problem) => problem.id)
    },
    {
      id: "set-dynamic-animation",
      slug: "dynamic-animation",
      title: "动态演示",
      description: "滑块、动点、轨迹和课堂动画表达题。",
      kind: "curated" as const,
      problemIds: animation.map((problem) => problem.id)
    },
    {
      id: "set-curated-agent",
      slug: "curated-agent",
      title: "GeoChat 能力样例",
      description: "手工维护的绘图、修改、诊断、3D 和 Agent 行为覆盖样例。",
      kind: "curated" as const,
      problemIds: manual.map((problem) => problem.id)
    },
    ...yearSets
  ].filter((set) => set.problemIds.length > 0);
}
