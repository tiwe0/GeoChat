/**
 * The contract between whoever asks for a GeoGebra operation and whoever
 * executes it against the applet.
 *
 * Deliberately absent: getNativeToolNameForHarnessTool, which maps tools onto
 * the browser-extension native host. This build executes in-process.
 */
export type { ToolExecutionResult } from "./functioncalls";
