import { useCallback, useSyncExternalStore } from "react";
import { UNAVAILABLE_GEOGEBRA_CONTROLS } from "../../geogebra/canvas-controls";
import { useGeoGebraRuntime } from "../../geogebra/runtime";

export function useGeoGebraCanvasControls() {
  const runtime = useGeoGebraRuntime();
  const controls = runtime.canvasControls ?? null;
  const subscribe = useCallback(
    (notify: () => void) => controls?.subscribe(notify) ?? (() => {}),
    [controls],
  );
  const getSnapshot = useCallback(
    () => controls?.getSnapshot() ?? UNAVAILABLE_GEOGEBRA_CONTROLS,
    [controls],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return { controls, snapshot };
}
