import { type GeoGebraApi } from "./ggbdeploy-wrapper";

type GeoGebraApplet = GeoGebraApi;

function callGeoGebraApplet(applet: GeoGebraApplet, method: string, ...args: unknown[]) {
  const fn = applet[method];
  if (typeof fn !== "function") throw new Error(`GeoGebra API ${method} 不可用。`);
  return Reflect.apply(fn, applet, args);
}

export type CanvasObject = { name: string; label: string; type: string; definition?: string };
export type CanvasContext = {
  ready: true;
  source: "geogebra-applet";
  /** Canonical GeoGebra perspective code (G, GEO, CAS, T, ...). */
  perspective: string | null;
  perspective_source: "suite-picker" | "applet" | "page" | "unknown";
  element_count: number;
  expression_count: number;
  selectedObjects: string[];
  objects: CanvasObject[];
  object_index: Record<string, string[]>;
  expressions: string[];
  xml?: string;
};

export function readCanvasContext(applet: GeoGebraApplet, includeXml: boolean): CanvasContext {
  const xml = getAppletXml(applet);
  if (!xml) throw capability("The current GeoGebra applet does not expose getXML.");
  const context = summarizeGeoGebraXml(xml, includeXml);
  const perspective = readActivePerspective(applet);
  return { ...context, ...perspective };
}

export function summarizeGeoGebraXml(xml: string, includeXml: boolean): CanvasContext {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("GeoGebra returned invalid XML.");
  const elements = [...document.querySelectorAll("construction > element")];
  const expressions = [...document.querySelectorAll("construction > expression")];
  const objects = elements.map((element) => {
    const label = element.getAttribute("label") ?? "";
    const type = element.getAttribute("type") ?? "unknown";
    const definition = element.getAttribute("exp") ?? element.querySelector("definition")?.textContent ?? undefined;
    return { name: label, label, type, ...(definition ? { definition } : {}) };
  }).filter((object) => object.label);
  const objectIndex: Record<string, string[]> = {};
  for (const object of objects) (objectIndex[object.type] ??= []).push(object.label);
  const expressionLabels = expressions.map((expression) => expression.getAttribute("label") ?? "").filter(Boolean);
  return {
    ready: true,
    source: "geogebra-applet",
    perspective: null,
    perspective_source: "unknown",
    element_count: objects.length,
    expression_count: expressionLabels.length,
    selectedObjects: [],
    objects,
    object_index: objectIndex,
    expressions: expressionLabels,
    ...(includeXml ? { xml } : {}),
  };
}

type PerspectiveState = Pick<CanvasContext, "perspective" | "perspective_source">;

/**
 * Read the active Suite sub-app from the page-owned picker. The picker is the
 * source of truth after switchToSubapp(); URL attributes only describe the
 * initial app and become stale after an in-page switch.
 */
export function readActivePerspective(applet?: GeoGebraApplet): PerspectiveState {
  if (typeof document !== "undefined") {
    const pickerKey = document
      .querySelector<HTMLElement>("#suiteAppPicker .suiteAppPickerButton [data-trans-key], .suiteAppPickerButton [data-trans-key]")
      ?.getAttribute("data-trans-key");
    const pickerPerspective = perspectiveFromKey(pickerKey);
    if (pickerPerspective) return { perspective: pickerPerspective, perspective_source: "suite-picker" };

    const initial = document.querySelector<HTMLElement>("#ggw, geogebraweb")?.getAttribute("data-param-perspective");
    const initialPerspective = normalizePerspective(initial);
    if (initialPerspective) return { perspective: initialPerspective, perspective_source: "page" };
  }

  for (const method of ["getPerspective", "getActivePerspective"]) {
    if (!applet || typeof applet[method] !== "function") continue;
    try {
      const value = normalizePerspective(String(callGeoGebraApplet(applet, method)));
      if (value) return { perspective: value, perspective_source: "applet" };
    } catch {
      // Optional API; continue with the other discovery mechanisms.
    }
  }
  return { perspective: null, perspective_source: "unknown" };
}

function perspectiveFromKey(key: string | null | undefined): string | null {
  if (!key) return null;
  switch (key) {
    case "GraphingCalculator.short": return "G";
    case "GeoGebra3DGrapher.short": return "T";
    case "Geometry": return "GEO";
    case "CAS": return "CAS";
    case "Probability": return "PROBABILITY";
    case "Scientific": return "SCIENTIFIC";
    default: return null;
  }
}

function normalizePerspective(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^['"]|['"]$/g, "").toUpperCase();
  if (!normalized) return null;
  switch (normalized) {
    case "1":
    case "GRAPHING":
    case "GRAPHINGCALCULATOR":
    case "G":
    case "AG": return "G";
    case "2":
    case "GEOMETRY":
    case "GEO": return "GEO";
    case "4":
    case "CAS": return "CAS";
    case "5":
    case "3D":
    case "G3D":
    case "T": return "T";
    case "6":
    case "PROBABILITY": return "PROBABILITY";
    case "SCIENTIFIC": return "SCIENTIFIC";
    default: return normalized;
  }
}

export function tryReadCanvasContext(applet: GeoGebraApplet, includeXml: boolean) {
  try {
    return readCanvasContext(applet, includeXml);
  } catch {
    return undefined;
  }
}

export function getAppletXml(applet: GeoGebraApplet) {
  if (typeof applet.getXML !== "function") return undefined;
  try {
    const value = callGeoGebraApplet(applet, "getXML");
    return typeof value === "string" ? value : String(value ?? "");
  } catch {
    return undefined;
  }
}

export function canvasLabels(context: CanvasContext) {
  return context.objects.map((object) => object.label).filter(Boolean);
}

function capability(message: string) {
  const error = new Error(message);
  error.name = "GeoGebraCapabilityError";
  return error;
}
