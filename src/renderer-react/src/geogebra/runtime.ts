import type { GeoGebraController } from "./controller";

let controller: GeoGebraController | null = null;
export function setFrontendGeoGebraController(value: GeoGebraController | null) { controller = value; }
export function getFrontendGeoGebraController() { return controller; }
