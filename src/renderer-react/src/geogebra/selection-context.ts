import type { GeoGebraApi } from "./ggbdeploy-wrapper";

export type GeoGebraSelectionStatus = "known" | "empty" | "unavailable";
export type GeoGebraSelectionMode = "events" | "discrete";
export type GeoGebraSelectionRefreshReason = "focus" | "submit" | "tool-complete";

export type GeoGebraSelectionContext = {
  status: GeoGebraSelectionStatus;
  objectNames: string[];
  observedAt?: string;
};

export type GeoGebraSelectionContextBridge = {
  readonly mode: GeoGebraSelectionMode;
  getSnapshot: () => GeoGebraSelectionContext;
  /**
   * Refresh at an explicit interaction boundary. Event-capable applets also
   * accept this call, which is useful immediately before a prompt is sent.
   */
  refresh: (reason: GeoGebraSelectionRefreshReason) => GeoGebraSelectionContext;
  dispose: () => void;
};

type BridgeOptions = {
  onChange?: (context: GeoGebraSelectionContext) => void;
  now?: () => Date;
};

const SELECTION_EVENT_NAMES = new Set(["select", "deselect"]);
const DISCRETE_REFRESH_REASONS = new Set<GeoGebraSelectionRefreshReason>([
  "focus",
  "submit",
  "tool-complete",
]);

/**
 * Build a selection bridge without polling.
 *
 * GeoGebra client events are treated only as invalidation signals. The event
 * payload is not trusted as selection state because it differs between
 * applets and may contain a caption rather than the construction label. Every
 * emitted snapshot is therefore read back through getSelectedObject*.
 *
 * When the applet does not expose a paired client-listener API, the bridge
 * stays in discrete mode. Callers may refresh it only at the focus, submit, or
 * tool-complete boundaries represented by GeoGebraSelectionRefreshReason.
 */
export function createGeoGebraSelectionContextBridge(
  applet: GeoGebraApi,
  options: BridgeOptions = {},
): GeoGebraSelectionContextBridge {
  const now = options.now ?? (() => new Date());
  let snapshot: GeoGebraSelectionContext = unavailableSelection();
  let disposed = false;

  const publish = () => {
    snapshot = readGeoGebraSelectionContext(applet, now);
    options.onChange?.(snapshot);
    return snapshot;
  };

  const register = applet.registerClientListener;
  const unregister = applet.unregisterClientListener;
  const canRead = hasSelectionReadCapability(applet);
  let mode: GeoGebraSelectionMode = "discrete";
  let listenerRegistered = false;

  const clientListener = (event: unknown) => {
    if (disposed || !isSelectionClientEvent(event)) return;
    publish();
  };

  if (canRead && typeof register === "function" && typeof unregister === "function") {
    try {
      Reflect.apply(register, applet, [clientListener]);
      listenerRegistered = true;
      mode = "events";
      // Registration closes the race before the initial observation.
      snapshot = readGeoGebraSelectionContext(applet, now);
    } catch (caughtError) {
      console.error("[ERROR] Failed to register GeoGebra selection listener", caughtError);
    }
  }

  return {
    mode,
    getSnapshot: () => snapshot,
    refresh: (reason) => {
      if (!DISCRETE_REFRESH_REASONS.has(reason)) {
        throw new Error(`Unsupported GeoGebra selection refresh boundary: ${String(reason)}`);
      }
      if (disposed) return snapshot;
      return publish();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (!listenerRegistered) return;
      try {
        Reflect.apply(unregister as (...args: unknown[]) => unknown, applet, [clientListener]);
      } catch (caughtError) {
        console.error("[ERROR] Failed to unregister GeoGebra selection listener", caughtError);
      } finally {
        listenerRegistered = false;
      }
    },
  };
}

export function readGeoGebraSelectionContext(
  applet: GeoGebraApi,
  now: () => Date = () => new Date(),
): GeoGebraSelectionContext {
  if (!hasSelectionReadCapability(applet)) return unavailableSelection();
  try {
    const count = Number(Reflect.apply(applet.getSelectedObjectCount as (...args: unknown[]) => unknown, applet, []));
    if (!Number.isInteger(count) || count < 0 || count > 256) return unavailableSelection();

    const objectNames: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < count; index += 1) {
      const value = Reflect.apply(applet.getSelectedObject as (...args: unknown[]) => unknown, applet, [index]);
      if (typeof value !== "string" || !value.trim()) return unavailableSelection();
      const objectName = value.trim();
      if (!seen.has(objectName)) {
        seen.add(objectName);
        objectNames.push(objectName);
      }
    }

    return {
      status: objectNames.length ? "known" : "empty",
      objectNames,
      observedAt: now().toISOString(),
    };
  } catch (caughtError) {
    console.error("[ERROR] Failed to read GeoGebra selection context", caughtError);
    return unavailableSelection();
  }
}

function hasSelectionReadCapability(applet: GeoGebraApi) {
  return typeof applet.getSelectedObjectCount === "function"
    && typeof applet.getSelectedObject === "function";
}

function unavailableSelection(): GeoGebraSelectionContext {
  return { status: "unavailable", objectNames: [] };
}

function isSelectionClientEvent(event: unknown) {
  const eventName = Array.isArray(event)
    ? event[0]
    : event && typeof event === "object"
      ? (event as { type?: unknown }).type
      : event;
  return typeof eventName === "string" && SELECTION_EVENT_NAMES.has(eventName);
}
