import { createContext, createElement, useContext, type ReactNode } from "react";
import type { CanvasTransactionOptions } from "./canvas-transactions";

export type GeoGebraTransactionExecute = (toolName: string, args: unknown) => Promise<unknown>;

/**
 * The smallest canvas capability shared by React and renderer-side workflows.
 * App owns the concrete controller; consumers only receive this injected port.
 */
export interface GeoGebraRuntimePort {
  readonly ready: boolean;
  executeTool(toolName: string, args: unknown): Promise<unknown>;
  runCanvasTransaction<T>(
    options: CanvasTransactionOptions,
    work: (execute: GeoGebraTransactionExecute) => T | PromiseLike<T>,
  ): Promise<T>;
  getCanvasXml(): string | undefined;
}

const GeoGebraRuntimeContext = createContext<GeoGebraRuntimePort | null>(null);

export function GeoGebraRuntimeProvider({ runtime, children }: { runtime: GeoGebraRuntimePort; children: ReactNode }) {
  return createElement(GeoGebraRuntimeContext.Provider, { value: runtime }, children);
}

export function useGeoGebraRuntime(): GeoGebraRuntimePort {
  const runtime = useContext(GeoGebraRuntimeContext);
  if (!runtime) throw new Error("GeoGebra runtime provider is missing.");
  return runtime;
}
