export {
  createGeoGebraSelectionContextBridge,
  readGeoGebraSelectionContext,
  type GeoGebraSelectionContext,
  type GeoGebraSelectionContextBridge,
  type GeoGebraSelectionMode,
  type GeoGebraSelectionRefreshReason,
  type GeoGebraSelectionStatus,
} from "../../geogebra/selection-context";

import type { GeoGebraSelectionContext } from "../../geogebra/selection-context";

/**
 * A submit-boundary refresh is synchronous at the GeoGebra bridge even though
 * publishing that snapshot into React state is not. Prefer the refreshed
 * value so the frozen turn describes the selection at the instant of submit.
 */
export function fusionSelectionObjectNamesForSubmit(
  current: GeoGebraSelectionContext,
  refreshed?: GeoGebraSelectionContext,
) {
  const selection = refreshed ?? current;
  return selection.status === "known" ? [...selection.objectNames] : [];
}

/**
 * Fusion-mode wiring contract:
 *
 * - create one bridge when the GeoGebra applet becomes ready;
 * - subscribe onChange into React state and dispose it with the applet;
 * - call refresh("focus") when the floating composer receives focus;
 * - call refresh("submit") immediately before freezing the prompt context;
 * - call refresh("tool-complete") after a canvas-mutating tool settles.
 *
 * The bridge never polls. `mode === "discrete"` tells the UI that live
 * selection events are unavailable, while the snapshot status distinguishes
 * a verified empty selection from an unavailable observation.
 */
