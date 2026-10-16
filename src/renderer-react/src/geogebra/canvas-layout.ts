import type { GeoGebraApi } from "./ggbdeploy-wrapper";

const OBJECT_LIMIT = 100;
const LIST_ITEM_LIMIT = 16;
const SAFE_OBJECT_NAME = /^\p{L}[\p{L}\p{N}_]*$/u;
let probeSequence = 0;

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type Viewport = Bounds & {
  width: number;
  height: number;
  unitsPerPixelX: number;
  unitsPerPixelY: number;
};

export async function measureCanvasLayout(
  api: GeoGebraApi,
  input: Record<string, unknown> = {},
  assertCurrent: () => void = () => {},
) {
  const missing = requiredMethods(api).filter((name) => typeof api[name] !== "function");
  if (missing.length > 0) return unavailable(`GeoGebra API is missing: ${missing.join(", ")}.`);

  const inventory = readObjectNames(api);
  const selection = selectObjects(input.objects, inventory);
  if (selection.unsafe.length > 0) {
    return unavailable("Some requested object names cannot be safely referenced by probe commands.", {
      selectedObjects: selection.names,
      unknown: selection.unsafe.map((name) => ({ name, reason: "unsafe object name" })),
    });
  }

  const viewport = readViewport(api);
  const probes: string[] = [];
  const boxes: Array<Record<string, unknown> & { id: string; bboxPx: Bounds }> = [];
  const unknown: Array<{ name: string; reason: string }> = selection.missing.map((name) => ({
    name,
    reason: "object is not present in getAllObjectNames",
  }));
  let examined = 0;
  let truncated = selection.truncated;
  let result: ReturnType<typeof completedResult> | undefined;

  try {
    for (const name of selection.names) {
      if (examined >= OBJECT_LIMIT) {
        truncated = true;
        break;
      }
      examined += 1;
      if (typeof api.getVisible === "function" && call(api, "getVisible", name, 1) === false) continue;
      const type = objectType(api, name);
      if (type === "text") {
        if (readAbsoluteScreenLocation(api, name)) {
          unknown.push({ name, reason: "absolute-screen text is not supported by world-coordinate Corner probes" });
          continue;
        }
        const measured = await measureText(api, name, name, viewport, probes, assertCurrent);
        if (measured) boxes.push(measured);
        else unknown.push({ name, reason: "text corners are undefined or non-finite" });
        continue;
      }
      if (type === "list") {
        const remaining = OBJECT_LIMIT - examined;
        const listResult = await measureTextList(api, name, Math.min(LIST_ITEM_LIMIT, remaining), viewport, probes, assertCurrent);
        boxes.push(...listResult.boxes);
        unknown.push(...listResult.unknown);
        examined += listResult.examined;
        truncated ||= listResult.truncated;
        continue;
      }

      const labelVisible = call(api, "getLabelVisible", name) === true;
      const visible = typeof api.getVisible === "function" ? call(api, "getVisible", name, 1) !== false : true;
      if (visible || labelVisible) {
        unknown.push({
          name,
          reason: labelVisible
            ? "ordinary object labels do not expose rendered text bounds through Corner(text, n)"
            : `visible ${type || "unknown"} objects are outside text-container coverage`,
        });
      }
    }

    result = completedResult(viewport, boxes, {
      selectedObjects: selection.names,
      examinedObjects: examined,
      measuredTextBoxes: boxes.length,
      unknown,
      truncated,
      complete: !truncated && unknown.length === 0 && selection.names.length > 0,
      limits: { objects: OBJECT_LIMIT, listItemsPerList: LIST_ITEM_LIMIT },
    });
  } finally {
    await deleteProbes(api, probes, assertCurrent);
  }

  return result!;
}

