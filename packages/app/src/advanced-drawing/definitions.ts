import type { AdvancedDrawingToolMetadata, AdvancedDrawingToolName } from "./types";

export const ADVANCED_DRAWING_TOOL_METADATA = {
  drawTriangularPrismSkeleton: {
    name: "drawTriangularPrismSkeleton",
    title: "绘制三棱柱骨架",
    description: "构造教材风格三棱柱骨架，包含上下底面、侧棱和半透明三角底面。",
    requiredSkills: ["prism", "solid-geometry"],
    assumptions: ["底面三点不共线。", "默认构造为斜三棱柱骨架，不自动推断题目给定长度。"],
    parameters: [
      { name: "pointLabels", kind: "identifier", description: "六个顶点名，默认 A,B,C,A1,B1,C1。" },
      { name: "coordinates", kind: "point3d-list", description: "六个三维坐标；若提供，必须保持底面和顶面三角形非退化。" }
    ],
    invariants: ["baseFace 与 topFace 都是三角形。", "sideA/sideB/sideC 连接对应顶点。"]
  },
  drawSquarePyramidSkeleton: {
    name: "drawSquarePyramidSkeleton",
    title: "绘制四棱锥骨架",
    description: "构造标准四棱锥骨架，标出底面中心、高和主要侧棱。",
    requiredSkills: ["solid-geometry", "pyramid-circumsphere"],
    assumptions: ["默认构造为正四棱锥。", "若传入自定义坐标，底面四点应按环向顺序给出。"],
    parameters: [
      { name: "baseHalfSize", kind: "number", description: "默认正方形底面半边长。" },
      { name: "height", kind: "number", description: "默认右四棱锥的锥高，必须为正数。" },
      { name: "pointLabels", kind: "identifier", description: "五个顶点名，默认 A,B,C,D,S。" },
      { name: "coordinates", kind: "point3d-list", description: "五个三维坐标；若提供，底面不能退化。" }
    ],
    invariants: ["baseSquare 使用 A,B,C,D 构成底面。", "高线端点为顶点 S 和底面四点重心。"]
  },
  drawTetrahedronCircumsphere: {
    name: "drawTetrahedronCircumsphere",
    title: "绘制四面体外接球",
    description: "构造一个教材风格四面体骨架，并标出外接球、球心、半径和关键辅助线。",
    requiredSkills: ["pyramid-circumsphere", "sphere"],
    assumptions: ["四个顶点必须构成非退化四面体。", "默认构造为边长 4 的正四面体。"],
    parameters: [
      { name: "sideLength", kind: "number", description: "默认正四面体边长。" },
      { name: "coordinates", kind: "point3d-list", description: "四个三维顶点坐标；若提供，将据此精确计算外接球心。" },
      { name: "centerName", kind: "identifier", description: "外接球心对象名。" },
      { name: "sphereName", kind: "identifier", description: "外接球对象名。" }
    ],
    invariants: ["球心到四个顶点距离相等。", "半径对象由 Distance(center, A) 定义。"]
  },
  drawTetrahedronInsphere: {
    name: "drawTetrahedronInsphere",
    title: "绘制四面体内切球",
    description: "构造正四面体、内切球、内心和到面的垂直半径，适合讲解等距到面。",
    requiredSkills: ["pyramid-circumsphere", "sphere"],
    assumptions: ["四个顶点必须构成非退化四面体。", "默认构造为边长 4 的正四面体。"],
    parameters: [
      { name: "sideLength", kind: "number", description: "默认正四面体边长。" },
      { name: "coordinates", kind: "point3d-list", description: "四个三维顶点坐标；若提供，将据此计算内心和到底面切点。" },
      { name: "centerName", kind: "identifier", description: "内心对象名。" },
      { name: "tangentPointName", kind: "identifier", description: "到底面 ABC 的垂足/切点名。" }
    ],
    invariants: ["内心按对面面积加权计算。", "半径为内心到底面 ABC 的垂直距离。"]
  },
  drawUnitCircleTrigProjection: {
    name: "drawUnitCircleTrigProjection",
    title: "绘制单位圆三角函数投影",
    description: "构造单位圆、逆时针角、终边点以及 sin/cos 投影线。",
    requiredSkills: ["trigonometric-unit-circle", "trigonometric-function"],
    assumptions: ["角以 x 正半轴为起边，按 GeoGebra 的 Angle(U,O,P) 顺序标注。"],
    parameters: [
      { name: "angleDegrees", kind: "number", description: "角度字面值，或 tagged ggb_expr 表达式。" },
      { name: "radius", kind: "number", description: "圆半径，必须为正。" },
      { name: "angleName", kind: "identifier", description: "角度参数对象名。" },
      { name: "pointName", kind: "identifier", description: "单位圆上终边点名。" }
    ],
    invariants: ["终边点坐标为 r*cos(theta), r*sin(theta)。", "cos 投影在 x 轴上，sin 投影是从终边点到 x 轴的短线段。"]
  },
  drawParabolaFocusDirectrix: {
    name: "drawParabolaFocusDirectrix",
    title: "绘制抛物线焦点准线",
    description: "构造标准抛物线、焦点、准线和点到焦点/准线的等距示意。",
    requiredSkills: ["conic-focus-directrix", "analytic-geometry-conic"],
    assumptions: ["使用标准竖直抛物线 x^2 = 4py，且 p > 0。"],
    parameters: [
      { name: "p", kind: "number", description: "焦参数，取正值且至少 0.25。" },
      { name: "sampleX", kind: "number", description: "示意点 P 的 x 坐标。" },
      { name: "parameterName", kind: "identifier", description: "焦参数对象名。" }
    ],
    invariants: ["焦点为 (0,p)。", "准线为 y=-p。", "示意点 P 在抛物线上。"]
  },
  drawQuadraticVertexDiagram: {
    name: "drawQuadraticVertexDiagram",
    title: "绘制二次函数顶点图",
    description: "构造顶点式二次函数、顶点、对称轴和左右对称点。",
    requiredSkills: ["quadratic-function", "function-graph"],
    assumptions: ["使用顶点式 f(x)=a(x-h)^2+k，且 a 不能为 0。"],
    parameters: [
      { name: "a", kind: "number", description: "二次项系数，不能为 0。" },
      { name: "h", kind: "number", description: "顶点横坐标。" },
      { name: "k", kind: "number", description: "顶点纵坐标。" },
      { name: "sampleOffset", kind: "number", description: "对称点相对顶点的水平距离，必须为正。" }
    ],
    invariants: ["顶点 V=(h,k)。", "对称轴为 x=h。", "L 与 R 关于 x=h 对称。"]
  },
  drawClassicalProbabilityGrid: {
    name: "drawClassicalProbabilityGrid",
    title: "绘制古典概型样本空间网格",
    description: "构造两枚骰子的 6x6 样本空间网格，并标出点数和为 7 的事件。",
    requiredSkills: ["classical-probability", "probability-statistics"],
    assumptions: ["两个结果空间等可能，且每个维度有相同面数。"],
    parameters: [
      { name: "sides", kind: "integer", description: "每个维度的结果数，限制在 2 到 8。" },
      { name: "targetSum", kind: "integer", description: "需要标记的点数和，限制在 2 到 2*sides。" }
    ],
    invariants: ["网格包含 sides^2 个等可能样本点所在单元。", "被标出的事件点满足 first + second = targetSum。"]
  }
} satisfies Record<AdvancedDrawingToolName, AdvancedDrawingToolMetadata>;
