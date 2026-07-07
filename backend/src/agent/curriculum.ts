import type { AgentSkillSummary } from "./skills";

export const CURRICULUM_VISUAL_PROFILE_NAMES = [
  "exam-clean",
  "teaching-demo",
  "choice-comparison",
  "dynamic-exploration",
  "proof-highlight",
  "spatial-3d"
] as const;

export type CurriculumVisualProfileName = (typeof CURRICULUM_VISUAL_PROFILE_NAMES)[number];

export type CurriculumNode = {
  id: string;
  source: "pep";
  stage: "junior" | "senior";
  edition: "人教版" | "人教A版";
  book: string;
  chapter: string;
  section?: string;
  keywords: string[];
  aliases: string[];
  skillIds: string[];
  recipeIds: string[];
  visualProfiles: CurriculumVisualProfileName[];
  prerequisites?: string[];
};

export type CurriculumCatalogSummary = {
  source: CurriculumNode["source"];
  stage: CurriculumNode["stage"];
  edition: CurriculumNode["edition"];
  books: string[];
  nodeCount: number;
};

export type CurriculumSearchOptions = {
  query: string;
  stage?: CurriculumNode["stage"] | null;
  book?: string | null;
  limit?: number | null;
};

export type CurriculumSearchResult = CurriculumNode & {
  score: number;
  matchedFields: string[];
};

const ALGEBRA_SKILLS = ["number-expression", "factorization-formulas"];
const EQUATION_SKILLS = ["equations-inequalities", "quadratic-equation", "inequality-interval"];
const GRAPH_FUNCTION_SKILLS = ["function-graph", "quadratic-function"];
const PLANE_GEOMETRY_SKILLS = ["plane-geometry", "triangle-circle-geometry", "geometric-transformations", "geometric-construction"];
const SOLID_GEOMETRY_SKILLS = ["solid-geometry", "solid-section", "prism", "sphere", "pyramid-circumsphere"];
const CONIC_SKILLS = ["analytic-geometry-conic", "conic-focus-directrix"];
const PROBABILITY_SKILLS = ["probability-statistics", "classical-probability", "statistical-distribution"];

