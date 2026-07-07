import type { FunctionCallLocale } from "../../functioncalls";
import { advancedCompilation } from "../compilation";
import { formatPoint3D } from "../formatting";
import { assertRightSquarePyramidGeometry, assertTriangularPrismGeometry, centroid3D } from "../math3d";
import type { AdvancedDrawingCompilation } from "../types";
import { identifierValue, normalizedArgs, pointCoordinatesWithFallback, pointLabels, positiveNumber } from "../validation";

export function compileTriangularPrismSkeleton(input: Record<string, unknown> | null | undefined, locale?: FunctionCallLocale | null): AdvancedDrawingCompilation {
  const args = normalizedArgs(input, ["pointLabels", "coordinates"], "drawTriangularPrismSkeleton");
  const labels = pointLabels(args.pointLabels, ["A", "B", "C", "A1", "B1", "C1"], "drawTriangularPrismSkeleton");
  const coordinates = pointCoordinatesWithFallback(args.coordinates, [
    [0, 0, 0],
    [4, 0, 0],
    [1.6, 2.6, 0],
    [0.8, 0.5, 3],
    [4.8, 0.5, 3],
    [2.4, 3.1, 3]
  ], "drawTriangularPrismSkeleton", "coordinates");
  assertTriangularPrismGeometry(coordinates, "drawTriangularPrismSkeleton");
  const commands = [
    ...labels.map((label, index) => `${label} = ${formatPoint3D(coordinates[index])}`),
    `baseFace = Polygon(${labels[0]}, ${labels[1]}, ${labels[2]})`,
    `topFace = Polygon(${labels[3]}, ${labels[4]}, ${labels[5]})`,
    `sideA = Segment(${labels[0]}, ${labels[3]})`,
    `sideB = Segment(${labels[1]}, ${labels[4]})`,
    `sideC = Segment(${labels[2]}, ${labels[5]})`,
    `edgeAB = Segment(${labels[0]}, ${labels[1]})`,
    `edgeBC = Segment(${labels[1]}, ${labels[2]})`,
    `edgeCA = Segment(${labels[2]}, ${labels[0]})`,
    `edgeA1B1 = Segment(${labels[3]}, ${labels[4]})`,
    `edgeB1C1 = Segment(${labels[4]}, ${labels[5]})`,
    `edgeC1A1 = Segment(${labels[5]}, ${labels[3]})`,
    `SetColor(baseFace, 86, 180, 233)`,
    `SetFilling(baseFace, 0.16)`,
    `SetColor(topFace, 0, 158, 115)`,
    `SetFilling(topFace, 0.12)`,
    ...labels.map((label) => `ShowLabel(${label}, true)`)
  ];
  return advancedCompilation("drawTriangularPrismSkeleton", locale, {
    titleZh: "绘制三棱柱骨架",
    titleEn: "Draw triangular prism skeleton",
    commands,
    perspective: "T",
    expectedObjects: [...labels, "baseFace", "topFace", "sideA", "sideB", "sideC"],
    outcomeZh: "展示三棱柱上下底面、侧棱和顶点命名。",
    outcomeEn: "Show the triangular prism bases, lateral edges, and vertex labels.",
    hintsZh: ["验证 3D 视图中存在两个三角底面和三条侧棱。", "后续若要补截面，必须先读取 canvas context 里的真实面和棱 label。"],
    hintsEn: ["Verify that the 3D view contains two triangular bases and three lateral edges.", "Read canvas context labels before adding section planes or follow-up styling."]
  });
}

export function compileSquarePyramidSkeleton(input: Record<string, unknown> | null | undefined, locale?: FunctionCallLocale | null): AdvancedDrawingCompilation {
  const args = normalizedArgs(input, ["pointLabels", "coordinates", "centerName", "heightName", "baseHalfSize", "height"], "drawSquarePyramidSkeleton");
  const labels = pointLabels(args.pointLabels, ["A", "B", "C", "D", "S"], "drawSquarePyramidSkeleton");
  const centerName = identifierValue(args.centerName, "O", "drawSquarePyramidSkeleton", "centerName");
  const footName = identifierValue(args.heightName, "SO", "drawSquarePyramidSkeleton", "heightName");
  const halfSize = positiveNumber(args.baseHalfSize, 2, "drawSquarePyramidSkeleton", "baseHalfSize");
  const height = positiveNumber(args.height, 3.2, "drawSquarePyramidSkeleton", "height");
  const coordinates = pointCoordinatesWithFallback(args.coordinates, [
    [-halfSize, -halfSize, 0],
    [halfSize, -halfSize, 0],
    [halfSize, halfSize, 0],
    [-halfSize, halfSize, 0],
    [0, 0, height]
  ], "drawSquarePyramidSkeleton", "coordinates");
  assertRightSquarePyramidGeometry(coordinates, "drawSquarePyramidSkeleton");
  const baseCenter = centroid3D(coordinates.slice(0, 4));
  const commands = [
    ...labels.map((label, index) => `${label} = ${formatPoint3D(coordinates[index])}`),
    `${centerName} = ${formatPoint3D(baseCenter)}`,
    `baseSquare = Polygon(${labels[0]}, ${labels[1]}, ${labels[2]}, ${labels[3]})`,
    `eAB = Segment(${labels[0]}, ${labels[1]})`,
    `eBC = Segment(${labels[1]}, ${labels[2]})`,
    `eCD = Segment(${labels[2]}, ${labels[3]})`,
    `eDA = Segment(${labels[3]}, ${labels[0]})`,
    `lSA = Segment(${labels[4]}, ${labels[0]})`,
    `lSB = Segment(${labels[4]}, ${labels[1]})`,
    `lSC = Segment(${labels[4]}, ${labels[2]})`,
    `lSD = Segment(${labels[4]}, ${labels[3]})`,
    `${footName} = Segment(${labels[4]}, ${centerName})`,
    `diagAC = Segment(${labels[0]}, ${labels[2]})`,
    `diagBD = Segment(${labels[1]}, ${labels[3]})`,
    `SetColor(baseSquare, 86, 180, 233)`,
    `SetFilling(baseSquare, 0.14)`,
    `SetColor(${footName}, 213, 94, 0)`,
    `SetLineThickness(${footName}, 5)`,
    `ShowLabel(${centerName}, true)`,
    ...labels.map((label) => `ShowLabel(${label}, true)`)
  ];
  return advancedCompilation("drawSquarePyramidSkeleton", locale, {
    titleZh: "绘制四棱锥骨架",
    titleEn: "Draw square pyramid skeleton",
    commands,
    perspective: "T",
    expectedObjects: [...labels, centerName, "baseSquare", footName],
    outcomeZh: "展示四棱锥底面、侧棱、底面中心和高。",
    outcomeEn: "Show the square pyramid base, lateral edges, base center, and height.",
    hintsZh: ["验证顶点 S、底面 ABCD、中心 O 和高 SO 都存在。", "若题目不是正四棱锥，后续要根据题设移动顶点或重建底面。"],
    hintsEn: ["Verify that apex S, base ABCD, center O, and height SO exist.", "If the problem is not a regular square pyramid, adjust vertices from the given conditions."]
  });
}
