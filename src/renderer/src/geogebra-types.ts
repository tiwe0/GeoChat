export type GgbEvent = {
  type?: string;
  target?: string;
  argument?: string;
  arguement?: string;
  message?: string;
};

export type GgbAppletApi = {
  setSize?: (width?: number, height?: number) => unknown;
  registerClientListener?: (listener: (event: GgbEvent) => void) => unknown;
  asyncEvalCommandResult?: (command: string) => Promise<unknown> | unknown;
  evalCommandResult?: (command: string) => unknown;
  evalCommand?: (command: string) => unknown;
  setPerspective?: (mode: string) => unknown;
  setViewVisible?: (...args: unknown[]) => unknown;
  reset?: () => unknown;
  getXML?: () => string;
  setXML?: (xml: string) => unknown;
  deleteObject?: (label: string) => unknown;
  getBase64?: (...args: unknown[]) => unknown;
  getPNGBase64?: (...args: unknown[]) => unknown;
  setAxesVisible?: (...args: unknown[]) => unknown;
  setGridVisible?: (...args: unknown[]) => unknown;
  setCoordSystem?: (...args: unknown[]) => unknown;
};

export type GgbAppletInstance = {
  setHTML5Codebase?: (codebase: string, offline?: boolean) => unknown;
  inject: (container: string | HTMLElement) => unknown;
  getAppletObject?: () => unknown;
  remove?: () => unknown;
};

export type GgbAppletConstructor = new (...args: unknown[]) => GgbAppletInstance;

declare global {
  interface Window {
    GGBApplet?: GgbAppletConstructor;
  }
}

export type GeoGebraLoadMessage = {
  label: string;
  status: "checking" | "ok" | "error";
  detail: string;
};

export type GeoGebraCommandResult = {
  command: string;
  success: boolean;
  label: string;
  error: string | null;
  lastError: string | null;
  durationMs?: number;
  canvas?: CanvasSummary;
  canvasToml?: string | null;
};

export type CanvasSummary = {
  ready: boolean;
  element_count: number;
  expression_count: number;
  selectedObjects: string[];
  objects: CanvasObjectSummary[];
  object_index: Record<string, string[]>;
  expressions: string[];
  source: "geogebra-applet";
  xml?: string;
};

export type CanvasObjectSummary = {
  name: string;
  label: string;
  type: string;
  subtype?: string;
  definition?: string;
};

export type GeoGebraPngBase64Options = {
  exportScale?: number | null;
  transparent?: boolean | null;
  dpi?: number | null;
};

export type GeoGebraPngBase64Payload = {
  ok: boolean;
  base64: string;
  mediaType: "image/png";
  exportScale: number;
  transparent: boolean;
  dpi?: number;
  byteEstimate: number;
  clientMeta: {
    source: "geogebra-applet";
    ready: true;
    boardId: string;
  };
};

export type ExecuteGeoGebraOptions = {
  perspective?: string | null;
  resetBefore?: boolean | null;
  restoreOnError?: boolean | null;
  restoreBeforeXml?: string | null;
  normalizeFreeParameters?: boolean | null;
};

export type GeoGebraExecutionPayload = {
  ok: boolean;
  results: GeoGebraCommandResult[];
  canvasContext: CanvasSummary | { ready: false; source: "geogebra-applet"; error: string };
  canvasBefore?: CanvasSummary | { ready: false; source: "geogebra-applet"; error: string };
  canvasAfter?: CanvasSummary | { ready: false; source: "geogebra-applet"; error: string };
  clientMeta: Record<string, unknown>;
  error: string | null;
  failedCommandIndex?: number | null;
  failedCommand?: string | null;
  lastCompletedCommand?: string | null;
};

export type GeoGebraResetPayload = {
  ok: boolean;
  results: GeoGebraCommandResult[];
  canvasContext: CanvasSummary | { ready: false; source: "geogebra-applet"; error: string };
  canvasBefore?: CanvasSummary | { ready: false; source: "geogebra-applet"; error: string };
  canvasAfter?: CanvasSummary | { ready: false; source: "geogebra-applet"; error: string };
  clientMeta: Record<string, unknown>;
  error: string | null;
};
