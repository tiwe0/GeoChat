import type { FunctionCallLocale } from "../../functioncalls";
import { advancedCompilation } from "../compilation";
import { formatPoint3D } from "../formatting";
import {
  assertNondegenerateTetrahedron,
  circumsphereCenter,
  projectPointToPlane,
  tetrahedronIncenter,
  type Point3D
} from "../math3d";
import type { AdvancedDrawingCompilation, AdvancedDrawingToolName } from "../types";
import { identifierValue, normalizedArgs, pointCoordinatesWithFallback, pointLabels, positiveNumber } from "../validation";

export function compileTetrahedronCircumsphere(input: Record<string, unknown> | null | undefined, locale?: FunctionCallLocale | null): AdvancedDrawingCompilation {
  const args = normalizedArgs(input, ["pointLabels", "coordinates", "sideLength", "centerName", "sphereName", "radiusName"], "drawTetrahedronCircumsphere");
  const labels = pointLabels(args.pointLabels, ["A", "B", "C", "D"], "drawTetrahedronCircumsphere");
  const centerName = identifierValue(args.centerName, "O", "drawTetrahedronCircumsphere", "centerName");
  const sphereName = identifierValue(args.sphereName, "circumsphere", "drawTetrahedronCircumsphere", "sphereName");
  const radiusName = identifierValue(args.radiusName, "r", "drawTetrahedronCircumsphere", "radiusName");
  const tetrahedron = regularTetrahedronParameters(args, "drawTetrahedronCircumsphere");
  assertNondegenerateTetrahedron(tetrahedron.vertices, "drawTetrahedronCircumsphere");
  const center = circumsphereCenter(tetrahedron.vertices);
  const commands = [
    ...labels.map((label, index) => `${label} = ${formatPoint3D(tetrahedron.vertices[index])}`),
    `${centerName} = ${formatPoint3D(center)}`,
    `${radiusName} = Distance(${centerName}, ${labels[0]})`,
    `${sphereName} = Sphere(${centerName}, ${radiusName})`,
    `sAB = Segment(${labels[0]}, ${labels[1]})`,
    `sAC = Segment(${labels[0]}, ${labels[2]})`,
    `sBC = Segment(${labels[1]}, ${labels[2]})`,
    `sAD = Segment(${labels[0]}, ${labels[3]})`,
    `sBD = Segment(${labels[1]}, ${labels[3]})`,
    `sCD = Segment(${labels[2]}, ${labels[3]})`,
    `radA = Segment(${centerName}, ${labels[0]})`,
    `SetColor(${sphereName}, 86, 180, 233)`,
    `SetFilling(${sphereName}, 0.18)`,
    `SetColor(radA, 213, 94, 0)`,
    `SetLineThickness(radA, 5)`,
    `SetColor(${centerName}, 0, 114, 178)`,
    `ShowLabel(${centerName}, true)`,
    ...labels.map((label) => `ShowLabel(${label}, true)`)
  ];
  return advancedCompilation("drawTetrahedronCircumsphere", locale, {
    titleZh: "绘制四面体外接球",
    titleEn: "Draw tetrahedron circumsphere",
    commands,
    perspective: "T",
    expectedObjects: [sphereName, centerName, radiusName, "radA", ...labels],
    outcomeZh: "展示四面体骨架、外接球、球心和一条半径线。",
    outcomeEn: "Show the tetrahedron skeleton, circumsphere, center, and one radius segment.",
    hintsZh: [
      "验证 3D 视图中存在四面体顶点、外接球、球心和半径线段。",
      "如果 GeoGebra 返回了不同的球面对象 label，后续样式化必须以 canvas context 中的真实 label 为准。"
    ],
    hintsEn: [
      "Verify that the 3D view contains the tetrahedron vertices, circumsphere, center, and radius segment.",
      "If GeoGebra reports a different sphere object label, use the canvas context label for follow-up styling."
    ]
  });
}