async function measureTextList(
  api: GeoGebraApi,
  listName: string,
  allowance: number,
  viewport: Viewport,
  probes: string[],
  assertCurrent: () => void,
) {
  const boxes: Array<Record<string, unknown> & { id: string; bboxPx: Bounds }> = [];
  const unknown: Array<{ name: string; reason: string }> = [];
  const lengthProbe = await createProbe(api, `Length(${listName})`, probes, assertCurrent);
  const rawLength = Number(call(api, "getValue", lengthProbe));
  if (!Number.isSafeInteger(rawLength) || rawLength < 0) {
    throw new Error(`GeoGebra returned an invalid length for list ${listName}.`);
  }
  const count = Math.min(rawLength, allowance);
  for (let index = 1; index <= count; index += 1) {
    const id = `${listName}[${index}]`;
    const alias = await createProbe(api, `Element(${listName}, ${index})`, probes, assertCurrent);
    if (objectType(api, alias) !== "text") {
      unknown.push({ name: id, reason: "list item is not text" });
      continue;
    }
    if (typeof api.getVisible === "function" && call(api, "getVisible", alias, 1) === false) continue;
    if (readAbsoluteScreenLocation(api, alias)) {
      unknown.push({ name: id, reason: "absolute-screen text is not supported by world-coordinate Corner probes" });
      continue;
    }
    const measured = await measureText(api, alias, id, viewport, probes, assertCurrent);
    if (measured) boxes.push(measured);
    else unknown.push({ name: id, reason: "text corners are undefined or non-finite" });
  }
  return { boxes, unknown, examined: count, truncated: rawLength > count };
}

async function measureText(
  api: GeoGebraApi,
  sourceName: string,
  id: string,
  viewport: Viewport,
  probes: string[],
  assertCurrent: () => void,
) {
  const corner1 = await createProbe(api, `Corner(${sourceName}, 1)`, probes, assertCurrent);
  const corner3 = await createProbe(api, `Corner(${sourceName}, 3)`, probes, assertCurrent);
  if (call(api, "isDefined", corner1) !== true || call(api, "isDefined", corner3) !== true) return null;

  const x1 = finiteCoordinate(call(api, "getXcoord", corner1));
  const y1 = finiteCoordinate(call(api, "getYcoord", corner1));
  const x3 = finiteCoordinate(call(api, "getXcoord", corner3));
  const y3 = finiteCoordinate(call(api, "getYcoord", corner3));
  if (x1 === null || y1 === null || x3 === null || y3 === null) return null;

  const bboxWorld = normalizeBounds(x1, y1, x3, y3);
  if (bboxWorld.maxX <= bboxWorld.minX || bboxWorld.maxY <= bboxWorld.minY) return null;
  const bboxPx = worldToPixels(bboxWorld, viewport);
  return {
    id,
    object: id === sourceName ? sourceName : id.slice(0, id.lastIndexOf("[")),
    ...(id === sourceName ? {} : { elementIndex: Number(id.slice(id.lastIndexOf("[") + 1, -1)) }),
    type: "text",
    source: "applet-text-corner" as const,
    bboxWorld,
    bboxPx,
  };
}

function completedResult(
  viewport: Viewport,
  boxes: Array<Record<string, unknown> & { id: string; bboxPx: Bounds }>,
  coverage: Record<string, unknown>,
) {
  const collisions = boxes.length === 0 ? null : findCollisions(boxes);
  const outsideViewport = boxes.length === 0 ? null : boxes
    .map((box) => outsideEntry(box.id, box.bboxPx, viewport.width, viewport.height))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const hasIssues = Boolean(collisions?.length || outsideViewport?.length);
  return {
    ok: true as const,
    status: boxes.length === 0 ? "unavailable" as const : hasIssues ? "issues_found" as const : "no_issues_in_checked_bounds" as const,
    verified: false,
    source: "applet-text-corner" as const,
    viewport: {
      pixels: [viewport.width, viewport.height],
      world: { minX: viewport.minX, minY: viewport.minY, maxX: viewport.maxX, maxY: viewport.maxY },
      pxPerUnitX: 1 / viewport.unitsPerPixelX,
      pxPerUnitY: 1 / viewport.unitsPerPixelY,
    },
    boxes,
    coverage,
    labelCollisions: collisions,
    outsideViewport,
    labelOverObject: null,
    tooSmallPx: null,
    occluded: null,
    limitations: [
      "Temporary dependent text and Corner probes can update GeoGebra's internal bounding-box cache and are not completely side-effect-free.",
      "This is a single-frame check; it does not prove animation layout at other times.",
      "Corner(text, n) measures the text container, not glyph ink bounds.",
      "Raster, 3D occlusion, ordinary object-label bounds, and label-over-object checks are not covered.",
    ],
  };
}