const CURRICULUM_NODES: CurriculumNode[] = [
  node("pep-junior-7a-rational-number", "junior", "人教版", "七年级上册", "有理数", {
    keywords: ["正数", "负数", "数轴", "相反数", "绝对值", "有理数运算", "科学记数法"],
    aliases: ["七上有理数", "整数分数", "数轴表示"],
    skillIds: ["number-expression"],
    recipeIds: ["number-line-interval-explain", "structure-preserving-simplification"],
    visualProfiles: ["exam-clean", "teaching-demo"]
  }),
  node("pep-junior-7a-polynomial-add-sub", "junior", "人教版", "七年级上册", "整式的加减", {
    keywords: ["单项式", "多项式", "同类项", "合并同类项", "去括号", "整式化简"],
    aliases: ["七上整式", "整式加减"],
    skillIds: ALGEBRA_SKILLS,
    recipeIds: ["structure-preserving-simplification", "common-factor-scan"],
    visualProfiles: ["exam-clean"]
  }),
  node("pep-junior-7a-linear-equation", "junior", "人教版", "七年级上册", "一元一次方程", {
    keywords: ["等式性质", "移项", "去分母", "实际问题", "方程建模"],
    aliases: ["七上一元一次方程", "一次方程"],
    skillIds: ["equations-inequalities"],
    recipeIds: ["equivalent-transform-with-guards"],
    visualProfiles: ["exam-clean", "teaching-demo"]
  }),
  node("pep-junior-7a-geometry-intro", "junior", "人教版", "七年级上册", "几何图形初步", {
    keywords: ["立体图形", "平面图形", "直线", "射线", "线段", "角", "余角", "补角"],
    aliases: ["七上几何初步", "线段角"],
    skillIds: ["plane-geometry", "geometric-construction"],
    recipeIds: ["base-diagram-then-auxiliary", "ruler-compass-step-replay"],
    visualProfiles: ["teaching-demo", "proof-highlight"]
  }),
  node("pep-junior-7b-parallel-lines", "junior", "人教版", "七年级下册", "相交线与平行线", {
    keywords: ["对顶角", "垂线", "平行线", "同位角", "内错角", "同旁内角", "平移"],
    aliases: ["七下平行线", "相交线"],
    skillIds: ["plane-geometry", "geometric-transformations"],
    recipeIds: ["base-diagram-then-auxiliary", "source-image-correspondence"],
    visualProfiles: ["proof-highlight", "teaching-demo"]
  }),
  node("pep-junior-7b-real-number", "junior", "人教版", "七年级下册", "实数", {
    keywords: ["平方根", "算术平方根", "立方根", "无理数", "实数", "二次根式"],
    aliases: ["七下实数", "根号数"],
    skillIds: ["number-expression"],
    recipeIds: ["domain-constraints-first", "structure-preserving-simplification"],
    visualProfiles: ["exam-clean"]
  }),
  node("pep-junior-7b-coordinate-plane", "junior", "人教版", "七年级下册", "平面直角坐标系", {
    keywords: ["坐标", "象限", "点的坐标", "坐标平移", "有序数对"],
    aliases: ["七下坐标系", "直角坐标系"],
    skillIds: ["function-graph", "plane-geometry", "geometric-transformations"],
    recipeIds: ["expression-table-graph-link", "source-image-correspondence"],
    visualProfiles: ["teaching-demo", "dynamic-exploration"]
  }),
  node("pep-junior-7b-linear-system", "junior", "人教版", "七年级下册", "二元一次方程组", {
    keywords: ["代入消元", "加减消元", "二元一次方程", "方程组", "实际问题"],
    aliases: ["七下方程组", "二元一次"],
    skillIds: ["equations-inequalities", "function-graph"],
    recipeIds: ["equivalent-transform-with-guards", "expression-table-graph-link"],
    visualProfiles: ["exam-clean", "teaching-demo"]
  }),
  node("pep-junior-7b-inequality", "junior", "人教版", "七年级下册", "不等式与不等式组", {
    keywords: ["不等式性质", "一元一次不等式", "不等式组", "解集", "数轴"],
    aliases: ["七下不等式", "不等式组"],
    skillIds: ["equations-inequalities", "inequality-interval"],
    recipeIds: ["critical-point-sign-chart", "number-line-endpoint-check"],
    visualProfiles: ["exam-clean", "teaching-demo"]
  }),
  node("pep-junior-7b-data", "junior", "人教版", "七年级下册", "数据的收集、整理与描述", {
    keywords: ["全面调查", "抽样调查", "频数", "频率", "直方图", "扇形统计图"],
    aliases: ["七下数据", "数据收集整理描述"],
    skillIds: ["probability-statistics"],
    recipeIds: ["frequency-distribution-chart"],
    visualProfiles: ["teaching-demo"]
  }),
  node("pep-junior-8a-triangle", "junior", "人教版", "八年级上册", "三角形", {
    keywords: ["三角形边角", "高线", "中线", "角平分线", "内角和", "外角"],
    aliases: ["八上三角形"],
    skillIds: ["plane-geometry", "triangle-circle-geometry"],
    recipeIds: ["base-diagram-then-auxiliary", "similarity-congruence-highlight"],
    visualProfiles: ["proof-highlight"]
  }),
  node("pep-junior-8a-congruent-triangle", "junior", "人教版", "八年级上册", "全等三角形", {
    keywords: ["全等", "SSS", "SAS", "ASA", "AAS", "HL", "证明"],
    aliases: ["八上全等", "三角形全等"],
    skillIds: ["plane-geometry"],
    recipeIds: ["similarity-congruence-highlight"],
    visualProfiles: ["proof-highlight"]
  }),
  node("pep-junior-8a-axis-symmetry", "junior", "人教版", "八年级上册", "轴对称", {
    keywords: ["轴对称", "垂直平分线", "等腰三角形", "作轴对称图形", "最短路径"],
    aliases: ["八上轴对称", "对称轴"],
    skillIds: ["geometric-transformations", "geometric-construction"],
    recipeIds: ["symmetry-axis-pairing", "bisector-locus-explain"],
    visualProfiles: ["teaching-demo", "dynamic-exploration"]
  }),
  node("pep-junior-8a-multiply-factor", "junior", "人教版", "八年级上册", "整式的乘法与因式分解", {
    keywords: ["幂的运算", "整式乘法", "乘法公式", "平方差", "完全平方", "因式分解"],
    aliases: ["八上因式分解", "乘法公式"],
    skillIds: ALGEBRA_SKILLS,
    recipeIds: ["formula-pattern-match", "complete-square-rewrite", "common-factor-scan"],
    visualProfiles: ["exam-clean"]
  }),
  node("pep-junior-8a-fraction-expression", "junior", "人教版", "八年级上册", "分式", {
    keywords: ["分式", "分式方程", "约分", "通分", "最简分式", "增根"],
    aliases: ["八上分式"],
    skillIds: ["number-expression", "equations-inequalities"],
    recipeIds: ["domain-constraints-first", "equivalent-transform-with-guards"],
    visualProfiles: ["exam-clean"]
  }),
  node("pep-junior-8b-quadratic-radical", "junior", "人教版", "八年级下册", "二次根式", {
    keywords: ["二次根式", "最简二次根式", "根式运算", "有意义条件"],
    aliases: ["八下二次根式", "根式化简"],
    skillIds: ["number-expression"],
    recipeIds: ["domain-constraints-first", "structure-preserving-simplification"],
    visualProfiles: ["exam-clean"]
  }),
  node("pep-junior-8b-pythagorean", "junior", "人教版", "八年级下册", "勾股定理", {
    keywords: ["勾股定理", "逆定理", "直角三角形", "距离", "面积证明"],
    aliases: ["八下勾股", "勾股逆定理"],
    skillIds: ["plane-geometry", "solid-geometry"],
    recipeIds: ["base-diagram-then-auxiliary", "projection-auxiliary-triangle"],
    visualProfiles: ["proof-highlight", "teaching-demo"]
  }),
  node("pep-junior-8b-parallelogram", "junior", "人教版", "八年级下册", "平行四边形", {
    keywords: ["平行四边形", "矩形", "菱形", "正方形", "中位线", "判定"],
    aliases: ["八下四边形", "特殊平行四边形"],
    skillIds: ["plane-geometry"],
    recipeIds: ["base-diagram-then-auxiliary", "similarity-congruence-highlight"],
    visualProfiles: ["proof-highlight"]
  }),
  node("pep-junior-8b-linear-function", "junior", "人教版", "八年级下册", "一次函数", {
    keywords: ["一次函数", "正比例函数", "函数图象", "斜率", "截距", "交点"],
    aliases: ["八下一次函数", "直线函数"],
    skillIds: ["function-graph"],
    recipeIds: ["expression-table-graph-link", "parameter-slider-transform"],
    visualProfiles: ["dynamic-exploration", "teaching-demo"]
  }),
  node("pep-junior-8b-data-analysis", "junior", "人教版", "八年级下册", "数据的分析", {
    keywords: ["平均数", "中位数", "众数", "方差", "数据波动"],
    aliases: ["八下数据分析"],
    skillIds: ["probability-statistics", "statistical-distribution"],
    recipeIds: ["histogram-boxplot-summary", "mean-variance-compare"],
    visualProfiles: ["teaching-demo"]
  }),
  node("pep-junior-9a-quadratic-equation", "junior", "人教版", "九年级上册", "一元二次方程", {
    keywords: ["一元二次方程", "配方法", "公式法", "判别式", "根与系数关系"],
    aliases: ["九上一元二次方程", "韦达定理"],
    skillIds: ["equations-inequalities", "quadratic-equation", "factorization-formulas"],
    recipeIds: ["discriminant-root-count", "vieta-root-relation", "complete-square-rewrite"],
    visualProfiles: ["exam-clean", "teaching-demo"]
  }),
  node("pep-junior-9a-quadratic-function", "junior", "人教版", "九年级上册", "二次函数", {
    keywords: ["二次函数", "抛物线", "顶点", "对称轴", "开口", "最值", "交点"],
    aliases: ["九上二次函数", "二次函数顶点", "抛物线顶点"],
    skillIds: GRAPH_FUNCTION_SKILLS,
    recipeIds: ["vertex-axis-zero-layout", "discriminant-intersection-count", "interval-extremum-visual-check"],
    visualProfiles: ["dynamic-exploration", "choice-comparison"]
  }),
  node("pep-junior-9a-rotation", "junior", "人教版", "九年级上册", "旋转", {
    keywords: ["旋转", "中心对称", "旋转中心", "旋转角", "对应点"],
    aliases: ["九上旋转", "中心对称图形"],
    skillIds: ["geometric-transformations"],
    recipeIds: ["rotation-center-angle-mark", "source-image-correspondence"],
    visualProfiles: ["dynamic-exploration", "teaching-demo"]
  }),
  node("pep-junior-9a-circle", "junior", "人教版", "九年级上册", "圆", {
    keywords: ["圆", "垂径定理", "圆周角", "弧", "切线", "正多边形", "扇形"],
    aliases: ["九上圆", "圆周角切线"],
    skillIds: ["plane-geometry", "triangle-circle-geometry", "geometric-construction"],
    recipeIds: ["inscribed-angle-same-arc", "tangent-radius-perpendicular", "circumcircle-auxiliary-line"],
    visualProfiles: ["proof-highlight", "dynamic-exploration"]
  }),
  node("pep-junior-9a-probability", "junior", "人教版", "九年级上册", "概率初步", {
    keywords: ["随机事件", "概率", "列表法", "画树状图", "古典概型"],
    aliases: ["九上概率", "概率初步"],
    skillIds: ["probability-statistics", "classical-probability"],
    recipeIds: ["tree-or-grid-sample-space", "favorable-over-total-count"],
    visualProfiles: ["teaching-demo"]
  }),
  node("pep-junior-9b-inverse-function", "junior", "人教版", "九年级下册", "反比例函数", {
    keywords: ["反比例函数", "双曲线", "象限", "k值", "面积"],
    aliases: ["九下反比例函数"],
    skillIds: ["function-graph"],
    recipeIds: ["expression-table-graph-link", "parameter-slider-transform"],
    visualProfiles: ["dynamic-exploration"]
  }),
  node("pep-junior-9b-similarity", "junior", "人教版", "九年级下册", "相似", {
    keywords: ["比例线段", "相似三角形", "位似", "相似比", "面积比"],
    aliases: ["九下相似", "相似三角形"],
    skillIds: ["plane-geometry", "geometric-transformations"],
    recipeIds: ["similarity-congruence-highlight", "source-image-correspondence"],
    visualProfiles: ["proof-highlight", "dynamic-exploration"]
  }),
  node("pep-junior-9b-right-trig", "junior", "人教版", "九年级下册", "锐角三角函数", {
    keywords: ["正弦", "余弦", "正切", "特殊角", "解直角三角形", "仰角俯角"],
    aliases: ["九下锐角三角函数", "解直角三角形"],
    skillIds: ["trigonometric-function", "trigonometric-unit-circle", "plane-geometry"],
    recipeIds: ["special-angle-coordinate", "quadrant-sign-check", "base-diagram-then-auxiliary"],
    visualProfiles: ["teaching-demo", "dynamic-exploration"]
  }),
  node("pep-junior-9b-projection-view", "junior", "人教版", "九年级下册", "投影与视图", {
    keywords: ["投影", "中心投影", "平行投影", "三视图", "主视图", "俯视图", "左视图"],
    aliases: ["九下投影视图", "三视图"],
    skillIds: ["solid-geometry"],
    recipeIds: ["3d-skeleton-first", "projection-auxiliary-triangle"],
    visualProfiles: ["spatial-3d", "teaching-demo"]
  }),
  node("pep-senior-a-compulsory-1-set-logic", "senior", "人教A版", "必修第一册", "集合与常用逻辑用语", {
    keywords: ["集合", "交集", "并集", "补集", "充分条件", "必要条件", "全称量词", "存在量词"],
    aliases: ["高中集合", "常用逻辑用语"],
    skillIds: ["number-expression", "equations-inequalities"],
    recipeIds: ["domain-constraints-first", "equivalent-transform-with-guards"],
    visualProfiles: ["exam-clean"]
  }),
  node("pep-senior-a-compulsory-1-quadratic-inequality", "senior", "人教A版", "必修第一册", "一元二次函数、方程和不等式", {
    keywords: ["一元二次", "二次函数", "二次方程", "二次不等式", "判别式", "韦达定理", "区间"],
    aliases: ["高中一元二次", "二次不等式"],
    skillIds: ["quadratic-function", "quadratic-equation", "inequality-interval", "equations-inequalities"],
    recipeIds: ["vertex-axis-zero-layout", "discriminant-root-count", "critical-point-sign-chart"],
    visualProfiles: ["choice-comparison", "dynamic-exploration"]
  }),
  node("pep-senior-a-compulsory-1-function-concept", "senior", "人教A版", "必修第一册", "函数的概念与性质", {
    keywords: ["函数定义域", "值域", "单调性", "奇偶性", "幂函数", "函数性质"],
    aliases: ["高中函数性质", "函数概念"],
    skillIds: ["function-graph", "polynomial-function"],
    recipeIds: ["expression-table-graph-link", "parameter-slider-transform", "roots-extrema-monotonicity"],
    visualProfiles: ["dynamic-exploration", "teaching-demo"]
  }),
  node("pep-senior-a-compulsory-1-exp-log", "senior", "人教A版", "必修第一册", "指数函数与对数函数", {
    keywords: ["指数函数", "对数函数", "指数运算", "对数运算", "底数", "定义域", "渐近线"],
    aliases: ["高中指数对数", "指数对数函数"],
    skillIds: ["exponential-logarithmic-function", "exponential-log-transform", "function-graph"],
    recipeIds: ["base-monotonicity-compare", "log-domain-guard", "asymptote-shift-mark"],
    visualProfiles: ["dynamic-exploration", "choice-comparison"]
  }),
  node("pep-senior-a-compulsory-1-trig", "senior", "人教A版", "必修第一册", "三角函数", {
    keywords: ["任意角", "弧度制", "单位圆", "诱导公式", "正弦函数", "余弦函数", "周期", "相位"],
    aliases: ["高中三角函数", "单位圆三角"],
    skillIds: ["trigonometric-function", "trigonometric-unit-circle"],
    recipeIds: ["unit-circle-to-graph", "period-amplitude-phase", "reference-angle-reduction"],
    visualProfiles: ["dynamic-exploration", "teaching-demo"]
  }),
  node("pep-senior-a-compulsory-2-vector", "senior", "人教A版", "必修第二册", "平面向量及其应用", {
    keywords: ["向量", "向量加法", "数量积", "投影", "共线", "垂直", "余弦定理", "正弦定理"],
    aliases: ["高中平面向量", "向量应用"],
    skillIds: ["vector", "plane-geometry"],
    recipeIds: ["coordinate-vector-decompose", "dot-product-projection", "collinearity-perpendicular-check"],
    visualProfiles: ["teaching-demo", "proof-highlight"]
  }),
  node("pep-senior-a-compulsory-2-complex", "senior", "人教A版", "必修第二册", "复数", {
    keywords: ["复数", "虚数单位", "复平面", "模", "共轭复数"],
    aliases: ["高中复数", "复平面"],
    skillIds: ["number-expression", "function-graph"],
    recipeIds: ["structure-preserving-simplification", "expression-table-graph-link"],
    visualProfiles: ["exam-clean", "teaching-demo"]
  }),
  node("pep-senior-a-compulsory-2-solid", "senior", "人教A版", "必修第二册", "立体几何初步", {
    keywords: ["空间几何体", "棱柱", "棱锥", "圆柱", "圆锥", "球", "三视图", "表面积", "体积", "四面体外接球", "外接球"],
    aliases: ["高中立体几何初步", "空间几何体", "四面体外接球"],
    skillIds: SOLID_GEOMETRY_SKILLS,
    recipeIds: ["3d-skeleton-first", "volume-base-height-mark", "center-radius-constraint", "base-circumcenter-axis"],
    visualProfiles: ["spatial-3d", "teaching-demo"]
  }),
  node("pep-senior-a-compulsory-2-statistics", "senior", "人教A版", "必修第二册", "统计", {
    keywords: ["抽样", "分层抽样", "频率分布", "百分位数", "平均数", "方差"],
    aliases: ["高中统计"],
    skillIds: ["probability-statistics", "statistical-distribution"],
    recipeIds: ["frequency-distribution-chart", "histogram-boxplot-summary", "mean-variance-compare"],
    visualProfiles: ["teaching-demo"]
  }),
  node("pep-senior-a-compulsory-2-probability", "senior", "人教A版", "必修第二册", "概率", {
    keywords: ["样本空间", "随机事件", "古典概型", "互斥事件", "对立事件", "独立事件", "概率性质"],
    aliases: ["高中概率", "样本空间古典概型"],
    skillIds: PROBABILITY_SKILLS,
    recipeIds: ["sample-space-structure", "tree-or-grid-sample-space", "favorable-over-total-count", "complement-event-check"],
    visualProfiles: ["teaching-demo", "choice-comparison"]
  }),
  node("pep-senior-a-selective-1-space-vector", "senior", "人教A版", "选择性必修第一册", "空间向量与立体几何", {
    keywords: ["空间向量", "空间直角坐标系", "空间角", "距离", "法向量", "线面角", "二面角"],
    aliases: ["选择性必修一空间向量", "空间向量立体几何"],
    skillIds: ["vector", "solid-geometry"],
    recipeIds: ["coordinate-vector-decompose", "dot-product-projection", "angle-distance-measurement-check"],
    visualProfiles: ["spatial-3d", "proof-highlight"]
  }),
  node("pep-senior-a-selective-1-line-circle", "senior", "人教A版", "选择性必修第一册", "直线和圆的方程", {
    keywords: ["直线方程", "斜率", "距离公式", "圆的方程", "切线", "弦长", "交点"],
    aliases: ["选择性必修一直线圆", "直线与圆"],
    skillIds: ["analytic-geometry-conic", "function-graph", "triangle-circle-geometry"],
    recipeIds: ["coordinate-object-extract", "chord-tangent-locus-visualize", "tangent-radius-perpendicular"],
    visualProfiles: ["dynamic-exploration", "choice-comparison"]
  }),
  node("pep-senior-a-selective-1-conic", "senior", "人教A版", "选择性必修第一册", "圆锥曲线的方程", {
    keywords: ["圆锥曲线", "椭圆", "双曲线", "抛物线", "焦点", "准线", "离心率", "焦点准线", "弦长", "切线"],
    aliases: ["选择性必修一圆锥曲线", "圆锥曲线焦点准线", "抛物线焦点准线"],
    skillIds: CONIC_SKILLS,
    recipeIds: ["coordinate-object-extract", "focus-directrix-locus", "eccentricity-parameter-check", "tangent-chord-relation"],
    visualProfiles: ["dynamic-exploration", "choice-comparison"]
  }),
  node("pep-senior-a-selective-2-sequence", "senior", "人教A版", "选择性必修第二册", "数列", {
    keywords: ["数列", "等差数列", "等比数列", "通项公式", "前n项和", "递推"],
    aliases: ["选择性必修二数列", "等差等比数列"],
    skillIds: ["sequence"],
    recipeIds: ["term-table-discrete-plot", "recurrence-step-unroll", "sum-area-or-stack-model"],
    visualProfiles: ["teaching-demo", "dynamic-exploration"]
  }),
  node("pep-senior-a-selective-2-derivative", "senior", "人教A版", "选择性必修第二册", "一元函数的导数及其应用", {
    keywords: ["导数", "切线", "单调性", "极值", "最值", "恒成立", "参数"],
    aliases: ["选择性必修二导数", "导数应用"],
    skillIds: ["derivative-application", "derivative-tangent", "polynomial-function"],
    recipeIds: ["derivative-sign-monotonicity", "extremum-critical-point", "tangent-point-slope", "parameter-inequality-visual-check"],
    visualProfiles: ["choice-comparison", "dynamic-exploration"]
  }),
  node("pep-senior-a-selective-3-counting", "senior", "人教A版", "选择性必修第三册", "计数原理", {
    keywords: ["分类加法", "分步乘法", "排列", "组合", "二项式定理"],
    aliases: ["选择性必修三计数", "排列组合"],
    skillIds: ["probability-statistics", "classical-probability"],
    recipeIds: ["sample-space-structure", "tree-or-grid-sample-space"],
    visualProfiles: ["exam-clean", "teaching-demo"]
  }),
  node("pep-senior-a-selective-3-random-variable", "senior", "人教A版", "选择性必修第三册", "随机变量及其分布", {
    keywords: ["随机变量", "离散型随机变量", "分布列", "期望", "方差", "二项分布", "正态分布"],
    aliases: ["选择性必修三随机变量", "概率分布"],
    skillIds: ["probability-statistics", "statistical-distribution"],
    recipeIds: ["expected-value-step-table", "mean-variance-compare", "normal-curve-interval-mark"],
    visualProfiles: ["teaching-demo", "choice-comparison"]
  }),
  node("pep-senior-a-selective-3-statistical-analysis", "senior", "人教A版", "选择性必修第三册", "成对数据的统计分析", {
    keywords: ["成对数据", "相关关系", "线性回归", "独立性检验", "列联表"],
    aliases: ["选择性必修三统计分析", "线性回归独立性检验"],
    skillIds: ["probability-statistics", "statistical-distribution"],
    recipeIds: ["frequency-distribution-chart", "mean-variance-compare"],
    visualProfiles: ["teaching-demo", "choice-comparison"]
  })
];