export function compileTetrahedronInsphere(input: Record<string, unknown> | null | undefined, locale?: FunctionCallLocale | null): AdvancedDrawingCompilation {
  const args = normalizedArgs(input, ["pointLabels", "coordinates", "sideLength", "centerName", "sphereName", "radiusName", "tangentPointName"], "drawTetrahedronInsphere");
  const labels = pointLabels(args.pointLabels, ["A", "B", "C", "D"], "drawTetrahedronInsphere");
  const centerName = identifierValue(args.centerName, "I", "drawTetrahedronInsphere", "centerName");
  const sphereName = identifierValue(args.sphereName, "insphere", "drawTetrahedronInsphere", "sphereName");
  const radiusName = identifierValue(args.radiusName, "rin", "drawTetrahedronInsphere", "radiusName");
  const tangentPointName = identifierValue(args.tangentPointName, "T", "drawTetrahedronInsphere", "tangentPointName");
  const tetrahedron = regularTetrahedronParameters(args, "drawTetrahedronInsphere");
  assertNondegenerateTetrahedron(tetrahedron.vertices, "drawTetrahedronInsphere");
  const center = tetrahedronIncenter(tetrahedron.vertices);
  const baseCenter = projectPointToPlane(center, tetrahedron.vertices[0], tetrahedron.vertices[1], tetrahedron.vertices[2]);
  const commands = [
    ...labels.map((label, index) => `${label} = ${formatPoint3D(tetrahedron.vertices[index])}`),
    `${centerName} = ${formatPoint3D(center)}`,
    `${tangentPointName} = ${formatPoint3D(baseCenter)}`,
    `${radiusName} = Distance(${centerName}, ${tangentPointName})`,
    `${sphereName} = Sphere(${centerName}, ${radiusName})`,
    `faceABC = Polygon(${labels[0]}, ${labels[1]}, ${labels[2]})`,
    `sAB = Segment(${labels[0]}, ${labels[1]})`,
    `sAC = Segment(${labels[0]}, ${labels[2]})`,
    `sBC = Segment(${labels[1]}, ${labels[2]})`,
    `sAD = Segment(${labels[0]}, ${labels[3]})`,
    `sBD = Segment(${labels[1]}, ${labels[3]})`,
    `sCD = Segment(${labels[2]}, ${labels[3]})`,
    `inRadius = Segment(${centerName}, ${tangentPointName})`,
    `SetColor(${sphereName}, 0, 158, 115)`,
    `SetFilling(${sphereName}, 0.2)`,
    `SetColor(inRadius, 213, 94, 0)`,
    `SetLineThickness(inRadius, 5)`,
    `ShowLabel(${centerName}, true)`,
    `ShowLabel(${tangentPointName}, true)`,
    ...labels.map((label) => `ShowLabel(${label}, true)`)
  ];
  return advancedCompilation("drawTetrahedronInsphere", locale, {
    titleZh: "绘制四面体内切球",
    titleEn: "Draw tetrahedron insphere",
    commands,
    perspective: "T",
    expectedObjects: [sphereName, centerName, radiusName, tangentPointName, "inRadius", ...labels],
    outcomeZh: "展示正四面体内切球、内心和到面的垂直半径。",
    outcomeEn: "Show the regular tetrahedron insphere, incenter, and perpendicular radius to a face.",
    hintsZh: ["验证内切球与底面相切点 T、内心 I 和半径 inRadius 存在。", "内切球题后续应围绕到各面的距离相等组织说明。"],
    hintsEn: ["Verify the tangency point T, incenter I, and radius inRadius.", "Use equal distance to faces as the follow-up explanation frame."]
  });
}

function regularTetrahedronParameters(input: Record<string, unknown>, macroName: AdvancedDrawingToolName) {
  const sideLength = positiveNumber(input.sideLength, 4, macroName, "sideLength");
  const height = Math.sqrt(2 / 3) * sideLength;
  const baseCenterY = Math.sqrt(3) * sideLength / 6;
  const defaultVertices: Point3D[] = [
    [0, 0, 0],
    [sideLength, 0, 0],
    [sideLength / 2, Math.sqrt(3) * sideLength / 2, 0],
    [sideLength / 2, baseCenterY, height]
  ];
  const vertices = pointCoordinatesWithFallback(input.coordinates, defaultVertices, macroName, "coordinates");
  return { vertices };
}
