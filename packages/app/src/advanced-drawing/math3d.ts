export type Point3D = [number, number, number];

export function assertNondegenerateTetrahedron(vertices: Point3D[], macroName: string) {
  const volume6 = dot3(sub3(vertices[1], vertices[0]), cross3(sub3(vertices[2], vertices[0]), sub3(vertices[3], vertices[0])));
  if (Math.abs(volume6) < 1e-8) {
    throw new Error(`${macroName} requires four non-coplanar points.`);
  }
}

export function assertTriangularPrismGeometry(vertices: Point3D[], macroName: string) {
  const [a, b, c, a1, b1, c1] = vertices;
  const baseNormal = cross3(sub3(b, a), sub3(c, a));
  if (norm3(baseNormal) < 1e-8) {
    throw new Error(`${macroName} requires a non-collinear base triangle.`);
  }
  const topNormal = cross3(sub3(b1, a1), sub3(c1, a1));
  if (norm3(topNormal) < 1e-8) {
    throw new Error(`${macroName} requires a non-collinear top triangle.`);
  }
  const offset = sub3(a1, a);
  if (norm3(offset) < 1e-8) {
    throw new Error(`${macroName} requires distinct base and top faces.`);
  }
  if (!vectorsClose(sub3(b1, b), offset) || !vectorsClose(sub3(c1, c), offset)) {
    throw new Error(`${macroName} requires the top triangle to be a translation of the base triangle.`);
  }
  if (Math.abs(dot3(baseNormal, offset)) < 1e-8) {
    throw new Error(`${macroName} requires positive prism volume.`);
  }
}

export function assertRightSquarePyramidGeometry(vertices: Point3D[], macroName: string) {
  const [a, b, c, d, apex] = vertices;
  const baseNormal = cross3(sub3(b, a), sub3(d, a));
  const normalLength = norm3(baseNormal);
  if (normalLength < 1e-8) throw new Error(`${macroName} requires a non-degenerate square base.`);
  if (Math.abs(dot3(sub3(c, a), baseNormal)) > 1e-6) {
    throw new Error(`${macroName} requires coplanar base vertices.`);
  }
  const edges = [distance3(a, b), distance3(b, c), distance3(c, d), distance3(d, a)];
  if (edges.some((edge) => edge < 1e-8) || edges.some((edge) => Math.abs(edge - edges[0]) > 1e-6)) {
    throw new Error(`${macroName} requires a square base with equal side lengths.`);
  }
  if (Math.abs(dot3(sub3(b, a), sub3(d, a))) > 1e-6) {
    throw new Error(`${macroName} requires adjacent square base edges to be perpendicular.`);
  }
  const center = centroid3D(vertices.slice(0, 4));
  const apexVector = sub3(apex, center);
  if (norm3(apexVector) < 1e-8 || Math.abs(dot3(apexVector, baseNormal)) < 1e-8) {
    throw new Error(`${macroName} requires the apex outside the base plane.`);
  }
  if (norm3(cross3(apexVector, baseNormal)) > 1e-6 * norm3(apexVector) * normalLength) {
    throw new Error(`${macroName} requires the apex to project to the square base center.`);
  }
}

export function circumsphereCenter(vertices: Point3D[]): Point3D {
  const [a, b, c, d] = vertices;
  const matrix = [b, c, d].map((point) => scale3(sub3(point, a), 2));
  const rhs = [b, c, d].map((point) => dot3(point, point) - dot3(a, a));
  return solve3x3(matrix, rhs, "Circumsphere center is undefined for a degenerate tetrahedron.");
}

export function tetrahedronIncenter(vertices: Point3D[]): Point3D {
  const [a, b, c, d] = vertices;
  const weights = [
    triangleArea(b, c, d),
    triangleArea(a, c, d),
    triangleArea(a, b, d),
    triangleArea(a, b, c)
  ];
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-8) throw new Error("Tetrahedron incenter is undefined for degenerate faces.");
  return [
    (weights[0] * a[0] + weights[1] * b[0] + weights[2] * c[0] + weights[3] * d[0]) / total,
    (weights[0] * a[1] + weights[1] * b[1] + weights[2] * c[1] + weights[3] * d[1]) / total,
    (weights[0] * a[2] + weights[1] * b[2] + weights[2] * c[2] + weights[3] * d[2]) / total
  ];
}

export function projectPointToPlane(point: Point3D, a: Point3D, b: Point3D, c: Point3D): Point3D {
  const normal = cross3(sub3(b, a), sub3(c, a));
  const lengthSquared = dot3(normal, normal);
  if (lengthSquared <= 1e-8) throw new Error("Cannot project to a degenerate plane.");
  const distanceScale = dot3(sub3(point, a), normal) / lengthSquared;
  return sub3(point, scale3(normal, distanceScale));
}

export function centroid3D(points: Point3D[]): Point3D {
  const total = points.reduce<Point3D>((sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]], [0, 0, 0]);
  return [total[0] / points.length, total[1] / points.length, total[2] / points.length];
}

function triangleArea(a: Point3D, b: Point3D, c: Point3D) {
  return 0.5 * norm3(cross3(sub3(b, a), sub3(c, a)));
}

function solve3x3(matrix: Point3D[], rhs: number[], errorMessage: string): Point3D {
  const det = determinant3(matrix);
  if (Math.abs(det) < 1e-8) throw new Error(errorMessage);
  const replaceColumn = (column: number) => matrix.map((row, rowIndex) => row.map((value, columnIndex) => columnIndex === column ? rhs[rowIndex] : value) as Point3D);
  return [determinant3(replaceColumn(0)) / det, determinant3(replaceColumn(1)) / det, determinant3(replaceColumn(2)) / det];
}

function determinant3(matrix: Point3D[]) {
  const [a, b, c] = matrix;
  return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function sub3(left: Point3D, right: Point3D): Point3D {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale3(point: Point3D, scale: number): Point3D {
  return [point[0] * scale, point[1] * scale, point[2] * scale];
}

function dot3(left: Point3D, right: Point3D) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross3(left: Point3D, right: Point3D): Point3D {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function norm3(point: Point3D) {
  return Math.sqrt(dot3(point, point));
}

function distance3(left: Point3D, right: Point3D) {
  return norm3(sub3(left, right));
}

function vectorsClose(left: Point3D, right: Point3D) {
  return distance3(left, right) <= 1e-6;
}
