/**
 * Geometry authored in mathematical coordinates, projected to SVG at render
 * time. Authoring in math space means the figure data and the GeoGebra command
 * strings shown beside it describe the same points — if one is edited and the
 * other is not, the mismatch is visible immediately.
 */

export type Role = "ink" | "construct" | "result";

export type Vec = readonly [number, number];

export type Element =
  | { kind: "point"; id: string; at: Vec; label?: string; role: Role }
  | { kind: "segment"; id: string; from: Vec; to: Vec; role: Role }
  | { kind: "line"; id: string; through: Vec; direction: Vec; role: Role }
  | { kind: "circle"; id: string; center: Vec; through?: Vec; radius?: number; role: Role }
  | { kind: "arc"; id: string; center: Vec; radius: number; fromDeg: number; toDeg: number; role: Role }
  | { kind: "polygon"; id: string; points: Vec[]; role: Role }
  | { kind: "rightAngle"; id: string; at: Vec; a: Vec; b: Vec; role: Role };

export type Figure = {
  /** Half-width and half-height of the visible math window. */
  view: { cx: number; cy: number; halfWidth: number };
  aspect: number;
  elements: Element[];
};

export type Projection = {
  width: number;
  height: number;
  scale: number;
  toSvg: (p: Vec) => Vec;
};

export function createProjection(figure: Figure, width = 400): Projection {
  const height = Math.round(width / figure.aspect);
  const scale = width / (figure.view.halfWidth * 2);
  const originX = width / 2 - figure.view.cx * scale;
  const originY = height / 2 + figure.view.cy * scale;
  return {
    width,
    height,
    scale,
    // SVG y grows downward; math y grows upward.
    toSvg: ([x, y]) => [originX + x * scale, originY - y * scale] as Vec
  };
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function midpoint(a: Vec, b: Vec): Vec {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Clips an infinite line to the visible window so a "line" reads as unbounded
 * without ever being drawn outside the viewBox.
 */
export function lineEndpoints(
  through: Vec,
  direction: Vec,
  figure: Figure
): [Vec, Vec] {
  const len = Math.hypot(direction[0], direction[1]) || 1;
  const unit: Vec = [direction[0] / len, direction[1] / len];
  const halfHeight = figure.view.halfWidth / figure.aspect;
  // Long enough to always exit the window; the viewBox does the clipping.
  const reach = (figure.view.halfWidth + halfHeight) * 1.6;
  return [
    [through[0] - unit[0] * reach, through[1] - unit[1] * reach],
    [through[0] + unit[0] * reach, through[1] + unit[1] * reach]
  ];
}

/** Perpendicular bisector of AB, as a point and a direction. */
export function perpendicularBisector(a: Vec, b: Vec): { through: Vec; direction: Vec } {
  const mid = midpoint(a, b);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return { through: mid, direction: [-dy, dx] };
}

export function circlePath(center: Vec, radius: number, project: Projection): string {
  const [cx, cy] = project.toSvg(center);
  const r = radius * project.scale;
  // Two arcs rather than <circle>, so the stroke can be drawn progressively
  // from a single, predictable start point at the top.
  return [
    `M ${cx} ${cy - r}`,
    `A ${r} ${r} 0 0 1 ${cx} ${cy + r}`,
    `A ${r} ${r} 0 0 1 ${cx} ${cy - r}`
  ].join(" ");
}

export function arcPath(
  center: Vec,
  radius: number,
  fromDeg: number,
  toDeg: number,
  project: Projection
): string {
  const point = (deg: number): Vec => [
    center[0] + radius * Math.cos((deg * Math.PI) / 180),
    center[1] + radius * Math.sin((deg * Math.PI) / 180)
  ];
  const [sx, sy] = project.toSvg(point(fromDeg));
  const [ex, ey] = project.toSvg(point(toDeg));
  const r = radius * project.scale;
  const sweep = toDeg > fromDeg ? 0 : 1;
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} ${sweep} ${ex} ${ey}`;
}

/** Small square marker showing that angle a–at–b is right. */
export function rightAnglePath(at: Vec, a: Vec, b: Vec, project: Projection, size = 0.34): string {
  const unit = (p: Vec): Vec => {
    const dx = p[0] - at[0];
    const dy = p[1] - at[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  const ua = unit(a);
  const ub = unit(b);
  const p1: Vec = [at[0] + ua[0] * size, at[1] + ua[1] * size];
  const p2: Vec = [at[0] + (ua[0] + ub[0]) * size, at[1] + (ua[1] + ub[1]) * size];
  const p3: Vec = [at[0] + ub[0] * size, at[1] + ub[1] * size];
  const [x1, y1] = project.toSvg(p1);
  const [x2, y2] = project.toSvg(p2);
  const [x3, y3] = project.toSvg(p3);
  return `M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3}`;
}

export const ROLE_STROKE: Record<Role, string> = {
  ink: "var(--color-ink)",
  construct: "var(--color-construct)",
  result: "var(--color-result)"
};

export const ROLE_LABEL: Record<Role, string> = {
  ink: "var(--color-ink)",
  construct: "var(--color-construct)",
  result: "var(--color-result)"
};