export function listCurriculumCatalogs(): CurriculumCatalogSummary[] {
  const summaries = new Map<string, CurriculumCatalogSummary>();
  for (const item of CURRICULUM_NODES) {
    const key = `${item.source}:${item.stage}:${item.edition}`;
    const summary = summaries.get(key) ?? {
      source: item.source,
      stage: item.stage,
      edition: item.edition,
      books: [],
      nodeCount: 0
    };
    if (!summary.books.includes(item.book)) summary.books.push(item.book);
    summary.nodeCount += 1;
    summaries.set(key, summary);
  }
  return [...summaries.values()].map((summary) => ({
    ...summary,
    books: [...summary.books].sort((left, right) => bookOrder(left) - bookOrder(right) || left.localeCompare(right))
  }));
}

export function listCurriculumNodes() {
  return [...CURRICULUM_NODES];
}

export function loadCurriculumNode(id: string): CurriculumNode {
  const normalized = id.trim().toLowerCase();
  const item = CURRICULUM_NODES.find((nodeItem) => nodeItem.id.toLowerCase() === normalized);
  if (!item) throw new Error(`Curriculum node was not found: ${id}`);
  return item;
}

export function searchCurriculum(options: CurriculumSearchOptions): CurriculumSearchResult[] {
  const query = normalizeText(options.query);
  const terms = tokenizeCurriculumQuery(options.query);
  const stage = options.stage ?? null;
  const book = normalizeText(options.book ?? "");
  const limit = clampLimit(options.limit, 5, 12);
  if (!query && !terms.length) return [];

  return CURRICULUM_NODES
    .filter((item) => !stage || item.stage === stage)
    .filter((item) => !book || normalizeText(item.book) === book)
    .map((item) => scoreCurriculumMatch(item, query, terms))
    .filter((match): match is CurriculumSearchResult => Boolean(match))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export function validateCurriculumCatalogReferences(skills: readonly AgentSkillSummary[]) {
  const errors: string[] = [];
  const skillsByName = new Map(skills.map((skill) => [skill.name, skill]));
  const visualProfiles = new Set<string>(CURRICULUM_VISUAL_PROFILE_NAMES);
  for (const item of CURRICULUM_NODES) {
    if (!item.keywords.length) errors.push(`${item.id} has no keywords.`);
    if (!item.aliases.length) errors.push(`${item.id} has no aliases.`);
    if (!item.skillIds.length) errors.push(`${item.id} has no skillIds.`);
    for (const skillId of item.skillIds) {
      if (!skillsByName.has(skillId)) errors.push(`${item.id} references unknown skill ${skillId}.`);
    }
    const recipes = new Set(item.skillIds.flatMap((skillId) => skillsByName.get(skillId)?.recipes ?? []));
    for (const recipeId of item.recipeIds) {
      if (!recipes.has(recipeId)) errors.push(`${item.id} references recipe ${recipeId} outside selected skills.`);
    }
    for (const profile of item.visualProfiles) {
      if (!visualProfiles.has(profile)) errors.push(`${item.id} references unknown visual profile ${profile}.`);
    }
  }
  return errors;
}

function node(
  id: string,
  stage: CurriculumNode["stage"],
  edition: CurriculumNode["edition"],
  book: string,
  chapter: string,
  options: Omit<CurriculumNode, "id" | "source" | "stage" | "edition" | "book" | "chapter">
): CurriculumNode {
  return {
    id,
    source: "pep",
    stage,
    edition,
    book,
    chapter,
    ...options
  };
}

function scoreCurriculumMatch(item: CurriculumNode, query: string, terms: readonly string[]): CurriculumSearchResult | undefined {
  let score = 0;
  const matchedFields = new Set<string>();
  const fields: Array<{ name: string; weight: number; values: readonly string[] }> = [
    { name: "chapter", weight: 12, values: [item.chapter] },
    { name: "section", weight: 10, values: item.section ? [item.section] : [] },
    { name: "aliases", weight: 9, values: item.aliases },
    { name: "keywords", weight: 7, values: item.keywords },
    { name: "book", weight: 4, values: [item.book, item.edition] },
    { name: "skillIds", weight: 3, values: item.skillIds },
    { name: "recipeIds", weight: 2, values: item.recipeIds }
  ];

  for (const field of fields) {
    for (const value of field.values) {
      const normalizedValue = normalizeText(value);
      if (!normalizedValue) continue;
      if (query.includes(normalizedValue) || normalizedValue.includes(query)) {
        score += field.weight * 2;
        matchedFields.add(field.name);
      }
      for (const term of terms) {
        if (normalizedValue.includes(term) || term.includes(normalizedValue)) {
          score += field.weight;
          matchedFields.add(field.name);
        }
      }
    }
  }

  if (score <= 0) return undefined;
  return {
    ...item,
    score,
    matchedFields: [...matchedFields]
  };
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/gu, "").trim();
}

function tokenizeCurriculumQuery(value: string) {
  return Array.from(new Set(
    value
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((term) => term.trim())
      .filter(Boolean)
  ));
}

function clampLimit(value: number | null | undefined, fallback: number, max: number) {
  if (!Number.isFinite(value ?? Number.NaN)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value as number)));
}

function bookOrder(book: string) {
  const order = [
    "七年级上册",
    "七年级下册",
    "八年级上册",
    "八年级下册",
    "九年级上册",
    "九年级下册",
    "必修第一册",
    "必修第二册",
    "选择性必修第一册",
    "选择性必修第二册",
    "选择性必修第三册"
  ];
  const index = order.indexOf(book);
  return index >= 0 ? index : order.length;
}