function findCollisions(boxes: Array<{ id: string; bboxPx: Bounds }>) {
  const collisions: Array<{ a: string; b: string; overlapPx: [number, number] }> = [];
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left]!;
      const b = boxes[right]!;
      const overlapX = Math.min(a.bboxPx.maxX, b.bboxPx.maxX) - Math.max(a.bboxPx.minX, b.bboxPx.minX);
      const overlapY = Math.min(a.bboxPx.maxY, b.bboxPx.maxY) - Math.max(a.bboxPx.minY, b.bboxPx.minY);
      if (overlapX > 0 && overlapY > 0) collisions.push({ a: a.id, b: b.id, overlapPx: [overlapX, overlapY] });
    }
  }
  return collisions;
}

function outsideEntry(id: string, bounds: Bounds, width: number, height: number) {
  const sides = [
    ...(bounds.minX < 0 ? ["left"] : []),
    ...(bounds.maxX > width ? ["right"] : []),
    ...(bounds.minY < 0 ? ["top"] : []),
    ...(bounds.maxY > height ? ["bottom"] : []),
  ];
  if (sides.length === 0) return null;
  const complete = bounds.maxX <= 0 || bounds.minX >= width || bounds.maxY <= 0 || bounds.minY >= height;
  return { object: id, extent: complete ? "complete" as const : "partial" as const, sides };
}

async function createProbe(
  api: GeoGebraApi,
  expression: string,
  probes: string[],
  assertCurrent: () => void,
) {
  const name = nextProbeName(api);
  probes.push(name);
  assertCurrent();
  const result = await Promise.resolve(call(api, "evalCommand", `${name} = ${expression}`));
  if (result === false || call(api, "exists", name) !== true) {
    throw new Error(`GeoGebra rejected layout probe: ${expression}.`);
  }
  return name;
}

async function deleteProbes(api: GeoGebraApi, probes: string[], assertCurrent: () => void) {
  const failures: string[] = [];
  for (const name of [...probes].reverse()) {
    try {
      assertCurrent();
      const result = await Promise.resolve(call(api, "deleteObject", name));
      if (result === false) failures.push(`${name}: deleteObject returned false`);
      else if (call(api, "exists", name) === true) failures.push(`${name}: object still exists after deletion`);
    } catch (error) {
      failures.push(`${name}: ${errorMessage(error)}`);
    }
  }
  if (failures.length > 0) throw new Error(`Failed to clean up layout probes: ${failures.join("; ")}`);
}

function nextProbeName(api: GeoGebraApi) {
  for (let attempt = 0; attempt < 256; attempt += 1) {
    probeSequence += 1;
    const name = `gcLayoutProbe${probeSequence.toString(36)}`;
    if (call(api, "exists", name) !== true) return name;
  }
  throw new Error("Unable to allocate a unique GeoGebra layout probe name.");
}

function selectObjects(value: unknown, inventory: string[]) {
  if (value !== undefined && !Array.isArray(value)) throw new Error("objects must be an array of GeoGebra object names.");
  const requested = value === undefined
    ? inventory
    : value.map((entry) => {
        if (typeof entry !== "string" || !entry.trim()) throw new Error("objects must contain non-empty strings.");
        return entry.trim();
      });
  const unique = [...new Set(requested)];
  const names = unique.filter((name) => inventory.includes(name)).slice(0, OBJECT_LIMIT);
  return {
    names,
    missing: unique.filter((name) => !inventory.includes(name)),
    unsafe: unique.filter((name) => inventory.includes(name) && !SAFE_OBJECT_NAME.test(name)),
    truncated: unique.length > OBJECT_LIMIT,
  };
}

