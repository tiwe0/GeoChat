import type { Figure } from "./geometry";
import { perpendicularBisector } from "./geometry";

/**
 * The hero. Same triangle, same coordinates and same circumcenter as the
 * GeoGebra commands listed in the pipeline section — the figure and the code
 * beside it are two views of one construction, not decoration plus code.
 *
 *   A(-3,-1)  B(3,-1)  C(1,3)  ->  O(0,0),  r = sqrt(10)
 */
export const circumcircle: Figure = {
  // Window sized so the circumcircle (r = 3.162) sits centred with enough
  // margin for the point labels, which the viewBox now clips.
  view: { cx: 0, cy: 0, halfWidth: 4.4 },
  aspect: 1.15,
  elements: [
    { kind: "point", id: "A", at: [-3, -1], label: "A", role: "ink" },
    { kind: "point", id: "B", at: [3, -1], label: "B", role: "ink" },
    { kind: "point", id: "C", at: [1, 3], label: "C", role: "ink" },
    { kind: "segment", id: "AB", from: [-3, -1], to: [3, -1], role: "ink" },
    { kind: "segment", id: "BC", from: [3, -1], to: [1, 3], role: "ink" },
    { kind: "segment", id: "CA", from: [1, 3], to: [-3, -1], role: "ink" },
    {
      kind: "line",
      id: "m1",
      ...perpendicularBisector([-3, -1], [3, -1]),
      role: "construct"
    },
    {
      kind: "line",
      id: "m2",
      ...perpendicularBisector([3, -1], [1, 3]),
      role: "construct"
    },
    { kind: "point", id: "O", at: [0, 0], label: "O", role: "construct" },
    { kind: "circle", id: "k", center: [0, 0], through: [-3, -1], role: "result" }
  ]
};

/**
 * Everything the app touches stays inside one boundary. An inscribed triangle
 * is the honest version of that claim: no element leaves the circle.
 */
export const inscribed: Figure = {
  view: { cx: 0, cy: 0, halfWidth: 2.9 },
  aspect: 1,
  elements: [
    { kind: "circle", id: "c", center: [0, 0], radius: 2, role: "ink" },
    {
      kind: "polygon",
      id: "t",
      points: [
        [0, 2],
        [-1.732, -1],
        [1.732, -1]
      ],
      role: "ink"
    },
    { kind: "point", id: "p1", at: [0, 2], role: "ink" },
    { kind: "point", id: "p2", at: [-1.732, -1], role: "ink" },
    { kind: "point", id: "p3", at: [1.732, -1], role: "ink" }
  ]
};

/**
 * A tangent from an external point: exactly one line reaches in from outside,
 * and it touches at exactly one place. That is what supplying your own API key
 * does — one deliberate connection, nothing else crossing the boundary.
 *
 *   |OP| = 3.6, r = 1.8  ->  the tangent meets the circle at 60 degrees.
 */
export const tangent: Figure = {
  view: { cx: 0.9, cy: 0.2, halfWidth: 3.4 },
  aspect: 1,
  elements: [
    { kind: "circle", id: "c", center: [0, 0], radius: 1.8, role: "ink" },
    { kind: "point", id: "O", at: [0, 0], label: "O", role: "ink" },
    { kind: "point", id: "P", at: [3.6, 0], label: "P", role: "ink" },
    { kind: "segment", id: "PT", from: [3.6, 0], to: [0.9, 1.5588], role: "construct" },
    { kind: "segment", id: "OT", from: [0, 0], to: [0.9, 1.5588], role: "construct" },
    {
      kind: "rightAngle",
      id: "ra",
      at: [0.9, 1.5588],
      a: [0, 0],
      b: [3.6, 0],
      role: "construct"
    },
    { kind: "point", id: "T", at: [0.9, 1.5588], label: "T", role: "result" }
  ]
};

/**
 * The perpendicular bisector, built the way it is actually built: two equal
 * compass arcs, and the line through where they cross. This is the figure for
 * "it genuinely constructs" because it *is* a construction, not a result.
 *
 *   A(-1.6,0), B(1.6,0), radius 2.2  ->  arcs meet at (0, +/-1.5100)
 */
