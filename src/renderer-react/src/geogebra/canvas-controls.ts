export type GeoGebraCanvasAction = "undo" | "redo" | "toggleGrid" | "toggleAxes" | "showAlgebra" | "show3D" | "showProperties" | "showGraphics";

export interface GeoGebraControlsSnapshot {
  readonly ready: boolean;
  readonly blocked: boolean;
  readonly mode: number | null;
  readonly gridVisible: boolean | null;
  readonly axesVisible: boolean | null;
  readonly supportsToolModes: boolean;
  readonly supportedActions: readonly GeoGebraCanvasAction[];
}

/** Shell controls use documented applet APIs, never vendor DOM or internal names. */
export interface GeoGebraCanvasControls {
  getSnapshot(): GeoGebraControlsSnapshot;
  subscribe(listener: () => void): () => void;
  setToolMode(mode: number): Promise<void>;
  performAction(action: GeoGebraCanvasAction): Promise<void>;
}

export const UNAVAILABLE_GEOGEBRA_CONTROLS: GeoGebraControlsSnapshot = Object.freeze({
  ready: false,
  blocked: false,
  mode: null,
  gridVisible: null,
  axesVisible: null,
  supportsToolModes: false,
  supportedActions: [],
});