function readObjectNames(api: GeoGebraApi) {
  const raw = call(api, "getAllObjectNames");
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : null;
  if (!values) throw new Error("getAllObjectNames returned an unsupported value.");
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function readViewport(api: GeoGebraApi): Viewport {
  const raw = call(api, "getViewProperties", 1);
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isRecord(value)) throw new Error("getViewProperties returned an unsupported value.");
  const width = positiveNumber(value.width, "width");
  const height = positiveNumber(value.height, "height");
  const minX = finiteNumber(value.xMin, "xMin");
  const minY = finiteNumber(value.yMin, "yMin");
  const unitsPerPixelX = positiveNumber(value.invXscale, "invXscale");
  const unitsPerPixelY = positiveNumber(value.invYscale, "invYscale");
  return {
    width,
    height,
    minX,
    minY,
    maxX: minX + width * unitsPerPixelX,
    maxY: minY + height * unitsPerPixelY,
    unitsPerPixelX,
    unitsPerPixelY,
  };
}

function readAbsoluteScreenLocation(api: GeoGebraApi, name: string) {
  if (typeof api.getXML !== "function") return null;
  const xml = String(call(api, "getXML", name) ?? "");
  if (!xml) return null;
  if (typeof DOMParser !== "undefined") {
    const element = new DOMParser().parseFromString(xml, "application/xml").querySelector("absoluteScreenLocation");
    if (element) {
      const x = Number(element.getAttribute("x"));
      const y = Number(element.getAttribute("y"));
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    }
  }
  const match = /<absoluteScreenLocation\b([^>]*)\/?\s*>/i.exec(xml)?.[1];
  if (!match) return null;
  const x = Number(/\bx\s*=\s*["']([^"']+)["']/i.exec(match)?.[1]);
  const y = Number(/\by\s*=\s*["']([^"']+)["']/i.exec(match)?.[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function worldToPixels(bounds: Bounds, viewport: Viewport): Bounds {
  return normalizeBounds(
    (bounds.minX - viewport.minX) / viewport.unitsPerPixelX,
    viewport.height - (bounds.minY - viewport.minY) / viewport.unitsPerPixelY,
    (bounds.maxX - viewport.minX) / viewport.unitsPerPixelX,
    viewport.height - (bounds.maxY - viewport.minY) / viewport.unitsPerPixelY,
  );
}

function normalizeBounds(x1: number, y1: number, x2: number, y2: number): Bounds {
  return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) };
}

function objectType(api: GeoGebraApi, name: string) {
  const value = call(api, "getObjectType", name);
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function unavailable(reason: string, coverage: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    status: "unavailable" as const,
    verified: false,
    source: "applet-text-corner" as const,
    boxes: [],
    coverage: { complete: false, ...coverage },
    labelCollisions: null,
    outsideViewport: null,
    labelOverObject: null,
    tooSmallPx: null,
    occluded: null,
    reason,
  };
}

function requiredMethods(api: GeoGebraApi) {
  return [
    "getAllObjectNames",
    "getViewProperties",
    "getObjectType",
    "getLabelVisible",
    "evalCommand",
    "exists",
    "deleteObject",
    "isDefined",
    "getValue",
    "getXcoord",
    "getYcoord",
  ].filter((name) => typeof api[name] !== "function");
}

function call(api: GeoGebraApi, method: string, ...args: unknown[]) {
  const fn = api[method];
  if (typeof fn !== "function") throw new Error(`GeoGebra API ${method} is unavailable.`);
  return Reflect.apply(fn, api, args);
}

function finiteCoordinate(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteNumber(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be finite.`);
  return number;
}

function positiveNumber(value: unknown, field: string) {
  const number = finiteNumber(value, field);
  if (number <= 0) throw new Error(`${field} must be positive.`);
  return number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