export const bisectorByArcs: Figure = {
  view: { cx: 0, cy: 0, halfWidth: 2.9 },
  aspect: 1,
  elements: [
    { kind: "point", id: "A", at: [-1.6, 0], label: "A", role: "ink" },
    { kind: "point", id: "B", at: [1.6, 0], label: "B", role: "ink" },
    { kind: "segment", id: "AB", from: [-1.6, 0], to: [1.6, 0], role: "ink" },
    {
      kind: "arc",
      id: "arcA",
      center: [-1.6, 0],
      radius: 2.2,
      fromDeg: -58,
      toDeg: 58,
      role: "construct"
    },
    {
      kind: "arc",
      id: "arcB",
      center: [1.6, 0],
      radius: 2.2,
      fromDeg: 122,
      toDeg: 238,
      role: "construct"
    },
    { kind: "segment", id: "m", from: [0, 1.51], to: [0, -1.51], role: "result" },
    { kind: "point", id: "M", at: [0, 0], role: "result" }
  ]
};

/** Plane and space in one workspace: a square, and the same square in depth. */
export const cube: Figure = {
  view: { cx: 0.45, cy: 0.45, halfWidth: 2.7 },
  aspect: 1,
  elements: [
    {
      kind: "polygon",
      id: "front",
      points: [
        [-1.5, -1.5],
        [1.5, -1.5],
        [1.5, 1.5],
        [-1.5, 1.5]
      ],
      role: "ink"
    },
    {
      kind: "polygon",
      id: "back",
      points: [
        [-0.6, -0.6],
        [2.4, -0.6],
        [2.4, 2.4],
        [-0.6, 2.4]
      ],
      role: "construct"
    },
    { kind: "segment", id: "e1", from: [-1.5, -1.5], to: [-0.6, -0.6], role: "construct" },
    { kind: "segment", id: "e2", from: [1.5, -1.5], to: [2.4, -0.6], role: "construct" },
    { kind: "segment", id: "e3", from: [1.5, 1.5], to: [2.4, 2.4], role: "construct" },
    { kind: "segment", id: "e4", from: [-1.5, 1.5], to: [-0.6, 2.4], role: "construct" }
  ]
};

/**
 * Three medians, three separate steps, one point they all agree on. The figure
 * for "every step is laid open": you can check each median independently.
 *
 *   A(-2,-1.2) B(2,-1.2) C(0.4,2.2)  ->  centroid (0.1333, -0.0667)
 */
export const centroid: Figure = {
  view: { cx: 0, cy: 0.35, halfWidth: 2.9 },
  aspect: 1,
  elements: [
    {
      kind: "polygon",
      id: "t",
      points: [
        [-2, -1.2],
        [2, -1.2],
        [0.4, 2.2]
      ],
      role: "ink"
    },
    { kind: "segment", id: "ma", from: [-2, -1.2], to: [1.2, 0.5], role: "construct" },
    { kind: "segment", id: "mb", from: [2, -1.2], to: [-0.8, 0.5], role: "construct" },
    { kind: "segment", id: "mc", from: [0.4, 2.2], to: [0, -1.2], role: "construct" },
    { kind: "point", id: "G", at: [0.1333, -0.0667], label: "G", role: "result" }
  ]
};

/**
 * A figure and its reflection: hand the .ggb file to someone else and they get
 * the same construction, not a picture of it.
 */
export const reflection: Figure = {
  view: { cx: 0, cy: 0.2, halfWidth: 3.4 },
  aspect: 1,
  elements: [
    {
      kind: "polygon",
      id: "src",
      points: [
        [-2.7, -1.1],
        [-0.8, -1.1],
        [-1.7, 1.5]
      ],
      role: "ink"
    },
    { kind: "line", id: "axis", through: [0, 0], direction: [0, 1], role: "construct" },
    {
      kind: "polygon",
      id: "img",
      points: [
        [2.7, -1.1],
        [0.8, -1.1],
        [1.7, 1.5]
      ],
      role: "result"
    }
  ]
};

/** Looked up by SellingPoint.id, so the copy layer never imports figures. */
export const sellingPointFigures: Record<string, Figure> = {
  local: inscribed,
  byok: tangent,
  "real-construction": bisectorByArcs,
  canvas: cube,
  reasoning: centroid,
  export: reflection
};
