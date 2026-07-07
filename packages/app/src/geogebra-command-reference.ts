import type { FunctionCallLocale } from "./functioncalls";
import { GENERATED_GEOGEBRA_COMMAND_REFERENCE } from "./geogebra-command-reference-data";

export const GEOGEBRA_COMMAND_SEARCH_SCOPES = [
  "global",
  "dsl",
  "dsl_function",
  "dsl_geometry",
  "dsl_3d",
  "dsl_coordinate",
  "animation",
  "style",
  "repair_dsl",
  "repair_animation",
  "repair_style",
  "geometry-2d",
  "function-graph",
  "conic",
  "axis",
  "geometry-3d",
  "diagnostic"
] as const;

export type GeoGebraCommandSearchScope = typeof GEOGEBRA_COMMAND_SEARCH_SCOPES[number];

export type GeoGebraCommandReferenceEntry = {
  command: string;
  localizedName?: string | null;
  syntax: string;
  syntaxEn?: string;
  description: string;
  descriptionEn?: string;
  searchTextEn?: string;
  note?: string;
  examples?: readonly string[];
  tags?: readonly string[];
  scopes: readonly GeoGebraCommandSearchScope[];
};

const ENGLISH_DESCRIPTION_OVERRIDES: Record<string, string> = {
  Point:
    "Create a point. Prefer uppercase names; use Point((x,y)) for lowercase point names because plain lowercase coordinate assignment may become a vector.",
  Circle: "Create a circle from its center and a point on the circle, or from its center and radius.",
  Line: "Create a line through two points, or a parallel line through a point and an existing line.",
  Function: "Define a function graph. Function names are usually lowercase; point names should usually be uppercase.",
  Segment: "Create a segment between two points.",
  Midpoint: "Create the midpoint of two points.",
  Intersect: "Find intersection points between two objects, such as Intersect(f, xAxis). Do not assign values to built-in fixed axes such as xAxis/yAxis.",
  Tangent: "Create a tangent at a point on a conic or function. Create the point first, then call Tangent(A, f).",
  OrthogonalLine: "Create a line through a point perpendicular to a line, segment, vector, plane, or another 3D direction object.",
  PerpendicularLine: "Create a line through a point perpendicular to a given line.",
  Polygon: "Create a polygon from points.",
  Circumcircle: "Create the circumcircle through three points.",
  Extremum: "Find extrema of a function. The command is Extremum, not extrema.",
  Root: "Find a function's x-axis crossing/root in an interval, for example Z = Root(f, startX, endX).",
  Text: "Create text at a position, for example Text(\"slope = -2\", (1, 2)).",
  ShowLabel: "Show or hide an object label. Use explicitly for important points, intersections, vertices, foci, moving points, and 3D points.",
  SetCaption: "Set an object's displayed caption; usually pair with ShowLabel(object, true).",
  SetColor: "Set object color. In 2D, use only for semantic highlighting with the approved palette; do not use decorative colors.",
  SetPointSize: "Set point size. Do not use in autonomous 2D drawing; 2D semantic highlighting should use color/filling instead.",
  SetLineThickness: "Set line thickness. Do not use in autonomous 2D drawing; 2D semantic highlighting should use color/filling instead.",
  SetLineStyle: "Set line style. Do not use in autonomous 2D drawing; 2D semantic highlighting should use color/filling instead.",
  SetFilling: "Set fill opacity. Do not use by default in 2D unless explicitly requested; do not use SetOpacity.",
  Slider: "Create a numeric slider. Declare the slider first, then reference it in points, functions, or dynamic constructions.",
  StartAnimation: "Start or stop animation for sliders, moving points, or similar dynamic objects.",
  Vector: "Create a vector. Use Vector(A, B) for a vector between two points; numeric component vectors can be written directly.",
  Pyramid: "Create a 3D pyramid from a base polygon and apex. Create the base Polygon and apex first, then call Pyramid(base, Apex).",
  Prism: "Create a 3D prism from a base polygon and a corresponding point on the second plane.",
  Sphere: "GeoGebra 5 sphere command. Use Sphere(center, radius) or Sphere(center, pointOnSphere); do not use Sphere(A, B, C, D).",
  PlaneBisector: "Create the perpendicular bisector plane between two points or of a segment.",
  Tetrahedron: "Create a regular tetrahedron from an equilateral triangle, three points, or point-direction inputs."
};

const SEARCH_ALIASES: Record<string, string> = {
  Extremum: "extrema maximum minimum max min 极值 最大值 最小值",
  OrthogonalLine: "PerpendicularLine perpendicular orthogonal 垂线 垂直线",
  PerpendicularLine: "OrthogonalLine perpendicular orthogonal 垂线 垂直线",
  Sphere: "ball 球 过两点球面 外接球 circumsphere circumscribed sphere not Sphere(A,B,C,D)",
  PlaneBisector: "perpendicular bisector plane 中垂面 垂直平分面",
  Pyramid: "tetrahedron 三棱锥 四面体 棱锥",
  Tetrahedron: "regular tetrahedron 正四面体",
  StartAnimation: "animation animate 播放 动画",
  Slider: "slider parameter 参数 滑块 滑动条"
};

const STRONG_INTENT_TOKENS: Record<string, readonly string[]> = {
  Intersect: ["intersection", "intersect", "crossing"],
  Sphere: ["外接球", "circumsphere", "circumscribed sphere"]
};

