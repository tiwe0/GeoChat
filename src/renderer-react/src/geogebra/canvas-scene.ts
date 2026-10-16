import type { GeoGebraApi } from "./ggbdeploy-wrapper";

const OBJECT_LIMIT = 100;
const ALL_SECTIONS = ["viewport", "style", "bbox", "deps"] as const;
type SceneSection = typeof ALL_SECTIONS[number];

type CapabilityUnavailable = { status: "unavailable"; reason: string };
type DependencyReport = {
  status: "partial";
  parentResolution: "complete" | "partial";
  parents: string[];
  unresolvedInputs: string[];
  outputs: string[];
  unresolvedOutputs: string[];
  dependents: null;
  reason: string;
} | {
  status: "unknown";
  parentResolution: "unknown";
  parents: null;
  unresolvedInputs: null;
  outputs: null;
  unresolvedOutputs: null;
  dependents: null;
  reason: string;
} | CapabilityUnavailable;

export type SceneReportInput = {
  include?: SceneSection[];
  objects?: string[];
};

export function readSceneReport(api: GeoGebraApi, input: SceneReportInput = {}) {
  const include = normalizeSections(input.include);
  const inventory = readObjectInventory(api);
  const requested = normalizeObjectNames(input.objects);
  const sourceNames = requested ?? inventory.names;
  const names = sourceNames.slice(0, OBJECT_LIMIT);
  const objects = names.map((name) => {
    const exists = readExists(api, name, inventory.names);
    return {
      name,
      exists,
      ...(exists ? readObjectType(api, name) : {}),
      ...(exists ? readVisibility(api, name) : {}),
      ...(include.has("style") && exists ? { style: readObjectStyle(api, name) } : {}),
      ...(include.has("bbox") ? { bbox: unavailableBoundingBox() } : {}),
      ...(include.has("deps") && exists ? { dependencies: readDependencies(api, name, inventory.allNames) } : {}),
    };
  });

  return {
    ok: true,
    source: "geogebra-public-api" as const,
    coverage: {
      totalObjects: inventory.total,
      returnedObjects: objects.length,
      truncated: sourceNames.length > OBJECT_LIMIT || inventory.truncated,
      limit: OBJECT_LIMIT,
      ...(inventory.error ? { inventoryError: inventory.error } : {}),
    },
    ...(include.has("viewport") ? { viewport: readViewport(api) } : {}),
    objects,
  };
}

export function readTextFont(api: GeoGebraApi, name: string): Record<string, string> | CapabilityUnavailable {
  const result = safeCall(api, "getStyleXML", name);
  if (!result.ok) return { status: "unavailable", reason: result.reason };
  const xml = String(result.value ?? "");
  const fontTag = /<font\b([^>]*)\/?\s*>/i.exec(xml)?.[1];
  if (!fontTag) return { status: "unavailable", reason: "getStyleXML returned no font element for this object." };
  return parseAttributes(fontTag);
}

function readObjectInventory(api: GeoGebraApi) {
  const result = safeCall(api, "getAllObjectNames");
  if (!result.ok) return { names: [] as string[], allNames: [] as string[], total: 0, truncated: false, error: result.reason };
  const allNames = normalizeObjectNameResult(result.value);
  return { names: allNames.slice(0, OBJECT_LIMIT), allNames, total: allNames.length, truncated: allNames.length > OBJECT_LIMIT };
}

function normalizeObjectNameResult(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(values.map((entry) => String(entry).trim()).filter(Boolean))];
}

function normalizeObjectNames(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("objects must be an array of object names.");
  if (value.length > OBJECT_LIMIT) throw new RangeError(`objects must contain at most ${OBJECT_LIMIT} names.`);
  if (value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new TypeError("objects must contain only non-empty strings.");
  }
  return [...new Set(value.map((entry) => entry.trim()))];
}

function normalizeSections(value: unknown) {
  if (value === undefined) return new Set<SceneSection>(ALL_SECTIONS);
  if (!Array.isArray(value)) throw new TypeError("include must be an array of scene sections.");
  const allowed = new Set<SceneSection>(ALL_SECTIONS);
  if (value.some((entry) => typeof entry !== "string" || !allowed.has(entry as SceneSection))) {
    throw new TypeError(`include may contain only: ${ALL_SECTIONS.join(", ")}.`);
  }
  return new Set(value as SceneSection[]);
}

function readExists(api: GeoGebraApi, name: string, knownNames: string[]) {
  const result = safeCall(api, "exists", name);
  if (result.ok) return result.value === true;
  return knownNames.includes(name);
}

function readObjectType(api: GeoGebraApi, name: string) {
  const result = safeCall(api, "getObjectType", name);
  const type = result.ok && typeof result.value === "string" ? result.value.trim() : "";
  return type ? { type } : {};
}

function readVisibility(api: GeoGebraApi, name: string) {
  const result = safeCall(api, "getVisible", name, 1);
  return result.ok && typeof result.value === "boolean"
    ? { visible: result.value, visibilityView: 1 }
    : { visible: null, visibilityView: 1 };
}