export const GEOGEBRA_COMMAND_REFERENCE = GENERATED_GEOGEBRA_COMMAND_REFERENCE;

export function findGeoGebraCommandReferenceEntry(command: string, locale?: FunctionCallLocale | null) {
  const normalized = command.trim().toLowerCase();
  const entry = GEOGEBRA_COMMAND_REFERENCE.find((item) => item.command.toLowerCase() === normalized);
  return entry ? localizeCommandReferenceEntry(entry, locale) : undefined;
}

function localizeCommandReferenceEntry(entry: GeoGebraCommandReferenceEntry, locale?: FunctionCallLocale | null): GeoGebraCommandReferenceEntry {
  if (locale === "en-US") {
    return {
      ...entry,
      syntax: entry.syntaxEn ?? entry.syntax,
      description: entry.descriptionEn ?? ENGLISH_DESCRIPTION_OVERRIDES[entry.command] ?? entry.description
    };
  }
  return entry;
}

export function searchGeoGebraCommandReference(
  query: string,
  topN = 8,
  locale?: FunctionCallLocale | null,
  scope: GeoGebraCommandSearchScope = "global"
) {
  const normalized = normalizeSearchText(query);
  const tokens = normalized.split(/[\s,;，；、"“”'()]+/u).filter((token) => token.length >= 2);
  const limit = Math.max(1, Math.min(12, Math.floor(topN || 8)));
  const candidates = GEOGEBRA_COMMAND_REFERENCE.filter(
    (item) => scope === "global" || (item.scopes as readonly GeoGebraCommandSearchScope[]).includes(scope)
  );
  const scored = candidates
    .map((item, index) => ({ item, index, score: normalized ? scoreCommandReference(item, normalized, tokens) : candidates.length - index }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.command.localeCompare(right.item.command));

  return scored.slice(0, limit).map(({ item }) => localizeCommandReferenceEntry(item, locale));
}

function scoreCommandReference(entry: GeoGebraCommandReferenceEntry, normalizedQuery: string, tokens: readonly string[]) {
  const command = entry.command.toLowerCase();
  const localizedName = normalizeSearchText(entry.localizedName ?? "");
  const syntax = normalizeSearchText(entry.syntax);
  const syntaxEn = normalizeSearchText(entry.syntaxEn ?? "");
  const description = normalizeSearchText(entry.description);
  const descriptionEn = normalizeSearchText(entry.descriptionEn ?? ENGLISH_DESCRIPTION_OVERRIDES[entry.command] ?? "");
  const searchTextEn = normalizeSearchText(entry.searchTextEn ?? "");
  const aliases = normalizeSearchText(SEARCH_ALIASES[entry.command] ?? "");
  const tags = normalizeSearchText((entry.tags ?? []).join(" "));
  const scopes = normalizeSearchText(entry.scopes.join(" "));
  const examples = normalizeSearchText((entry.examples ?? []).join(" "));
  const haystack = [command, localizedName, syntax, syntaxEn, description, descriptionEn, searchTextEn, aliases, tags, scopes, examples]
    .filter(Boolean)
    .join(" ");
  let score = 0;

  if ((STRONG_INTENT_TOKENS[entry.command] ?? []).some((token) => normalizedQuery.includes(token))) score += 900;
  if (normalizedQuery === command || normalizedQuery === localizedName) score += 1000;
  if (command.startsWith(normalizedQuery) || localizedName.startsWith(normalizedQuery)) score += 500;
  if (command.includes(normalizedQuery) || localizedName.includes(normalizedQuery)) score += 300;
  if (syntax.includes(normalizedQuery) || syntaxEn.includes(normalizedQuery)) score += 180;
  if (aliases.includes(normalizedQuery)) score += 180;
  if (description.includes(normalizedQuery) || descriptionEn.includes(normalizedQuery) || searchTextEn.includes(normalizedQuery)) score += 120;
  score += Math.max(fuzzyScore(command, normalizedQuery), fuzzyScore(localizedName, normalizedQuery));

  for (const token of tokens) {
    if (token === command || token === localizedName) score += 280;
    else if (command.startsWith(token) || localizedName.startsWith(token)) score += 160;
    else if (command.includes(token) || localizedName.includes(token)) score += 100;
    if (syntax.includes(token) || syntaxEn.includes(token)) score += 45;
    if (aliases.includes(token)) score += 120;
    if (description.includes(token) || descriptionEn.includes(token) || searchTextEn.includes(token) || examples.includes(token)) score += 20;
    if (tags.includes(token) || scopes.includes(token)) score += 8;
    score += Math.max(fuzzyScore(command, token), fuzzyScore(localizedName, token));
  }

  if (haystack.includes(normalizedQuery)) score += 80;
  return score;
}

function fuzzyScore(value: string, query: string) {
  if (!value || !query) return 0;
  let score = 0;
  let queryIndex = 0;
  for (let index = 0; index < value.length && queryIndex < query.length; index += 1) {
    if (value[index] !== query[queryIndex]) continue;
    score += 10;
    if (index === queryIndex) score += 5;
    queryIndex += 1;
  }
  if (queryIndex !== query.length) return 0;
  score += 20;
  if (value.startsWith(query)) score += 30;
  if (value === query) score += 50;
  return score;
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}