function readViewport(api: GeoGebraApi) {
  const result = safeCall(api, "getViewProperties", 1);
  if (!result.ok) return { status: "unavailable" as const, reason: result.reason };
  try {
    const value = typeof result.value === "string" ? JSON.parse(result.value) : result.value;
    if (!isRecord(value)) throw new Error("view properties are not an object");
    const width = positiveNumber(value.width, "width");
    const height = positiveNumber(value.height, "height");
    const xMin = finiteNumber(value.xMin, "xMin");
    const yMin = finiteNumber(value.yMin, "yMin");
    const unitsPerPixelX = positiveNumber(value.invXscale, "invXscale");
    const unitsPerPixelY = positiveNumber(value.invYscale, "invYscale");
    const pxPerUnitX = 1 / unitsPerPixelX;
    const pxPerUnitY = 1 / unitsPerPixelY;
    return {
      status: "available" as const,
      view: 1,
      pixels: [width, height] as [number, number],
      x: [xMin, xMin + width * unitsPerPixelX] as [number, number],
      y: [yMin, yMin + height * unitsPerPixelY] as [number, number],
      pxPerUnitX,
      pxPerUnitY,
      axesEqual: Math.abs(pxPerUnitX - pxPerUnitY) <= Math.max(pxPerUnitX, pxPerUnitY) * 1e-6,
    };
  } catch (error) {
    return { status: "unavailable" as const, reason: `getViewProperties returned invalid geometry: ${errorMessage(error)}` };
  }
}

function readObjectStyle(api: GeoGebraApi, name: string) {
  const fields: Record<string, unknown> = {};
  const unknownFields: Record<string, string> = {};
  const getters = [
    ["color", "getColor"],
    ["filling", "getFilling"],
    ["lineStyle", "getLineStyle"],
    ["thickness", "getLineThickness"],
    ["pointSize", "getPointSize"],
    ["pointStyle", "getPointStyle"],
    ["labelVisible", "getLabelVisible"],
    ["labelStyle", "getLabelStyle"],
    ["layer", "getLayer"],
  ] as const;
  for (const [field, method] of getters) {
    const result = safeCall(api, method, name);
    if (result.ok && isScalar(result.value)) fields[field] = result.value;
    else unknownFields[field] = result.ok ? `${method} returned an unsupported value.` : result.reason;
  }
  const font = readTextFont(api, name);
  if ("status" in font) unknownFields.font = font.reason;
  else fields.font = font;
  return { ...fields, ...(Object.keys(unknownFields).length ? { unknownFields } : {}) };
}

function readDependencies(api: GeoGebraApi, name: string, allObjectNames: string[]): DependencyReport {
  const result = safeCall(api, "getAlgorithmXML", name);
  if (!result.ok) return { status: "unavailable", reason: result.reason };
  const xml = String(result.value ?? "");
  const input = /<input\b([^>]*)\/?\s*>/i.exec(xml)?.[1];
  const output = /<output\b([^>]*)\/?\s*>/i.exec(xml)?.[1];
  if (!input && !output) {
    const independent = safeCall(api, "isIndependent", name);
    if (independent.ok && independent.value === true) {
      return {
        status: "partial",
        parentResolution: "complete",
        parents: [],
        unresolvedInputs: [],
        outputs: [name],
        unresolvedOutputs: [],
        dependents: null,
        reason: "isIndependent confirms that this is a free object with no parents; the public API still does not expose its downstream dependents.",
      };
    }
    return {
      status: "unknown",
      parentResolution: "unknown",
      parents: null,
      unresolvedInputs: null,
      outputs: null,
      unresolvedOutputs: null,
      dependents: null,
      reason: independent.ok
        ? "getAlgorithmXML exposed no command inputs and isIndependent did not confirm a free object."
        : `getAlgorithmXML exposed no command inputs and independence could not be determined: ${independent.reason}`,
    };
  }
  const knownNames = new Set(allObjectNames);
  const rawInputs = input ? Object.values(parseAttributes(input)).filter(Boolean) : [];
  const rawOutputs = output ? Object.values(parseAttributes(output)).filter(Boolean) : [];
  const parents = rawInputs.filter((candidate) => knownNames.has(candidate));
  const unresolvedInputs = rawInputs.filter((candidate) => !knownNames.has(candidate));
  const outputs = rawOutputs.filter((candidate) => knownNames.has(candidate));
  const unresolvedOutputs = rawOutputs.filter((candidate) => !knownNames.has(candidate));
  return {
    status: "partial",
    parentResolution: unresolvedInputs.length ? "partial" : "complete",
    parents: [...new Set(parents)],
    unresolvedInputs: [...new Set(unresolvedInputs)],
    outputs: [...new Set(outputs)],
    unresolvedOutputs: [...new Set(unresolvedOutputs)],
    dependents: null,
    reason: "Only inputs that exactly match current object names are classified as parents; literals and expressions remain unresolved, and downstream dependents are unavailable.",
  };
}

function unavailableBoundingBox(): CapabilityUnavailable {
  return {
    status: "unavailable",
    reason: "GeoGebra's public applet API does not expose rendered object or label bounding boxes; no hidden construction probes were created. Use geochat_checkLayout for a controlled layout check.",
  };
}

function safeCall(api: GeoGebraApi, method: string, ...args: unknown[]):
  | { ok: true; value: unknown }
  | { ok: false; reason: string } {
  const fn = api[method];
  if (typeof fn !== "function") return { ok: false, reason: `GeoGebra API ${method} is unavailable.` };
  try {
    return { ok: true, value: Reflect.apply(fn, api, args) };
  } catch (error) {
    return { ok: false, reason: `GeoGebra API ${method} failed: ${errorMessage(error)}` };
  }
}

function parseAttributes(source: string) {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(/([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[match[1]] = decodeXml(match[2] ?? match[3] ?? "");
  }
  return attributes;
}

function decodeXml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function positiveNumber(value: unknown, field: string) {
  const parsed = finiteNumber(value, field);
  if (parsed <= 0) throw new Error(`${field} must be positive`);
  return parsed;
}

function finiteNumber(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be finite`);
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
